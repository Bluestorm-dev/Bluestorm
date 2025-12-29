// js/utils/escape.js
// Sécurise les chaînes injectées dans le HTML (anti XSS basique).
// À utiliser pour tous les contenus texte venant de l’utilisateur.

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
