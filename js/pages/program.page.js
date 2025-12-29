// js/pages/program.page.js
// Page Programme : affiche blocs + semaines, + indicateurs de progression (à partir de program_progress).
// - Liste des blocs (depuis program_weeks stockées)
// - Pour chaque bloc : semaines cliquables -> /week/:n
// - Affiche % de complétion de la semaine (todos cochées)
//
// Dépend: db/program.store.js + router.navigate()

import { listWeeks, computeWeekCompletion } from "../db/program.store.js";
import { navigate } from "../router.js";

const $ = (sel, root = document) => root.querySelector(sel);

export async function renderProgramPage(container) {
  container.dataset.page = "program";

  container.innerHTML = `
    <section class="page-header">
      <div class="page-title">Programme</div>
      <div class="page-desc">
        Tes 2 ans de progression, découpés en blocs et semaines. Clique pour piloter.
      </div>
    </section>

    <section class="list" id="blocksList" aria-live="polite">
      ${skeletonBlocks()}
    </section>
  `;

  const weeks = await listWeeks();
  const grouped = groupByBlock(weeks);

  const blocksList = $("#blocksList", container);
  if (!weeks.length) {
    blocksList.innerHTML = emptyState();
    return;
  }

  // Render blocks
  blocksList.innerHTML = "";
  for (const block of grouped) {
    const blockEl = document.createElement("section");
    blockEl.className = "card block";

    // Compute block completion (avg of weeks)
    const weekCompletions = [];
    for (const w of block.weeks) {
      const c = await computeWeekCompletion(w.id);
      weekCompletions.push(c.percent);
    }
    const avg = weekCompletions.length
      ? Math.round(weekCompletions.reduce((a, b) => a + b, 0) / weekCompletions.length)
      : 0;

    blockEl.innerHTML = `
      <div class="block-header">
        <div>
          <div class="block-title">${escapeHtml(block.title)}</div>
          <div class="week-meta">${escapeHtml(block.months || "")}</div>
        </div>
        <div style="min-width:110px; text-align:right;">
          <div class="muted" style="font-size:0.9rem;">${avg}%</div>
          <div class="progress" aria-label="Progression du bloc">
            <div class="progress__bar" style="width:${avg}%"></div>
          </div>
        </div>
      </div>

      <div class="week-grid" style="margin-top:12px;">
        ${block.weeks.map((w) => renderWeekRow(w)).join("")}
      </div>
    `;

    // Wire week clicks + async fill progress for each row
    wireWeekLinks(blockEl, block.weeks);

    blocksList.appendChild(blockEl);
  }
}

/* =========================
   Helpers
   ========================= */

function groupByBlock(weeks) {
  // weeks already sorted by weekNumber
  const map = new Map();

  for (const w of weeks) {
    const id = w.blockId || "unknown";
    if (!map.has(id)) {
      map.set(id, {
        id,
        title: w.blockTitle || "Bloc",
        months: w.months || "",
        summary: w.blockSummary || "",
        weeks: [],
      });
    }
    map.get(id).weeks.push(w);
  }

  return Array.from(map.values()).sort((a, b) => {
    const aw = a.weeks[0]?.weekNumber ?? 0;
    const bw = b.weeks[0]?.weekNumber ?? 0;
    return aw - bw;
  });
}

function renderWeekRow(week) {
  // Progress is filled after render (async), placeholder now
  return `
    <a class="list-item week-link" href="#/week/${week.weekNumber}" data-week="${escapeHtml(week.id)}" data-wn="${week.weekNumber}">
      <div class="list-item__main" style="min-width:0;">
        <div class="list-item__title">Semaine ${week.weekNumber} — ${escapeHtml(week.title || "")}</div>
        <div class="week-meta">${escapeHtml(week.mainGoal || "")}</div>
      </div>

      <div style="display:grid; gap:8px; min-width: 86px; align-items:center;">
        <div class="muted" style="text-align:right; font-size:0.9rem;" data-pct>…</div>
        <div class="progress" aria-label="Progression semaine">
          <div class="progress__bar" data-bar style="width:0%"></div>
        </div>
      </div>
    </a>
  `;
}

function wireWeekLinks(rootEl, weeks) {
  // Click for SPA navigation
  rootEl.querySelectorAll("[data-week]").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const wn = Number(a.getAttribute("data-wn"));
      navigate(`/week/${wn}`);
    });
  });

  // Fill progress per row
  fillWeekProgress(rootEl, weeks).catch(console.error);
}

async function fillWeekProgress(rootEl, weeks) {
  // Progressive enhancement: fill each row's % without blocking initial render too long.
  for (const w of weeks) {
    const row = rootEl.querySelector(`[data-week="${cssEscape(w.id)}"]`);
    if (!row) continue;

    const pctEl = row.querySelector("[data-pct]");
    const barEl = row.querySelector("[data-bar]");

    const c = await computeWeekCompletion(w.id);
    pctEl.textContent = `${c.percent}%`;
    barEl.style.width = `${c.percent}%`;
  }
}

function emptyState() {
  return `
    <section class="card" data-focus="true">
      <div class="card__title">Programme vide</div>
      <div class="card__subtitle">
        Aucun programme n’a été chargé dans la DB.
      </div>
      <div style="margin-top:14px; display:flex; gap:12px; flex-wrap:wrap;">
        <a class="btn btn--secondary" href="#/">Retour Cockpit</a>
      </div>
    </section>
  `;
}

function skeletonBlocks() {
  const block = `
    <section class="card">
      <div class="card__title">Chargement…</div>
      <div class="card__subtitle">Préparation du programme</div>
      <div class="progress" style="margin-top:12px;">
        <div class="progress__bar" style="width:35%"></div>
      </div>
    </section>
  `;
  return block.repeat(2);
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// CSS.escape fallback (pour querySelector data-week)
function cssEscape(value) {
  if (window.CSS && CSS.escape) return CSS.escape(value);
  return String(value).replaceAll('"', '\\"');
}
