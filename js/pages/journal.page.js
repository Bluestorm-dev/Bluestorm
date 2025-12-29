// js/pages/journal.page.js
// Page Journal : liste + recherche + filtres (thème / type / période) + actions rapides.
// Dépend de: /js/db/journal.store.js + components/toast.js + router.navigate()

import * as JournalStore from "/js/db/journal.store.js";
import { toast } from "../components/toast.js";
import { navigate } from "../router.js";

console.log("journal.page.js loaded", import.meta.url);

const THEMES = [
  { id: "bluestorm", label: "BlueStorm" },
  { id: "html", label: "HTML" },
  { id: "css", label: "CSS" },
  { id: "javascript", label: "JavaScript" },
  { id: "threejs", label: "Three.js" },
  { id: "figma", label: "Figma" },
];

const TYPES = [
  { id: "note", label: "Note" },
  { id: "study", label: "Study" },
  { id: "code", label: "Code" },
  { id: "doc", label: "Doc" },
  { id: "debug", label: "Debug" },
  { id: "design", label: "Design" },
  { id: "idea", label: "Idée" },
];

const PERIODS = [
  { id: "all", label: "Tout" },
  { id: "3", label: "3 jours" },
  { id: "7", label: "7 jours" },
  { id: "14", label: "14 jours" },
];

const $ = (sel, root = document) => root.querySelector(sel);

/* =========================
   Entry point
   ========================= */

export async function renderJournalPage(container, { query } = {}) {
  container.dataset.page = "journal";

  // query example: ?theme=javascript&type=code&days=7&q=dom
  const initialTheme = query?.theme || "";
  const initialType = query?.type || "";
  const initialDays = query?.days || "7";
  const initialQ = query?.q || "";

  container.innerHTML = `
    <section class="page-header">
      <div class="page-title">Journal</div>
      <div class="page-desc">
        Trace ce que tu fais vraiment : code, doc, Three.js, Figma… tout compte.
      </div>
    </section>

    <section class="journal-toolbar">
      <div class="search" role="search">
        <span class="dim" aria-hidden="true">🔎</span>
        <input id="searchInput" type="search" placeholder="Rechercher (ex: DOM, three, bug…)" autocomplete="off" />
      </div>

      <div style="display:flex; gap:12px; justify-content:flex-end;">
        <button class="btn" id="addEntryBtn" type="button">+ Nouvelle</button>
      </div>
    </section>

    <section class="card" style="margin-bottom: 14px;">
      <div class="chips" id="filterChips"></div>
      <div style="margin-top: 12px; display:grid; gap:12px;">
        <div class="field">
          <label class="muted" for="themeSelect">Thème</label>
          <select id="themeSelect"></select>
        </div>
        <div class="field">
          <label class="muted" for="typeSelect">Type</label>
          <select id="typeSelect"></select>
        </div>
        <div class="field">
          <label class="muted" for="daysSelect">Période</label>
          <select id="daysSelect"></select>
        </div>
      </div>
    </section>

    <section class="list" id="entriesList" aria-live="polite"></section>
  `;

  // Fill selects
  fillSelect($("#themeSelect", container), [{ id: "", label: "Tous" }, ...THEMES], initialTheme);
  fillSelect($("#typeSelect", container), [{ id: "", label: "Tous" }, ...TYPES], initialType);
  fillSelect(
    $("#daysSelect", container),
    PERIODS,
    PERIODS.some((p) => p.id === initialDays) ? initialDays : "7"
  );

  // Chips (quick filters)
  renderQuickChips($("#filterChips", container), {
    theme: initialTheme,
    type: initialType,
    days: initialDays,
    q: initialQ,
  });

  // Wire events
  const searchInput = $("#searchInput", container);
  searchInput.value = initialQ;

  $("#addEntryBtn", container)?.addEventListener("click", () => {
    navigate("/journal/new", { from: "journal" });
  });

  $("#themeSelect", container)?.addEventListener("change", () => refreshFromUI(container));
  $("#typeSelect", container)?.addEventListener("change", () => refreshFromUI(container));
  $("#daysSelect", container)?.addEventListener("change", () => refreshFromUI(container));

  let searchTimer = null;
  searchInput?.addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => refreshFromUI(container), 220);
  });

  // Initial load
  await refreshList(container);
}

/* =========================
   Refresh logic
   ========================= */

async function refreshFromUI(container) {
  const theme = $("#themeSelect", container).value || "";
  const type = $("#typeSelect", container).value || "";
  const days = $("#daysSelect", container).value || "7";
  const q = ($("#searchInput", container).value || "").trim();

  // Update chips UI
  renderQuickChips($("#filterChips", container), { theme, type, days, q });

  // Update URL (share/bookmark)
  const query = {};
  if (theme) query.theme = theme;
  if (type) query.type = type;
  if (days && days !== "all") query.days = days;
  if (q) query.q = q;

  const qs = new URLSearchParams(query).toString();
  location.hash = `#/journal${qs ? `?${qs}` : ""}`;

  await refreshList(container);
}

async function refreshList(container) {
  const theme = $("#themeSelect", container).value || "";
  const type = $("#typeSelect", container).value || "";
  const days = $("#daysSelect", container).value || "7";
  const q = ($("#searchInput", container).value || "").trim();

  const listEl = $("#entriesList", container);
  listEl.innerHTML = skeletonList();

  // ---- Resolve functions safely (fallbacks) ----
  const listEntries =
    JournalStore.listEntries ||
    (async (opts) => (JournalStore.listJournalEntries ? JournalStore.listJournalEntries(opts) : []));

  const listRecentEntries =
    JournalStore.listRecentEntries ||
    (async ({ days = 7, limit = 200 } = {}) => {
      const all = await listEntries({ limit: 5000 });
      const cutoff = Date.now() - Number(days || 0) * 86400000;
      const recent = all.filter((e) => Date.parse(e.dateStart || e.createdAt || 0) >= cutoff);
      recent.sort((a, b) => Date.parse(b.dateStart || b.createdAt || 0) - Date.parse(a.dateStart || a.createdAt || 0));
      return recent.slice(0, limit);
    });

  const searchEntries =
    JournalStore.searchEntries ||
    (async (query, opts = {}) => {
      const qlow = String(query || "").trim().toLowerCase();
      const items = await listEntries({ ...(opts || {}), limit: 5000 });
      if (!qlow) return items;
      return items.filter((e) => {
        const hay = `${e.title || ""} ${e.notes || ""} ${e.type || ""} ${e.themeId || ""}`.toLowerCase();
        return hay.includes(qlow);
      });
    });

  const deleteEntry =
    JournalStore.deleteEntry ||
    (async (id) => (JournalStore.deleteJournalEntry ? JournalStore.deleteJournalEntry(id) : null));

  // ---- Load data ----
  let entries = [];

  try {
    if (q) {
      entries = await searchEntries(q, { limit: 200 });
    } else if (days && days !== "all") {
      entries = await listRecentEntries({ days: Number(days), limit: 200 });
    } else {
      entries = await listEntries({ limit: 200 });
    }
  } catch (e) {
    console.error(e);
    listEl.innerHTML = errorState("Erreur lors du chargement du journal.");
    return;
  }

  // Apply theme/type filters
  if (theme) entries = entries.filter((e) => (e.themeId || "bluestorm") === theme);
  if (type) entries = entries.filter((e) => (e.type || "note") === type);

  // Render
  if (!entries.length) {
    listEl.innerHTML = emptyState();
    return;
  }

  listEl.innerHTML = entries.map(renderEntryRow).join("");

  // Wire delete buttons
  listEl.querySelectorAll("[data-del]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-del");
      const ok = confirm("Supprimer cette entrée ? (elle sera supprimée au prochain sync)");
      if (!ok) return;

      try {
        await deleteEntry(id);
        toast("Entrée supprimée.");
        await refreshList(container);
      } catch (e) {
        console.error(e);
        toast("Erreur suppression.");
      }
    });
  });

  // Wire "create flashcard from entry" (hook)
  listEl.querySelectorAll("[data-mkcard]").forEach((btn) => {
    btn.addEventListener("click", () => {
      toast("Bientôt : créer une flashcard depuis cette entrée.");
    });
  });
}

/* =========================
   UI pieces
   ========================= */

function renderEntryRow(e) {
  const date = safeDateLabel(e.dateStart || e.createdAt);
  const mins = Number(e.durationMinutes || e.minutes || 0) || 0;
  const theme = e.themeId || "bluestorm";
  const meta = `${date} • ${mins} min • ${theme}`;

  const type = (e.type || "note").toUpperCase();
  const previewSrc = (e.notes || e.title || "").trim();
  const preview = previewSrc.length > 160 ? `${previewSrc.slice(0, 160)}…` : (previewSrc || "—");

  return `
    <article class="list-item journal-item" style="align-items:flex-start;">
      <div class="list-item__main" style="min-width:0;">
        <div class="journal-item__title">${escapeHtml(type)}</div>
        <div class="list-item__meta">${escapeHtml(meta)}</div>
        <div class="journal-item__text">${escapeHtml(preview)}</div>
        ${
          (e.tags && e.tags.length)
            ? `<div class="chips" style="margin-top:10px;">
                 ${e.tags.slice(0, 6).map(t => `<span class="chip">${escapeHtml(t)}</span>`).join("")}
               </div>`
            : ""
        }
      </div>

      <div style="display:flex; flex-direction:column; gap:10px; align-items:flex-end;">
        <button class="btn btn--ghost" data-mkcard="${escapeHtml(e.id)}" type="button" title="Créer une flashcard">🃏</button>
        <button class="btn btn--danger" data-del="${escapeHtml(e.id)}" type="button" title="Supprimer">🗑</button>
      </div>
    </article>
  `;
}

function renderQuickChips(container, { theme, type, days, q }) {
  const chips = [];
  chips.push(
    chipHtml(`Thème: ${labelFor(THEMES, theme)}`, !theme),
    chipHtml(`Type: ${labelFor(TYPES, type)}`, !type),
    chipHtml(`Période: ${labelFor(PERIODS, days)}`, days === "all"),
    chipHtml(q ? `Recherche: "${q}"` : "Recherche: —", !q)
  );
  container.innerHTML = chips.join("");
}

function chipHtml(text, inactive) {
  return `<span class="chip ${inactive ? "" : "chip--active"}">${escapeHtml(text)}</span>`;
}

function fillSelect(selectEl, items, selectedId) {
  selectEl.innerHTML = items
    .map((it) => `<option value="${escapeHtml(it.id)}">${escapeHtml(it.label)}</option>`)
    .join("");
  selectEl.value = selectedId || "";
}

function labelFor(list, id) {
  if (!id) return "Tous";
  const found = list.find((x) => x.id === id);
  return found ? found.label : id;
}

function emptyState() {
  return `
    <section class="card" data-focus="true">
      <div class="card__title">Aucune entrée</div>
      <div class="card__subtitle">
        Ajoute une entrée : ce que tu as lu, codé, compris, raté, ou découvert.
      </div>
      <div style="margin-top:14px; display:flex; gap:12px; flex-wrap:wrap;">
        <a class="btn" href="#/journal/new">+ Nouvelle entrée</a>
        <a class="btn btn--secondary" href="#/program">Voir le programme</a>
      </div>
    </section>
  `;
}

function errorState(msg) {
  return `
    <section class="card" data-focus="true">
      <div class="card__title">Oups</div>
      <div class="card__subtitle">${escapeHtml(msg)}</div>
      <div style="margin-top:14px;">
        <a class="btn btn--secondary" href="#/cockpit">Retour cockpit</a>
      </div>
    </section>
  `;
}

function skeletonList() {
  const row = `
    <div class="list-item">
      <div class="list-item__main">
        <div class="list-item__title">Chargement…</div>
        <div class="list-item__meta">…</div>
      </div>
    </div>
  `;
  return row.repeat(4);
}

function safeDateLabel(iso) {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return "Date ?";
  const d = new Date(t);
  return d.toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short" });
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* =========================
   ALIASES + HELPERS (compat pages)
   ========================= */

// alias déjà ok chez toi
export async function listEntries(opts = {}) {
  return await listJournalEntries(opts);
}
export async function deleteEntry(id, opts) {
  return await deleteJournalEntry(id, opts);
}
export async function saveEntry(entry) {
  return await putJournalEntry(entry);
}

// ✅ manquant : journalNew.page.js attend addEntry()
export async function addEntry(entry) {
  return await putJournalEntry(entry);
}

// ✅ manquant : journal.page.js attend listEntriesByTheme / listEntriesByType
export async function listEntriesByTheme(themeId, { limit = 200 } = {}) {
  return await listJournalEntries({ themeId, limit });
}
export async function listEntriesByType(type, { limit = 200 } = {}) {
  return await listJournalEntries({ type, limit });
}

// ✅ manquant : journal.page.js attend searchEntries()
export async function searchEntries(query, { limit = 200 } = {}) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return await listJournalEntries({ limit });

  const all = await listJournalEntries({ limit: 2000 }); // on élargit un peu
  const items = all.filter((e) => {
    const hay = [
      e.title,
      e.notes,
      e.text,
      e.type,
      e.themeId,
      ...(Array.isArray(e.tags) ? e.tags : []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return hay.includes(q);
  });

  return items.slice(0, limit);
}

