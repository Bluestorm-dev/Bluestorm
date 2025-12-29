// js/components/badge.js
// Badges BlueStorm : étiquettes/badges + "skill badge" (locked/unlocked) + petit glow.
// - Réutilisable partout (skills, flashcards, journal tags, cockpit KPIs)
// - Accessible (aria-label)
// - Thème-compatible via CSS variables
//
// Usage (string):
// import { Badge, SkillBadge } from "../components/badge.js";
//
// el.innerHTML = Badge({ label:"DONE", tone:"success", icon:"✅" });
// el.innerHTML = SkillBadge({ state:"locked", label:"HTML Initiate", code:"html-initiate" });
//
// Usage (DOM):
// import { mountBadges } from "../components/badge.js";
// mountBadges(container, [{label:"JS", tone:"info"}]);

import { escapeHtml } from "../utils/escape.js";

/* =========================
   Template (string)
   ========================= */

export function Badge({
  label = "",
  tone = "default",  // default | primary | info | success | warning | danger | muted
  icon = "",
  size = "md",       // sm | md
  pill = true,
  title = ""
} = {}) {
  const cls = [
    "badge",
    `badge--${tone}`,
    size === "sm" ? "badge--sm" : "",
    pill ? "badge--pill" : ""
  ].filter(Boolean).join(" ");

  return `
    <span class="${cls}" ${title ? `title="${escapeHtml(title)}"` : ""} aria-label="${escapeHtml(label)}">
      ${icon ? `<span class="badge__icon" aria-hidden="true">${escapeHtml(icon)}</span>` : ""}
      <span class="badge__label">${escapeHtml(label)}</span>
    </span>
  `;
}

/**
 * Badge "compétence" : affiche un état verrouillé/en cours/débloqué + code badge.
 * state: locked | in_progress | unlocked
 */
export function SkillBadge({
  state = "locked",
  label = "Badge",
  code = "",
  showCode = true
} = {}) {
  const icon =
    state === "unlocked" ? "🏅" :
    state === "in_progress" ? "🟡" : "🔒";

  const tone =
    state === "unlocked" ? "success" :
    state === "in_progress" ? "warning" : "muted";

  const title =
    state === "unlocked" ? "Débloqué" :
    state === "in_progress" ? "En cours" : "Verrouillé";

  return `
    <div class="skill-badge skill-badge--${escapeHtml(state)}" aria-label="${escapeHtml(label)}">
      <div class="skill-badge__top">
        ${Badge({ label, tone, icon, title })}
      </div>
      ${
        showCode && code
          ? `<div class="skill-badge__code mono">${escapeHtml(code)}</div>`
          : ""
      }
    </div>
  `;
}

/* =========================
   Mount helpers
   ========================= */

export function mountBadges(container, badges = []) {
  container.innerHTML = badges.map((b) => Badge(b)).join("");
}
