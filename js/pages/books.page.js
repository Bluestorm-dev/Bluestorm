// js/pages/books.page.js
// Page Books : catalogue + progression lecture (offline IndexedDB)
// Dépend de: db/books.store.js (+ reading.store.js optionnel), components/toast.js, router.navigate()

import {
  listBooks,
  putBook,
  deleteBook,
  setBookStatus,
  getBookProgress,
  computeBooksStats
} from "../db/books.store.js";

import { toast } from "../components/toast.js";
import { navigate } from "../router.js";

const $ = (sel, root = document) => root.querySelector(sel);

export async function renderBooksPage(container, { query } = {}) {
  container.dataset.page = "books";

  const q0 = (query?.q || "").trim();
  const status0 = query?.status || "all"; // all | planned | reading | paused | finished

  container.innerHTML = `
    <section class="page-header">
      <div class="page-title">Books</div>
      <div class="page-desc">Suivi de lecture : livres, progression, sessions.</div>
    </section>

    <section class="card" id="booksStats"></section>

    <section class="books-toolbar">
      <div class="search" role="search">
        <span class="dim" aria-hidden="true">🔎</span>
        <input id="booksSearch" type="search" placeholder="Rechercher (titre, auteur…)" autocomplete="off" />
      </div>

      <div style="display:flex; gap:12px; justify-content:flex-end; flex-wrap:wrap;">
        <select id="statusSelect" class="select">
          <option value="all">Tous</option>
          <option value="planned">Planned</option>
          <option value="reading">Reading</option>
          <option value="paused">Paused</option>
          <option value="finished">Finished</option>
        </select>

        <button class="btn" id="addBookBtn" type="button">+ Ajouter</button>
      </div>
    </section>

    <section class="list" id="booksList" aria-live="polite"></section>

    <!-- mini modal simple (sans ton modal.js pour éviter dépendances) -->
    <div class="overlay" id="bookModal" hidden>
      <div class="modal card">
        <div class="card__title">Ajouter un livre</div>
        <div class="field" style="margin-top:12px;">
          <label>Titre</label>
          <input id="mTitle" type="text" placeholder="Ex: JavaScript – The Good Parts" />
        </div>
        <div class="field">
          <label>Auteur</label>
          <input id="mAuthor" type="text" placeholder="Ex: Douglas Crockford" />
        </div>
        <div class="field">
          <label>Catégorie</label>
          <input id="mCategory" type="text" placeholder="ux | dev | js | design | 3d | ..." />
        </div>
        <div class="field">
          <label>Langue</label>
          <select id="mLang">
            <option value="fr">fr</option>
            <option value="en">en</option>
          </select>
        </div>
        <div class="field">
          <label>Format</label>
          <select id="mFormat">
            <option value="paper">paper</option>
            <option value="ebook">ebook</option>
            <option value="audio">audio</option>
          </select>
        </div>
        <div class="field">
          <label>Pages totales (option)</label>
          <input id="mPages" type="number" min="0" step="1" value="0" />
        </div>

        <div style="display:flex; gap:12px; justify-content:flex-end; margin-top:14px;">
          <button class="btn btn--secondary" id="mCancel" type="button">Annuler</button>
          <button class="btn" id="mSave" type="button">Enregistrer</button>
        </div>
      </div>
    </div>
  `;

  // init controls
  $("#booksSearch", container).value = q0;
  $("#statusSelect", container).value = status0;

  $("#addBookBtn", container).addEventListener("click", () => openModal(container));
  $("#mCancel", container).addEventListener("click", () => closeModal(container));
  $("#bookModal", container).addEventListener("click", (e) => {
    if (e.target?.id === "bookModal") closeModal(container);
  });

  $("#mSave", container).addEventListener("click", async () => {
    await onSaveBook(container);
  });

  let t = null;
  $("#booksSearch", container).addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => refreshBooks(container), 180);
  });
  $("#statusSelect", container).addEventListener("change", () => refreshBooks(container));

  await refreshBooks(container);
}

/* =========================
   Refresh
   ========================= */

async function refreshBooks(container) {
  const q = ($("#booksSearch", container).value || "").trim().toLowerCase();
  const status = $("#statusSelect", container).value || "all";

  // stats
  const stats = await computeBooksStats();
  $("#booksStats", container).innerHTML = `
    <div class="card__title">Stats</div>
    <div class="card__subtitle">
      ${stats.totalBooks} livres • ${stats.readingBooks} en cours • ${stats.finishedBooks} finis • ${stats.totalPagesRead} pages lues
    </div>
  `;

  // list
  let items = await listBooks({ limit: 3000 });

  if (status !== "all") {
    items = items.filter(b => (b.status || "planned") === status);
  }

  if (q) {
    items = items.filter(b => {
      const hay = `${b.title || ""} ${b.author || ""} ${b.category || ""} ${(b.tags||[]).join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }

  const listEl = $("#booksList", container);
  if (!items.length) {
    listEl.innerHTML = `
      <section class="card">
        <div class="card__title">Aucun livre</div>
        <div class="card__subtitle">Ajoute un livre pour commencer ton suivi.</div>
        <div style="margin-top:12px;">
          <button class="btn" id="emptyAddBtn" type="button">+ Ajouter</button>
        </div>
      </section>
    `;
    $("#emptyAddBtn", container)?.addEventListener("click", () => openModal(container));
    return;
  }

  listEl.innerHTML = items.map(renderBookRow).join("");

  // wire actions
  listEl.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const action = btn.getAttribute("data-action");
      const id = btn.getAttribute("data-id");
      if (!id) return;

      if (action === "cycle") {
        await cycleStatus(id);
        toast("Statut mis à jour.");
        await refreshBooks(container);
      }

      if (action === "delete") {
        const ok = confirm("Supprimer ce livre ? (tombstone pour sync)");
        if (!ok) return;
        await deleteBook(id, { tombstone: true });
        toast("Livre supprimé.");
        await refreshBooks(container);
      }

      if (action === "details") {
        // plus tard: page book/:id
        
        navigate(`/books/${id}`);
      }
    });
  });
}

function renderBookRow(b) {
  const status = String(b.status || "planned");
  const title = escapeHtml(b.title || "Sans titre");
  const author = escapeHtml(b.author || "");
  const meta = [
    author ? `✍️ ${author}` : null,
    b.category ? `🏷️ ${escapeHtml(b.category)}` : null,
    statusLabel(status),
  ].filter(Boolean).join(" • ");

  return `
    <article class="list-item" style="align-items:flex-start;">
      <div class="list-item__main" style="min-width:0;">
        <div class="list-item__title">${title}</div>
        <div class="list-item__meta">${meta}</div>
      </div>

      <div style="display:flex; gap:10px; align-items:center;">
        <button class="btn btn--ghost" data-action="details" data-id="${escapeHtml(b.id)}" type="button">📘</button>
        <button class="btn btn--secondary" data-action="cycle" data-id="${escapeHtml(b.id)}" type="button">↻</button>
        <button class="btn btn--danger" data-action="delete" data-id="${escapeHtml(b.id)}" type="button">🗑</button>
      </div>
    </article>
  `;
}

async function cycleStatus(bookId) {
  // cycle: planned -> reading -> paused -> finished -> planned
  const p = await getBookProgress(bookId);
  const current = String(p?.status || "planned");

  const next =
    current === "planned" ? "reading" :
    current === "reading" ? "paused" :
    current === "paused" ? "finished" :
    "planned";

  await setBookStatus(bookId, next);
}

/* =========================
   Modal add book
   ========================= */

function openModal(container) {
  const m = $("#bookModal", container);
  m.hidden = false;

  $("#mTitle", container).value = "";
  $("#mAuthor", container).value = "";
  $("#mCategory", container).value = "dev";
  $("#mLang", container).value = "fr";
  $("#mFormat", container).value = "paper";
  $("#mPages", container).value = "0";

  setTimeout(() => $("#mTitle", container)?.focus(), 0);
}

function closeModal(container) {
  $("#bookModal", container).hidden = true;
}

async function onSaveBook(container) {
  const title = ($("#mTitle", container).value || "").trim();
  if (!title) {
    toast("Titre requis.");
    return;
  }

  const book = {
    title,
    author: ($("#mAuthor", container).value || "").trim(),
    category: ($("#mCategory", container).value || "other").trim(),
    language: ($("#mLang", container).value || "fr").trim(),
    format: ($("#mFormat", container).value || "paper").trim(),
    totalPages: Number($("#mPages", container).value || 0) || 0,
    status: "planned",
    tags: [],
  };

  try {
    await putBook(book);
    toast("Livre ajouté.");
    closeModal(container);
    await refreshBooks(container);
  } catch (e) {
    console.error(e);
    toast("Erreur ajout livre.");
  }
}

/* =========================
   Helpers
   ========================= */

function statusLabel(st) {
  if (st === "planned") return "🟦 planned";
  if (st === "reading") return "🟩 reading";
  if (st === "paused") return "🟨 paused";
  if (st === "finished") return "🟪 finished";
  return st;
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
export async function renderBookPage(container, { bookId } = {}) {
  container.dataset.page = "book";

  container.innerHTML = `
    <section class="page-header">
      <div class="page-title">Livre</div>
      <div class="page-desc">Détail du livre (id: ${escapeHtml(bookId || "")})</div>
    </section>

    <section class="card">
      <div class="card__title">Bientôt</div>
      <div class="card__subtitle">
        Ici on mettra: progression, sessions de lecture, notes/citations, boutons.
      </div>

      <div style="margin-top:14px; display:flex; gap:12px; flex-wrap:wrap;">
        <a class="btn btn--secondary" href="#/books">← Retour Books</a>
        <a class="btn" href="#/reading/new?bookId=${encodeURIComponent(bookId || "")}">+ Session</a>
        <a class="btn btn--ghost" href="#/quotes/new?bookId=${encodeURIComponent(bookId || "")}">+ Citation</a>
      </div>
    </section>
  `;
}
