// js/pages/quotes.new.page.js
// Ajouter une citation/note
// Route: /quotes/new?bookId=BOOK_ID

import { putBookQuote } from "../db/reading.store.js";
import { getBook } from "../db/books.store.js";
import { toast } from "../components/toast.js";
import { navigate } from "../router.js";

const $ = (sel, root = document) => root.querySelector(sel);

export async function renderQuotesNewPage(container, { query } = {}) {
  container.dataset.page = "quotes-new";

  const bookId = query?.bookId;
  if (!bookId) {
    container.innerHTML = missing("bookId manquant");
    return;
  }

  const book = await getBook(bookId);

  container.innerHTML = `
    <section class="page-header">
      <div class="page-title">＋ Citation</div>
      <div class="page-desc">${book ? escape(book.title) : "—"}</div>
    </section>

    <section class="card">
      <div class="form" style="display:grid; gap:12px;">
        <div class="field">
          <label>Page (optionnel)</label>
          <input id="page" type="number" inputmode="numeric" placeholder="ex: 42">
        </div>

        <div class="field">
          <label>Citation (optionnel)</label>
          <textarea id="quote" rows="4" placeholder="Une phrase utile…"></textarea>
        </div>

        <div class="field">
          <label>Note (recommandé)</label>
          <textarea id="note" rows="5" placeholder="Pourquoi c’est important / comment tu l’appliques…"></textarea>
        </div>
      </div>
    </section>

    <section style="margin-top:14px; display:flex; gap:10px; flex-wrap:wrap;">
      <button class="btn" id="saveBtn" type="button">Enregistrer</button>
      <a class="btn btn--secondary" href="#/quotes?bookId=${encodeURIComponent(bookId)}">Annuler</a>
    </section>
  `;

  $("#saveBtn", container)?.addEventListener("click", async () => {
    const page = Number($("#page", container).value || 0) || 0;
    const quote = $("#quote", container).value || "";
    const note = $("#note", container).value || "";

    if (!quote.trim() && !note.trim()) {
      toast("Ajoute au moins une note ou une citation");
      return;
    }

    await putBookQuote({
      bookId,
      page,
      quote: quote.trim(),
      note: note.trim()
    });

    toast("Ajouté ✅");
    navigate(`/quotes?bookId=${encodeURIComponent(bookId)}`);
  });
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
