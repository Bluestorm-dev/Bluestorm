// js/components/toast.js
// Toast notifications minimalistes pour BlueStorm.
// - Mobile-first
// - Non bloquant
// - Accessible (aria-live)
// - Thème-compatible (CSS variables)
//
// Usage:
// import { toast } from "../components/toast.js";
// toast("Sauvegardé");
// toast("Erreur réseau", { type: "error", duration: 4000 });

let container;

/* =========================
   INIT
   ========================= */

function ensureContainer() {
  if (container) return container;

  container = document.createElement("div");
  container.id = "toast-container";
  container.setAttribute("aria-live", "polite");
  container.setAttribute("aria-atomic", "true");

  // Le container vit en dehors du main (overlay global)
  document.body.appendChild(container);
  return container;
}

/* =========================
   API
   ========================= */

export function toast(message, options = {}) {
  const {
    type = "info",          // info | success | warning | error
    duration = 2500,        // ms
    dismissible = false
  } = options;

  if (!message) return;

  const root = ensureContainer();

  const el = document.createElement("div");
  el.className = `toast toast--${type}`;
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");

  el.innerHTML = `
    <div class="toast__content">
      <span class="toast__icon" aria-hidden="true">${iconFor(type)}</span>
      <span class="toast__message"></span>
      ${dismissible ? `<button class="toast__close" aria-label="Fermer">×</button>` : ""}
    </div>
  `;

  el.querySelector(".toast__message").textContent = message;

  if (dismissible) {
    el.querySelector(".toast__close")?.addEventListener("click", () => removeToast(el));
  }

  root.appendChild(el);

  // Force reflow for animation
  requestAnimationFrame(() => el.classList.add("is-visible"));

  // Auto-remove
  if (duration > 0) {
    setTimeout(() => removeToast(el), duration);
  }
}

/* =========================
   HELPERS
   ========================= */

function removeToast(el) {
  if (!el) return;
  el.classList.remove("is-visible");
  el.addEventListener(
    "transitionend",
    () => {
      el.remove();
    },
    { once: true }
  );
}

function iconFor(type) {
  if (type === "success") return "✅";
  if (type === "warning") return "⚠️";
  if (type === "error") return "❌";
  return "ℹ️";
}
