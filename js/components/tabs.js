// js/components/tabs.js
// Tabs BlueStorm : onglets (UI) + gestion d'état
// - Mobile-first (scroll horizontal)
// - Accessible (role=tablist/tab/tabpanel)
// - Sans framework
//
// Usage (DOM):
// import { mountTabs } from "../components/tabs.js";
//
// const api = mountTabs(container, {
//   id: "journalTabs",
//   tabs: [
//     { id:"all",  label:"Tout", icon:"✨" },
//     { id:"week", label:"Semaine", icon:"🗓️" },
//     { id:"theme",label:"Thème", icon:"🏷️" }
//   ],
//   selected: "all",
//   onChange: (id, api) => { ... }
// });
//
// api.set("theme");

import { escapeHtml } from "../utils/escape.js";

const clamp = (n, min, max) => Math.max(min, Math.min(max, Number(n) || 0));

/* =========================
   Mount
   ========================= */

export function mountTabs(container, {
  id = "tabs",
  tabs = [],
  selected = null,
  size = "md",       // sm | md
  scroll = true,
  onChange
} = {}) {
  const sel = selected ?? (tabs[0]?.id ?? null);

  container.innerHTML = Tabs({
    id,
    tabs,
    selected: sel,
    size,
    scroll
  });

  const root = container.querySelector(`[data-tabs="${cssEscape(id)}"]`);
  const panels = container.querySelectorAll(`[data-tabpanel="${cssEscape(id)}"]`);

  const api = {
    root,
    id,
    get: () => getSelected(root),
    set: (tabId) => setSelected(root, tabId, { id, panels, onChange }),
    setBadgeCounts: (counts) => setBadgeCounts(root, counts)
  };

  root?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-tab]");
    if (!btn) return;

    const tabId = btn.getAttribute("data-tab");
    api.set(tabId);
  });

  // Keyboard navigation
  root?.addEventListener("keydown", (e) => {
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(e.key)) return;

    const all = Array.from(root.querySelectorAll("[data-tab]"));
    const current = root.querySelector(".tab--active");
    const idx = Math.max(0, all.indexOf(current));

    let nextIdx = idx;

    if (e.key === "ArrowLeft") nextIdx = idx - 1;
    if (e.key === "ArrowRight") nextIdx = idx + 1;
    if (e.key === "Home") nextIdx = 0;
    if (e.key === "End") nextIdx = all.length - 1;

    nextIdx = clamp(nextIdx, 0, all.length - 1);
    const next = all[nextIdx];
    if (next) {
      e.preventDefault();
      next.focus();
      api.set(next.getAttribute("data-tab"));
    }
  });

  // Initial panel state
  api.set(sel);

  return api;
}

/* =========================
   Template
   ========================= */

export function Tabs({ id = "tabs", tabs = [], selected = null, size = "md", scroll = true } = {}) {
  const cls = [
    "tabs",
    scroll ? "tabs--scroll" : "",
    size === "sm" ? "tabs--sm" : ""
  ].filter(Boolean).join(" ");

  return `
    <div class="${cls}">
      <div class="tablist" role="tablist" aria-label="Onglets"
           data-tabs="${escapeHtml(id)}">
        ${(tabs || []).map((t) => tabHtml(id, t, selected)).join("")}
      </div>

      <!--
        Les panels (tabpanels) ne sont pas créés automatiquement ici,
        tu peux les créer dans la page et juste les marquer avec:
        data-tabpanel="ID" data-tab="tabId"
      -->
    </div>
  `;
}

function tabHtml(groupId, tab, selected) {
  const active = tab.id === selected;
  const cls = ["tab", active ? "tab--active" : ""].filter(Boolean).join(" ");

  return `
    <button type="button"
      class="${cls}"
      role="tab"
      data-tab="${escapeHtml(tab.id)}"
      aria-selected="${active ? "true" : "false"}"
      aria-controls="${escapeHtml(groupId)}-${escapeHtml(tab.id)}"
      tabindex="${active ? "0" : "-1"}">
      ${tab.icon ? `<span class="tab__icon" aria-hidden="true">${escapeHtml(tab.icon)}</span>` : ""}
      <span class="tab__label">${escapeHtml(tab.label || tab.id)}</span>
      ${typeof tab.count === "number" ? `<span class="tab__count" aria-hidden="true">${tab.count}</span>` : ""}
    </button>
  `;
}

/* =========================
   State helpers
   ========================= */

export function getSelected(root) {
  if (!root) return null;
  const active = root.querySelector(".tab--active");
  return active ? active.getAttribute("data-tab") : null;
}

export function setSelected(root, tabId, { id, panels, onChange } = {}) {
  if (!root || !tabId) return;

  // Tabs
  root.querySelectorAll("[data-tab]").forEach((btn) => {
    const isActive = btn.getAttribute("data-tab") === tabId;
    btn.classList.toggle("tab--active", isActive);
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
    btn.setAttribute("tabindex", isActive ? "0" : "-1");
  });

  // Panels: show/hide panels tagged with data-tabpanel="id" and data-tab="tabId"
  if (panels && panels.length) {
    panels.forEach((panel) => {
      const pTab = panel.getAttribute("data-tab");
      const show = pTab === tabId;
      panel.hidden = !show;

      if (show) {
        panel.setAttribute("role", "tabpanel");
        panel.id = `${id}-${tabId}`;
      }
    });
  }

  // Scroll active into view (mobile friendly)
  const active = root.querySelector(`[data-tab="${cssEscape(tabId)}"]`);
  active?.scrollIntoView?.({ inline: "center", block: "nearest", behavior: "smooth" });

  if (typeof onChange === "function") onChange(tabId);
}

export function setBadgeCounts(root, counts = {}) {
  // counts = { tabId: number }
  if (!root) return;

  root.querySelectorAll("[data-tab]").forEach((btn) => {
    const tabId = btn.getAttribute("data-tab");
    const n = counts?.[tabId];

    let badge = btn.querySelector(".tab__count");
    if (typeof n !== "number") {
      if (badge) badge.remove();
      return;
    }

    if (!badge) {
      badge = document.createElement("span");
      badge.className = "tab__count";
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
