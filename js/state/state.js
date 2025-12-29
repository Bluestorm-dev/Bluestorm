// js/state/state.js
// State global BlueStorm (runtime) + helpers de persistance légère.
// Objectif: avoir UN endroit pour:
// - lire/écrire les préférences (settings localStorage)
// - lire/écrire l'état UI (dernier onglet, filtres, etc.)
// - stocker du state runtime (non persistant) pour éviter de tout recalculer
//
// Note: Les données métier (journal, flashcards, programme, skills) restent en IndexedDB.
// Ici c'est plutôt: UI state, caches, flags.
//
// Usage:
// import { State } from "../state/state.js";
//
// const s = State.get();                // state complet
// State.set({ ui: { ... } });           // merge
// State.ui.set("journalFilter", "all"); // set simple
// const theme = State.settings.get("themeMode");

const LS_KEY = "bluestorm.state.v1";
const LS_SETTINGS_KEY = "bluestorm.settings.v1";

// Defaults UI (tout ce qui est "confort / navigation")
const DEFAULT_UI = {
  lastRoute: "#/",
  lastDomainFilter: "all",
  journalFilter: "all",
  flashcardsFilter: "due",
  skillsDomain: "all"
};

// Defaults settings (tu as déjà DEFAULTS dans settings.page.js,
// ici on met une version minimaliste, la page settings écrase si besoin)
const DEFAULT_SETTINGS = {
  themeMode: "dark",
  reduceMotion: false,
  dailyNewCardsLimit: 10,
  dailyReviewLimit: 50,
  autoFlashcardsFromJournal: false,
  showEasterEggs: true,
  devMode: false
};

let runtime = {
  // runtime cache (non persisté)
  cache: {
    theme: null,
    skillsMap: null,
    program: null
  }
};

/* =========================
   Core load / save
   ========================= */

function loadState() {
  return safeMerge(
    { ui: { ...DEFAULT_UI } },
    safeParse(localStorage.getItem(LS_KEY)) || {}
  );
}

function saveState(next) {
  localStorage.setItem(LS_KEY, JSON.stringify(next));
}

function loadSettings() {
  return safeMerge(
    { ...DEFAULT_SETTINGS },
    safeParse(localStorage.getItem(LS_SETTINGS_KEY)) || {}
  );
}

function saveSettings(next) {
  localStorage.setItem(LS_SETTINGS_KEY, JSON.stringify(next));
}

/* =========================
   Public API
   ========================= */

export const State = {
  // Entire state (ui only)
  get() {
    return loadState();
  },

  set(partial) {
    const current = loadState();
    const next = safeMerge(current, partial || {});
    saveState(next);
    return next;
  },

  reset() {
    const next = { ui: { ...DEFAULT_UI } };
    saveState(next);
    return next;
  },

  ui: {
    get(key, fallback = null) {
      const s = loadState();
      return key in s.ui ? s.ui[key] : fallback;
    },

    set(key, value) {
      const s = loadState();
      s.ui[key] = value;
      saveState(s);
      return value;
    }
  },

  settings: {
    get(key, fallback = null) {
      const s = loadSettings();
      return key in s ? s[key] : fallback;
    },

    set(key, value) {
      const s = loadSettings();
      s[key] = value;
      saveSettings(s);
      return value;
    },

    all() {
      return loadSettings();
    },

    replace(next) {
      const merged = safeMerge({ ...DEFAULT_SETTINGS }, next || {});
      saveSettings(merged);
      return merged;
    },

    reset() {
      saveSettings({ ...DEFAULT_SETTINGS });
      return { ...DEFAULT_SETTINGS };
    }
  },

  runtime: {
    // runtime cache: ne touche pas localStorage
    getCache(key) {
      return runtime.cache[key] ?? null;
    },
    setCache(key, value) {
      runtime.cache[key] = value;
      return value;
    },
    clearCache(key) {
      if (key) delete runtime.cache[key];
      else runtime.cache = {};
    }
  }
};

/* =========================
   Utils
   ========================= */

function safeParse(raw) {
  try {
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isPlainObject(x) {
  return x && typeof x === "object" && !Array.isArray(x);
}

// merge profond (objects uniquement)
function safeMerge(base, patch) {
  const out = { ...(base || {}) };

  for (const [k, v] of Object.entries(patch || {})) {
    if (isPlainObject(v) && isPlainObject(out[k])) {
      out[k] = safeMerge(out[k], v);
    } else {
      out[k] = v;
    }
  }

  return out;
}
