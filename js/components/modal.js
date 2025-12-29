// js/components/modal.js
// Modal générique BlueStorm
// - Accessible (focus trap, aria)
// - Mobile-first
// - Sans framework
// - Compatible thème (CSS variables)
// - Peut servir pour: confirmation, édition, aide, easter egg, etc.
//
// Usage:
// import { openModal, closeModal, confirmModal } from "../components/modal.js";
//
// openModal({
//   title: "Titre",
//   content: "<p>Contenu HTML</p>",
//   actions: [
//     { label: "Annuler", variant: "secondary", onClick: closeModal },
//     { label: "OK", variant: "primary", onClick: () => { ... } }
//   ]
// });
//
// const ok = await confirmModal({ title:"Supprimer ?", message:"Irréversible" });

import { escapeHtml } from "../utils/escape.js";

let activeModal = null;
let lastFocusedEl = null;

/* =========================
   API
   ========================= */

export function openModal({
  title = "",
  content = "",
  actions = [],
  closeOnBackdrop = true,
  size = "md" // sm | md | lg
} = {}) {
  if (activeModal) closeModal();

  lastFocusedEl = document.activeElement;

  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";

  const modal = document.createElement("div");
  modal.className = `modal modal--${size}`;
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");

  modal.innerHTML = `
    <div class="modal__header">
      <div class="modal__title">${escapeHtml(title)}</div>
      <button class="modal__close" aria-label="Fermer">×</button>
    </div>

    <div class="modal__body">
      ${content}
    </div>

    <div class="modal__footer">
      ${renderActions(actions)}
    </div>
  `;

  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);
  activeModal = backdrop;

  // Close handlers
  modal.querySelector(".modal__close")?.addEventListener("click", closeModal);

  if (closeOnBackdrop) {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeModal();
    });
  }

  // ESC to close
  document.addEventListener("keydown", onEsc);

  // Focus trap
  trapFocus(modal);

  // Animate in
  requestAnimationFrame(() => backdrop.classList.add("is-visible"));

  return modal;
}

export function closeModal() {
  if (!activeModal) return;

  const backdrop = activeModal;
  backdrop.classList.remove("is-visible");

  document.removeEventListener("keydown", onEsc);

  backdrop.addEventListener(
    "transitionend",
    () => {
      backdrop.remove();
    },
    { once: true }
  );

  activeModal = null;

  if (lastFocusedEl?.focus) lastFocusedEl.focus();
}

/* =========================
   CONFIRM MODAL (PROMISE)
   ========================= */

export function confirmModal({
  title = "Confirmer",
  message = "Êtes-vous sûr ?",
  confirmLabel = "OK",
  cancelLabel = "Annuler",
  danger = false
} = {}) {
  return new Promise((resolve) => {
    openModal({
      title,
      content: `<p>${escapeHtml(message)}</p>`,
      actions: [
        {
          label: cancelLabel,
          variant: "secondary",
          onClick: () => {
            closeModal();
            resolve(false);
          }
        },
        {
          label: confirmLabel,
          variant: danger ? "danger" : "primary",
          onClick: () => {
            closeModal();
            resolve(true);
          }
        }
      ]
    });
  });
}

/* =========================
   INTERNALS
   ========================= */

function renderActions(actions) {
  if (!actions.length) return "";

  return actions
    .map(
      (a) => `
      <button class="btn btn--${escapeHtml(a.variant || "primary")}" type="button">
        ${escapeHtml(a.label || "OK")}
      </button>
    `
    )
    .join("");
}

function onEsc(e) {
  if (e.key === "Escape") closeModal();
}

function trapFocus(modal) {
  const focusables = modal.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  if (!focusables.length) return;

  const first = focusables[0];
  const last = focusables[focusables.length - 1];

  first.focus();

  modal.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });
}
