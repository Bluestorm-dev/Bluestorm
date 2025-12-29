// js/router.js
// Router SPA simple (hash) compatible GitHub Pages.
// Supporte "#/path" + query string (ex: #/week/12?x=1)

import { toast } from "./components/toast.js";

import { renderCockpitPage } from "./pages/cockpit.page.js";
import { renderJournalPage } from "./pages/journal.page.js";
import { renderJournalNewPage } from "./pages/journalNew.page.js";
import { renderProgramPage } from "./pages/program.page.js";
import { renderWeekPage } from "./pages/week.page.js";
import { renderFlashcardsPage } from "./pages/flashcards.page.js";
import { renderSkillsPage } from "./pages/skills.page.js";
import { renderSettingsPage } from "./pages/settings.page.js";
import { renderMorePage } from "./pages/more.page.js";

import { renderBooksPage } from "./pages/books.page.js"; // ✅


// (option) reading / quotes si tu les as réellement
// import { renderReadingNewPage } from "./pages/reading.new.page.js";
// import { renderReadingPage } from "./pages/reading.page.js";
// import { renderQuotesPage } from "./pages/quotes.page.js";
// import { renderQuotesNewPage } from "./pages/quotes.new.page.js";

const $ = (sel, root = document) => root.querySelector(sel);

let _onRouteChange = null;

function normalizeHash(hash) {
  if (!hash || hash === "#") return "#/";
  return hash.startsWith("#") ? hash : `#${hash}`;
}

function parseUrlFromHash(hash) {
  const clean = normalizeHash(hash).slice(1); // remove "#"
  const [pathPart, queryPart = ""] = clean.split("?");
  const path = pathPart || "/";

  const query = {};
  if (queryPart) {
    const sp = new URLSearchParams(queryPart);
    for (const [k, v] of sp.entries()) query[k] = v;
  }

  return { path, query };
}

function matchRoute(path) {
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return { key: "cockpit", params: {} };

  const [p0, p1] = parts;

  if (p0 === "journal" && !p1) return { key: "journal", params: {} };
  if (p0 === "journal" && p1 === "new") return { key: "journal-new", params: {} };

  if (p0 === "program" && !p1) return { key: "program", params: {} };

  if (p0 === "week" && p1) {
    const n = Number(p1);
    if (Number.isFinite(n) && n > 0) return { key: "week", params: { weekNumber: n } };
    return { key: "not-found", params: {} };
  }

  if (p0 === "flashcards") return { key: "flashcards", params: {} };
  if (p0 === "skills") return { key: "skills", params: {} };
  if (p0 === "settings") return { key: "settings", params: {} };
  if (p0 === "more") return { key: "more", params: {} };

  // ✅ Books list
  if (p0 === "books" && !p1) return { key: "books", params: {} };

  // ✅ Book details (two formats accepted)
  // - #/book?id=xxx   (query)
  // - #/books/xxx     (param)
  if (p0 === "book") return { key: "book", params: {} };
  if (p0 === "books" && p1) return { key: "book", params: { bookId: p1 } };

  return { key: "not-found", params: {} };
}

function setPageMeta(appEl, pageKey) {
  appEl.dataset.page = pageKey;
}

async function renderRoute() {
  const appEl = $("#app");
  if (!appEl) return;

  const { path, query } = parseUrlFromHash(location.hash);
  const { key, params } = matchRoute(path);

  appEl.innerHTML = "";
  setPageMeta(appEl, key);

  try {
    let title = "BlueStorm";

    switch (key) {
      case "cockpit":
        title = "Cockpit";
        await renderCockpitPage(appEl, { query });
        break;

      case "journal":
        title = "Journal";
        await renderJournalPage(appEl, { query });
        break;

      case "journal-new":
        title = "Nouvelle entrée";
        await renderJournalNewPage(appEl, { query });
        break;

      case "program":
        title = "Programme";
        await renderProgramPage(appEl, { query });
        break;

      case "week":
        title = `Semaine ${params.weekNumber}`;
        await renderWeekPage(appEl, { weekNumber: params.weekNumber, query });
        break;

      case "flashcards":
        title = "Flashcards";
        await renderFlashcardsPage(appEl, { query });
        break;

      case "skills":
        title = "Compétences";
        await renderSkillsPage(appEl, { query });
        break;

      case "settings":
        title = "Réglages";
        await renderSettingsPage(appEl, { query });
        break;

      case "more":
        title = "Plus";
        await renderMorePage(appEl, { query });
        break;

   
    case "books":
  title = "Books";
  await renderBooksPage(appEl, { query });
  break;


      default:
        title = "Introuvable";
        renderNotFound(appEl);
        break;
    }

    document.title = `BlueStorm — ${title}`;
    _onRouteChange?.({ route: key, title, path, params, query });
  } catch (err) {
    console.error(err);
    toast("Erreur de rendu page.");
    renderError(appEl, err);
    _onRouteChange?.({ route: "error", title: "Erreur", path, params: {}, query });
  }
}

function renderNotFound(appEl) {
  appEl.innerHTML = `
    <section class="card">
      <div class="card__title">Page introuvable</div>
      <div class="card__subtitle">Cette route n’existe pas.</div>
      <a class="btn btn--secondary" href="#/">Retour au Cockpit</a>
    </section>
  `;
}

function renderError(appEl, err) {
  const msg = err?.message ? String(err.message) : "Erreur inconnue";
  appEl.innerHTML = `
    <section class="card" data-focus="true">
      <div class="card__title">Oups…</div>
      <div class="card__subtitle">Une erreur est survenue pendant le rendu.</div>
      <p class="muted" style="margin-top:12px; font-size:.9rem;">${escapeHtml(msg)}</p>
      <div style="margin-top:16px; display:flex; gap:12px;">
        <a class="btn btn--secondary" href="#/">Retour</a>
        <button class="btn btn--ghost" id="reloadBtn" type="button">Recharger</button>
      </div>
    </section>
  `;
  appEl.querySelector("#reloadBtn")?.addEventListener("click", () => location.reload());
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function initRouter({ onRouteChange } = {}) {
  _onRouteChange = onRouteChange || null;
  window.addEventListener("hashchange", renderRoute);

  if (!location.hash) location.hash = "#/";
  renderRoute();
}

export function navigate(path, query = {}) {
  const qs = new URLSearchParams(query).toString();
  location.hash = `#${path}${qs ? `?${qs}` : ""}`;
}
