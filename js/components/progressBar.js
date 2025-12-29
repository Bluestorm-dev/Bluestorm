// js/components/progressbar.js
// ProgressBar BlueStorm : composant HTML + helpers update
// - Simple (pas de framework)
// - Thème-compatible (CSS variables)
// - Accessible (role="progressbar", aria-valuenow)
//
// Usage (HTML string):
// import { ProgressBar } from "../components/progressbar.js";
// el.innerHTML = ProgressBar({ value: 42, label: "Semaine", showPercent: true });
//
// Usage (update DOM):
// import { mountProgressBar, setProgress } from "../components/progressbar.js";
// const api = mountProgressBar(container, { value: 20 });
// api.set(65);

import { escapeHtml } from "../utils/escape.js";

const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, Number(n) || 0));

/* =========================
   Template (string)
   ========================= */

export function ProgressBar({
  value = 0,
  label = "",
  size = "md",          // sm | md | lg
  showPercent = false,
  id = ""
} = {}) {
  const v = clamp(value);

  const sizeClass =
    size === "sm" ? "progress--sm" :
    size === "lg" ? "progress--lg" : "";

  const barId = id ? ` id="${escapeHtml(id)}"` : "";

  return `
    <div class="progress ${sizeClass}" role="progressbar"
         aria-valuemin="0" aria-valuemax="100" aria-valuenow="${v}"
         ${barId}>
      ${label ? `<div class="progress__label">${escapeHtml(label)}</div>` : ""}
      <div class="progress__track">
        <div class="progress__bar" style="width:${v}%"></div>
      </div>
      ${showPercent ? `<div class="progress__pct">${v}%</div>` : ""}
    </div>
  `;
}

/* =========================
   Mount (DOM) + API
   ========================= */

export function mountProgressBar(container, opts = {}) {
  container.innerHTML = ProgressBar(opts);
  const root = container.querySelector(".progress");
  return {
    root,
    set: (value, meta) => setProgress(root, value, meta)
  };
}

/* =========================
   Update
   ========================= */

export function setProgress(root, value, { label, showPercent } = {}) {
  if (!root) return;

  const v = clamp(value);
  root.setAttribute("aria-valuenow", String(v));

  const bar = root.querySelector(".progress__bar");
  if (bar) bar.style.width = `${v}%`;

  const labelEl = root.querySelector(".progress__label");
  if (typeof label === "string") {
    if (labelEl) labelEl.textContent = label;
    else {
      // add label if missing
      const div = document.createElement("div");
      div.className = "progress__label";
      div.textContent = label;
      root.prepend(div);
    }
  }

  const pctEl = root.querySelector(".progress__pct");
  if (showPercent === true) {
    if (pctEl) pctEl.textContent = `${v}%`;
    else {
      const div = document.createElement("div");
      div.className = "progress__pct";
      div.textContent = `${v}%`;
      root.appendChild(div);
    }
  } else if (showPercent === false && pctEl) {
    pctEl.remove();
  }
}
