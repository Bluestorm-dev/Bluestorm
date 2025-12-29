// js/db/journal.store.js
// Store Journal (IndexedDB) — compatible avec js/db/db.js
//
// Store: "journal_entries"
// Indexes: byDateStart, byUpdatedAt, byTheme, byWeek, byTodo, byType
//
// Exports attendus par cockpit.page.js :
// - listRecentEntries({ days, limit })
// - computeJournalStats({ days })

import { openDB, get, getAll, put, del } from "./db.js";
import { createTombstone } from "./tombstones.store.js";

const STORE = "journal_entries";

console.log("journal.store.js loaded", import.meta.url);

function nowIso() {
  return new Date().toISOString();
}

function ensureId(entry) {
  if (entry.id) return entry.id;
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `je_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function normalize(entry) {
  const e = { ...(entry || {}) };

  e.id = ensureId(e);
  if (!e.createdAt) e.createdAt = nowIso();
  e.updatedAt = nowIso();

  // champs utiles
  if (!e.dateStart) e.dateStart = nowIso();
  if (!e.type) e.type = "study"; // study | code | doc | design | review | other
  if (!e.themeId) e.themeId = "bluestorm";

  e.title = String(e.title || "").trim();
  e.notes = String(e.notes || "").trim();

  // optionnels, mais utiles pour liens programme / todo
  if (e.weekId != null) e.weekId = String(e.weekId);
  if (e.todoId != null) e.todoId = String(e.todoId);

  // Durée (minutes) — cockpit utilise durationMinutes
  // On supporte aussi "minutes" si tu l’utilises ailleurs.
  if (e.durationMinutes == null && e.minutes != null) {
    e.durationMinutes = Number(e.minutes || 0) || 0;
  }
  if (e.durationMinutes != null) {
    e.durationMinutes = Number(e.durationMinutes || 0) || 0;
  } else {
    e.durationMinutes = 0;
  }

  return e;
}

function toMs(iso) {
  const t = Date.parse(iso || "");
  return Number.isFinite(t) ? t : 0;
}

function daysToMs(days) {
  return Number(days || 0) * 24 * 60 * 60 * 1000;
}

/* =========================
   CRUD
   ========================= */

export async function getJournalEntry(id) {
  await openDB();
  return await get(STORE, id);
}

export async function putJournalEntry(entry) {
  await openDB();
  const e = normalize(entry);
  await put(STORE, e);
  return e;
}

export async function deleteJournalEntry(id, { tombstone = true } = {}) {
  await openDB();

  if (tombstone) {
    await createTombstone({
      storeName: STORE,
      entityId: id,
    });
  }

  await del(STORE, id);
}

/* =========================
   LIST / QUERIES
   ========================= */

export async function listJournalEntries({
  limit = 1000,
  themeId = null,
  type = null,
  weekId = null,
} = {}) {
  await openDB();

  let items = [];

  if (weekId) {
    items = await getAll(STORE, "byWeek", String(weekId));
  } else if (themeId) {
    items = await getAll(STORE, "byTheme", themeId);
  } else if (type) {
    items = await getAll(STORE, "byType", type);
  } else {
    items = await getAll(STORE);
  }

  // tri desc par dateStart
  items.sort((a, b) => toMs(b.dateStart || b.createdAt) - toMs(a.dateStart || a.createdAt));

  if (limit && items.length > limit) items = items.slice(0, limit);

  // normalisation légère pour garantir durationMinutes
  return items.map((x) => (x.durationMinutes == null ? normalize(x) : x));
}

/**
 * listRecentEntries({ days, limit })
 * Utilisé par cockpit.page.js
 */
export async function listRecentEntries({ days = 3, limit = 3 } = {}) {
  await openDB();

  const all = await getAll(STORE);
  const cutoff = Date.now() - daysToMs(days);

  let items = all.filter((e) => toMs(e.dateStart || e.createdAt) >= cutoff);

  // tri récent d'abord
  items.sort((a, b) => toMs(b.dateStart || b.createdAt) - toMs(a.dateStart || a.createdAt));

  if (limit && items.length > limit) items = items.slice(0, limit);

  // garantir durationMinutes
  return items.map((x) => (x.durationMinutes == null ? normalize(x) : x));
}

/* =========================
   STATS (Cockpit)
   ========================= */

/**
 * computeJournalStats({ days })
 * Retour attendu par cockpit.page.js :
 * - stats.entries
 * - stats.totalMinutes
 */
export async function computeJournalStats({ days = 7 } = {}) {
  await openDB();

  const all = await getAll(STORE);
  const cutoff = Date.now() - daysToMs(days);

  let entries = 0;
  let totalMinutes = 0;

  // bonus utiles si tu veux plus tard
  const byType = {};
  const byTheme = {};

  for (const raw of all) {
    const t = toMs(raw.dateStart || raw.createdAt);
    if (t < cutoff) continue;

    const e = raw.durationMinutes == null ? normalize(raw) : raw;

    entries++;
    totalMinutes += Number(e.durationMinutes || 0) || 0;

    const type = String(e.type || "other");
    byType[type] = (byType[type] || 0) + 1;

    const theme = String(e.themeId || "bluestorm");
    byTheme[theme] = (byTheme[theme] || 0) + 1;
  }

  return { entries, totalMinutes, byType, byTheme, days };
}
/* =========================
   ALIASES (compat pages)
   ========================= */



// journal.page.js attend listEntries()
export async function listEntries(opts = {}) {
  return await listJournalEntries(opts);
}

// journal.page.js attend deleteEntry()
export async function deleteEntry(id, opts) {
  return await deleteJournalEntry(id, opts);
}

// utile si une page attend saveEntry()
export async function saveEntry(entry) {
  return await putJournalEntry(entry);
}
/* =========================
   EXTRA EXPORTS (pour journal.page.js)
   ========================= */

/**
 * listEntriesByTheme(themeId, opts?)
 * journal.page.js l’attend.
 */
export async function listEntriesByTheme(themeId, opts = {}) {
  return await listJournalEntries({ ...(opts || {}), themeId });
}

/**
 * listEntriesByType(type, opts?)
 * journal.page.js l’attend.
 */
export async function listEntriesByType(type, opts = {}) {
  return await listJournalEntries({ ...(opts || {}), type });
}

/**
 * searchEntries(query, opts?)
 * Recherche simple sur title + notes + type + themeId
 * journal.page.js l’attend.
 */
export async function searchEntries(query, opts = {}) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) {
    // si query vide → retourne juste la liste filtrée
    return await listJournalEntries(opts);
  }

  const items = await listJournalEntries({ ...(opts || {}), limit: 5000 });

  return items.filter((e) => {
    const hay = `${e.title || ""} ${e.notes || ""} ${e.type || ""} ${e.themeId || ""}`.toLowerCase();
    return hay.includes(q);
  });
}

