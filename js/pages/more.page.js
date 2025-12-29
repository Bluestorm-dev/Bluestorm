// js/pages/more.page.js
// Page "Plus" : hub des outils secondaires (Settings, Sync, About, Debug, etc.)
// Objectif: garder la bottom-nav clean (5 items max) et mettre le reste ici.
//
// Dépend: router.navigate() + components/card.js (optionnel) + utils/escape.js
// Ici on fait simple en HTML, sans dépendre de Card pour éviter les cascades.

import { navigate } from "../router.js";
import { escapeHtml } from "../utils/escape.js";

const $ = (sel, root = document) => root.querySelector(sel);

export async function renderMorePage(container) {
  container.dataset.page = "more";

  container.innerHTML = `
    <section class="page-header">
      <div class="page-title">Plus</div>
      <div class="page-desc">
        Outils, réglages, export, diagnostic. Tout ce qui ne doit pas être dans la barre du bas.
      </div>
    </section>

    <section class="card">
      <div class="card__title">Outils</div>
      <div class="list" style="margin-top:12px;">
        ${row("⚙️", "Réglages", "Thème, limites, export/import", "settings")}
        ${row("🔄", "Synchroniser", "Exporter / importer un snapshot", "sync")}
        ${row("🧪", "Debug", "Voir l’état DB, caches, logs", "debug")}
      </div>
    </section>

    <section class="card" style="margin-top:14px;">
      <div class="card__title">BlueStorm</div>
      <div class="list" style="margin-top:12px;">
        ${row("🌩️", "À propos", "Version, philosophie, credits", "about")}
        ${row("📦", "Données", "Backup local + nettoyage", "data")}
        ${row("🗺️", "Plan du site", "Routes et pages", "sitemap")}
      </div>
    </section>

    <section class="card" style="margin-top:14px;">
      <div class="card__title">Raccourcis</div>
      <div class="chips" style="margin-top:12px;">
        <a class="chip" href="#/">Cockpit</a>
        <a class="chip" href="#/program">Programme</a>
        <a class="chip" href="#/journal">Journal</a>
        <a class="chip" href="#/flashcards">Flashcards</a>
        <a class="chip" href="#/skills">Skills</a>
      </div>
    </section>

    <section class="card" style="margin-top:14px;">
      <div class="card__title">Danger zone</div>
      <div class="card__subtitle">Actions destructrices (protégées).</div>

      <div style="margin-top:12px; display:flex; gap:12px; flex-wrap:wrap;">
        <button class="btn btn--danger" id="wipeBtn" type="button">🧨 Tout effacer</button>
        <a class="btn btn--ghost" href="#/settings">Gérer via Réglages</a>
      </div>

      <div class="muted" style="margin-top:10px; font-size:0.9rem;">
        Le wipe complet est dans Réglages (avec confirmation).
      </div>
    </section>
  `;

  // Wire rows (SPA navigation)
  container.querySelectorAll("[data-go]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      const target = el.getAttribute("data-go");
      go(target);
    });
  });

  // Wipe button just redirects to settings (single place)
  $("#wipeBtn", container)?.addEventListener("click", () => {
    navigate("/settings");
  });
}

/* =========================
   Navigation
   ========================= */

function go(key) {
  // Routes proposées (tu peux les implémenter progressivement)
  if (key === "settings") return navigate("/settings");
  if (key === "sync") return navigate("/settings"); // V1: sync via settings
  if (key === "debug") return navigate("/debug");   // à coder plus tard
  if (key === "about") return navigate("/about");   // à coder plus tard
  if (key === "data") return navigate("/settings"); // V1: data tools in settings
  if (key === "sitemap") return navigate("/sitemap"); // à coder plus tard
  return navigate("/");
}

/* =========================
   UI helpers
   ========================= */

function row(icon, title, subtitle, goKey) {
  return `
    <a class="list-item" href="#/${escapeHtml(goKey)}" data-go="${escapeHtml(goKey)}">
      <div class="list-item__main" style="min-width:0;">
        <div class="list-item__title">
          <span aria-hidden="true">${escapeHtml(icon)}</span>
          <span style="margin-left:8px;">${escapeHtml(title)}</span>
        </div>
        <div class="list-item__meta">${escapeHtml(subtitle)}</div>
      </div>
      <div class="muted" aria-hidden="true">›</div>
    </a>
  `;
}
