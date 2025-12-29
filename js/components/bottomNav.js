// js/components/bottomNav.js
// Bottom nav BlueStorm — version compatible avec tes classes CSS existantes.
// Exports:
// - initBottomNav(mountEl, { onNavigate })
// - setActiveNav(routeKey)

let _root = null;

const NAV_ITEMS = [
  { key: "cockpit", label: "Cockpit", href: "#/", icon: "⌂" },
  { key: "journal", label: "Journal", href: "#/journal", icon: "✎" },
  { key: "program", label: "Programme", href: "#/program", icon: "☰" },
  { key: "flashcards", label: "Cartes", href: "#/flashcards", icon: "🃏" },
  { key: "more", label: "Plus", href: "#/more", icon: "⋯" },
  // Tu pourras ajouter books/skills/settings ici quand les routes seront prêtes
];

/**
 * initBottomNav(mountEl, { onNavigate })
 * mountEl: <footer id="bottomNav">
 */
export function initBottomNav(mountEl, { onNavigate } = {}) {
  if (!mountEl) throw new Error("initBottomNav: mountEl manquant");

  mountEl.innerHTML = `
    <nav class="bottomnav" role="navigation" aria-label="Navigation principale">
      ${NAV_ITEMS.map(renderItem).join("")}
    </nav>
  `;

  _root = mountEl.querySelector(".bottomnav");

  // click (optionnel)
  _root.querySelectorAll("[data-nav]").forEach((a) => {
    a.addEventListener("click", (e) => {
      const routeKey = a.getAttribute("data-nav") || "cockpit";
      const href = a.getAttribute("href") || "#/";

      if (typeof onNavigate === "function") {
        e.preventDefault();
        onNavigate(routeKey, href);
      }
      // sinon : on laisse le hash changer naturellement
    });
  });

  // active initial
  setActiveNav(guessRouteFromHash(location.hash));

  return _root;
}

export function setActiveNav(routeKey) {
  if (!_root) return;

  const activeKey = normalizeRouteKey(routeKey);

  _root.querySelectorAll("[data-nav]").forEach((a) => {
    const k = a.getAttribute("data-nav");
    const active = k === activeKey;

    // accessibilité
    a.setAttribute("aria-current", active ? "page" : "false");

    // style: on ajoute une classe
    a.classList.toggle("is-active", active);
  });
}

/* =========================
   Helpers
   ========================= */

function renderItem(it) {
  return `
    <a class="bottomnav__item"
       href="${it.href}"
       data-nav="${escapeHtml(it.key)}"
       aria-label="${escapeHtml(it.label)}">
      <span class="bottomnav__icon" aria-hidden="true">${it.icon}</span>
      <span class="bottomnav__label">${escapeHtml(it.label)}</span>
    </a>
  `;
}

function normalizeRouteKey(key) {
  const k = String(key || "cockpit");

  if (k === "cockpit") return "cockpit";
  if (k.startsWith("journal")) return "journal";
  if (k === "program" || k === "week") return "program";
  if (k === "flashcards") return "flashcards";
  if (k === "more") return "more";

  // futurs:
  if (k === "books" || k === "book" || k.startsWith("reading") || k.startsWith("quotes")) return "more";
  if (k === "skills") return "more";
  if (k === "settings") return "more";

  return "cockpit";
}

function guessRouteFromHash(hash) {
  const h = String(hash || "");
  if (!h || h === "#/" || h === "#") return "cockpit";
  if (h.includes("#/journal")) return "journal";
  if (h.includes("#/program") || h.includes("#/week/")) return "program";
  if (h.includes("#/flashcards")) return "flashcards";
  if (h.includes("#/more")) return "more";
  return "cockpit";
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
