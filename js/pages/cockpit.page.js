// js/pages/cockpit.page.js
// Cockpit BlueStorm : vue synthèse (programme + journal + flashcards)

import { listWeeks, computeWeekCompletion } from "../db/program.store.js";
import { listRecentEntries, computeJournalStats } from "../db/journal.store.js";
import { listDueCards, computeFlashcardsStats } from "../db/flashcards.store.js";
import { navigate } from "../router.js";

const $ = (sel, root = document) => root.querySelector(sel);

/* =========================
   ENTRY POINT
   ========================= */

export async function renderCockpitPage(container) {
  container.dataset.page = "cockpit";

  container.innerHTML = `
    <section class="page-header">
      <div class="page-title">Cockpit</div>
      <div class="page-desc">
        Vision globale de ta formation BlueStorm.
      </div>
    </section>

    <section class="cockpit-grid">
      <section class="card hero" id="programCard"></section>
      <section class="card" id="journalCard"></section>
      <section class="card" id="flashcardsCard"></section>
      <section class="card" id="nextActionsCard"></section>
    </section>
  `;

  await Promise.all([
    renderProgramStatus($("#programCard", container)),
    renderJournalStatus($("#journalCard", container)),
    renderFlashcardsStatus($("#flashcardsCard", container)),
    renderNextActions($("#nextActionsCard", container)),
  ]);
}

/* =========================
   PROGRAM STATUS
   ========================= */

async function renderProgramStatus(el) {
  const weeks = await listWeeks();
  if (!weeks.length) {
    el.innerHTML = emptyCard("Programme", "Programme non chargé.");
    return;
  }

  // Semaine "active" = première non terminée
  let currentWeek = weeks[0];
  for (const w of weeks) {
    const progress = await computeWeekCompletion(w.id);
    if (progress.percent < 100) {
      currentWeek = w;
      break;
    }
  }

  const completion = await computeWeekCompletion(currentWeek.id);

  el.innerHTML = `
    <div class="card__title">Programme</div>
    <div class="card__subtitle">
      Semaine ${currentWeek.weekNumber} — ${currentWeek.title}
    </div>

    <div style="margin-top:12px;">
      <div class="progress">
        <div class="progress__bar" style="width:${completion.percent}%"></div>
      </div>
      <small>${completion.done} / ${completion.total} tâches</small>
    </div>

    <div style="margin-top:14px;">
      <button class="btn" id="goWeekBtn">Continuer la semaine</button>
    </div>
  `;

  $("#goWeekBtn", el)?.addEventListener("click", () => {
    navigate(`/week/${currentWeek.weekNumber}`);
  });
}

/* =========================
   JOURNAL STATUS
   ========================= */

async function renderJournalStatus(el) {
  const stats = await computeJournalStats({ days: 7 });
  const recent = await listRecentEntries({ days: 3, limit: 3 });

  el.innerHTML = `
    <div class="card__title">Journal</div>
    <div class="card__subtitle">
      ${stats.entries} entrées • ${Math.round(stats.totalMinutes / 60)} h (7 jours)
    </div>

    <div class="list" style="margin-top:12px;">
      ${recent.map(renderJournalItem).join("")}
    </div>

    <div style="margin-top:14px;">
      <a class="btn btn--secondary" href="#/journal">Voir le journal</a>
    </div>
  `;
}

function renderJournalItem(e) {
  return `
    <div class="list-item">
      <div class="list-item__main">
        <div class="list-item__title">${escapeHtml(e.type || "note")}</div>
        <div class="list-item__meta">
          ${new Date(e.dateStart).toLocaleDateString()} • ${e.durationMinutes || 0} min
        </div>
      </div>
    </div>
  `;
}

/* =========================
   FLASHCARDS STATUS
   ========================= */

async function renderFlashcardsStatus(el) {
  const stats = await computeFlashcardsStats();
  const due = await listDueCards({ limit: 5 });

  el.innerHTML = `
    <div class="card__title">Flashcards</div>
    <div class="card__subtitle">
      ${stats.due} à réviser • ${stats.new} nouvelles
    </div>

    <div class="list" style="margin-top:12px;">
      ${
        due.length
          ? due.map(
              () => `
            <div class="list-item">
              <div class="list-item__main">
                <div class="list-item__title">Carte à réviser</div>
                <div class="list-item__meta">Due maintenant</div>
              </div>
            </div>
          `
            ).join("")
          : `<small>Aucune carte due 🎉</small>`
      }
    </div>

    <div style="margin-top:14px;">
      <a class="btn btn--secondary" href="#/flashcards">Réviser maintenant</a>
    </div>
  `;
}

/* =========================
   NEXT ACTIONS (SMART)
   ========================= */

async function renderNextActions(el) {
  const weeks = await listWeeks();
  const actions = [];

  // 1) Retard programme
  for (const w of weeks.slice(0, 4)) {
    const c = await computeWeekCompletion(w.id);
    if (c.percent < 50) {
      actions.push(`Avancer la semaine ${w.weekNumber}`);
      break;
    }
  }

  // 2) Flashcards
  const flashStats = await computeFlashcardsStats();
  if (flashStats.due > 0) {
    actions.push(`Réviser ${flashStats.due} flashcards`);
  }

  // 3) Journal
  const journalStats = await computeJournalStats({ days: 2 });
  if (journalStats.entries === 0) {
    actions.push("Ajouter une entrée de journal aujourd’hui");
  }

  el.innerHTML = `
    <div class="card__title">Prochaines actions</div>
    <div class="list" style="margin-top:12px;">
      ${
        actions.length
          ? actions.map(
              (a) => `
            <div class="list-item">
              <div class="list-item__main">
                <div class="list-item__title">${a}</div>
              </div>
            </div>
          `
            ).join("")
          : `<small>Tout est aligné 👍</small>`
      }
    </div>
  `;
}

/* =========================
   HELPERS
   ========================= */

function emptyCard(title, subtitle) {
  return `
    <div class="card__title">${title}</div>
    <div class="card__subtitle">${subtitle}</div>
  `;
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
