// js/pages/week.page.js
// Détail d'une semaine : objectifs + todos (checklist) + stats + raccourcis journal/flashcards + BOOKS (lectures liées).
// - Lit la semaine depuis program_weeks
// - Lit / écrit progression dans program_progress via program.store
// - Affiche les sessions de lecture liées à cette semaine (reading_sessions.linkedWeekId)
//
// Dépend: db/program.store.js + db/reading.store.js + db/books.store.js + router.navigate() + components/toast.js

import {
  getWeekByNumber,
  computeWeekCompletion,
  getWeekProgress,
  setTodoChecked,
  addTimeSpent,
  setWeekStatus,
} from "../db/program.store.js";

import { listReadingSessionsByWeek } from "../db/reading.store.js";
import { getBook } from "../db/books.store.js";

import { toast } from "../components/toast.js";
import { navigate } from "../router.js";

const $ = (sel, root = document) => root.querySelector(sel);

export async function renderWeekPage(container, { weekNumber } = {}) {
  container.dataset.page = "week";

  const week = await getWeekByNumber(Number(weekNumber));
  if (!week) {
    container.innerHTML = notFound(weekNumber);
    return;
  }

  // Prépare l'id de semaine (string) qui sera utilisé côté Books/Reading
  // Ton program.store semble stocker week.id, on le garde.
  const weekId = String(week.id);

  // Base render
  container.innerHTML = `
    <section class="week-head">
      <div class="page-title">Semaine ${week.weekNumber}</div>
      <div class="week-sub">${escapeHtml(week.title || "")}</div>
      ${week.mainGoal ? `<div class="muted">${escapeHtml(week.mainGoal)}</div>` : ""}
    </section>

    <section class="card">
      <div class="hero-row">
        <div class="kpi">
          <div class="kpi__value" id="pctKpi">0%</div>
          <div class="kpi__label">Complétion</div>
        </div>

        <div class="kpi">
          <div class="kpi__value" id="timeKpi">0 min</div>
          <div class="kpi__label">Temps</div>
        </div>

        <div class="kpi">
          <div class="kpi__value" id="statusKpi">TODO</div>
          <div class="kpi__label">Statut</div>
        </div>
      </div>

      <div style="margin-top:12px;">
        <div class="progress">
          <div class="progress__bar" id="weekProgressBar" style="width:0%"></div>
        </div>
        <small id="countLine" class="muted">—</small>
      </div>

      <div style="margin-top:14px; display:flex; gap:12px; flex-wrap:wrap;">
        <button class="btn btn--secondary" id="add10Btn" type="button">+10 min</button>
        <button class="btn btn--secondary" id="add30Btn" type="button">+30 min</button>
        <button class="btn btn--ghost" id="markDoneBtn" type="button">Marquer DONE</button>
      </div>
    </section>

    ${renderGoals(week.secondaryGoals)}

    <section class="todo-section">
      <div class="todo-title">
        <span>Checklist</span>
        <a class="btn btn--ghost" href="#/program" id="backProgramLink">Programme</a>
      </div>

     ${renderTodoGroupFromList("Coding", "coding", week.c || [])}
${renderTodoGroupFromList("Figma", "figma", week.f || [])}
${renderTodoGroupFromList("Projet", "project", week.pr || [])}
${renderTodoGroupFromList("Pédago / Culture", "pedagogy", week.ped || [])}

    </section>

    <!-- ✅ NEW: Lectures liées à la semaine -->
    <section class="card" style="margin-top: 16px;" id="readingCard">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:12px;">
        <div>
          <div class="card__title">📚 Lectures liées</div>
          <div class="card__subtitle">Sessions de lecture associées à cette semaine.</div>
        </div>

        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn btn--secondary" id="addReadingBtn" type="button">＋ Session</button>
          <button class="btn btn--ghost" id="openBooksBtn" type="button">Books</button>
        </div>
      </div>

      <div id="readingList" style="margin-top:12px; display:grid; gap:10px;">
        ${renderReadingLoading()}
      </div>
    </section>

    <section class="card" style="margin-top: 16px;">
      <div class="card__title">Raccourcis</div>
      <div class="card__subtitle">Trace et consolide cette semaine.</div>

      <div style="margin-top:12px; display:flex; gap:12px; flex-wrap:wrap;">
        <button class="btn" id="journalBtn" type="button">+ Journal</button>
        <button class="btn btn--secondary" id="flashBtn" type="button">Flashcards</button>
      </div>
    </section>
  `;

  // Events
  $("#backProgramLink", container)?.addEventListener("click", (e) => {
    e.preventDefault();
    navigate("/program");
  });

  $("#journalBtn", container)?.addEventListener("click", () => {
    // on passe weekId en query
    navigate("/journal/new", { week: String(weekId), theme: guessThemeFromWeek(week) });
  });

  $("#flashBtn", container)?.addEventListener("click", () => {
    navigate("/flashcards", { theme: guessThemeFromWeek(week) });
  });

  // ✅ NEW: Books shortcuts
  $("#openBooksBtn", container)?.addEventListener("click", () => {
    navigate("/books");
  });

  $("#addReadingBtn", container)?.addEventListener("click", () => {
    // On pré-remplit weekId + bookId sera choisi sur l'écran Books ou on peut créer une route chooser plus tard.
    // Ici: on va sur Books et tu choisis le livre, puis "Session".
    // Option plus directe: /reading/new?weekId=... (et on ajoutera un select livre)
    navigate("/books", { week: weekId });
  });

  $("#add10Btn", container)?.addEventListener("click", async () => {
    await safeTimeAdd(container, week.id, 10);
  });

  $("#add30Btn", container)?.addEventListener("click", async () => {
    await safeTimeAdd(container, week.id, 30);
  });

  $("#markDoneBtn", container)?.addEventListener("click", async () => {
    try {
      await setWeekStatus(week.id, "done");
      toast("Semaine marquée DONE.");
      await refreshHeader(container, week.id);
    } catch (e) {
      console.error(e);
      toast("Erreur: statut.");
    }
  });

  // Wire todos checkboxes
  container.querySelectorAll("[data-todo]").forEach((row) => {
    const todoId = row.getAttribute("data-todo");
    const cb = row.querySelector("input[type='checkbox']");
    cb?.addEventListener("change", async () => {
      try {
        await setTodoChecked(week.id, todoId, cb.checked);
        await refreshHeader(container, week.id);
      } catch (e) {
        console.error(e);
        toast("Erreur: todo.");
      }
    });
  });

  // Initial refresh to set checkbox states and KPIs
  await hydrateTodos(container, week);
  await refreshHeader(container, week.id);

  // ✅ NEW: load reading sessions linked to this week
  await hydrateReading(container, weekId);
}

/* =========================
   Hydration & KPIs
   ========================= */

async function hydrateTodos(container, week) {
  const progress = (await getWeekProgress(week.id)) || {
    checkedTodoIds: [],
    timeSpentMinutes: 0,
    status: "todo",
  };

  const checked = new Set(progress.checkedTodoIds || []);
  container.querySelectorAll("[data-todo]").forEach((row) => {
    const todoId = row.getAttribute("data-todo");
    const cb = row.querySelector("input[type='checkbox']");
    if (cb) cb.checked = checked.has(todoId);
  });
}

async function refreshHeader(container, weekId) {
  const c = await computeWeekCompletion(weekId);
  const p = await getWeekProgress(weekId);

  const time = Number(p?.timeSpentMinutes || 0);
  const status = String(p?.status || "todo").toUpperCase();

  $("#pctKpi", container).textContent = `${c.percent}%`;
  $("#timeKpi", container).textContent = `${time} min`;
  $("#statusKpi", container).textContent = status;

  $("#weekProgressBar", container).style.width = `${c.percent}%`;
  $("#countLine", container).textContent = `${c.done} / ${c.total} tâches`;
}

async function safeTimeAdd(container, weekId, minutes) {
  try {
    await addTimeSpent(weekId, minutes);
    toast(`+${minutes} min`);
    await refreshHeader(container, weekId);
  } catch (e) {
    console.error(e);
    toast("Erreur: temps.");
  }
}

/* =========================
   ✅ Reading (Books) section
   ========================= */

async function hydrateReading(container, weekId) {
  const host = $("#readingList", container);
  if (!host) return;

  host.innerHTML = renderReadingLoading();

  try {
    const sessions = await listReadingSessionsByWeek(weekId, { limit: 20 });

    if (!sessions.length) {
      host.innerHTML = renderReadingEmpty(weekId);
      return;
    }

    // Cache books for titles
    const cache = new Map();
    for (const s of sessions) {
      if (!cache.has(s.bookId)) {
        cache.set(s.bookId, await getBook(s.bookId));
      }
    }

    host.innerHTML = sessions.map((s) => renderReadingRow(s, cache.get(s.bookId))).join("");

    // click to open book
    host.querySelectorAll("[data-open-book]").forEach((el) => {
      el.addEventListener("click", () => {
        navigate("/book", { id: el.getAttribute("data-open-book") });
      });
    });

    // quick add session (open book first)
    host.querySelectorAll("[data-add-session]").forEach((el) => {
      el.addEventListener("click", () => {
        const bookId = el.getAttribute("data-add-session");
        navigate("/reading/new", { bookId, weekId });
      });
    });

  } catch (e) {
    console.error(e);
    host.innerHTML = `
      <div class="card" style="padding:12px; opacity:.75; border:1px dashed var(--color-border-soft);">
        <div class="card__title">Erreur lectures</div>
        <div class="card__subtitle">Impossible de charger les sessions liées.</div>
      </div>
    `;
  }
}

function renderReadingRow(s, book) {
  const title = book?.title || "Livre";
  const date = shortDate(s.dateStart);
  const meta = [
    (s.fromPage || s.toPage) ? `p.${s.fromPage || "?"}→${s.toPage || "?"}` : "",
    s.pages ? `${s.pages} pages` : "",
    s.minutes ? `${s.minutes} min` : ""
  ].filter(Boolean).join(" • ");

  return `
    <div class="row--card" style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start;">
      <div style="flex:1; min-width:0; cursor:pointer;" data-open-book="${escapeHtml(s.bookId)}">
        <div class="row__title">${escapeHtml(title)}</div>
        <div class="row__meta">${escapeHtml(date)} • ${escapeHtml(meta)}</div>
        ${s.notes ? `<div class="muted" style="margin-top:6px;">${escapeHtml(s.notes)}</div>` : ""}
      </div>

      <button class="btn btn--ghost" type="button" data-add-session="${escapeHtml(s.bookId)}">＋</button>
    </div>
  `;
}

function renderReadingEmpty(weekId) {
  return `
    <div class="card" style="padding:12px; opacity:.75; border:1px dashed var(--color-border-soft);">
      <div class="card__title">Aucune lecture liée</div>
      <div class="card__subtitle">
        Ajoute une session de lecture et lie-la à <span class="mono">${escapeHtml(weekId)}</span>.
      </div>
      <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap;">
        <a class="btn btn--secondary" href="#/books">Aller à Books</a>
      </div>
    </div>
  `;
}

function renderReadingLoading() {
  return `
    <div class="card" style="padding:12px; opacity:.7;">
      <div class="card__subtitle">Chargement…</div>
    </div>
  `;
}

function shortDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(+d)) return "—";
  return d.toLocaleDateString();
}

/* =========================
   Render helpers
   ========================= */

function renderGoals(goals) {
  if (!Array.isArray(goals) || goals.length === 0) return "";
  return `
    <section class="card" style="margin-top: 16px;">
      <div class="card__title">Objectifs secondaires</div>
      <div class="list" style="margin-top: 12px;">
        ${goals.map((g) => `
          <div class="list-item">
            <div class="list-item__main">
              <div class="list-item__title">${escapeHtml(g)}</div>
            </div>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function renderTodoGroup(title, key, todos) {
  if (!todos.length) return "";

  return `
    <section class="card" style="margin-top: 12px;">
      <div class="card__title" style="font-size:1.1rem;">${escapeHtml(title)}</div>
      <div class="todo-list" style="margin-top: 12px;">
        ${todos.map((t) => renderTodoRow(t, key)).join("")}
      </div>
    </section>
  `;
}

function renderTodoRow(todo, groupKey) {
  // expected: {id, title, minutes?, notes?}
  const id = todo.id || `${groupKey}-${Math.random().toString(36).slice(2)}`;
  const title = todo.title || todo.label || "Todo";
  const mins = todo.minutes ? ` • ${todo.minutes} min` : "";
  const note = todo.note || todo.notes || "";

  return `
    <div class="todo" data-todo="${escapeHtml(id)}">
      <label style="display:flex; gap:12px; align-items:flex-start; cursor:pointer; width:100%;">
        <input type="checkbox" />
        <span style="display:grid; gap:4px; min-width:0;">
          <span style="font-weight: var(--font-weight-medium);">${escapeHtml(title)}</span>
          <span class="muted" style="font-size:0.9rem;">
            ${escapeHtml(groupKey.toUpperCase())}${escapeHtml(mins)}
          </span>
          ${note ? `<span class="dim" style="font-size:0.9rem;">${escapeHtml(note)}</span>` : ""}
        </span>
      </label>
    </div>
  `;
}

function notFound(weekNumber) {
  return `
    <section class="card" data-focus="true">
      <div class="card__title">Semaine introuvable</div>
      <div class="card__subtitle">Semaine ${escapeHtml(String(weekNumber))} inconnue.</div>
      <div style="margin-top:14px;">
        <a class="btn btn--secondary" href="#/program">Retour au programme</a>
      </div>
    </section>
  `;
}

function guessThemeFromWeek(week) {
  // Heuristique: si le titre / objectifs contiennent des mots
  const text = `${week.title || ""} ${week.mainGoal || ""}`.toLowerCase();
  if (text.includes("three")) return "threejs";
  if (text.includes("figma")) return "figma";
  if (text.includes("css")) return "css";
  if (text.includes("html")) return "html";
  if (text.includes("js") || text.includes("javascript")) return "javascript";
  return "bluestorm";
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function renderTodoGroupFromList(title, key, list) {
  if (!Array.isArray(list) || !list.length) return "";

  // list est un tableau de strings dans ton JSON
  const todos = list.map((txt, idx) => ({
    id: `${key}-${idx + 1}`,
    title: String(txt || "").trim(),
  })).filter(t => t.title);

  return renderTodoGroup(title, key, todos);
}
