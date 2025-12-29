// js/flashcards/flashcards.engine.js
// Moteur de révision Flashcards BlueStorm (offline-first)
// Objectifs:
// - Sélectionner les cartes à réviser (due) + nouvelles (new) selon limites
// - Appliquer une planification type SM-2 (simplifiée, stable, maintenable)
// - Gérer états: new | learning | review | suspended
// - Produire des "sessions" de révision (queue) sans dépendance UI
//
// Dépendances:
// - db/flashcards.store.js : getFlashcard(), putFlashcard(), listDueFlashcards(), listNewFlashcards(), listFlashcards()
// - state/state.js ou settings localStorage pour limites (optionnel)
// - constants.js (optionnel)
//
// Notes modèle de carte (stock):
// {
//   id, question, answer, hint?,
//   themeId?, tags?, sourceId?,
//   status: "new"|"learning"|"review"|"suspended",
//   suspended: boolean,
//   createdAt, updatedAt,
//   dueAt: ISO,
//   reps: number,          // nb de révisions réussies
//   lapses: number,        // nb d'échecs (Again)
//   ease: number,          // facteur (min 1.3)
//   intervalDays: number,  // dernier intervalle en jours
//   lastReviewedAt: ISO
// }

import {
  getFlashcard,
  putFlashcard,
  listDueFlashcards,
  listNewFlashcards,
  listFlashcards
} from "../db/flashcards.store.js";

// Optionnel: si tu as centralisé des constantes
// import { FLASHCARD_RATINGS, FLASHCARD_STATUS } from "../constants.js";

const DEFAULT_LIMITS = {
  newPerDay: 10,
  reviewsPerDay: 50
};

// SM-2 (version simplifiée)
const SM2 = {
  MIN_EASE: 1.3,
  START_EASE: 2.5,
  EASY_BONUS: 0.15,
  HARD_PENALTY: 0.15,
  AGAIN_PENALTY: 0.2,

  // Intervalles de départ pour learning (jours)
  FIRST_INTERVAL_DAYS: 1,
  SECOND_INTERVAL_DAYS: 3
};

const RATING = {
  AGAIN: 0,
  HARD: 1,
  GOOD: 2,
  EASY: 3
};

/* =========================
   SESSION BUILDERS
   ========================= */

/**
 * buildReviewQueue()
 * Construit une file de révision pour "aujourd'hui":
 * - prend d'abord les DUE (jusqu'à reviewsPerDay)
 * - puis ajoute des NEW (jusqu'à newPerDay) si place
 * - option: themeId pour réviser par thème
 */
export async function buildReviewQueue({
  themeId = null,
  limits = DEFAULT_LIMITS,
  now = Date.now()
} = {}) {
  const reviewsPerDay = clampInt(limits.reviewsPerDay, 0, 500);
  const newPerDay = clampInt(limits.newPerDay, 0, 200);

  const due = await listDueFlashcards({ limit: reviewsPerDay, at: now, themeId });
  const remaining = Math.max(0, reviewsPerDay - due.length);

  // NEW: on les ajoute après les due, mais on ne dépasse pas newPerDay
  const newCards = remaining > 0
    ? await listNewFlashcards({ limit: Math.min(newPerDay, remaining), themeId })
    : [];

  // On marque les new comme "learning" quand elles entrent en session
  // (sinon elles restent éternellement new si l'utilisateur ne valide pas)
  const normalizedNew = [];
  for (const c of newCards) {
    const cc = await ensureLearningOnFirstSeen(c, now);
    normalizedNew.push(cc);
  }

  const queue = [...due, ...normalizedNew];

  return {
    meta: {
      createdAt: new Date(now).toISOString(),
      themeId: themeId || "all",
      counts: {
        due: due.length,
        new: newCards.length,
        total: queue.length
      }
    },
    queue
  };
}

/**
 * buildSearchQueue()
 * Pour une session "libre": filtre par status/theme/search.
 * Utile pour flashcardlist.page.js quand tu veux réviser un subset.
 */
export async function buildSearchQueue({
  themeId = null,
  status = null, // "new"|"learning"|"review"|"suspended"|null
  query = "",
  limit = 200
} = {}) {
  const all = await listFlashcards({ limit: 5000, themeId, status, includeSuspended: status === "suspended" });

  const q = (query || "").trim().toLowerCase();
  let filtered = all;

  if (q) {
    filtered = all.filter((c) => {
      const hay = [
        c.question,
        c.answer,
        c.hint,
        (c.tags || []).join(" "),
        c.themeId,
        c.sourceId
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }

  // Priorité : due d'abord, puis new, puis updatedAt desc
  filtered.sort((a, b) => priority(a) - priority(b) || (ms(b.updatedAt || b.createdAt) - ms(a.updatedAt || a.createdAt)));

  return {
    meta: { query: q, themeId: themeId || "all", status: status || "any" },
    queue: filtered.slice(0, limit)
  };
}

/* =========================
   REVIEW ACTION (SM-2)
   ========================= */

/**
 * reviewCard(cardId, rating)
 * rating: 0 Again | 1 Hard | 2 Good | 3 Easy
 * Met à jour la carte (ease, intervalDays, dueAt, reps, lapses, status)
 * Renvoie la carte mise à jour.
 */
export async function reviewCard(cardId, rating, { now = Date.now() } = {}) {
  const card = await getFlashcard(cardId);
  if (!card) throw new Error("Flashcard introuvable");

  if (card.suspended || card.status === "suspended") {
    // On n'évalue pas une carte suspendue
    return card;
  }

  const r = normalizeRating(rating);

  // Init champs SM2
  const c = { ...card };

  if (typeof c.ease !== "number") c.ease = SM2.START_EASE;
  if (typeof c.reps !== "number") c.reps = 0;
  if (typeof c.lapses !== "number") c.lapses = 0;
  if (typeof c.intervalDays !== "number") c.intervalDays = 0;

  const isFirst = c.reps === 0 && (c.status === "new" || !c.status);

  // Base status
  if (!c.status || c.status === "new") c.status = "learning";

  if (r === RATING.AGAIN) {
    // Échec : on remet en learning, interval court, pénalité d'ease
    c.lapses += 1;
    c.ease = Math.max(SM2.MIN_EASE, round2(c.ease - SM2.AGAIN_PENALTY));
    c.intervalDays = 0;
    c.status = "learning";
    c.dueAt = new Date(now + 10 * 60 * 1000).toISOString(); // 10 min (v1)
  }

  if (r === RATING.HARD) {
    // Difficulté : léger recul
    c.ease = Math.max(SM2.MIN_EASE, round2(c.ease - SM2.HARD_PENALTY));
    c.intervalDays = nextIntervalDays(c, "hard", isFirst);
    c.status = c.intervalDays < 3 ? "learning" : "review";
    c.dueAt = new Date(now + daysToMs(c.intervalDays)).toISOString();
    c.reps += 1;
  }

  if (r === RATING.GOOD) {
    c.intervalDays = nextIntervalDays(c, "good", isFirst);
    c.status = c.intervalDays < 3 ? "learning" : "review";
    c.dueAt = new Date(now + daysToMs(c.intervalDays)).toISOString();
    c.reps += 1;
  }

  if (r === RATING.EASY) {
    c.ease = round2(c.ease + SM2.EASY_BONUS);
    c.intervalDays = nextIntervalDays(c, "easy", isFirst);
    c.status = "review";
    c.dueAt = new Date(now + daysToMs(c.intervalDays)).toISOString();
    c.reps += 1;
  }

  c.lastReviewedAt = new Date(now).toISOString();
  c.updatedAt = new Date(now).toISOString();

  await putFlashcard(c);
  return c;
}

/* =========================
   NEW → LEARNING (first seen)
   ========================= */

async function ensureLearningOnFirstSeen(card, now) {
  // Dès qu’une carte "new" est tirée dans une session,
  // on peut la passer en learning avec une due proche (aujourd'hui)
  if (!card) return card;
  if (card.status !== "new") return card;

  const c = { ...card };
  c.status = "learning";
  c.reps = typeof c.reps === "number" ? c.reps : 0;
  c.lapses = typeof c.lapses === "number" ? c.lapses : 0;
  c.ease = typeof c.ease === "number" ? c.ease : SM2.START_EASE;
  c.intervalDays = typeof c.intervalDays === "number" ? c.intervalDays : 0;

  // Première carte: due dans 1 jour (ou même "ce soir")
  c.dueAt = c.dueAt || new Date(now + daysToMs(SM2.FIRST_INTERVAL_DAYS)).toISOString();
  c.updatedAt = new Date(now).toISOString();

  await putFlashcard(c);
  return c;
}

/* =========================
   Interval logic (simplified SM-2)
   ========================= */

function nextIntervalDays(card, mode, isFirst) {
  // Règles simples:
  // - si first: 1j, puis 3j (GOOD), EASY: 4j
  // - sinon: interval *= ease (GOOD), HARD = interval * 1.2, EASY = interval * ease * 1.3
  const prev = Math.max(0, Number(card.intervalDays) || 0);
  const ease = Math.max(SM2.MIN_EASE, Number(card.ease) || SM2.START_EASE);

  if (isFirst || prev === 0) {
    if (mode === "hard") return SM2.FIRST_INTERVAL_DAYS;      // 1
    if (mode === "good") return SM2.FIRST_INTERVAL_DAYS;      // 1
    if (mode === "easy") return 4;                            // un peu plus agressif
    return SM2.FIRST_INTERVAL_DAYS;
  }

  // Second step (si reps==1 ou interval small) on peut utiliser SECOND_INTERVAL
  if (prev <= SM2.FIRST_INTERVAL_DAYS) {
    if (mode === "hard") return 2;
    if (mode === "good") return SM2.SECOND_INTERVAL_DAYS;     // 3
    if (mode === "easy") return 5;
  }

  if (mode === "hard") return Math.max(1, Math.round(prev * 1.2));
  if (mode === "good") return Math.max(1, Math.round(prev * ease));
  if (mode === "easy") return Math.max(2, Math.round(prev * ease * 1.3));
  return Math.max(1, Math.round(prev * ease));
}

/* =========================
   Helpers
   ========================= */

function normalizeRating(r) {
  const n = Number(r);
  if (n === 0 || n === 1 || n === 2 || n === 3) return n;
  return RATING.GOOD;
}

function daysToMs(days) {
  return Math.round(Number(days) * 24 * 60 * 60 * 1000);
}

function ms(iso) {
  const t = Date.parse(iso || "");
  return Number.isFinite(t) ? t : 0;
}

function priority(card) {
  // due first, then new, then learning, then review, suspended last
  const st = card.status || "new";
  const susp = card.suspended || st === "suspended";
  if (susp) return 9;

  const dueAt = ms(card.dueAt);
  const isDue = st !== "new" && dueAt > 0 && dueAt <= Date.now();

  if (isDue) return 0;
  if (st === "new") return 1;
  if (st === "learning") return 2;
  if (st === "review") return 3;
  return 4;
}

function clampInt(n, min, max) {
  const v = Number(n);
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.trunc(v)));
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}
