// js/db/books.store.js
// Catalogue Books + Progress (IndexedDB)
// Stores:
// - books
// - book_progress
//
// Support tombstones (sync)
//
// Dépendances: db.js + tombstones.store.js

import { openDB, get, getAll, put, del } from "./db.js";
import { createTombstone } from "./tombstones.store.js";

const BOOKS = "books";
const PROGRESS = "book_progress";

function nowIso() {
  return new Date().toISOString();
}

function uid(prefix) {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function normalizeBook(b) {
  const book = { ...(b || {}) };

  book.id = book.id || uid("book");
  book.title = String(book.title || "").trim();
  book.author = String(book.author || "").trim();
  book.category = String(book.category || "other").trim();
  book.language = String(book.language || "fr").trim();
  book.format = String(book.format || "paper").trim();
  book.totalPages = Number(book.totalPages || 0) || 0;

  // planned | reading | paused | finished
  book.status = book.status || "planned";

  book.tags = Array.isArray(book.tags)
    ? book.tags.filter(Boolean).map(String)
    : [];

  if (!book.createdAt) book.createdAt = nowIso();
  book.updatedAt = nowIso();

  return book;
}

function normalizeProgress(p, bookId) {
  const pr = { ...(p || {}) };

  pr.bookId = bookId;
  pr.status = pr.status || "planned";
  pr.startedAt = pr.startedAt || null;
  pr.finishedAt = pr.finishedAt || null;

  pr.currentPage = Number(pr.currentPage || 0) || 0;
  pr.pagesRead = Number(pr.pagesRead || pr.currentPage || 0) || 0;

  pr.lastSessionAt = pr.lastSessionAt || null;
  pr.rating = pr.rating ?? null;
  pr.summary = String(pr.summary || "");

  if (!pr.createdAt) pr.createdAt = nowIso();
  pr.updatedAt = nowIso();

  return pr;
}

/* =========================
   BOOKS CRUD
   ========================= */

export async function getBook(id) {
  await openDB();
  return await get(BOOKS, id);
}

export async function listBooks({ limit = 2000, status = null, category = null } = {}) {
  await openDB();

  let items = await getAll(BOOKS);

  if (status) items = items.filter(b => b.status === status);
  if (category) items = items.filter(b => b.category === category);

  items.sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0));
  if (limit && items.length > limit) items = items.slice(0, limit);

  return items;
}

export async function putBook(book) {
  await openDB();

  const b = normalizeBook(book);
  await put(BOOKS, b);

  const existing = await get(PROGRESS, b.id);
  if (!existing) {
    await put(PROGRESS, normalizeProgress({ status: b.status }, b.id));
  }

  return b;
}

export async function deleteBook(bookId, { tombstone = true } = {}) {
  await openDB();

  if (tombstone) {
    await createTombstone({ storeName: BOOKS, entityId: bookId });
    await createTombstone({ storeName: PROGRESS, entityId: bookId });
  }

  await del(BOOKS, bookId);
  await del(PROGRESS, bookId);
}

/* =========================
   PROGRESS
   ========================= */

export async function getBookProgress(bookId) {
  await openDB();
  return await get(PROGRESS, bookId);
}

export async function putBookProgress(bookId, patch) {
  await openDB();

  const current = (await get(PROGRESS, bookId)) || normalizeProgress({}, bookId);
  const next = normalizeProgress({ ...current, ...(patch || {}) }, bookId);

  const book = await get(BOOKS, bookId);
  if (book) {
    book.status = next.status || book.status;
    book.updatedAt = nowIso();
    await put(BOOKS, book);
  }

  await put(PROGRESS, next);
  return next;
}

export async function setBookStatus(bookId, status) {
  const st = String(status || "").trim();
  const now = nowIso();

  const patch = { status: st, updatedAt: now };

  if (st === "reading") {
    const p = await getBookProgress(bookId);
    patch.startedAt = p?.startedAt || now;
  }

  if (st === "finished") patch.finishedAt = now;

  return await putBookProgress(bookId, patch);
}

/* =========================
   STATS
   ========================= */

export async function computeBooksStats() {
  await openDB();

  const books = await getAll(BOOKS);
  const progress = await getAll(PROGRESS);
  const byId = new Map(progress.map(p => [p.bookId, p]));

  let totalBooks = books.length;
  let finishedBooks = 0;
  let readingBooks = 0;
  let totalPagesRead = 0;

  for (const b of books) {
    const p = byId.get(b.id);
    const st = p?.status || b.status || "planned";

    if (st === "finished") finishedBooks++;
    if (st === "reading") readingBooks++;

    totalPagesRead += Number(p?.pagesRead || 0);
  }

  return { totalBooks, finishedBooks, readingBooks, totalPagesRead };
}
