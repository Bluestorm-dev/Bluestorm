// js/db/db.js
// IndexedDB centralisée — BlueStorm
// Versions :
// V1 → core (program, journal, flashcards, skills, tombstones)
// V2 → books, reading, quotes

const DB_NAME = "bluestorm";
const DB_VERSION = 2;

let _db = null;

/* =========================
   OPEN / INIT
   ========================= */

export function openDB() {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = req.result;
      const oldVersion = event.oldVersion || 0;

      if (oldVersion < 1) {
        createStoresV1(db);
      }

      if (oldVersion < 2) {
        createStoresV2(db);
      }
    };

    req.onsuccess = () => {
      _db = req.result;
      resolve(_db);
    };

    req.onerror = () => reject(req.error);
  });
}

/* =========================
   STORES – VERSION 1
   ========================= */

function createStoresV1(db) {
  if (!db.objectStoreNames.contains("program_weeks")) {
    const programWeeks = db.createObjectStore("program_weeks", { keyPath: "id" });
    programWeeks.createIndex("byWeekNumber", "weekNumber", { unique: true });
    programWeeks.createIndex("byBlock", "blockId", { unique: false });
  }

  if (!db.objectStoreNames.contains("program_progress")) {
    const programProgress = db.createObjectStore("program_progress", { keyPath: "weekId" });
    programProgress.createIndex("byUpdatedAt", "updatedAt", { unique: false });
  }

  if (!db.objectStoreNames.contains("journal_entries")) {
    const journal = db.createObjectStore("journal_entries", { keyPath: "id" });
    journal.createIndex("byDateStart", "dateStart", { unique: false });
    journal.createIndex("byUpdatedAt", "updatedAt", { unique: false });
    journal.createIndex("byTheme", "themeId", { unique: false });
    journal.createIndex("byWeek", "weekId", { unique: false });
    journal.createIndex("byTodo", "todoId", { unique: false });
    journal.createIndex("byType", "type", { unique: false });
  }

  if (!db.objectStoreNames.contains("flashcards")) {
    const flashcards = db.createObjectStore("flashcards", { keyPath: "id" });
    flashcards.createIndex("byDueAt", "dueAt", { unique: false });
    flashcards.createIndex("byTheme", "themeId", { unique: false });
    flashcards.createIndex("byStatus", "status", { unique: false });
    flashcards.createIndex("byUpdatedAt", "updatedAt", { unique: false });
    flashcards.createIndex("bySource", "sourceId", { unique: false });
  }

  if (!db.objectStoreNames.contains("skills")) {
    const skills = db.createObjectStore("skills", { keyPath: "id" });
    skills.createIndex("byWeek", "weekId", { unique: false });
    skills.createIndex("byState", "state", { unique: false });
    skills.createIndex("byUpdatedAt", "updatedAt", { unique: false });
  }

  if (!db.objectStoreNames.contains("issues")) {
    const issues = db.createObjectStore("issues", { keyPath: "id" });
    issues.createIndex("byTheme", "themeId", { unique: false });
    issues.createIndex("byUpdatedAt", "updatedAt", { unique: false });
  }

  if (!db.objectStoreNames.contains("projects")) {
    const projects = db.createObjectStore("projects", { keyPath: "id" });
    projects.createIndex("byTheme", "themeId", { unique: false });
    projects.createIndex("byUpdatedAt", "updatedAt", { unique: false });
  }

  if (!db.objectStoreNames.contains("settings")) {
    db.createObjectStore("settings", { keyPath: "key" });
  }

  if (!db.objectStoreNames.contains("tombstones")) {
    const tombstones = db.createObjectStore("tombstones", { keyPath: "id" });
    tombstones.createIndex("byDeletedAt", "deletedAt", { unique: false });
    tombstones.createIndex("byStore", "storeName", { unique: false });
  }
}

/* =========================
   STORES – VERSION 2
   ========================= */

function createStoresV2(db) {
  if (!db.objectStoreNames.contains("books")) {
    const books = db.createObjectStore("books", { keyPath: "id" });
    books.createIndex("byTitle", "title", { unique: false });
    books.createIndex("byAuthor", "author", { unique: false });
    books.createIndex("byCategory", "category", { unique: false });
    books.createIndex("byStatus", "status", { unique: false });
    books.createIndex("byUpdatedAt", "updatedAt", { unique: false });
  }

  if (!db.objectStoreNames.contains("book_progress")) {
    const bookProgress = db.createObjectStore("book_progress", { keyPath: "bookId" });
    bookProgress.createIndex("byStatus", "status", { unique: false });
    bookProgress.createIndex("byLastSessionAt", "lastSessionAt", { unique: false });
    bookProgress.createIndex("byUpdatedAt", "updatedAt", { unique: false });
  }

  if (!db.objectStoreNames.contains("reading_sessions")) {
    const sessions = db.createObjectStore("reading_sessions", { keyPath: "id" });
    sessions.createIndex("byBook", "bookId", { unique: false });
    sessions.createIndex("byDateStart", "dateStart", { unique: false });
    sessions.createIndex("byUpdatedAt", "updatedAt", { unique: false });
    sessions.createIndex("byWeek", "linkedWeekId", { unique: false });
  }

  if (!db.objectStoreNames.contains("book_quotes")) {
    const quotes = db.createObjectStore("book_quotes", { keyPath: "id" });
    quotes.createIndex("byBook", "bookId", { unique: false });
    quotes.createIndex("byPage", "page", { unique: false });
    quotes.createIndex("byUpdatedAt", "updatedAt", { unique: false });
  }
}

/* =========================
   GENERIC HELPERS (SAFE)
   ========================= */

async function storeTx(storeName, mode = "readonly") {
  const db = await openDB();
  return db.transaction(storeName, mode).objectStore(storeName);
}

export async function get(storeName, key) {
  const store = await storeTx(storeName);
  return new Promise((resolve, reject) => {
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function getAll(storeName, indexName = null, query = null) {
  const store = await storeTx(storeName);
  const source = indexName ? store.index(indexName) : store;
  return new Promise((resolve, reject) => {
    const req = source.getAll(query);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function put(storeName, value) {
  const store = await storeTx(storeName, "readwrite");
  return new Promise((resolve, reject) => {
    const req = store.put(value);
    req.onsuccess = () => resolve(value);
    req.onerror = () => reject(req.error);
  });
}

export async function del(storeName, key) {
  const store = await storeTx(storeName, "readwrite");
  return new Promise((resolve, reject) => {
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function clear(storeName) {
  const store = await storeTx(storeName, "readwrite");
  return new Promise((resolve, reject) => {
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
