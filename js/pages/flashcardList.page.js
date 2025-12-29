// js/pages/flashcardlist.page.js
// Page "Liste des flashcards" : recherche, filtres, actions (suspend/reprise/suppression),
// et accès rapide vers la révision.
// Mobile-first, offline-first.
//
// Dépendances attendues :
// - db/flashcards.store.js : listFlashcards(), putFlashcard(), deleteFlashcard(), suspendFlashcard(), unsuspendFlashcard()
// - db/tombstones.store.js : addTombstone() (si tu supprimes)
// - components/toast.js
// - components/modal.js (confirmModal)
// - components/chips.js
// - components/tabs.js (optionnel, ici on utilise chips)
// - utils/escape.js
// - router.navigate()

import { listFlashcards, putFlashcard, deleteFlashcard, suspendFlashcard, unsuspendFlashcard } from "../db/flashcards.store.js";
import { addTombstone } from "../db/tombstones.store.js";
import { toast } from "../components/toast.js";
import { confirmModal, openModal, closeModal } from "../components/modal.js";
import { mountChips } from "../components/chips.js";
import { escapeHtml } from "../utils/escape.js";
import { navigate } from "../router.js";

const $ = (sel, root = document) => root.querySelector(sel);

const FILTERS = [
  { id: "due", label: "À réviser", icon: "⏰" },
  { id: "new", label: "Nouvelles", icon: "✨" },
  { id: "learning", label: "En cours", icon: "🧠" },
  { id: "review", label: "Review", icon: "📚" },
  { id: "suspended", label: "Suspendues", icon: "🧊" },
  { id: "all", label: "Toutes", icon: "🗂️" }
];

export async function renderFlashcardListPage(container, { query } = {}) {
  container.dataset.page = "flashcardlist";

  const initialFilter = query?.filter || "due";
  const initialTheme = query?.theme || "all";

  container.innerHTML = `
    <section class="page-header">
      <div class="page-title">Flashcards</div>
      <div class="page-desc">
        Liste complète : recherche, tri, suspension, suppression. (Les révisions restent dans “Réviser”.)
      </div>
    </section>

    <section class="card" style="margin-bottom: 14px;">
      <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center; justify-content:space-between;">
        <div style="flex:1; min-width: 240px;">
          <label class="muted" for="searchInput">Recherche</label>
          <input id="searchInput" type="search" placeholder="question, réponse, tag…" autocomplete="off">
        </div>

        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button class="btn btn--secondary" id="refreshBtn" type="button">Rafraîchir</button>
          <button class="btn" id="reviewBtn" type="button">▶ Réviser</button>
        </div>
      </div>

      <div style="margin-top: 12px;">
        <div class="muted" style="margin-bottom: 6px;">Filtre</div>
        <div id="filterChips"></div>
      </div>

      <div style="margin-top: 12px;">
        <div class="muted" style="margin-bottom: 6px;">Thème</div>
        <div id="themeChips"></div>
      </div>

      <div class="muted" id="countLine" style="margin-top: 12px;">…</div>
    </section>

    <section id="listArea" class="card" style="padding: 0;">
      <div class="list" id="cardsList">
        ${skeletonRows(6)}
      </div>
    </section>
  `;

  // Wire buttons
  $("#refreshBtn", container)?.addEventListener("click", async () => {
    toast("Mise à jour…");
    await refresh(container);
    toast("OK.");
  });

  $("#reviewBtn", container)?.addEventListener("click", () => {
    // Page existante de révision
    navigate("/flashcards");
  });

  // Search debounce
  let t = null;
  $("#searchInput", container)?.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => refresh(container), 180);
  });

  // Build chips (filter + theme) once we have themes list from DB
  await initChips(container, { initialFilter, initialTheme });

  // Initial list
  await refresh(container);
}

/* =========================
   Chips init
   ========================= */

async function initChips(container, { initialFilter, initialTheme }) {
  const all = await listFlashcards({ limit: 5000 });

  const themes = buildThemes(all);
  const themeItems = [{ id: "all", label: "Tous", icon: "🏷️" }, ...themes];

  const filterMount = $("#filterChips", container);
  const themeMount = $("#themeChips", container);

  const filterApi = mountChips(filterMount, FILTERS, {
    selected: initialFilter,
    scroll: true,
    onChange: () => refresh(container)
  });

  const themeApi = mountChips(themeMount, themeItems, {
    selected: initialTheme,
    scroll: true,
    variant: "subtle",
    onChange: () => refresh(container)
  });

  // store on container for refresh()
  container._flashcardList = { filterApi, themeApi };
}

function buildThemes(cards) {
  // themeId -> count
  const map = new Map();
  for (const c of cards) {
    const id = c.themeId || "other";
    map.set(id, (map.get(id) || 0) + 1);
  }

  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([id, count]) => ({
      id,
      label: prettifyTheme(id),
      icon: "🏷️",
      count
    }));
}

function prettifyTheme(id) {
  if (id === "javascript") return "JavaScript";
  if (id === "threejs") return "Three.js";
  if (id === "html") return "HTML";
  if (id === "css") return "CSS";
  if (id === "figma") return "Figma";
  if (id === "bluestorm") return "BlueStorm";
  return id.charAt(0).toUpperCase() + id.slice(1);
}

/* =========================
   Refresh + render list
   ========================= */

async function refresh(container) {
  const listEl = $("#cardsList", container);
  const countLine = $("#countLine", container);

  const search = ($("#searchInput", container)?.value || "").trim().toLowerCase();

  const filterApi = container._flashcardList?.filterApi;
  const themeApi = container._flashcardList?.themeApi;

  const filter = filterApi?.getSelected?.() || "due";
  const theme = themeApi?.getSelected?.() || "all";

  const all = await listFlashcards({ limit: 5000 });

  const filtered = all
    .filter((c) => matchesFilter(c, filter))
    .filter((c) => theme === "all" ? true : (c.themeId || "other") === theme)
    .filter((c) => matchesSearch(c, search))
    .sort(sortByPriority);

  countLine.textContent = `${filtered.length} carte(s) affichée(s) • ${all.length} au total`;

  // Update chip counts (filter)
  if (filterApi?.setCounts) {
    const counts = computeFilterCounts(all, theme, search);
    filterApi.setCounts(counts);
  }

  // Render list
  listEl.innerHTML = filtered.length
    ? filtered.map(renderRow).join("")
    : emptyState(search);

  // Wire row actions
  listEl.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", (e) => onActionClick(e, container));
  });

  // Wire row click (open modal preview)
  listEl.querySelectorAll("[data-open]").forEach((row) => {
    row.addEventListener("click", (e) => {
      // If click on action button, ignore
      if (e.target.closest("[data-action]")) return;
      const id = row.getAttribute("data-open");
      const card = filtered.find((c) => c.id === id);
      if (card) openPreview(card, container);
    });
  });
}

function computeFilterCounts(cards, theme, search) {
  const out = {};
  for (const f of FILTERS) out[f.id] = 0;

  for (const c of cards) {
    if (theme !== "all" && (c.themeId || "other") !== theme) continue;
    if (!matchesSearch(c, search)) continue;

    for (const f of FILTERS) {
      if (matchesFilter(c, f.id)) out[f.id]++;
    }
  }
  return out;
}

function matchesSearch(card, q) {
  if (!q) return true;

  const hay = [
    card.question,
    card.answer,
    card.hint,
    card.tags?.join(" "),
    card.themeId,
    card.sourceId
  ].filter(Boolean).join(" ").toLowerCase();

  return hay.includes(q);
}

function matchesFilter(card, filter) {
  const status = card.status || "new";
  const suspended = Boolean(card.suspended) || status === "suspended";

  if (filter === "all") return true;
  if (filter === "suspended") return suspended;

  if (suspended) return false;

  if (filter === "due") {
    const dueAt = Date.parse(card.dueAt || 0) || 0;
    return status !== "new" && dueAt > 0 && dueAt <= Date.now();
  }

  if (filter === "new") return status === "new";
  if (filter === "learning") return status === "learning";
  if (filter === "review") return status === "review";

  return true;
}

function sortByPriority(a, b) {
  // due first, then new, then others, then updatedAt desc
  const pa = priority(a);
  const pb = priority(b);
  if (pa !== pb) return pa - pb;

  const ta = Date.parse(a.updatedAt || a.createdAt || 0) || 0;
  const tb = Date.parse(b.updatedAt || b.createdAt || 0) || 0;
  return tb - ta;
}

function priority(card) {
  const status = card.status || "new";
  const suspended = Boolean(card.suspended) || status === "suspended";
  if (suspended) return 9;

  const dueAt = Date.parse(card.dueAt || 0) || Infinity;
  const isDue = status !== "new" && dueAt <= Date.now();

  if (isDue) return 0;
  if (status === "new") return 1;
  if (status === "learning") return 2;
  if (status === "review") return 3;
  return 4;
}

/* =========================
   Row rendering
   ========================= */

function renderRow(card) {
  const status = card.status || "new";
  const suspended = Boolean(card.suspended) || status === "suspended";

  const dueAt = Date.parse(card.dueAt || 0) || 0;
  const isDue = !suspended && status !== "new" && dueAt && dueAt <= Date.now();

  const leftIcon = suspended ? "🧊" : isDue ? "⏰" : status === "new" ? "✨" : "📚";

  const title = card.question ? clip(card.question, 68) : "(sans question)";
  const meta = [
    prettifyTheme(card.themeId || "other"),
    statusLabel(status, suspended),
    dueLabel(dueAt, isDue, suspended)
  ].filter(Boolean).join(" • ");

  return `
    <div class="list-item flash-row" data-open="${escapeHtml(card.id)}">
      <div class="list-item__main" style="min-width:0;">
        <div class="list-item__title">
          <span aria-hidden="true">${leftIcon}</span>
          <span style="margin-left:8px;">${escapeHtml(title)}</span>
        </div>
        <div class="list-item__meta">${escapeHtml(meta)}</div>
      </div>

      <div class="row-actions" style="display:flex; gap:8px; align-items:center;">
        ${suspended
          ? actionBtn("unsuspend", card.id, "Reprendre", "▶")
          : actionBtn("suspend", card.id, "Suspendre", "⏸")}
        ${actionBtn("delete", card.id, "Supprimer", "🗑️")}
      </div>
    </div>
  `;
}

function actionBtn(action, id, label, icon) {
  return `
    <button class="btn btn--ghost btn--icon"
      type="button"
      data-action="${escapeHtml(action)}"
      data-id="${escapeHtml(id)}"
      aria-label="${escapeHtml(label)}"
      title="${escapeHtml(label)}">
      <span aria-hidden="true">${escapeHtml(icon)}</span>
    </button>
  `;
}

function statusLabel(status, suspended) {
  if (suspended) return "suspendue";
  if (status === "new") return "nouvelle";
  if (status === "learning") return "en cours";
  if (status === "review") return "review";
  return status;
}

function dueLabel(dueAt, isDue, suspended) {
  if (suspended) return null;
  if (!dueAt) return null;

  if (isDue) return "due";
  const d = new Date(dueAt);
  return `due ${d.toLocaleDateString()}`;
}

function clip(s, n) {
  const str = String(s || "");
  return str.length > n ? str.slice(0, n - 1) + "…" : str;
}

function emptyState(q) {
  if (q) {
    return `
      <div class="card" style="margin: 14px; padding: 14px;">
        <div class="card__title">Aucun résultat</div>
        <div class="card__subtitle">Essaie un autre mot clé.</div>
      </div>
    `;
  }
  return `
    <div class="card" style="margin: 14px; padding: 14px;">
      <div class="card__title">Aucune flashcard</div>
      <div class="card__subtitle">Crée ta première carte depuis le journal ou le module flashcards.</div>
      <div style="margin-top: 12px;">
        <a class="btn" href="#/flashcards">Aller aux flashcards</a>
      </div>
    </div>
  `;
}

function skeletonRows(n) {
  const row = `
    <div class="list-item">
      <div class="list-item__main">
        <div class="list-item__title">Chargement…</div>
        <div class="list-item__meta">…</div>
      </div>
    </div>
  `;
  return row.repeat(n);
}

/* =========================
   Actions
   ========================= */

async function onActionClick(e, container) {
  e.preventDefault();
  e.stopPropagation();

  const btn = e.target.closest("[data-action]");
  if (!btn) return;

  const action = btn.getAttribute("data-action");
  const id = btn.getAttribute("data-id");
  if (!id) return;

  if (action === "suspend") {
    await suspendFlashcardSafe(id);
    toast("Carte suspendue.");
    await refresh(container);
    return;
  }

  if (action === "unsuspend") {
    await unsuspendFlashcardSafe(id);
    toast("Carte réactivée.");
    await refresh(container);
    return;
  }

  if (action === "delete") {
    const ok = await confirmModal({
      title: "Supprimer la flashcard ?",
      message: "Irréversible (et synchronisé via tombstones).",
      confirmLabel: "Supprimer",
      cancelLabel: "Annuler",
      danger: true
    });
    if (!ok) return;

    await deleteFlashcardSafe(id);
    toast("Flashcard supprimée.");
    await refresh(container);
    return;
  }
}

async function suspendFlashcardSafe(id) {
  try {
    await suspendFlashcard(id);
  } catch {
    // fallback: patch
    const cards = await listFlashcards({ limit: 5000 });
    const c = cards.find((x) => x.id === id);
    if (!c) return;
    c.suspended = true;
    c.status = "suspended";
    c.updatedAt = new Date().toISOString();
    await putFlashcard(c);
  }
}

async function unsuspendFlashcardSafe(id) {
  try {
    await unsuspendFlashcard(id);
  } catch {
    const cards = await listFlashcards({ limit: 5000 });
    const c = cards.find((x) => x.id === id);
    if (!c) return;
    c.suspended = false;
    if (c.status === "suspended") c.status = "review";
    c.updatedAt = new Date().toISOString();
    await putFlashcard(c);
  }
}

async function deleteFlashcardSafe(id) {
  // tombstone first (sync)
  await addTombstone({
    storeName: "flashcards",
    entityId: id,
    deletedAt: new Date().toISOString()
  });

  await deleteFlashcard(id);
}

/* =========================
   Preview modal
   ========================= */

function openPreview(card, container) {
  const status = card.status || "new";
  const dueAt = card.dueAt ? new Date(card.dueAt).toLocaleString() : "—";

  openModal({
    title: "Flashcard",
    size: "lg",
    content: `
      <div style="display:grid; gap:12px;">
        <div class="card" style="padding: 12px; border:1px solid var(--color-border-soft); background: rgba(255,255,255,0.03);">
          <div class="muted">Question</div>
          <div style="margin-top:6px;">${escapeHtml(card.question || "(vide)")}</div>
        </div>

        <div class="card" style="padding: 12px; border:1px solid var(--color-border-soft); background: rgba(255,255,255,0.03);">
          <div class="muted">Réponse</div>
          <div style="margin-top:6px;">${escapeHtml(card.answer || "(vide)")}</div>
        </div>

        ${card.hint ? `
          <div class="card" style="padding: 12px; border:1px solid var(--color-border-soft); background: rgba(255,255,255,0.03);">
            <div class="muted">Hint</div>
            <div style="margin-top:6px;">${escapeHtml(card.hint)}</div>
          </div>
        ` : ""}

        <div class="muted" style="font-size:0.9rem;">
          Thème: <span class="mono">${escapeHtml(card.themeId || "other")}</span> •
          Status: <span class="mono">${escapeHtml(status)}</span> •
          Due: <span class="mono">${escapeHtml(dueAt)}</span>
        </div>
      </div>
    `,
    actions: [
      {
        label: "Fermer",
        variant: "secondary",
        onClick: closeModal
      },
      {
        label: "Réviser",
        variant: "primary",
        onClick: () => {
          closeModal();
          navigate("/flashcards");
        }
      }
    ]
  });
}
