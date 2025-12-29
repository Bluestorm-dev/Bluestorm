// js/db/program.store.js
// Programme (weeks) — IndexedDB stores: "program_weeks" + "program_progress"
// Source: ./data/program.v1.json (schema v2.compact supporté)
//
// API exposée (attendue par week.page.js):
// - ensureProgramLoaded()
// - listWeeks({limit})
// - getWeekByNumber(weekNumber)
// - computeWeekCompletion(weekId)
// - getWeekProgress(weekId)
// - setTodoChecked(weekId, todoId, checked)
// - addTimeSpent(weekId, minutes, meta?)
// - setWeekStatus(weekId, status)
//
// Stock progress (program_progress):
// { weekId, checkedTodoIds:[], timeSpentMinutes:0, status:"todo", sessions:[], updatedAt, createdAt }

import { openDB, get, getAll, put } from "./db.js";

const STORE_WEEKS = "program_weeks";
const STORE_PROGRESS = "program_progress";

function nowIso() {
  return new Date().toISOString();
}

function weekIdFromNumber(n) {
  // IMPORTANT: stable + pad pour éviter week_1 vs week_01
  const nn = Number(n);
  return `week_${String(nn).padStart(2, "0")}`;
}

function clampInt(x, min = 0, max = 1e9) {
  const n = Math.floor(Number(x || 0));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function safeStr(x) {
  return String(x ?? "").trim();
}

/* =========================
   PUBLIC API
   ========================= */

export async function ensureProgramLoaded() {
  await openDB();

  const existing = await getAll(STORE_WEEKS);
  if (existing && existing.length) {
    return { loaded: true, count: existing.length, source: "idb" };
  }

  const data = await fetchProgramJson();
  const weeks = mapProgramJsonToWeeks(data);

  for (const w of weeks) {
    await put(STORE_WEEKS, w);
  }

  return { loaded: true, count: weeks.length, source: "json" };
}

export async function listWeeks({ limit = 5000 } = {}) {
  await openDB();
  await ensureProgramLoaded();

  let weeks = await getAll(STORE_WEEKS);
  weeks.sort((a, b) => Number(a.weekNumber) - Number(b.weekNumber));

  if (limit && weeks.length > limit) weeks = weeks.slice(0, limit);
  return weeks;
}

export async function getWeekByNumber(weekNumber) {
  await openDB();
  await ensureProgramLoaded();

  const id = weekIdFromNumber(weekNumber);
  return await get(STORE_WEEKS, id);
}

// Completion simple : % basé sur todos cochées
export async function computeWeekCompletion(weekId) {
  await openDB();

  const week = await get(STORE_WEEKS, weekId);
  if (!week) return { percent: 0, done: 0, total: 0 };

  const progress = (await getWeekProgress(weekId)) || defaultProgress(weekId);
  const checked = new Set(progress.checkedTodoIds || []);

  const todoIds = extractAllTodoIds(week);
  const total = todoIds.length;
  const done = todoIds.filter((id) => checked.has(id)).length;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  return { percent, done, total, progress };
}

export async function getWeekProgress(weekId) {
  await openDB();
  const p = await get(STORE_PROGRESS, weekId);
  return p || null;
}

export async function setTodoChecked(weekId, todoId, checked) {
  await openDB();

  const current = (await get(STORE_PROGRESS, weekId)) || defaultProgress(weekId);
  const set = new Set(current.checkedTodoIds || []);

  if (checked) set.add(todoId);
  else set.delete(todoId);

  const next = {
    ...current,
    checkedTodoIds: Array.from(set),
    updatedAt: nowIso(),
  };

  await put(STORE_PROGRESS, next);
  return next;
}

// Ajoute du temps (minutes) sur la semaine
export async function addTimeSpent(weekId, minutes, meta = {}) {
  await openDB();

  const m = clampInt(minutes, 0, 24 * 60);
  if (!weekId) throw new Error("weekId requis");
  if (!m) return (await get(STORE_PROGRESS, weekId)) || defaultProgress(weekId);

  const current = (await get(STORE_PROGRESS, weekId)) || defaultProgress(weekId);

  const next = {
    ...current,
    timeSpentMinutes: clampInt(current.timeSpentMinutes, 0) + m,
    sessions: [
      ...(Array.isArray(current.sessions) ? current.sessions : []),
      {
        id: cryptoId("time"),
        minutes: m,
        at: nowIso(),
        note: meta.note ? safeStr(meta.note) : "",
        source: meta.source ? safeStr(meta.source) : "manual",
      },
    ],
    updatedAt: nowIso(),
  };

  await put(STORE_PROGRESS, next);
  return next;
}

export async function setWeekStatus(weekId, status) {
  await openDB();

  const st = safeStr(status).toLowerCase();
  const allowed = new Set(["todo", "doing", "done"]);
  const nextStatus = allowed.has(st) ? st : "todo";

  const current = (await get(STORE_PROGRESS, weekId)) || defaultProgress(weekId);
  const next = { ...current, status: nextStatus, updatedAt: nowIso() };
  await put(STORE_PROGRESS, next);
  return next;
}

/* =========================
   INTERNAL HELPERS
   ========================= */

function defaultProgress(weekId) {
  return {
    weekId,
    checkedTodoIds: [],
    timeSpentMinutes: 0,
    status: "todo",
    sessions: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

function extractAllTodoIds(week) {
  // Ton week UI s’appuie sur week.todos.{coding,figma,project,pedagogy}
  // mais en base on stocke week.tasks[] (plat) OU week.todos (groupé).
  // On supporte les 2.
  const ids = [];

  if (week?.todos && typeof week.todos === "object") {
    for (const k of Object.keys(week.todos)) {
      const arr = Array.isArray(week.todos[k]) ? week.todos[k] : [];
      for (const t of arr) if (t?.id) ids.push(String(t.id));
    }
    return ids;
  }

  const tasks = Array.isArray(week?.tasks) ? week.tasks : [];
  for (const t of tasks) if (t?.id) ids.push(String(t.id));
  return ids;
}

function cryptoId(prefix = "id") {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

/* =========================
   LOADING + MAPPING
   ========================= */

async function fetchProgramJson() {
  const res = await fetch("./data/program.v1.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`program.v1.json fetch failed: ${res.status}`);
  return await res.json();
}

function mapProgramJsonToWeeks(data) {
  if (!data || !Array.isArray(data.weeks)) return [];

  // ✅ support bluestorm.program.v2.compact (ton format)
  if (data.schema && String(data.schema).includes("v2.compact")) {
    return data.weeks.map((w) => {
      const n = Number(w.n);
      const id = weekIdFromNumber(n);

      // ✅ on construit "todos" groupés + "tasks" plat (compat ancienne UI si besoin)
      const todos = buildTodosFromCompactWeek(w, id);
      const tasks = flattenTodosToTasks(todos);

      return {
        id,
        weekNumber: n,
        title: w.t || "",
        mainGoal: w.obj || "",
        objective: w.obj || "",
        minTime: w.min || "",
        optiTime: w.opti || "",
        secondaryGoals: Array.isArray(w.sec) ? w.sec : [],
        sections: Array.isArray(w.sec) ? w.sec : [],
        todos,   // ✅ pour week.page.js moderne (groupé)
        tasks,   // ✅ compat computeWeekCompletion “ancien”
        blockId: inferBlockId(data.blocks, n),
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
    });
  }

  // fallback (déjà full)
  return data.weeks.map((w) => ({
    id: w.id || weekIdFromNumber(w.weekNumber),
    weekNumber: Number(w.weekNumber || 0),
    title: w.title || "",
    mainGoal: w.mainGoal || w.objective || "",
    objective: w.objective || "",
    minTime: w.minTime || "",
    optiTime: w.optiTime || "",
    secondaryGoals: Array.isArray(w.secondaryGoals) ? w.secondaryGoals : [],
    todos: w.todos || null,
    tasks: Array.isArray(w.tasks) ? w.tasks : [],
    blockId: w.blockId || null,
    createdAt: w.createdAt || nowIso(),
    updatedAt: nowIso(),
  }));
}

function inferBlockId(blocks, weekNumber) {
  if (!Array.isArray(blocks)) return null;
  const b = blocks.find((x) => weekNumber >= Number(x.ws) && weekNumber <= Number(x.we));
  return b ? Number(b.b) : null;
}

function buildTodosFromCompactWeek(w, weekId) {
  // Ton compact :
  // - c : coding
  // - f : figma
  // - pr : project
  // - ped : pedagogy
  const map = [
    { key: "c", out: "coding", label: "Coding" },
    { key: "f", out: "figma", label: "Figma" },
    { key: "pr", out: "project", label: "Projet" },
    { key: "ped", out: "pedagogy", label: "Pédago" },
  ];

  const todos = {};
  for (const g of map) {
    const arr = Array.isArray(w[g.key]) ? w[g.key] : [];
    todos[g.out] = arr
      .map((text, idx) => safeStr(text))
      .filter(Boolean)
      .map((text, idx) => {
        // ✅ ID stable (pas de random)
        return {
          id: `${weekId}_${g.out}_${String(idx + 1).padStart(2, "0")}`,
          title: text,
          minutes: estimateMinutes(text),
          notes: "",
          group: g.label,
        };
      });
  }

  return todos;
}

function flattenTodosToTasks(todos) {
  // compat “tasks[]”
  const tasks = [];
  if (!todos) return tasks;

  for (const groupKey of Object.keys(todos)) {
    const arr = Array.isArray(todos[groupKey]) ? todos[groupKey] : [];
    for (const t of arr) {
      tasks.push({
        id: String(t.id),
        group: t.group || groupKey,
        text: t.title || t.text || "",
      });
    }
  }
  return tasks;
}

function estimateMinutes(text) {
  const len = String(text || "").length;
  if (len <= 20) return 10;
  if (len <= 60) return 20;
  if (len <= 120) return 30;
  return 40;
}
