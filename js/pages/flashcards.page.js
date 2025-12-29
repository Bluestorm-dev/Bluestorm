// js/pages/flashcards.page.js
// Page "Réviser" : session flashcards (DUE + NEW) + UI de notation (Again/Hard/Good/Easy)
// Mobile-first, offline-first.
//
// Dépendances:
// - flashcards/flashcards.engine.js : buildReviewQueue(), reviewCard()
// - db/flashcards.store.js : computeFlashcardsStats() (pour header)
// - components/progressbar.js : ProgressBar() / setProgress() (optionnel)
// - components/toast.js
// - components/chips.js (optionnel: filtre thème)
// - utils/escape.js
// - router.navigate()

import { buildReviewQueue, reviewCard } from "../flashcards/flashcards.engine.js";
import { computeFlashcardsStats } from "../db/flashcards.store.js";
import { toast } from "../components/toast.js";
import { ProgressBar, setProgress } from "../components/progressBar.js";
import { escapeHtml } from "../utils/escape.js";
import { navigate } from "../router.js";
import { State } from "../state/state.js";

const $ = (sel, root = document) => root.querySelector(sel);

const RATINGS = [
  { id: 0, label: "Again", hint: "10 min", emoji: "🔁", variant: "danger" },
  { id: 1, label: "Hard", hint: "plus court", emoji: "🧱", variant: "warning" },
  { id: 2, label: "Good", hint: "normal", emoji: "✅", variant: "primary" },
  { id: 3, label: "Easy", hint: "plus long", emoji: "⚡", variant: "secondary" }
];

export async function renderFlashcardsPage(container, { query } = {}) {
  container.dataset.page = "flashcards";

  // Limits depuis settings (localStorage)
  const settings = State.settings.all();
  const limits = {
    newPerDay: Number(settings.dailyNewCardsLimit ?? 10),
    reviewsPerDay: Number(settings.dailyReviewLimit ?? 50)
  };

  // Theme filter optionnel (si tu passes ?theme=javascript)
  const themeId = query?.theme || null;

  // Session state (runtime)
  const session = await buildReviewQueue({ themeId, limits });
  const queue = [...(session.queue || [])];

  const stats = await computeFlashcardsStats();

  const state = {
    themeId,
    limits,
    queue,
    index: 0,
    flipped: false,
    startedAt: Date.now(),
    done: 0,
    againCount: 0
  };

  container._flashReview = state;

  container.innerHTML = `
    <section class="page-header">
      <div class="page-title">Réviser</div>
      <div class="page-desc">
        ${themeId ? `Thème: <span class="mono">${escapeHtml(themeId)}</span> • ` : ""}
        Due: ${stats.due} • New: ${stats.new} • Total: ${stats.total}
      </div>
    </section>

    <section class="card" style="margin-bottom: 14px;">
      <div style="display:flex; gap:12px; align-items:center; justify-content:space-between; flex-wrap:wrap;">
        <div class="muted">
          Session: <span id="sessionMeta">…</span>
        </div>
        <div style="display:flex; gap:10px;">
          <button class="btn btn--secondary" id="backToListBtn" type="button">Liste</button>
          <button class="btn btn--ghost" id="restartBtn" type="button">Recommencer</button>
        </div>
      </div>

      <div style="margin-top: 12px;" id="progressMount"></div>
    </section>

    <section class="card" id="cardArea" style="padding: 14px;">
      ${renderCardOrEmpty(state)}
    </section>

    <section class="card" style="margin-top: 14px;">
      <div class="muted" style="margin-bottom: 10px;">Notation</div>
      <div class="rating-grid" id="ratingGrid">
        ${RATINGS.map(btnHtml).join("")}
      </div>
      <div class="muted" style="margin-top: 10px; font-size: 0.9rem;">
        Astuce: touche <span class="mono">Espace</span> pour retourner la carte.
      </div>
    </section>
  `;

  // Progressbar
  $("#progressMount", container).innerHTML = ProgressBar({
    value: progressValue(state),
    label: "Progression",
    showPercent: true
  });

  $("#sessionMeta", container).textContent =
    `${session.meta.counts.total} carte(s) • ${session.meta.counts.due} due • ${session.meta.counts.new} new`;

  // Buttons
  $("#restartBtn", container)?.addEventListener("click", () => navigate("/flashcards"));
  $("#backToListBtn", container)?.addEventListener("click", () => navigate("/flashcardlist"));

  // Flip card on click
  container.addEventListener("click", (e) => {
    const flip = e.target.closest("[data-flip]");
    if (!flip) return;
    toggleFlip(container);
  });

  // Rating buttons
  $("#ratingGrid", container)?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-rate]");
    if (!btn) return;

    const rating = Number(btn.getAttribute("data-rate"));
    await applyRating(container, rating);
  });

  // Keyboard shortcuts
  window.addEventListener("keydown", (e) => onKeyDown(e, container));

  // Cleanup handler when route changes (simple)
  container._dispose = () => window.removeEventListener("keydown", (e) => onKeyDown(e, container));
}

/* =========================
   Render
   ========================= */

function renderCardOrEmpty(state) {
  if (!state.queue.length) {
    return `
      <div class="card" style="padding: 14px;">
        <div class="card__title">Rien à réviser 🎉</div>
        <div class="card__subtitle">
          Tu es à jour. Tu peux créer des cartes depuis le journal.
        </div>
        <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap;">
          <a class="btn" href="#/journal/new">Ajouter au journal</a>
          <a class="btn btn--secondary" href="#/flashcardlist">Voir la liste</a>
        </div>
      </div>
    `;
  }

  const card = state.queue[state.index];
  const q = card?.question || "(question vide)";
  const a = card?.answer || "(réponse vide)";
  const hint = card?.hint ? `<div class="muted" style="margin-top:10px;">💡 ${escapeHtml(card.hint)}</div>` : "";

  const tagLine = [
    card?.themeId ? `#${card.themeId}` : null,
    card?.status ? card.status : null
  ].filter(Boolean).join(" • ");

  return `
    <div class="review-card ${state.flipped ? "is-flipped" : ""}" data-flip="1">
      <div class="review-card__top">
        <div class="muted">Carte ${state.index + 1} / ${state.queue.length}</div>
        <div class="mono muted">${escapeHtml(tagLine)}</div>
      </div>

      <div class="review-card__face review-card__front">
        <div class="review-card__label">Question</div>
        <div class="review-card__text">${escapeHtml(q)}</div>
        ${hint}
        <div class="review-card__tap muted">Tap pour voir la réponse</div>
      </div>

      <div class="review-card__face review-card__back">
        <div class="review-card__label">Réponse</div>
        <div class="review-card__text">${escapeHtml(a)}</div>
        <div class="review-card__tap muted">Tap pour revenir</div>
      </div>
    </div>
  `;
}

/* =========================
   Interactions
   ========================= */

function toggleFlip(container) {
  const st = container._flashReview;
  if (!st.queue.length) return;
  st.flipped = !st.flipped;
  rerenderCard(container);
}

async function applyRating(container, rating) {
  const st = container._flashReview;
  if (!st.queue.length) return;

  const current = st.queue[st.index];
  if (!current) return;

  // Safety: rating only after flip? (UX)
  if (!st.flipped) {
    toast("Retourne la carte d’abord.");
    return;
  }

  // Apply engine update
  try {
    const updated = await reviewCard(current.id, rating);
    st.queue[st.index] = updated;
  } catch (e) {
    console.error(e);
    toast("Erreur de sauvegarde.");
    return;
  }

  if (rating === 0) st.againCount += 1;

  // Next
  st.done += 1;
  st.index += 1;
  st.flipped = false;

  if (st.index >= st.queue.length) {
    showEndState(container);
    return;
  }

  // Update progress + card
  updateProgress(container);
  rerenderCard(container);
}

function rerenderCard(container) {
  const st = container._flashReview;
  $("#cardArea", container).innerHTML = renderCardOrEmpty(st);
}

function updateProgress(container) {
  const st = container._flashReview;
  const mount = $("#progressMount", container);
  const root = mount.querySelector(".progress");
  setProgress(root, progressValue(st), { showPercent: true });
}

function progressValue(st) {
  if (!st.queue.length) return 100;
  const v = Math.round((st.done / st.queue.length) * 100);
  return Math.max(0, Math.min(100, v));
}

function showEndState(container) {
  const st = container._flashReview;
  const minutes = Math.max(1, Math.round((Date.now() - st.startedAt) / 60000));

  $("#cardArea", container).innerHTML = `
    <div class="card" style="padding: 14px;">
      <div class="card__title">Session terminée ✅</div>
      <div class="card__subtitle">
        ${st.done} carte(s) • ${minutes} min • ${st.againCount} “Again”
      </div>
      <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap;">
        <button class="btn" id="againBtn" type="button">Relancer une session</button>
        <a class="btn btn--secondary" href="#/flashcardlist">Liste</a>
        <a class="btn btn--ghost" href="#/">Cockpit</a>
      </div>
    </div>
  `;

  updateProgress(container);

  $("#againBtn", container)?.addEventListener("click", () => navigate("/flashcards"));
  toast("Bien joué 🎉");
}

/* =========================
   Keyboard
   ========================= */

function onKeyDown(e, container) {
  const st = container._flashReview;
  if (!st) return;

  // Space flips
  if (e.code === "Space") {
    e.preventDefault();
    toggleFlip(container);
    return;
  }

  // 1-4 ratings
  if (e.key === "1") return applyRating(container, 0);
  if (e.key === "2") return applyRating(container, 1);
  if (e.key === "3") return applyRating(container, 2);
  if (e.key === "4") return applyRating(container, 3);
}

/* =========================
   Buttons render
   ========================= */

function btnHtml(b) {
  // variants: btn--danger/--warning/--secondary/--primary
  const cls =
    b.variant === "danger" ? "btn btn--danger" :
    b.variant === "warning" ? "btn btn--secondary" :
    b.variant === "secondary" ? "btn btn--secondary" :
    "btn";

  return `
    <button class="${cls}" type="button" data-rate="${b.id}">
      <div style="display:flex; align-items:center; gap:10px; justify-content:center;">
        <span aria-hidden="true">${escapeHtml(b.emoji)}</span>
        <span>${escapeHtml(b.label)}</span>
      </div>
      <div class="muted" style="font-size:0.8rem; margin-top:4px;">${escapeHtml(b.hint)}</div>
    </button>
  `;
}
