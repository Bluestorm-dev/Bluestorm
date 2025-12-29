// js/constants.js
// Constantes globales BlueStorm
// Objectif: centraliser tout ce qui ne doit PAS être recodé en dur partout.
// - noms de routes
// - noms de stores IndexedDB
// - types / statuts métier
// - clés localStorage
// - timings UI
// - conventions communes
//
// 👉 Ce fichier ne contient AUCUNE logique, uniquement des valeurs.

export const APP = {
  NAME: "BlueStorm",
  VERSION: "1.0.0",
  DB_NAME: "bluestorm",
  DB_VERSION: 1
};

/* =========================
   ROUTES (SPA)
   ========================= */

export const ROUTES = {
  COCKPIT: "/",
  PROGRAM: "/program",
  WEEK: "/week",           // /week/:id
  JOURNAL: "/journal",
  JOURNAL_NEW: "/journal/new",
  FLASHCARDS: "/flashcards",
  SKILLS: "/skills",
  SETTINGS: "/settings",
  MORE: "/more",
  DEBUG: "/debug",
  ABOUT: "/about"
};

/* =========================
   INDEXEDDB STORES
   ========================= */

export const STORES = {
  PROGRAM_WEEKS: "program_weeks",
  PROGRAM_PROGRESS: "program_progress",
  JOURNAL: "journal_entries",
  FLASHCARDS: "flashcards",
  SKILLS: "skills",
  ISSUES: "issues",
  PROJECTS: "projects",
  SETTINGS: "settings",
  TOMBSTONES: "tombstones"
};

export const STORE_LIST = Object.values(STORES);

/* =========================
   LOCAL STORAGE KEYS
   ========================= */

export const LS_KEYS = {
  UI_STATE: "bluestorm.state.v1",
  SETTINGS: "bluestorm.settings.v1",
  LAST_SYNC: "bluestorm.lastSyncAt"
};

/* =========================
   JOURNAL
   ========================= */

export const JOURNAL_TYPES = {
  STUDY: "study",
  CODE: "code",
  DESIGN: "design",
  DOC: "doc",
  REVIEW: "review",
  OTHER: "other"
};

/* =========================
   FLASHCARDS
   ========================= */

export const FLASHCARD_STATUS = {
  NEW: "new",
  LEARNING: "learning",
  REVIEW: "review",
  SUSPENDED: "suspended"
};

export const FLASHCARD_RATINGS = {
  AGAIN: 0,
  HARD: 1,
  GOOD: 2,
  EASY: 3
};

/* =========================
   SKILLS / BADGES
   ========================= */

export const SKILL_STATE = {
  LOCKED: "locked",
  IN_PROGRESS: "in_progress",
  UNLOCKED: "unlocked"
};

/* =========================
   UI / UX
   ========================= */

export const UI = {
  TOAST_DURATION: 2500,
  TOAST_DURATION_LONG: 4000,
  MODAL_ANIMATION_MS: 180,
  PROGRESS_ANIMATION_MS: 180,
  DEBOUNCE_MS: 250
};

/* =========================
   SYNC
   ========================= */

export const SYNC = {
  SNAPSHOT_VERSION: 1,
  MAX_IMPORT_SIZE_MB: 10,
  STRATEGY: "last-write-wins"
};

/* =========================
   TIME HELPERS
   ========================= */

export const TIME = {
  DAY_MS: 24 * 60 * 60 * 1000,
  WEEK_MS: 7 * 24 * 60 * 60 * 1000
};

/* =========================
   DEV / FLAGS
   ========================= */

export const FLAGS = {
  DEV_MODE: false,
  ENABLE_EASTER_EGGS: true
};
