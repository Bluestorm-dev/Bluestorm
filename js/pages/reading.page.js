// js/pages/reading.page.js
// Liste des sessions de lecture.
// Route: /reading?bookId=BOOK_ID (optionnel)

import { listReadingSessions, deleteReadingSession } from "../db/reading.store.js";
import { getBook } from "../db/books.store.js";
import { toast } from "../components/toast.js";
import { navigate } from "../router.js";

const $ = (sel, root = document) => root.querySelector(sel);

export async function renderReadingPage(container, { query } = {}) {
  container.dataset.page = "reading";

  const bookId = query?.bookId || null;

  const [sessions, book] = await Promise.all([
    listReadingSessions({ bookId, limit: 2000 }),
    bookId ? getBook(bookId) : Promise.resolve(null)
  ]);

  container.innerHTML = `
    <section class="page-header">
      <div class="page-title">🕒 Sessions</div>
      <div class="page-desc">
        ${book ? `Livre: <span class="mono">${escape(book.title)}</span>` : "Toutes les sessions"}
        • ${sessions.length} session(s)
      </div>
    </section>

    <section class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:12px;">
        <div class="card__title">Historique</div>
        ${bookId ? `<button class="btn" id="addBtn">＋ Ajouter</button>` : ""}
      </div>

      <div style="margin-top:12px; display:grid; gap:10px;">
        ${sessions.length ? sessions.map(row).join("") : empty()}
      </div>
    </section>

    <section style="margin-top:14px;">
      ${bookId ? `<a class="btn btn--secondary" href="#/book?id=${encodeURIComponent(bookId)}">← Retour livre</a>` : `<a class="btn btn--secondary" href="#/books">← Books</a>`}
    </section>
  `;

  $("#addBtn", container)?.addEventListener("click", () => {
    navigate(`/reading/new?bookId=${encodeURIComponent(bookId)}`);
  });

  container.querySelectorAll("[data-del]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-del");
      if (!confirm("Supprimer cette session ?")) return;
      await deleteReadingSession(id);
      toast("Session supprimée");
      renderReadingPage(container, { query });
    });
  });
}

function row(s) {
  const date = shortDate(s.dateStart);
  const range = (s.fromPage || s.toPage) ? `p.${s.fromPage || "?"}→${s.toPage || "?"}` : "";
  const pages = s.pages ? `${s.pages} pages` : "";
  const mins = s.minutes ? `${s.minutes} min` : "";
  const meta = [range, pages, mins].filter(Boolean).join(" • ");

  return `
    <div class="row--card">
      <div style="flex:1;">
        <div class="row__title">${date}</div>
        <div class="row__meta">${escape(meta)}</div>
        ${s.notes ? `<div class="muted" style="margin-top:6px;">${escape(s.notes)}</div>` : ""}
      </div>
      <button class="btn btn--ghost" data-del="${escape(s.id)}">🗑️</button>
    </div>
  `;
}

function empty() {
  return `
    <div class="card" style="padding:12px; opacity:.7; border:1px dashed var(--color-border-soft);">
      <div class="card__title">Aucune session</div>
      <div class="card__subtitle">Ajoute ta première lecture.</div>
    </div>
  `;
}

function shortDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(+d)) return "—";
  return d.toLocaleDateString();
}

function escape(str) {
  return String(str || "").replace(/[&<>"']/g, m =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m])
  );
}
