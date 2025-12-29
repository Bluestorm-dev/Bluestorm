// js/components/themebutton.js
// Boutons "Thème" style BlueStorm (cockpit / quick actions).
// Objectif: rendre tes boutons élégants, cohérents, et faciles à réutiliser.
// - Variants: "primary" (BlueStorm), "theme" (par domaine), "ghost"
// - Support: icône + titre + sous-texte
// - States: active / disabled
//
// Usage (string):
// import { ThemeButton } from "../components/themebutton.js";
//
// container.innerHTML = ThemeButton({
//   id: "btn-js",
//   themeId: "javascript",
//   title: "JavaScript",
//   subtitle: "DOM, events, modules",
//   icon: "⚡",
//   href: "#/journal?theme=javascript"
// });
//
// Usage (DOM):
// import { mountThemeButtons } from "../components/themebutton.js";
// mountThemeButtons(gridEl, buttons, (btn) => navigate(btn.route));

import { escapeHtml } from "../utils/escape.js";

const DEFAULT_THEME_META = {
  bluestorm: { icon: "🌩️", tint: "primary" },
  html: { icon: "🧩", tint: "info" },
  css: { icon: "🎛️", tint: "info" },
  javascript: { icon: "⚡", tint: "primary" },
  threejs: { icon: "🧊", tint: "primary" },
  figma: { icon: "🎨", tint: "info" },
  ux: { icon: "🧠", tint: "info" },
  dev: { icon: "🛠️", tint: "warning" }
};

/* =========================
   Template (string)
   ========================= */

export function ThemeButton({
  id = "",
  themeId = "bluestorm",
  title = "Thème",
  subtitle = "",
  icon = "",
  variant = "theme",        // theme | primary | ghost
  active = false,
  disabled = false,
  href = "",
  data = {}                // extra dataset: { route:"/journal" }
} = {}) {
  const meta = DEFAULT_THEME_META[themeId] || DEFAULT_THEME_META.bluestorm;
  const ico = icon || meta.icon || "•";

  const classes = [
    "theme-btn",
    `theme-btn--${variant}`,
    `theme-btn--${meta.tint || "primary"}`,
    active ? "is-active" : "",
    disabled ? "is-disabled" : ""
  ].filter(Boolean).join(" ");

  const attrs = [
    id ? `id="${escapeHtml(id)}"` : "",
    disabled ? `aria-disabled="true"` : "",
    active ? `aria-pressed="true"` : `aria-pressed="false"`,
    ...Object.entries(data || {}).map(([k, v]) => `data-${escapeHtml(k)}="${escapeHtml(String(v))}"`)
  ].filter(Boolean).join(" ");

  const tag = href ? "a" : "button";
  const hrefAttr = href ? `href="${escapeHtml(href)}"` : "";
  const typeAttr = href ? "" : `type="button"`;

  return `
    <${tag} class="${classes}" ${hrefAttr} ${typeAttr} ${attrs}>
      <span class="theme-btn__icon" aria-hidden="true">${escapeHtml(ico)}</span>
      <span class="theme-btn__text">
        <span class="theme-btn__title">${escapeHtml(title)}</span>
        ${subtitle ? `<span class="theme-btn__subtitle">${escapeHtml(subtitle)}</span>` : ""}
      </span>
      <span class="theme-btn__chev" aria-hidden="true">›</span>
    </${tag}>
  `;
}

/* =========================
   Mount (DOM) + click handler
   ========================= */

export function mountThemeButtons(container, buttons, onClick) {
  container.innerHTML = (buttons || []).map((b) => ThemeButton(b)).join("");

  container.querySelectorAll(".theme-btn").forEach((el) => {
    el.addEventListener("click", (e) => {
      // si c'est un <a>, le routeur hash gère; sinon callback
      const isLink = el.tagName.toLowerCase() === "a";
      if (!isLink) e.preventDefault();

      if (el.classList.contains("is-disabled")) return;

      const payload = {
        id: el.id || "",
        themeId: el.getAttribute("data-theme") || "",
        route: el.getAttribute("data-route") || ""
      };

      if (typeof onClick === "function") onClick(payload, el);
    });
  });
}

/* =========================
   Helper: preset list
   ========================= */

export function defaultThemeButtons() {
  return [
    {
      id: "btn-bs",
      themeId: "bluestorm",
      title: "BlueStorm",
      subtitle: "Identité & progression",
      icon: "🌩️",
      href: "#/cockpit"
    },
    {
      id: "btn-html",
      themeId: "html",
      title: "HTML",
      subtitle: "Structure & sémantique",
      icon: "🧩",
      href: "#/journal?theme=html"
    },
    {
      id: "btn-css",
      themeId: "css",
      title: "CSS",
      subtitle: "Layouts & responsive",
      icon: "🎛️",
      href: "#/journal?theme=css"
    },
    {
      id: "btn-js",
      themeId: "javascript",
      title: "JavaScript",
      subtitle: "DOM & logique",
      icon: "⚡",
      href: "#/journal?theme=javascript"
    },
    {
      id: "btn-three",
      themeId: "threejs",
      title: "Three.js",
      subtitle: "3D & scènes",
      icon: "🧊",
      href: "#/journal?theme=threejs"
    },
    {
      id: "btn-figma",
      themeId: "figma",
      title: "Figma",
      subtitle: "UI & composants",
      icon: "🎨",
      href: "#/journal?theme=figma"
    }
  ];
}
