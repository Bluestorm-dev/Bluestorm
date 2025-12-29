// js/components/card.js
// Composant "Card" ultra simple : helpers pour générer des blocs UI cohérents.
// Objectif: éviter de répéter du HTML partout, sans framework.
//
// Usage:
// import { Card, CardTitle, CardSubtitle, CardBody, CardActions } from "../components/card.js";
// container.innerHTML = Card({
//   focus: true,
//   title: "Titre",
//   subtitle: "Sous-titre",
//   body: "<p>Contenu</p>",
//   actions: `<a class="btn" href="#/">OK</a>`,
// });

import { escapeHtml } from "../utils/escape.js";

export function Card({
  title = "",
  subtitle = "",
  body = "",
  actions = "",
  focus = false,
  extraClass = "",
  attrs = "",
} = {}) {
  const focusAttr = focus ? ` data-focus="true"` : "";
  const cls = `card ${extraClass}`.trim();

  return `
    <section class="${cls}"${focusAttr} ${attrs}>
      ${title ? CardTitle(title) : ""}
      ${subtitle ? CardSubtitle(subtitle) : ""}
      ${body ? CardBody(body) : ""}
      ${actions ? CardActions(actions) : ""}
    </section>
  `;
}

export function CardTitle(text) {
  return `<div class="card__title">${escapeHtml(text)}</div>`;
}

export function CardSubtitle(text) {
  return `<div class="card__subtitle">${escapeHtml(text)}</div>`;
}

export function CardBody(html) {
  return `<div class="card__body">${html}</div>`;
}

export function CardActions(html) {
  return `<div class="card__actions" style="margin-top:14px;">${html}</div>`;
}

/* =========================
   Convenience presets
   ========================= */

export function EmptyCard({
  title = "Rien ici",
  subtitle = "Aucune donnée pour l’instant.",
  actionHref = "#/",
  actionLabel = "Retour",
} = {}) {
  return Card({
    focus: true,
    title,
    subtitle,
    actions: `<a class="btn btn--secondary" href="${actionHref}">${escapeHtml(actionLabel)}</a>`,
  });
}

export function ErrorCard({
  title = "Oups…",
  subtitle = "Une erreur est survenue.",
  details = "",
} = {}) {
  const body = details
    ? `<pre class="mono" style="white-space:pre-wrap; margin-top:12px;">${escapeHtml(details)}</pre>`
    : "";
  return Card({ focus: true, title, subtitle, body });
}
