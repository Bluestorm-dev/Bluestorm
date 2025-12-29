// js/pages/journalNew.page.js
// Création d'une entrée de journal + (option) création flashcards.
// Dépend: /js/db/journal.store.js, /js/db/flashcards.store.js, components/toast.js, router.navigate()

import * as JournalStore from "/js/db/journal.store.js";
import * as FlashStore from "/js/db/flashcards.store.js";
import { toast } from "../components/toast.js";
import { navigate } from "../router.js";

console.log("journalNew.page.js loaded", import.meta.url);

const THEMES = [
  { id: "bluestorm", label: "BlueStorm" },
  { id: "html", label: "HTML" },
  { id: "css", label: "CSS" },
  { id: "javascript", label: "JavaScript" },
  { id: "threejs", label: "Three.js" },
  { id: "figma", label: "Figma" },
];

const TYPES = [
  { id: "note", label: "Note" },
  { id: "study", label: "Study" },
  { id: "code", label: "Code" },
  { id: "doc", label: "Doc" },
  { id: "debug", label: "Debug" },
  { id: "design", label: "Design" },
  { id: "idea", label: "Idée" },
];

const $ = (sel, root = document) => root.querySelector(sel);

export async function renderJournalNewPage(container, { query } = {}) {
  container.dataset.page = "journal-new";

  const defaultTheme = query?.theme || "bluestorm";
  const defaultType = query?.type || "note";
  const defaultWeekId = query?.week || null; // ex: week_12 (optionnel)

  container.innerHTML = `
    <section class="page-header">
      <div class="page-title">Nouvelle entrée</div>
      <div class="page-desc">
        Note ce que tu as fait aujourd’hui. Même 10 minutes, ça compte.
      </div>
    </section>

    <section class="card">
      <form class="form" id="entryForm">
        <div class="field">
          <label for="themeSelect">Thème</label>
          <select id="themeSelect"></select>
        </div>

        <div class="field">
          <label for="typeSelect">Type</label>
          <select id="typeSelect"></select>
        </div>

        <div class="field">
          <label for="dateStart">Date / heure</label>
          <input id="dateStart" type="datetime-local" />
        </div>

        <div class="field">
          <label for="duration">Durée (minutes)</label>
          <input id="duration" type="number" min="0" max="1440" step="5" value="30" />
        </div>

        <div class="field">
          <label for="title">Titre (option)</label>
          <input id="title" type="text" placeholder="Ex: DOM + addEventListener" />
        </div>

        <div class="field">
          <label for="notes">Ce que tu as fait / compris</label>
          <textarea id="notes" placeholder="Ex: J'ai vu le DOM, compris addEventListener, et testé un mini handler…"></textarea>
        </div>

        <div class="card" style="background: rgba(255,255,255,0.04); border: 1px solid var(--color-border-soft);">
          <div class="card__title" style="font-size: 1.1rem;">Flashcards (option)</div>
          <div class="card__subtitle">
            Transforme ton entrée en cartes pour mémoriser (1 à 3 max).
          </div>

          <div class="field" style="margin-top: 12px;">
            <label for="fcCount">Nombre de cartes à créer</label>
            <select id="fcCount">
              <option value="0">0 (aucune)</option>
              <option value="1">1 carte</option>
              <option value="2">2 cartes</option>
              <option value="3">3 cartes</option>
            </select>
          </div>

          <div class="field">
            <label for="fcMode">Mode</label>
            <select id="fcMode">
              <option value="auto">Auto (depuis ton texte)</option>
              <option value="manual">Manuel (je remplis)</option>
            </select>
          </div>

          <div id="fcManualWrap" hidden style="display:grid; gap:12px; margin-top:12px;"></div>

          <small class="muted">
            Règle BlueStorm: 1 entrée = 1 apprentissage = 1 à 3 cartes max.
          </small>
        </div>

        <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top: 6px;">
          <button class="btn" type="submit">Enregistrer</button>
          <button class="btn btn--secondary" id="cancelBtn" type="button">Annuler</button>
        </div>
      </form>
    </section>
  `;

  // Fill selects
  fillSelect($("#themeSelect", container), THEMES, defaultTheme);
  fillSelect($("#typeSelect", container), TYPES, defaultType);

  // Default dateStart = now (local datetime)
  $("#dateStart", container).value = toLocalDatetimeInputValue(new Date());

  // Wire cancel
  $("#cancelBtn", container)?.addEventListener("click", () => navigate("/journal"));

  // Flashcard UI
  const fcCountEl = $("#fcCount", container);
  const fcModeEl = $("#fcMode", container);
  const fcManualWrap = $("#fcManualWrap", container);

  function refreshFlashcardUI() {
    const count = Number(fcCountEl.value || 0);
    const mode = String(fcModeEl.value || "auto");

    if (count <= 0) {
      fcManualWrap.innerHTML = "";
      fcManualWrap.hidden = true;
      return;
    }

    if (mode === "manual") {
      fcManualWrap.hidden = false;
      fcManualWrap.innerHTML = buildManualFlashcardInputs(count);
    } else {
      fcManualWrap.innerHTML = "";
      fcManualWrap.hidden = true;
    }
  }

  fcCountEl.addEventListener("change", refreshFlashcardUI);
  fcModeEl.addEventListener("change", refreshFlashcardUI);
  refreshFlashcardUI();

  // Submit
  $("#entryForm", container)?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await onSubmit(container, { defaultWeekId });
  });
}

/* =========================
   Submit handler
   ========================= */

async function onSubmit(container, { defaultWeekId = null } = {}) {
  // Resolve store funcs safely
  const addEntry =
    JournalStore.addEntry ||
    JournalStore.saveEntry ||
    JournalStore.putJournalEntry;

  const putFlashcard =
    FlashStore.addFlashcard ||
    FlashStore.putFlashcard;

  if (!addEntry) {
    toast("Erreur: journal.store.js ne fournit pas de méthode d’ajout.");
    return;
  }
  if (!putFlashcard) {
    toast("Erreur: flashcards.store.js ne fournit pas putFlashcard().");
    return;
  }

  const themeId = $("#themeSelect", container).value || "bluestorm";
  const type = $("#typeSelect", container).value || "note";

  const dateStartLocal = $("#dateStart", container).value;
  const dateStart = dateStartLocal
    ? new Date(dateStartLocal).toISOString()
    : new Date().toISOString();

  const durationMinutes = Number($("#duration", container).value || 0) || 0;
  const title = ($("#title", container).value || "").trim();
  const notes = ($("#notes", container).value || "").trim();

  if (!notes && !title) {
    toast("Écris au moins une phrase 🙂");
    return;
  }

  // Create journal entry (format compatible avec ton store)
  const entry = {
    id: cryptoId(),
    dateStart,
    durationMinutes,
    themeId,
    type,
    title,
    notes,
    tags: extractTags(`${title}\n${notes}`),
    weekId: defaultWeekId ? String(defaultWeekId) : null,
    todoId: null,
  };

  let saved;
  try {
    saved = await addEntry(entry);
  } catch (err) {
    console.error(err);
    toast("Erreur : impossible d’enregistrer l’entrée.");
    return;
  }

  // Flashcards option
  const fcCount = Number($("#fcCount", container).value || 0);
  const fcMode = String($("#fcMode", container).value || "auto");

  if (fcCount > 0) {
    try {
      const baseText = `${title}\n${notes}`.trim();

      const cards =
        fcMode === "manual"
          ? readManualFlashcards(container, fcCount, { themeId, sourceId: saved.id })
          : buildAutoFlashcardsFromText(baseText, fcCount, { themeId, sourceId: saved.id });

      for (const c of cards) {
        await putFlashcard(c);
      }

      toast(`Entrée + ${cards.length} flashcard(s) enregistrées.`);
    } catch (err) {
      console.error(err);
      toast("Entrée OK, mais erreur flashcards.");
    }
  } else {
    toast("Entrée enregistrée.");
  }

  navigate("/journal");
}

/* =========================
   Flashcards helpers
   ========================= */

function buildAutoFlashcardsFromText(text, count, { themeId, sourceId }) {
  const sentences = splitSentences(text);
  const picks = pickBestSentences(sentences, count);

  return picks.map((s) => {
    const front = buildQuestionFromSentence(s);
    const back = s.trim();

    return {
      id: cryptoId(),
      themeId,
      sourceId,               // index bySource dans db.js
      tags: ["from-journal", `entry:${sourceId}`],

      // store flashcards.store.js attend:
      status: "new",           // new | learning | review | suspended
      suspended: false,
      dueAt: null,             // une "new" n’est pas due (ta logique isDue ignore new)
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),

      // contenu
      front,
      back,
      hint: "Relis ton journal si besoin.",

      // paramètres SRS (optionnels)
      reps: 0,
      intervalDays: 0,
      ease: 2.5,
    };
  });
}

function buildManualFlashcardInputs(count) {
  let html = "";
  for (let i = 1; i <= count; i++) {
    html += `
      <div class="card" style="padding: 12px; background: rgba(255,255,255,0.03);">
        <div class="muted" style="margin-bottom: 8px;">Carte ${i}</div>
        <div class="field">
          <label>Question (Front)</label>
          <input type="text" data-fc-front="${i}" placeholder="Ex: C’est quoi le DOM ?" />
        </div>
        <div class="field">
          <label>Réponse (Back)</label>
          <textarea data-fc-back="${i}" placeholder="Ex: Le DOM est la représentation de la page en objets…"></textarea>
        </div>
      </div>
    `;
  }
  return html;
}

function readManualFlashcards(container, count, { themeId, sourceId }) {
  const cards = [];
  for (let i = 1; i <= count; i++) {
    const front = ($(`[data-fc-front="${i}"]`, container).value || "").trim();
    const back = ($(`[data-fc-back="${i}"]`, container).value || "").trim();

    if (!front || !back) continue;

    cards.push({
      id: cryptoId(),
      themeId,
      sourceId,
      tags: ["manual", `entry:${sourceId}`],

      status: "new",
      suspended: false,
      dueAt: null,

      front,
      back,
      hint: "",

      reps: 0,
      intervalDays: 0,
      ease: 2.5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  if (!cards.length) throw new Error("Aucune flashcard manuelle remplie.");
  return cards;
}

/* =========================
   Utilities
   ========================= */

function fillSelect(selectEl, items, selectedId) {
  selectEl.innerHTML = items
    .map((it) => `<option value="${escapeHtml(it.id)}">${escapeHtml(it.label)}</option>`)
    .join("");
  selectEl.value = selectedId || items[0]?.id || "";
}

function cryptoId() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `id-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

function toLocalDatetimeInputValue(date) {
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function splitSentences(text) {
  return String(text)
    .split(/[\n.!?]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function pickBestSentences(sentences, count) {
  const keywords = ["dom", "css", "js", "three", "fonction", "objet", "event", "async", "promise", "layout", "flex", "grid", "api"];

  const scored = sentences.map((s) => {
    const len = s.length;
    let score = 0;
    if (len >= 25 && len <= 120) score += 2;
    if (len > 120 && len <= 200) score += 1;
    for (const k of keywords) if (s.toLowerCase().includes(k)) score += 1;
    return { s, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, count).map((x) => x.s);
}

function buildQuestionFromSentence(sentence) {
  const s = sentence.trim();
  const lower = s.toLowerCase();

  if (lower.includes("c'est") || lower.includes("c’est")) return "Explique cette notion en une phrase ?";
  if (lower.startsWith("j'ai") || lower.startsWith("je ")) return "Qu’as-tu appris ici ?";
  return "Explique :";
}

function extractTags(text) {
  const tags = [];
  const hashTags = text.match(/#[a-zA-Z0-9_-]+/g) || [];
  for (const t of hashTags) tags.push(t.replace("#", "").toLowerCase());

  const kw = ["dom", "threejs", "css", "html", "javascript", "figma", "debug"];
  for (const k of kw) if (text.toLowerCase().includes(k)) tags.push(k);

  return Array.from(new Set(tags)).slice(0, 12);
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
