// js/db/tombstones.store.js
// Gestion des suppressions logiques (tombstones)
// Store IndexedDB : "tombstones"
//
// Rôle :
// - tracer les suppressions locales
// - permettre une synchro différée
// - nettoyer un snapshot importé
//
// Dépendances : db.js (openDB, put, getAll, del)

import { openDB, put, getAll, del } from "./db.js";

const STORE = "tombstones";

/* =========================
   CREATE
   ========================= */

export async function createTombstone({ storeName, entityId }) {
  if (!storeName || !entityId) {
    console.warn("[tombstones] createTombstone: paramètres manquants");
    return null;
  }

  await openDB();

  const record = {
    id: `${storeName}:${entityId}`,
    storeName,
    entityId,
    deletedAt: new Date().toISOString()
  };

  try {
    await put(STORE, record);
    return record;
  } catch (e) {
    console.error("[tombstones] erreur create", e);
    return null;
  }
}

/* =========================
   READ
   ========================= */

export async function listTombstones() {
  await openDB();
  return await getAll(STORE);
}

export async function listTombstonesByStore(storeName) {
  if (!storeName) return [];

  await openDB();

  try {
    return await getAll(STORE, "byStore", IDBKeyRange.only(storeName));
  } catch (e) {
    // Sécurité : si l’index n’existe pas ou autre
    console.warn("[tombstones] index byStore indisponible, fallback", e);
    const all = await getAll(STORE);
    return all.filter(t => t.storeName === storeName);
  }
}

/* =========================
   APPLY (SNAPSHOT MERGE)
   ========================= */

export function applyTombstonesToSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return snapshot;
  if (!Array.isArray(snapshot.tombstones)) return snapshot;

  for (const t of snapshot.tombstones) {
    if (!t?.storeName || !t?.entityId) continue;

    const list = snapshot[t.storeName];
    if (!Array.isArray(list)) continue;

    snapshot[t.storeName] = list.filter(
      (item) => item?.id !== t.entityId
    );
  }

  return snapshot;
}

/* =========================
   CLEANUP
   ========================= */

export async function clearTombstones() {
  await openDB();

  const all = await getAll(STORE);
  for (const t of all) {
    try {
      await del(STORE, t.id);
    } catch (e) {
      console.warn("[tombstones] erreur delete", t.id, e);
    }
  }
}
