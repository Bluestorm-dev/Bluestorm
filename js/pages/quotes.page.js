// js/pages/quotes.page.js
// Liste des citations/notes d'un livre.
// Route: /quotes?bookId=BOOK_ID

import { listBookQuotes, deleteBookQuote } from "../db/reading.store.js";
import { getBook } from "../db/books.store.js";
import { toast } from "../components/toast.js";
import { navigate } from "../router.js";

const $ = (sel, root = document) => root.querySelector(sel);

export async function renderQuotesPage(container, { query } = {}) {
  container.dataset.page = "quotes";

  const bookId = query?.bookId;
  if (!bookId) {
    container.innerHTML = missing("bookId manquant");
    return;
  }

  const [book, quotes] = await Promise.all([
    getBook(bookId),
    listBookQuotes({ bookId, limit: 2000 })
  ]);

  container.innerHTML = `
    <section class="page-header">
      <div class="page-title">🗒️ Citations</div>
      <div class="page-desc">${book ? escape(book.title) : "—"} • ${quotes.length} note(s)</div>
    </section>

    <section class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:12px;">
        <div class="card__title">Notes</div>
        <button class="btn" id="addBtn">＋ Ajouter</button>
      </div>

      <div style="margin-top:12px; display:grid; gap:10px;">
        ${quotes.length ? quotes.map(row).join("") : empty()}
      </div>
    </section>

    <section style="margin-top:14px;">
      <a class="btn btn--secondary" href="#/book?id=${encodeURIComponent(bookId)}">← Retour livre</a>
    </section>
  `;

  $("#addBtn", container)?.addEventListener("click", () => {
    navigate(`/quotes/new?bookId=${encodeURIComponent(bookId)}`);
  });

  container.querySelectorAll("[data-del]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-del");
      if (!confirm("Supprimer cette note ?")) return;
      await deleteBookQuote(id);
      toast("Note supprimée");
      renderQuotesPage(container, { query });
    });
  });
}

function row(q) {
  const page = q.page ? `p.${q.page}` : "—";
  return `
    <div class="row--card">
      <div style="flex:1;">
        <div class="row__title">${page}</div>
        ${q.quote ? `<div class="muted" style="margin-top:6px;">“${escape(q.quote)}”</div>` : ""}
        ${q.note ? `<div class="muted" style="margin-top:6px;">📝 ${escape(q.note)}</div>` : ""}
      </div>
      <button class="btn btn--ghost" data-del="${escape(q.id)}">🗑️</button>
    </div>
  `;
}

function empty() {
  return `
    <div class="card" style="padding:12px; opacity:.7; border:1px dashed var(--color-border-soft);">
      <div class="card__title">Aucune note</div>
      <div class="card__subtitle">Ajoute des citations utiles pour tes flashcards.</div>
    </div>
  `;
}

function missing(txt) {
  return `
    <section class="card" style="margin:14px; padding:14px;">
      <div class="card__title">${escape(txt)}</div>
      <div style="margin-top:12px;">
        <a class="btn btn--secondary" href="#/books">← Books</a>
      </div>
    </section>
  `;
}

function escape(str) {
  return String(str || "").replace(/[&<>"']/g, m =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m])
  );
}
