// js/components/chips.js
// Chips / Pills BlueStorm : filtres élégants, réutilisables partout.
// - Accessible (aria-pressed / role)
// - Mobile-first (scroll horizontal possible)
// - API string + API mount + API state (get/set)
//
// Usage (string):
// import { Chips } from "../components/chips.js";
// el.innerHTML = Chips({ items, selected: "all", on: "theme" });
//
// Usage (DOM):
// import { mountChips } from "../components/chips.js";
// mountChips(container, items, { selected:"all", onChange:(id)=>{...} });
//
// items = [{ id:"all", label:"Tout", icon:"✨", count: 12 }]

import { escapeHtml } from "../utils/escape.js";

const $ = (sel, root = document) => root.querySelector(sel);

/* =========================
   Template (string)
   ========================= */

export function Chips({
  items = [],
  selected = null,
  id = "",
  variant = "default", // default | subtle
  scroll = true
} = {}) {
  const cls = [
    "chips",
    scroll ? "chips--scroll" : "",
    variant === "subtle" ? "chips--subtle" : ""
  ].filter(Boolean).join(" ");

  return `
    <div class="${cls}" ${id ? `id="${escapeHtml(id)}"` : ""} role="group">
      ${(items || []).map((it) => chipHtml(it, selected)).join("")}
    </div>
  `;
}

function chipHtml(it, selected) {
  const isActive = selected != null && it.id === selected;
  const count = typeof it.count === "number" ? it.count : null;

  const classes = ["chip", isActive ? "chip--active" : ""].filter(Boolean).join(" ");

  return `
    <button
      type="button"
      class="${classes}"
      data-chip="${escapeHtml(it.id)}"
      aria-pressed="${isActive ? "true" : "false"}"
      title="${escapeHtml(it.title || it.label || "")}">
      ${it.icon ? `<span class="chip__icon" aria-hidden="true">${escapeHtml(it.icon)}</span>` : ""}
      <span class="chip__label">${escapeHtml(it.label || it.id)}</span>
      ${count !== null ? `<span class="chip__count" aria-hidden="true">${count}</span>` : ""}
    </button>
  `;
}

/* =========================
   Mount (DOM) + API
   ========================= */

export function mountChips(container, items, { selected = null, variant = "default", scroll = true, onChange } = {}) {
  container.innerHTML = Chips({ items, selected, variant, scroll });

  const root = container.querySelector(".chips");
  const api = {
    root,
    getSelected: () => getSelected(root),
    setSelected: (id) => setSelected(root, id),
    setCounts: (counts) => setCounts(root, counts)
  };

  root?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-chip]");
    if (!btn) return;

    const id = btn.getAttribute("data-chip");
    api.setSelected(id);

    if (typeof onChange === "function") onChange(id, api);
  });

  return api;
}

/* =========================
   State helpers
   ========================= */

export function getSelected(root) {
  if (!root) return null;
  const active = root.querySelector(".chip--active");
  return active ? active.getAttribute("data-chip") : null;
}

export function setSelected(root, id) {
  if (!root) return;

  root.querySelectorAll("[data-chip]").forEach((btn) => {
    const isActive = btn.getAttribute("data-chip") === id;
    btn.classList.toggle("chip--active", isActive);
    btn.setAttribute("aria-pressed", isActive ? "true" : "false");
  });

  // Auto scroll into view (mobile friendly)
  const target = root.querySelector(`[data-chip="${cssEscape(id)}"]`);
  target?.scrollIntoView?.({ inline: "center", block: "nearest", behavior: "smooth" });
}

export function setCounts(root, counts = {}) {
  // counts = { id: number, ... }
  if (!root) return;

  root.querySelectorAll("[data-chip]").forEach((btn) => {
    const id = btn.getAttribute("data-chip");
    const n = counts?.[id];

    let badge = btn.querySelector(".chip__count");
    if (typeof n !== "number") {
      if (badge) badge.remove();
      return;
    }

    if (!badge) {
      badge = document.createElement("span");
      badge.className = "chip__count";
      badge.setAttribute("aria-hidden", "true");
      btn.appendChild(badge);
    }
    badge.textContent = String(n);
  });
}

/* =========================
   Utilities
   ========================= */

function cssEscape(value) {
  if (window.CSS && CSS.escape) return CSS.escape(value);
  return String(value ?? "").replaceAll('"', '\\"');
}
