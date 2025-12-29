// js/pages/reading.new.page.js
// Ajouter une session de lecture.
// Route: /reading/new?bookId=BOOK_ID

import { addReadingSession } from "../db/reading.store.js";
import { getBook, getBookProgress } from "../db/books.store.js";
import { toast } from "../components/toast.js";
import { navigate } from "../router.js";

const $ = (sel, root = document) => root.querySelector(sel);

export async function renderReadingNewPage(container, { query } = {}) {
  container.dataset.page = "reading-new";

  const bookId = query?.bookId;
  if (!bookId) {
    container.innerHTML = missing("bookId manquant");
    return;
  }

  const [book, progress] = await Promise.all([
    getBook(bookId),
    getBookProgress(bookId)
  ]);

  if (!book) {
    container.innerHTML = missing("Livre introuvable");
    return;
  }

  const suggestedFrom = Number(progress?.currentPage || 0) || 0;

  container.innerHTML = `
    <section class="page-header">
      <div class="page-title">＋ Session</div>
      <div class="page-desc">${escape(book.title)}</div>
    </section>

    <section class="card">
      <div class="form" style="display:grid; gap:12px;">
        <div class="field">
          <label>Durée (minutes)</label>
          <input id="minutes" type="number" inputmode="numeric" placeholder="ex: 25" value="25">
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
          <div class="field">
            <label>De page</label>
            <input id="fromPage" type="number" inputmode="numeric" value="${suggestedFrom}">
          </div>
          <div class="field">
            <label>À page</label>
            <input id="toPage" type="number" inputmode="numeric" value="${suggestedFrom}">
          </div>
        </div>

        <div class="field">
          <label>Notes</label>
          <textarea id="notes" rows="5" placeholder="Ce que tu retiens, concepts, exemples…"></textarea>
        </div>

        <div class="field">
          <label>Lien semaine (optionnel)</label>
          <input id="linkedWeekId" type="text" placeholder="ex: week_14">
          <div class="muted" style="margin-top:6px; font-size:.9rem;">
            Tu pourras le relier automatiquement plus tard via ton programme.
          </div>
        </div>
      </div>
    </section>

    <section style="margin-top:14px; display:flex; gap:10px; flex-wrap:wrap;">
      <button class="btn" id="saveBtn" type="button">Enregistrer</button>
      <a class="btn btn--secondary" href="#/book?id=${encodeURIComponent(bookId)}">Annuler</a>
    </section>
  `;

  $("#saveBtn", container)?.addEventListener("click", async () => {
    const minutes = Number($("#minutes", container).value || 0) || 0;
    const fromPage = Number($("#fromPage", container).value || 0) || 0;
    const toPage = Number($("#toPage", container).value || 0) || 0;

    if (minutes <= 0) {
      toast("Durée invalide");
      return;
    }

    if (toPage < fromPage) {
      toast("La page de fin doit être >= début");
      return;
    }

    const pages = Math.max(0, toPage - fromPage);

    await addReadingSession({
      bookId,
      minutes,
      fromPage,
      toPage,
      pages,
      notes: $("#notes", container).value || "",
      linkedWeekId: ($("#linkedWeekId", container).value || "").trim() || null,
      dateStart: new Date().toISOString(),
      dateEnd: new Date().toISOString()
    });

    toast("Session ajoutée ✅");
    navigate(`/book?id=${encodeURIComponent(bookId)}`);
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
