// js/db/flashcards.store.js
// Store Flashcards (IndexedDB)
//
// Store: "flashcards"
// Indexes: byDueAt, byTheme, byStatus, byUpdatedAt, bySource
//
// Dépendances: db.js + tombstones.store.js

import { openDB, get, getAll, put, del } from "./db.js";
import { createTombstone } from "./tombstones.store.js";

const STORE = "flashcards";

/* =========================
   Helpers
   ========================= */

function nowIso() {
  return new Date().toISOString();
}

function ensureId(card) {
  if (card.id) return card.id;
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `fc_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function normalize(card) {
  const c = { ...(card || {}) };

  c.id = ensureId(c);

  if (!c.createdAt) c.createdAt = nowIso();
  c.updatedAt = nowIso();

  // new | learning | review | suspended
  if (!c.status) c.status = "new";

  if (c.status === "suspended") c.suspended = true;
  if (c.suspended === true && c.status !== "suspended") c.status = "suspended";
  if (c.suspended !== true && c.status === "suspended") c.suspended = true;

  if (c.dueAt && typeof c.dueAt === "number") {
    c.dueAt = new Date(c.dueAt).toISOString();
  }

  if (Array.isArray(c.tags)) c.tags = c.tags.filter(Boolean).map(String);
  else if (c.tags == null) c.tags = [];

  if (typeof c.reps !== "number") c.reps = Number(c.reps || 0);
  if (typeof c.ease !== "number") c.ease = Number(c.ease || 2.5);
  if (typeof c.intervalDays !== "number") c.intervalDays = Number(c.intervalDays || 0);

  return c;
}

function toMs(iso) {
  const t = Date.parse(iso || "");
  return Number.isFinite(t) ? t : 0;
}

function isDue(card, at = Date.now()) {
  if (!card) return false;
  if (card.suspended || card.status === "suspended") return false;
  if (card.status === "new") return false;
  const due = toMs(card.dueAt);
  return due > 0 && due <= at;
}

/* =========================
   CRUD
   ========================= */

export async function getFlashcard(id) {
  await openDB();
  return await get(STORE, id);
}

export async function putFlashcard(card) {
  await openDB();
  const c = normalize(card);
  await put(STORE, c);
  return c;
}

export async function deleteFlashcard(id, { tombstone = true } = {}) {
  await openDB();

  if (tombstone) {
    await createTombstone({
      storeName: STORE,
      entityId: id
    });
  }

  await del(STORE, id);
}

export async function suspendFlashcard(id) {
  await openDB();
  const c = await get(STORE, id);
  if (!c) return null;

  c.suspended = true;
  c.status = "suspended";
  c.updatedAt = nowIso();

  await put(STORE, c);
  return c;
}

export async function unsuspendFlashcard(id) {
  await openDB();
  const c = await get(STORE, id);
  if (!c) return null;

  c.suspended = false;
  if (c.status === "suspended") c.status = "review";
  c.updatedAt = nowIso();

  await put(STORE, c);
  return c;
}

/* =========================
   LIST / QUERIES
   ========================= */

export async function listFlashcards({
  limit = 5000,
  themeId = null,
  status = null,
  includeSuspended = true,
  dueOnly = false,
  at = Date.now()
} = {}) {
  await openDB();

  let items = [];

  if (themeId) {
    items = await getAll(STORE, "byTheme", themeId);
  } else if (status) {
    items = await getAll(STORE, "byStatus", status);
  } else {
    items = await getAll(STORE);
  }

  if (!includeSuspended) {
    items = items.filter(c => !(c.suspended || c.status === "suspended"));
  }

  if (dueOnly) {
    items = items.filter(c => isDue(c, at));
  }

  items.sort((a, b) => toMs(b.updatedAt || b.createdAt) - toMs(a.updatedAt || a.createdAt));

  if (limit && items.length > limit) items = items.slice(0, limit);

  return items;
}

export async function listDueFlashcards({ limit = 200, at = Date.now(), themeId = null } = {}) {
  const cards = await listFlashcards({ limit: 5000, themeId, includeSuspended: false });
  const due = cards.filter(c => isDue(c, at));
  due.sort((a, b) => toMs(a.dueAt) - toMs(b.dueAt));
  return due.slice(0, limit);
}

export async function listNewFlashcards({ limit = 200, themeId = null } = {}) {
  const cards = await listFlashcards({ limit: 5000, themeId, includeSuspended: false });
  const neu = cards.filter(c => c.status === "new");
  neu.sort((a, b) => toMs(a.createdAt) - toMs(b.createdAt));
  return neu.slice(0, limit);
}

/* =========================
   STATS
   ========================= */

export async function computeFlashcardsStats({ at = Date.now() } = {}) {
  await openDB();
  const all = await getAll(STORE);

  let total = 0;
  let suspended = 0;
  let due = 0;
  let neu = 0;
  let learning = 0;
  let review = 0;

  for (const c of all) {
    total++;
    const st = c.status || "new";
    const susp = c.suspended || st === "suspended";

    if (susp) suspended++;
    if (st === "new" && !susp) neu++;
    if (st === "learning" && !susp) learning++;
    if (st === "review" && !susp) review++;
    if (isDue(c, at)) due++;
  }

  return { total, suspended, due, new: neu, learning, review };
}

/* =========================
   BULK
   ========================= */

export async function upsertManyFlashcards(cards = []) {
  await openDB();
  const out = [];
  for (const c of cards) {
    out.push(await putFlashcard(c));
  }
  return out;
}
/* =========================
   ALIASES (compat cockpit)
   ========================= */

// cockpit.page.js attend listDueCards()
// => alias vers listDueFlashcards()
export async function listDueCards({ limit = 200, at = Date.now(), themeId = null } = {}) {
  return await listDueFlashcards({ limit, at, themeId });
}

// optionnel : alias si tu utilises aussi listNewCards quelque part
export async function listNewCards({ limit = 200, themeId = null } = {}) {
  return await listNewFlashcards({ limit, themeId });
}
