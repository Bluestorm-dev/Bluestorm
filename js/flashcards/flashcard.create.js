// js/flashcards/flashcard.create.js
// Création de flashcards depuis une entrée Journal.
// ✅ Mode manuel: l'utilisateur remplit Q/A (et on lie sourceId à l'entrée)
// ✅ Mode auto: on génère 1 à N suggestions (simple heuristique), éditables avant save
//
// Dépendances:
// - db/flashcards.store.js : putFlashcard(), upsertManyFlashcards()
// - (optionnel) state/settings pour auto-create flag
//
// Convention:
// - card.sourceId = entry.id
// - card.themeId = entry.themeId
// - card.tags inclut "journal"

import { putFlashcard, upsertManyFlashcards } from "../db/flashcards.store.js";

function nowIso() {
  return new Date().toISOString();
}

function cleanLines(text) {
  return String(text || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * createFlashcardsForEntry(entry, cards)
 * cards: [{question, answer, hint?, tags?, themeId?}]
 */
export async function createFlashcardsForEntry(entry, cards = []) {
  if (!entry?.id) throw new Error("Journal entry must be saved first (needs id)");

  const baseTheme = entry.themeId || "bluestorm";

  const payload = (cards || [])
    .filter((c) => c && (c.question || c.answer))
    .map((c) => ({
      ...c,
      themeId: c.themeId || baseTheme,
      sourceId: entry.id,
      tags: normalizeTags([...(c.tags || []), "journal"]),
      status: c.status || "new",
      createdAt: c.createdAt || nowIso(),
      updatedAt: nowIso()
    }));

  if (!payload.length) return [];

  // bulk upsert pour performance
  return await upsertManyFlashcards(payload);
}

/**
 * autoSuggestFlashcards(entry)
 * Génère des suggestions "éditables" (ne sauvegarde pas).
 * Heuristiques:
 * - si notes contiennent des lignes "Q:" / "A:" (ou "?" + ligne suivante), on crée des cartes
 * - sinon on tente: 1 carte = titre => question, notes => réponse
 * - + cartes à partir des puces/points (si beaucoup)
 */
export function autoSuggestFlashcards(entry, { max = 6 } = {}) {
  const title = String(entry?.title || "").trim();
  const notes = String(entry?.notes || "").trim();
  const lines = cleanLines(notes);

  const out = [];

  // 1) Pattern Q:/A:
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^q[:\-]/i.test(l)) {
      const q = l.replace(/^q[:\-]\s*/i, "").trim();
      const next = lines[i + 1] || "";
      let a = "";

      if (/^a[:\-]/i.test(next)) {
        a = next.replace(/^a[:\-]\s*/i, "").trim();
        i += 1;
      } else {
        a = next;
      }

      if (q) out.push({ question: q, answer: a || "(à compléter)", hint: "" });
      if (out.length >= max) break;
    }
  }

  if (out.length >= max) return out.slice(0, max);

  // 2) Pattern "ligne ? -> réponse = ligne suivante"
  for (let i = 0; i < lines.length - 1 && out.length < max; i++) {
    const l = lines[i];
    const next = lines[i + 1];
    if (l.endsWith("?") && next && next.length >= 3) {
      out.push({ question: l, answer: next, hint: "" });
    }
  }

  if (out.length >= 2) return out.slice(0, max);

  // 3) Fallback: 1 carte titre/notes
  if (title || notes) {
    out.push({
      question: title ? `Explique : ${title}` : "Explique ce que tu as appris aujourd’hui",
      answer: notes || "(à compléter)",
      hint: entry?.type ? `Type: ${entry.type}` : ""
    });
  }

  // 4) Bonus: si notes ont des bullet points, on crée des cartes "définition"
  const bullets = lines.filter((l) => /^[-•*]/.test(l)).slice(0, max);
  for (const b of bullets) {
    if (out.length >= max) break;
    const text = b.replace(/^[-•*]\s*/, "");
    if (text.length < 6) continue;
    out.push({
      question: `Définis / résume : ${text}`,
      answer: "(à compléter)",
      hint: "Complète avec tes mots"
    });
  }

  // Dédupe simple
  const seen = new Set();
  const uniq = [];
  for (const c of out) {
    const k = `${(c.question || "").toLowerCase()}::${(c.answer || "").toLowerCase()}`;
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(c);
  }

  return uniq.slice(0, max);
}

function normalizeTags(tags) {
  return Array.from(new Set((tags || []).map((t) => String(t || "").trim()).filter(Boolean)));
}
