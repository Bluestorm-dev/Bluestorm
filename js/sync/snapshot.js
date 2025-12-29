// js/sync/snapshot.js
// Export / Import (merge) de toute l'app BlueStorm pour sync manuel (fichier JSON).
//
// Compatible avec ton js/db/db.js:
// - openDB(), getAll(), put(), del(), clear()
//
// Stratégie:
// - Export: dump de tous les stores + meta
// - Import: merge "last-write-wins" (updatedAt) + respect des tombstones (storeName + entityId)
// - Clear: wipe stores + localStorage settings key (optionnel) + caches PWA
//
// Notes:
// - Les suppressions sont gérées via tombstones:
//   tombstone = { id, storeName, entityId, deletedAt, updatedAt? }
// - On suppose que tes records ont (si possible) updatedAt; sinon on tombe sur createdAt; sinon 0.

import { openDB, getAll, put, del, clear } from "../db/db.js";

const SNAPSHOT_VERSION = 1;
const LS_SETTINGS_KEY = "bluestorm.settings.v1";

// ⚠️ Tes vrais noms de stores (d’après createStoresV1)
export const STORES = [
  "program_weeks",
  "program_progress",
  "journal_entries",
  "flashcards",
  "skills",
  "issues",
  "projects",
  "settings",
  "tombstones"
];

/* =========================
   EXPORT
   ========================= */

export async function exportSnapshot({ includeLocalStorageSettings = true } = {}) {
  await openDB();

  const exportedAt = new Date().toISOString();
  const data = {};

  for (const storeName of STORES) {
    data[storeName] = await getAll(storeName);
  }

  const localStorageSettings = includeLocalStorageSettings
    ? safeParse(localStorage.getItem(LS_SETTINGS_KEY))
    : null;

  return {
    meta: {
      version: SNAPSHOT_VERSION,
      app: "BlueStorm",
      exportedAt,
      stores: STORES
    },
    localStorageSettings,
    data
  };
}

/* =========================
   IMPORT (MERGE)
   ========================= */

export async function importSnapshot(snapshot) {
  await openDB();

  if (!snapshot || typeof snapshot !== "object") throw new Error("Snapshot invalide");

  // 1) localStorage settings (optionnel)
  if (snapshot.localStorageSettings && typeof snapshot.localStorageSettings === "object") {
    localStorage.setItem(LS_SETTINGS_KEY, JSON.stringify(snapshot.localStorageSettings));
  }

  // 2) Tombstones index = union (local + imported)
  const localTombs = await getAll("tombstones");
  const importedTombs = Array.isArray(snapshot?.data?.tombstones) ? snapshot.data.tombstones : [];
  const tombIndex = buildTombstoneIndex([...localTombs, ...importedTombs]);

  // 2a) Merge tombstones store itself (on garde les plus récents)
  await mergeStore("tombstones", importedTombs, {
    skipIfDeleted: () => false
  });

  // 3) Merge each store (except tombstones) + apply deletions afterwards
  for (const storeName of STORES) {
    if (storeName === "tombstones") continue;

    const importedItems = Array.isArray(snapshot?.data?.[storeName]) ? snapshot.data[storeName] : [];

    await mergeStore(storeName, importedItems, {
      skipIfDeleted: (item) => tombIndex.has(keyTomb(storeName, item?.id))
    });

    await applyTombstonesToStore(storeName, tombIndex);
  }

  return true;
}

/* =========================
   CLEAR ALL
   ========================= */

export async function clearAllData({ alsoClearCaches = true, alsoClearLocalStorageSettings = true } = {}) {
  await openDB();

  // IndexedDB stores
  for (const storeName of STORES) {
    await clear(storeName);
  }

  // localStorage (settings)
  if (alsoClearLocalStorageSettings) {
    localStorage.removeItem(LS_SETTINGS_KEY);
  }

  // PWA caches
  if (alsoClearCaches && "caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
}

/* =========================
   MERGE ENGINE (LWW)
   ========================= */

async function mergeStore(storeName, importedItems, { skipIfDeleted } = {}) {
  const localItems = await getAll(storeName);
  const localIndex = new Map(localItems.map((x) => [x.id, x]));

  for (const incoming of importedItems || []) {
    if (!incoming || !incoming.id) continue;
    if (skipIfDeleted?.(incoming)) continue;

    const local = localIndex.get(incoming.id);

    // New item
    if (!local) {
      await put(storeName, incoming);
      localIndex.set(incoming.id, incoming);
      continue;
    }

    // Update if incoming is newer
    const inTs = getUpdatedAt(incoming);
    const locTs = getUpdatedAt(local);

    if (inTs > locTs) {
      await put(storeName, incoming);
      localIndex.set(incoming.id, incoming);
    }
  }
}

async function applyTombstonesToStore(storeName, tombIndex) {
  const localItems = await getAll(storeName);
  for (const item of localItems) {
    if (!item?.id) continue;
    if (tombIndex.has(keyTomb(storeName, item.id))) {
      await del(storeName, item.id);
    }
  }
}

/* =========================
   TOMBSTONES INDEX
   ========================= */

function buildTombstoneIndex(tombstones) {
  // Pour chaque (storeName, entityId) on garde le tombstone le plus récent.
  const map = new Map();

  for (const t of tombstones || []) {
    if (!t?.storeName || !t?.entityId) continue;

    const k = keyTomb(t.storeName, t.entityId);
    const prev = map.get(k);

    const tTs = Date.parse(t.deletedAt || t.updatedAt || t.createdAt || 0) || 0;
    const pTs = prev ? (Date.parse(prev.deletedAt || prev.updatedAt || prev.createdAt || 0) || 0) : 0;

    if (!prev || tTs > pTs) map.set(k, t);
  }

  return map;
}

function keyTomb(storeName, entityId) {
  if (!storeName || !entityId) return "";
  return `${storeName}::${entityId}`;
}

/* =========================
   UTILS
   ========================= */

function getUpdatedAt(item) {
  // LWW: updatedAt > createdAt > 0
  return Date.parse(item?.updatedAt || item?.createdAt || 0) || 0;
}

function safeParse(raw) {
  try {
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
