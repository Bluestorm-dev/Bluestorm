// js/db/reading.store.js
// Reading sessions + quotes (IndexedDB)
// Stores:
// - reading_sessions
// - book_quotes
//
// addReadingSession() met à jour book_progress automatiquement.
//
// Dépend: db.js + tombstones.store.js + books.store.js

import { openDB, get, getAll, put, del } from "./db.js";
import { createTombstone } from "./tombstones.store.js";
import { getBook, getBookProgress, putBookProgress } from "./books.store.js";

const SESSIONS = "reading_sessions";
const QUOTES = "book_quotes";

function nowIso() { return new Date().toISOString(); }
function uid(prefix) {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function normalizeSession(s) {
  const x = { ...(s || {}) };

  x.id = x.id || uid("read");
  x.bookId = String(x.bookId || "").trim();

  x.dateStart = x.dateStart || nowIso();
  x.dateEnd = x.dateEnd || null;

  x.minutes = Number(x.minutes || 0) || 0;
  x.fromPage = Number(x.fromPage || 0) || 0;
  x.toPage = Number(x.toPage || 0) || 0;

  // pages calculées si non fournies
  const computedPages = x.toPage > x.fromPage ? (x.toPage - x.fromPage) : 0;
  x.pages = Number(x.pages || computedPages) || 0;

  x.notes = String(x.notes || "").trim();

  // lien semaine (string ou null)
  x.linkedWeekId = x.linkedWeekId ? String(x.linkedWeekId) : null;

  if (!x.createdAt) x.createdAt = nowIso();
  x.updatedAt = nowIso();

  return x;
}

function normalizeQuote(q) {
  const x = { ...(q || {}) };

  x.id = x.id || uid("quote");
  x.bookId = String(x.bookId || "").trim();
  x.page = Number(x.page || 0) || 0;

  x.quote = String(x.quote || "").trim();
  x.note = String(x.note || "").trim();

  if (!x.createdAt) x.createdAt = nowIso();
  x.updatedAt = nowIso();

  return x;
}

/* =========================
   SESSIONS
   ========================= */

export async function listReadingSessions({ bookId = null, limit = 2000 } = {}) {
  await openDB();

  let items = bookId
    ? await getAll(SESSIONS, "byBook", bookId)
    : await getAll(SESSIONS);

  items.sort((a, b) => Date.parse(b.dateStart || 0) - Date.parse(a.dateStart || 0));
  if (limit && items.length > limit) items = items.slice(0, limit);

  return items;
}

export async function listReadingSessionsByWeek(weekId, { limit = 2000 } = {}) {
  await openDB();
  const wid = String(weekId || "");
  if (!wid) return [];

  let items = await getAll(SESSIONS, "byWeek", wid);
  items.sort((a, b) => Date.parse(b.dateStart || 0) - Date.parse(a.dateStart || 0));
  if (limit && items.length > limit) items = items.slice(0, limit);

  return items;
}

export async function getReadingSession(id) {
  await openDB();
  return await get(SESSIONS, id);
}

/**
 * addReadingSession(session)
 * - sauvegarde la session
 * - met à jour book_progress (pagesRead, currentPage, lastSessionAt, status)
 */
export async function addReadingSession(session) {
  await openDB();

  const s = normalizeSession(session);
  if (!s.bookId) throw new Error("bookId requis");

  // Persist session
  await put(SESSIONS, s);

  // Update progress
  const book = await getBook(s.bookId);
  const pr = (await getBookProgress(s.bookId)) || { bookId: s.bookId };

  const currentPage = Math.max(
    Number(pr.currentPage || 0) || 0,
    Number(s.toPage || 0) || 0
  );

  // pagesRead : on garde une progression monotone.
  // NOTE: ce modèle est simple. Si tu veux "exact", on recalculera depuis toutes les sessions.
  const pagesRead = Math.max(
    Number(pr.pagesRead || 0) || 0,
    Number(pr.pagesRead || 0) + (Number(s.pages || 0) || 0),
    currentPage
  );

  const nextStatus = pr.status === "finished" ? "finished" : "reading";

  await putBookProgress(s.bookId, {
    status: nextStatus,
    startedAt: pr.startedAt || s.dateStart,
    currentPage,
    pagesRead,
    lastSessionAt: s.dateEnd || s.dateStart
  });

  // Si on atteint totalPages => finished (si totalPages connu)
  if (book?.totalPages && currentPage >= Number(book.totalPages)) {
    await putBookProgress(s.bookId, {
      status: "finished",
      finishedAt: nowIso()
    });
  }

  return s;
}

export async function deleteReadingSession(id, { tombstone = true } = {}) {
  await openDB();

  const s = await get(SESSIONS, id);
  if (!s) return;

  if (tombstone) {
    await createTombstone({ storeName: SESSIONS, entityId: id });
  }

  await del(SESSIONS, id);

  // NOTE: on ne “recalcule” pas automatiquement le progress ici (complexe).
  // Si tu veux, je te code recomputeBookProgress(bookId) plus tard.
}

/* =========================
   QUOTES
   ========================= */

export async function listBookQuotes({ bookId = null, limit = 2000 } = {}) {
  await openDB();

  let items = bookId
    ? await getAll(QUOTES, "byBook", bookId)
    : await getAll(QUOTES);

  items.sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0));
  if (limit && items.length > limit) items = items.slice(0, limit);

  return items;
}

export async function getBookQuote(id) {
  await openDB();
  return await get(QUOTES, id);
}

export async function putBookQuote(quote) {
  await openDB();

  const q = normalizeQuote(quote);
  if (!q.bookId) throw new Error("bookId requis");

  await put(QUOTES, q);
  return q;
}

export async function deleteBookQuote(id, { tombstone = true } = {}) {
  await openDB();

  const q = await get(QUOTES, id);
  if (!q) return;

  if (tombstone) {
    await createTombstone({ storeName: QUOTES, entityId: id });
  }

  await del(QUOTES, id);
}

/* =========================
   STATS
   ========================= */

export async function computeReadingStats({ bookId = null } = {}) {
  const sessions = await listReadingSessions({ bookId, limit: 5000 });

  let totalMinutes = 0;
  let totalPages = 0;

  for (const s of sessions) {
    totalMinutes += Number(s.minutes || 0) || 0;
    totalPages += Number(s.pages || 0) || 0;
  }

  return { totalMinutes, totalPages, sessions: sessions.length };
}
