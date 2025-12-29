// js/pages/skills.page.js
// Page Skills : affiche l'arbre de compétences + badges + état (locked / unlocked / progress).
// Version 1: UI lisible + mobile-first + filtrage par domaine + vue "carte".
// (On garde l'arbre graphique "noeuds + liaisons" pour une V2)
//
// Dépend: data/skills.map.json (fetch) + db/program.store.js + db/journal.store.js + db/flashcards.store.js
// + components/toast.js + utils/escape.js
//
// Important: Pour l'instant, on calcule les unlocks côté page (simple).
// Si tu veux, ensuite on extrait la logique dans skills.engine.js.

import { listWeeks, computeWeekCompletion, getWeekProgress } from "../db/program.store.js";
import { computeJournalStats, listRecentEntries } from "../db/journal.store.js";
import { computeFlashcardsStats, listFlashcards } from "../db/flashcards.store.js";
import { toast } from "../components/toast.js";
import { escapeHtml } from "../utils/escape.js";

const $ = (sel, root = document) => root.querySelector(sel);

const SKILLS_URL = "./data/skills.map.json";

export async function renderSkillsPage(container, { query } = {}) {
  container.dataset.page = "skills";

  container.innerHTML = `
    <section class="page-header">
      <div class="page-title">Compétences</div>
      <div class="page-desc">
        Ton arbre BlueStorm : ce que tu sais, ce qui est en cours, ce qui arrive.
      </div>
    </section>

    <section class="card" style="margin-bottom: 14px;">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
        <div>
          <div class="card__title" style="font-size:1.1rem;">Vue d’ensemble</div>
          <div class="card__subtitle" id="overviewLine">…</div>
        </div>

        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button class="btn btn--secondary" id="refreshBtn" type="button">Rafraîchir</button>
          <button class="btn btn--ghost" id="legendBtn" type="button">Légende</button>
        </div>
      </div>

      <div style="margin-top:12px;">
        <div class="progress">
          <div class="progress__bar" id="globalProgress" style="width:0%"></div>
        </div>
      </div>

      <div class="chips" id="domainChips" style="margin-top: 12px;"></div>
    </section>

    <section class="skills-grid" id="skillsGrid" aria-live="polite">
      ${skeletonSkills()}
    </section>

    <dialog id="legendDialog" class="dialog">
      <div class="dialog__content card">
        <div class="card__title">Légende</div>
        <div class="card__subtitle">Comment lire l’arbre.</div>

        <div class="list" style="margin-top:12px;">
          ${legendRow("🔒", "Verrouillé", "Pas encore débloqué par les conditions")}
          ${legendRow("🟡", "En cours", "Conditions partiellement remplies")}
          ${legendRow("✅", "Débloqué", "Conditions remplies")}
          ${legendRow("🏅", "Badge", "Récompense visuelle (collection)")}
        </div>

        <div style="margin-top:14px; display:flex; gap:12px; justify-content:flex-end;">
          <button class="btn" id="closeLegendBtn" type="button">OK</button>
        </div>
      </div>
    </dialog>
  `;

  $("#legendBtn", container)?.addEventListener("click", () => {
    $("#legendDialog", container)?.showModal?.();
  });
  $("#closeLegendBtn", container)?.addEventListener("click", () => {
    $("#legendDialog", container)?.close?.();
  });

  $("#refreshBtn", container)?.addEventListener("click", async () => {
    toast("Mise à jour…");
    await loadAndRender(container, { domain: getSelectedDomain(container) });
    toast("OK.");
  });

  // Initial render
  await loadAndRender(container, { domain: query?.domain || "all" });
}

/* =========================
   Load + Compute state
   ========================= */

async function loadAndRender(container, { domain }) {
  const map = await fetchSkillsMap();
  const metrics = await computeMetrics(); // user progress signals

  // Domains chips
  renderDomainChips($("#domainChips", container), map.domains, domain);

  // Compute all skill states
  const computed = computeDomainsState(map.domains, metrics);

  // Global overview
  const totals = countTotals(computed);
  const pct = totals.totalLevels ? Math.round((totals.unlockedLevels / totals.totalLevels) * 100) : 0;

  $("#overviewLine", container).textContent =
    `${totals.unlockedLevels}/${totals.totalLevels} paliers débloqués • ` +
    `${totals.skillsUnlocked}/${totals.totalSkills} skills ouvertes • ` +
    `${metrics.flashcardsDue} cards dues • ` +
    `${metrics.journalStreakDays} jours de streak`;

  $("#globalProgress", container).style.width = `${pct}%`;

  // Render grid
  const grid = $("#skillsGrid", container);
  grid.innerHTML = renderDomainsCards(computed, { selectedDomain: domain });

  // Wire collapse toggles
  grid.querySelectorAll("[data-toggle-domain]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const domId = btn.getAttribute("data-toggle-domain");
      const section = grid.querySelector(`[data-domain="${cssEscape(domId)}"]`);
      section?.classList.toggle("is-collapsed");
    });
  });

  // Wire "chip filter" nav
  grid.querySelectorAll("[data-domain-chip]").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const domId = a.getAttribute("data-domain-chip");
      setSelectedDomain(container, domId);
      // update hash to persist
      const qs = domId && domId !== "all" ? `?domain=${encodeURIComponent(domId)}` : "";
      location.hash = `#/skills${qs}`;
      loadAndRender(container, { domain: domId }).catch(console.error);
    });
  });
}

async function fetchSkillsMap() {
  const res = await fetch(SKILLS_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Impossible de charger ${SKILLS_URL} (${res.status})`);
  return await res.json();
}

/* =========================
   Metrics (signals)
   ========================= */

async function computeMetrics() {
  // Programme
  const weeks = await listWeeks();
  const completedWeekNumbers = [];
  for (const w of weeks) {
    const c = await computeWeekCompletion(w.id);
    if (c.percent >= 100) completedWeekNumbers.push(w.weekNumber);
  }

  // Journal
  const journal7 = await computeJournalStats({ days: 7 });
  const journal2 = await computeJournalStats({ days: 2 });
  const streak = await computeJournalStreakDays(30); // streak up to 30 days

  // Flashcards
  const fcStats = await computeFlashcardsStats();
  // "Mastered" proxy: cartes en review avec reps>=3 (approx). (On pourra raffiner plus tard)
  const mastered = await estimateFlashcardsMastered();

  return {
    completedWeekNumbers,
    journalEntries7d: journal7.entries,
    journalEntries2d: journal2.entries,
    journalStreakDays: streak,
    flashcardsDue: fcStats.due,
    flashcardsNew: fcStats.new,
    flashcardsMastered: mastered,
  };
}

async function computeJournalStreakDays(maxDays = 30) {
  // Streak = nb de jours consécutifs avec au moins une entrée.
  const entries = await listRecentEntries({ days: maxDays, limit: 3000 });

  const daysWith = new Set(entries.map((e) => dayKey(e.dateStart)));
  let streak = 0;

  for (let i = 0; i < maxDays; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = dayKey(d.toISOString());
    if (daysWith.has(key)) streak += 1;
    else break;
  }

  return streak;
}

function dayKey(iso) {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return "????-??-??";
  const d = new Date(t);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

async function estimateFlashcardsMastered() {
  // Simple proxy:
  // - cartes non suspendues
  // - état review
  // - reps >= 3
  const all = await listFlashcards({ limit: 5000 });
  return all.filter((c) => !c.suspended && c.state === "review" && (c.reps || 0) >= 3).length;
}

/* =========================
   Compute unlock states
   ========================= */

function computeDomainsState(domains, metrics) {
  return (domains || [])
    .slice()
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    .map((d) => computeDomainState(d, metrics));
}

function computeDomainState(domain, metrics) {
  const skills = (domain.skills || []).map((s) => computeSkillState(s, metrics));

  const totalLevels = skills.reduce((acc, s) => acc + s.levels.length, 0);
  const unlockedLevels = skills.reduce((acc, s) => acc + s.levels.filter((l) => l.state === "unlocked").length, 0);

  const skillsUnlocked = skills.filter((s) => s.state !== "locked").length;

  return {
    ...domain,
    skills,
    totals: { totalLevels, unlockedLevels, skillsUnlocked, totalSkills: skills.length },
    state: unlockedLevels === totalLevels ? "unlocked" : unlockedLevels > 0 ? "in_progress" : "locked",
  };
}

function computeSkillState(skill, metrics) {
  const levels = (skill.levels || []).map((lvl) => computeLevelState(lvl, metrics));
  const unlocked = levels.filter((l) => l.state === "unlocked").length;

  let state = "locked";
  if (unlocked === levels.length && levels.length > 0) state = "unlocked";
  else if (unlocked > 0) state = "in_progress";

  return {
    ...skill,
    levels,
    state,
    unlockedLevels: unlocked,
    totalLevels: levels.length,
    badgeEarned: state === "unlocked",
  };
}

function computeLevelState(level, metrics) {
  const unlock = level.unlock || {};
  const checks = [];
  let okCount = 0;

  // weeksCompleted: list of numbers, all required must be present
  if (Array.isArray(unlock.weeksCompleted) && unlock.weeksCompleted.length) {
    const needed = unlock.weeksCompleted;
    const got = metrics.completedWeekNumbers;
    const ok = needed.every((w) => got.includes(w));
    checks.push({ label: `Semaines: ${needed.join(", ")}`, ok });
    if (ok) okCount++;
  }

  // journalEntries: minimum (we use 7d window as proxy)
  if (typeof unlock.journalEntries === "number") {
    const ok = metrics.journalEntries7d >= unlock.journalEntries;
    checks.push({ label: `Journal (7j) ≥ ${unlock.journalEntries}`, ok });
    if (ok) okCount++;
  }

  // journalStreakDays: minimum
  if (typeof unlock.journalStreakDays === "number") {
    const ok = metrics.journalStreakDays >= unlock.journalStreakDays;
    checks.push({ label: `Streak ≥ ${unlock.journalStreakDays}j`, ok });
    if (ok) okCount++;
  }

  // flashcardsMastered: minimum
  if (typeof unlock.flashcardsMastered === "number") {
    const ok = metrics.flashcardsMastered >= unlock.flashcardsMastered;
    checks.push({ label: `Cards maîtrisées ≥ ${unlock.flashcardsMastered}`, ok });
    if (ok) okCount++;
  }

  const totalChecks = checks.length || 0;
  const allOk = totalChecks === 0 ? true : checks.every((c) => c.ok);

  // progress ratio used for "🟡 en cours"
  const ratio = totalChecks === 0 ? 1 : okCount / totalChecks;

  return {
    ...level,
    checks,
    state: allOk ? "unlocked" : ratio > 0 ? "in_progress" : "locked",
    progressRatio: ratio,
  };
}

function countTotals(domainsComputed) {
  let totalLevels = 0;
  let unlockedLevels = 0;
  let totalSkills = 0;
  let skillsUnlocked = 0;

  for (const d of domainsComputed) {
    totalLevels += d.totals.totalLevels;
    unlockedLevels += d.totals.unlockedLevels;
    totalSkills += d.totals.totalSkills;
    skillsUnlocked += d.totals.skillsUnlocked;
  }

  return { totalLevels, unlockedLevels, totalSkills, skillsUnlocked };
}

/* =========================
   Render
   ========================= */

function renderDomainChips(container, domains, selected) {
  const current = selected || "all";
  const chips = [];

  chips.push(`<a href="#/skills" class="chip ${current === "all" ? "chip--active" : ""}" data-domain-chip="all">Tout</a>`);

  for (const d of (domains || []).slice().sort((a, b) => (a.order ?? 999) - (b.order ?? 999))) {
    const active = current === d.id ? "chip--active" : "";
    chips.push(
      `<a href="#/skills?domain=${encodeURIComponent(d.id)}" class="chip ${active}" data-domain-chip="${escapeHtml(d.id)}">
        ${escapeHtml(d.icon || "•")} ${escapeHtml(d.label)}
      </a>`
    );
  }

  container.innerHTML = chips.join("");
}

function renderDomainsCards(domainsComputed, { selectedDomain }) {
  const filtered =
    selectedDomain && selectedDomain !== "all"
      ? domainsComputed.filter((d) => d.id === selectedDomain)
      : domainsComputed;

  return filtered.map(renderDomainCard).join("");
}

function renderDomainCard(domain) {
  const stateBadge =
    domain.state === "unlocked" ? badge("✅", "Débloqué") :
    domain.state === "in_progress" ? badge("🟡", "En cours") :
    badge("🔒", "Verrouillé");

  const pct = domain.totals.totalLevels
    ? Math.round((domain.totals.unlockedLevels / domain.totals.totalLevels) * 100)
    : 0;

  return `
    <section class="card domain-card ${domain.state}" data-domain="${escapeHtml(domain.id)}">
      <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px;">
        <div style="min-width:0;">
          <div class="card__title" style="display:flex; gap:10px; align-items:center;">
            <span aria-hidden="true">${escapeHtml(domain.icon || "•")}</span>
            <span>${escapeHtml(domain.label)}</span>
          </div>
          <div class="card__subtitle">
            ${stateBadge}
            <span class="muted">•</span>
            <span class="muted">${domain.totals.unlockedLevels}/${domain.totals.totalLevels} paliers</span>
          </div>
        </div>

        <button class="btn btn--ghost" type="button" data-toggle-domain="${escapeHtml(domain.id)}">↕</button>
      </div>

      <div style="margin-top: 12px;">
        <div class="progress">
          <div class="progress__bar" style="width:${pct}%"></div>
        </div>
      </div>

      <div class="domain-body" style="margin-top: 14px;">
        <div class="skills-list">
          ${domain.skills.map(renderSkillCard).join("")}
        </div>
      </div>
    </section>
  `;
}

function renderSkillCard(skill) {
  const icon =
    skill.state === "unlocked" ? "✅" :
    skill.state === "in_progress" ? "🟡" : "🔒";

  const pct = skill.totalLevels
    ? Math.round((skill.unlockedLevels / skill.totalLevels) * 100)
    : 0;

  const badgeLine = skill.badge
    ? `<div class="muted" style="margin-top:6px;">🏅 Badge: <span class="mono">${escapeHtml(skill.badge)}</span></div>`
    : "";

  return `
    <div class="card skill-card ${skill.state}" style="padding: 12px; border: 1px solid var(--color-border-soft); background: rgba(255,255,255,0.03);">
      <div style="display:flex; justify-content:space-between; gap:12px;">
        <div style="min-width:0;">
          <div style="display:flex; gap:10px; align-items:center;">
            <span aria-hidden="true">${icon}</span>
            <div style="font-weight: var(--font-weight-semibold);">${escapeHtml(skill.label)}</div>
          </div>
          ${skill.description ? `<div class="muted" style="margin-top:4px;">${escapeHtml(skill.description)}</div>` : ""}
        </div>
        <div class="muted" style="white-space:nowrap; font-size:0.9rem;">${pct}%</div>
      </div>

      <div style="margin-top:10px;">
        <div class="progress">
          <div class="progress__bar" style="width:${pct}%"></div>
        </div>
      </div>

      <div class="levels" style="margin-top:12px; display:grid; gap:10px;">
        ${skill.levels.map(renderLevelRow).join("")}
      </div>

      ${badgeLine}
    </div>
  `;
}

function renderLevelRow(level) {
  const stateIcon =
    level.state === "unlocked" ? "✅" :
    level.state === "in_progress" ? "🟡" : "🔒";

  const checksHtml = (level.checks || []).length
    ? `<ul style="margin:8px 0 0 18px; padding:0; display:grid; gap:6px;">
        ${level.checks.map((c) => `
          <li class="muted" style="list-style: disc;">
            <span aria-hidden="true">${c.ok ? "✅" : "⬜"}</span>
            ${escapeHtml(c.label)}
          </li>
        `).join("")}
      </ul>`
    : `<div class="muted" style="margin-top:8px;">Aucune condition (débloqué par défaut).</div>`;

  return `
    <div class="level-row" style="padding:10px; border-radius: var(--radius-md); border: 1px solid var(--color-border-soft);">
      <div style="display:flex; justify-content:space-between; gap:12px;">
        <div style="min-width:0;">
          <div style="display:flex; gap:10px; align-items:center;">
            <span aria-hidden="true">${stateIcon}</span>
            <div style="font-weight: var(--font-weight-medium);">
              Niveau ${escapeHtml(String(level.level))} — ${escapeHtml(level.label || "")}
            </div>
          </div>
        </div>
        <div class="muted" style="white-space:nowrap; font-size:0.9rem;">
          ${Math.round((level.progressRatio || 0) * 100)}%
        </div>
      </div>
      ${checksHtml}
    </div>
  `;
}

function badge(icon, label) {
  return `<span class="badge"><span aria-hidden="true">${escapeHtml(icon)}</span> ${escapeHtml(label)}</span>`;
}

function legendRow(icon, title, text) {
  return `
    <div class="list-item">
      <div class="list-item__main">
        <div class="list-item__title">${escapeHtml(icon)} ${escapeHtml(title)}</div>
        <div class="list-item__meta">${escapeHtml(text)}</div>
      </div>
    </div>
  `;
}

/* =========================
   Domain selection state
   ========================= */

function setSelectedDomain(container, domId) {
  container.dataset.selectedDomain = domId || "all";
}

function getSelectedDomain(container) {
  return container.dataset.selectedDomain || "all";
}

/* =========================
   Misc
   ========================= */

function skeletonSkills() {
  const card = `
    <section class="card">
      <div class="card__title">Chargement…</div>
      <div class="card__subtitle">Préparation des compétences</div>
      <div class="progress" style="margin-top:12px;">
        <div class="progress__bar" style="width:38%"></div>
      </div>
    </section>
  `;
  return card.repeat(3);
}

function cssEscape(value) {
  if (window.CSS && CSS.escape) return CSS.escape(value);
  return String(value).replaceAll('"', '\\"');
}
