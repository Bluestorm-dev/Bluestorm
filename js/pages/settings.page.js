// js/pages/settings.page.js
// Settings BlueStorm : préférences locales + outils (export/import/sync local) + infos PWA.
// Objectif: tout tenir en LocalStorage/IndexedDB, sans backend obligatoire.
// (Le "vrai" bouton Sync serveur viendra ensuite dans sync.engine.js)
//
// Dépend: db/db.js (list of stores optional), db/settings.store.js (facultatif), components/toast.js,
// router.navigate(), utils/escape.js
//
// NOTE: Comme on n'a pas encore codé settings.store.js dans cette conversation,
// ce fichier fonctionne avec localStorage (simple, robuste). Si tu veux, on le branchera ensuite sur IndexedDB.

import { toast } from "../components/toast.js";
import { navigate } from "../router.js";
import { escapeHtml } from "../utils/escape.js";

// Importers pour exporter/importer toute la base (snapshot)
import { exportSnapshot, importSnapshot, clearAllData } from "../sync/snapshot.js";

const $ = (sel, root = document) => root.querySelector(sel);

const LS_KEY = "bluestorm.settings.v1";

const DEFAULTS = {
  themeMode: "dark",          // "dark" | "light" (light + tard)
  reduceMotion: false,
  dailyNewCardsLimit: 10,     // pour flashcards (l’app UI utilisera ce param)
  dailyReviewLimit: 50,
  journalReminder: false,     // (si tu veux un futur "notification" local)
  autoFlashcardsFromJournal: false,
  showEasterEggs: true,
  devMode: false
};

export async function renderSettingsPage(container) {
  container.dataset.page = "settings";

  const settings = loadSettings();

  container.innerHTML = `
    <section class="page-header">
      <div class="page-title">Réglages</div>
      <div class="page-desc">
        Personnalise ton cockpit. Tes données restent chez toi (offline-first).
      </div>
    </section>

    <section class="card">
      <div class="card__title">Préférences</div>
      <div class="card__subtitle">Confort d’utilisation et limites de révision.</div>

      <div class="form" style="margin-top: 12px; display:grid; gap:14px;">
        ${rowSelect("Mode", "themeMode", [
          { id: "dark", label: "🌙 Dark (défaut)" },
          { id: "light", label: "☀️ Light (plus tard)" }
        ], settings.themeMode)}

        ${rowToggle("Réduire les animations", "reduceMotion", settings.reduceMotion)}

        ${rowNumber("Limite cards nouvelles / jour", "dailyNewCardsLimit", settings.dailyNewCardsLimit, 0, 50, 1)}
        ${rowNumber("Limite révisions / jour", "dailyReviewLimit", settings.dailyReviewLimit, 0, 200, 5)}

        ${rowToggle("Auto-flashcards depuis journal", "autoFlashcardsFromJournal", settings.autoFlashcardsFromJournal)}
        ${rowToggle("Afficher easter eggs", "showEasterEggs", settings.showEasterEggs)}

        <div class="field">
          <label class="muted">Mode développeur</label>
          <div style="display:flex; justify-content:space-between; gap:12px; align-items:center;">
            <div class="muted">Affiche des infos techniques (debug).</div>
            <label class="switch">
              <input type="checkbox" id="devMode" ${settings.devMode ? "checked" : ""}>
              <span class="switch__ui"></span>
            </label>
          </div>
        </div>
      </div>

      <div style="margin-top: 14px; display:flex; gap:12px; flex-wrap:wrap;">
        <button class="btn" id="saveBtn" type="button">Enregistrer</button>
        <button class="btn btn--secondary" id="resetBtn" type="button">Réinitialiser</button>
      </div>
    </section>

    <section class="card" style="margin-top: 14px;">
      <div class="card__title">Données</div>
      <div class="card__subtitle">
        Export / import pour synchroniser ton téléphone et ton PC (sans serveur, version 1).
      </div>

      <div style="margin-top: 12px; display:grid; gap:12px;">
        <button class="btn btn--secondary" id="exportBtn" type="button">⬇️ Exporter (JSON)</button>

        <div class="card" style="padding: 12px; background: rgba(255,255,255,0.03); border: 1px solid var(--color-border-soft);">
          <div class="muted" style="margin-bottom: 8px;">Importer un snapshot</div>
          <input type="file" id="importFile" accept="application/json" />
          <div class="muted" style="margin-top: 8px; font-size: 0.9rem;">
            Import = fusion (les données plus récentes gagnent). Les suppressions sont respectées (tombstones).
          </div>
          <div style="margin-top: 10px;">
            <button class="btn" id="importBtn" type="button">⬆️ Importer</button>
          </div>
        </div>

        <button class="btn btn--danger" id="wipeBtn" type="button">🧨 Tout effacer</button>
      </div>
    </section>

    <section class="card" style="margin-top: 14px;">
      <div class="card__title">PWA</div>
      <div class="card__subtitle">Infos d’installation et état offline.</div>

      <div class="list" style="margin-top: 12px;">
        ${infoRow("Service Worker", `<span id="swState">…</span>`)}
        ${infoRow("Cache", `<span id="cacheState">…</span>`)}
        ${infoRow("Mode", `<span id="modeState">${escapeHtml(settings.themeMode)}</span>`)}
        ${infoRow("Version", `<span class="mono">v1</span>`)}
      </div>

      <div style="margin-top: 12px;">
        <button class="btn btn--ghost" id="checkPwaBtn" type="button">Vérifier</button>
      </div>
    </section>
  `;

  // Wire buttons
  $("#saveBtn", container)?.addEventListener("click", () => {
    const next = readSettingsFromUI(container);
    saveSettings(next);
    applySettingsSideEffects(next);
    toast("Réglages enregistrés.");
    $("#modeState", container).textContent = next.themeMode;
  });

  $("#resetBtn", container)?.addEventListener("click", () => {
    saveSettings(DEFAULTS);
    applySettingsSideEffects(DEFAULTS);
    toast("Réglages réinitialisés.");
    navigate("/settings"); // reload page
  });

  $("#exportBtn", container)?.addEventListener("click", async () => {
    try {
      const snap = await exportSnapshot();
      downloadJson(snap, `bluestorm-snapshot-${dateStamp()}.json`);
      toast("Export prêt.");
    } catch (e) {
      console.error(e);
      toast("Erreur export.");
    }
  });

  $("#importBtn", container)?.addEventListener("click", async () => {
    const file = $("#importFile", container)?.files?.[0];
    if (!file) {
      toast("Choisis un fichier JSON.");
      return;
    }

    try {
      const text = await file.text();
      const snap = JSON.parse(text);
      await importSnapshot(snap);
      toast("Import OK.");
      navigate("/"); // retour cockpit
    } catch (e) {
      console.error(e);
      toast("Erreur import (JSON ?).");
    }
  });

  $("#wipeBtn", container)?.addEventListener("click", async () => {
    const ok = confirm("Tout effacer ? (journal, flashcards, progression…) Cette action est irréversible.");
    if (!ok) return;

    try {
      await clearAllData();
      localStorage.removeItem(LS_KEY);
      toast("Données effacées.");
      navigate("/"); // cockpit
    } catch (e) {
      console.error(e);
      toast("Erreur effacement.");
    }
  });

  $("#checkPwaBtn", container)?.addEventListener("click", async () => {
    await refreshPwaInfo(container);
    toast("Infos mises à jour.");
  });

  // Initial PWA info
  await refreshPwaInfo(container);
  applySettingsSideEffects(settings);
}

/* =========================
   Settings storage
   ========================= */

function loadSettings() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return normalizeSettings({ ...DEFAULTS, ...parsed });
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings(settings) {
  const normalized = normalizeSettings(settings);
  localStorage.setItem(LS_KEY, JSON.stringify(normalized));
  return normalized;
}

function normalizeSettings(s) {
  const out = { ...DEFAULTS, ...(s || {}) };

  out.themeMode = out.themeMode === "light" ? "light" : "dark";
  out.reduceMotion = Boolean(out.reduceMotion);
  out.journalReminder = Boolean(out.journalReminder);
  out.autoFlashcardsFromJournal = Boolean(out.autoFlashcardsFromJournal);
  out.showEasterEggs = Boolean(out.showEasterEggs);
  out.devMode = Boolean(out.devMode);

  out.dailyNewCardsLimit = clampInt(out.dailyNewCardsLimit, 0, 50);
  out.dailyReviewLimit = clampInt(out.dailyReviewLimit, 0, 200);

  return out;
}

function readSettingsFromUI(container) {
  const themeMode = $("#themeMode", container).value;
  const reduceMotion = $("#reduceMotion", container).checked;
  const dailyNewCardsLimit = Number($("#dailyNewCardsLimit", container).value);
  const dailyReviewLimit = Number($("#dailyReviewLimit", container).value);
  const autoFlashcardsFromJournal = $("#autoFlashcardsFromJournal", container).checked;
  const showEasterEggs = $("#showEasterEggs", container).checked;
  const devMode = $("#devMode", container).checked;

  return normalizeSettings({
    themeMode,
    reduceMotion,
    dailyNewCardsLimit,
    dailyReviewLimit,
    autoFlashcardsFromJournal,
    showEasterEggs,
    devMode
  });
}

/* =========================
   Side effects (optional)
   ========================= */

function applySettingsSideEffects(settings) {
  // 1) Reduce motion
  document.documentElement.toggleAttribute("data-reduce-motion", settings.reduceMotion);

  // 2) Theme mode hook (light later)
  document.documentElement.setAttribute("data-mode", settings.themeMode);

  // 3) Dev mode
  document.documentElement.toggleAttribute("data-dev", settings.devMode);
}

/* =========================
   PWA info
   ========================= */

async function refreshPwaInfo(container) {
  const swState = $("#swState", container);
  const cacheState = $("#cacheState", container);

  // SW state
  if ("serviceWorker" in navigator) {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        swState.innerHTML = `<span class="muted">non enregistré</span>`;
      } else {
        const active = reg.active ? "actif" : "en attente";
        swState.innerHTML = `<span class="mono">${escapeHtml(active)}</span>`;
      }
    } catch {
      swState.innerHTML = `<span class="muted">inconnu</span>`;
    }
  } else {
    swState.innerHTML = `<span class="muted">non supporté</span>`;
  }

  // Cache state
  if ("caches" in window) {
    try {
      const keys = await caches.keys();
      cacheState.innerHTML = `<span class="mono">${escapeHtml(String(keys.length))} cache(s)</span>`;
    } catch {
      cacheState.innerHTML = `<span class="muted">inconnu</span>`;
    }
  } else {
    cacheState.innerHTML = `<span class="muted">non supporté</span>`;
  }
}

/* =========================
   Snapshot download helper
   ========================= */

function downloadJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function dateStamp() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${da}`;
}

/* =========================
   Small UI builders
   ========================= */

function rowSelect(label, id, items, value) {
  return `
    <div class="field">
      <label for="${escapeHtml(id)}">${escapeHtml(label)}</label>
      <select id="${escapeHtml(id)}">
        ${items
          .map((it) => `<option value="${escapeHtml(it.id)}" ${it.id === value ? "selected" : ""}>${escapeHtml(it.label)}</option>`)
          .join("")}
      </select>
    </div>
  `;
}

function rowNumber(label, id, value, min, max, step) {
  return `
    <div class="field">
      <label for="${escapeHtml(id)}">${escapeHtml(label)}</label>
      <input id="${escapeHtml(id)}" type="number" value="${escapeHtml(String(value))}" min="${min}" max="${max}" step="${step}">
    </div>
  `;
}

function rowToggle(label, id, checked) {
  return `
    <div class="field">
      <label class="muted">${escapeHtml(label)}</label>
      <div style="display:flex; justify-content:space-between; gap:12px; align-items:center;">
        <div class="muted"></div>
        <label class="switch">
          <input type="checkbox" id="${escapeHtml(id)}" ${checked ? "checked" : ""}>
          <span class="switch__ui"></span>
        </label>
      </div>
    </div>
  `;
}

function infoRow(label, valueHtml) {
  return `
    <div class="list-item">
      <div class="list-item__main">
        <div class="list-item__title">${escapeHtml(label)}</div>
        <div class="list-item__meta">${valueHtml}</div>
      </div>
    </div>
  `;
}

function clampInt(n, min, max) {
  const v = Number(n);
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.trunc(v)));
}
