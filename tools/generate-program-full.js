// tools/generate-program-full.js
// Usage: node tools/generate-program-full.js data/program.v1.json data/program.v2.full.json

import fs from "node:fs";

function parseHours(str) {
  // "4h" => 4 ; "8–10h" => {min:8,max:10} (on garde une moyenne)
  const s = String(str || "").replace(/\s/g, "");
  const m = s.match(/^(\d+)(?:h)?$/i);
  if (m) return { min: Number(m[1]), opti: Number(m[1]) };

  const r = s.match(/^(\d+)[–-](\d+)h$/i);
  if (r) return { min: Number(r[1]), opti: Math.round((Number(r[1]) + Number(r[2])) / 2) };

  // fallback
  return { min: 4, opti: 8 };
}

function itemToTodo(item, id) {
  // On estime minutes selon longueur : simple heuristique
  const text = String(item || "").trim();
  const len = text.length;
  const minutes = len < 25 ? 10 : len < 60 ? 20 : len < 120 ? 30 : 40;

  return {
    id,
    title: text,
    minutes,
    notes: ""
  };
}

function listToTodos(list, prefix) {
  const arr = Array.isArray(list) ? list : [];
  return arr
    .filter(Boolean)
    .map((x, i) => itemToTodo(x, `${prefix}_${String(i + 1).padStart(2, "0")}`));
}

function compactWeekToFull(w) {
  const n = Number(w.n);
  const weekId = `week_${String(n).padStart(2, "0")}`;

  const hrs = parseHours(w.min);
  const opt = parseHours(w.opti);

  return {
    id: weekId,
    weekNumber: n,
    title: w.t || "",
    mainGoal: w.obj || "",
    secondaryGoals: Array.isArray(w.sec) ? w.sec : [],
    time: { minHours: hrs.min, optiHours: opt.opti },

    // mapping compact -> groups
    todos: {
      coding: listToTodos(w.c, `w${String(n).padStart(2, "0")}_c`),
      figma: listToTodos(w.f, `w${String(n).padStart(2, "0")}_f`),
      project: listToTodos(w.pr, `w${String(n).padStart(2, "0")}_p`),
      pedagogy: listToTodos(w.ped, `w${String(n).padStart(2, "0")}_d`),

      // bonus auto (toujours utile)
      review: [
        {
          id: `w${String(n).padStart(2, "0")}_r_01`,
          title: "Récap de fin de semaine (5 points + 1 difficulté + 1 victoire)",
          minutes: 15,
          notes: "Écrire dans le journal."
        }
      ]
    }
  };
}

// -------- main
const [,, inFile, outFile] = process.argv;
if (!inFile || !outFile) {
  console.error("Usage: node tools/generate-program-full.js input.json output.json");
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(inFile, "utf-8"));

const full = {
  schema: "bluestorm.program.v2.full",
  weeks: (raw.weeks || []).map(compactWeekToFull),
  blocks: raw.blocks || []
};

fs.writeFileSync(outFile, JSON.stringify(full, null, 2), "utf-8");
console.log("OK ->", outFile);
