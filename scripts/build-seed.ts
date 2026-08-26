/**
 * Construit les fichiers de seed du programme à partir des extractions PDF.
 *
 *   npm run seed:build
 *
 * Produit :
 *   data/seed/programme.json  — données importées en base
 *   data/seed/REVUE.md        — même contenu, lisible, à relire avant import
 *
 * Le fichier de revue existe parce que l'extraction d'un PDF n'est jamais sûre
 * à 100 % : une charge fausse ferait charger la mauvaise barre. Il doit être
 * relu avant `npm run db:seed`.
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { parsePpl } from "./lib/ppl-parser";
import { parseCalisthenie } from "./lib/cali-parser";
import { parseLadders, parseTargets, parseTestMetrics } from "./lib/cali-reference";
import { weekdayOf } from "./lib/dates";

const YEAR = 2026;

function fail(message: string): never {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

const ppl = parsePpl(readFileSync("data/raw/ppl.txt", "utf8"), YEAR);
const cali = parseCalisthenie(readFileSync("data/raw/calisthenie.txt", "utf8"), YEAR);

if (ppl.errors.length > 0) {
  ppl.errors.forEach((e) => console.error("  ERREUR PPL :", e));
  fail("Extraction du programme de salle en échec.");
}
if (cali.errors.length > 0) {
  cali.errors.forEach((e) => console.error("  ERREUR CALI :", e));
  fail("Extraction du programme de calisthénie en échec.");
}

// Le mode `-table` rend la semaine 1 lisible comme les autres : il n'y a plus
// de transcription manuelle à maintenir.
const pplWeeks = [...ppl.weeks].sort((a, b) => a.weekNumber - b.weekNumber);
const pplDays = [...ppl.days].sort((a, b) => a.date.localeCompare(b.date));

const caliRaw = readFileSync("data/raw/calisthenie.txt", "utf8");
const { ladders, errors: ladderErrors } = parseLadders(caliRaw);
const testMetrics = parseTestMetrics(caliRaw);
const { targets, errors: targetErrors } = parseTargets(caliRaw);

for (const message of [...ladderErrors, ...targetErrors]) {
  console.error("  ERREUR RÉFÉRENTIEL :", message);
}
if (ladderErrors.length > 0 || targetErrors.length > 0) {
  fail("Extraction du référentiel de calisthénie en échec.");
}

// ---------------------------------------------------------------------------
// Contrôles de cohérence — un seed faux est pire qu'un seed absent.
// ---------------------------------------------------------------------------
const problems: string[] = [];

for (const day of pplDays) {
  if (weekdayOf(day.date) !== day.weekday) {
    problems.push(`PPL ${day.date} : annoncé ${day.weekday}, calculé ${weekdayOf(day.date)}`);
  }
}
for (const day of cali.days) {
  if (weekdayOf(day.date) !== day.weekday) {
    problems.push(`CALI ${day.date} : annoncé ${day.weekday}, calculé ${weekdayOf(day.date)}`);
  }
}

const pplDates = new Set<string>();
for (const day of pplDays) {
  if (pplDates.has(day.date)) problems.push(`PPL : date en double ${day.date}`);
  pplDates.add(day.date);
}

if (pplWeeks.length !== 17) problems.push(`PPL : ${pplWeeks.length} semaines au lieu de 17`);
if (cali.weeks.length !== 17) problems.push(`CALI : ${cali.weeks.length} semaines au lieu de 17`);

// Le document impose ces temps de repos par position dans la séance.
const EXPECTED_REST: Record<string, number> = { "1": 150, "2": 120, "3": 90, "4a": 0, "4b": 75 };
for (const day of pplDays) {
  if (day.weekNumber === 1) continue; // la semaine de réadaptation a ses propres repos
  for (const exercise of day.exercises) {
    const expected = EXPECTED_REST[exercise.order];
    if (expected !== undefined && exercise.restSeconds !== expected) {
      problems.push(
        `PPL ${day.date} #${exercise.order} : repos ${exercise.restSeconds}s au lieu de ${expected}s`,
      );
    }
  }
}

// L'alternative maison doit être présente partout où le document la fournit
// (semaines 2 à 17) : c'est elle qui permet de déplacer une séance.
for (const day of pplDays) {
  if (day.weekNumber < 2 || day.isRestDay) continue;
  for (const exercise of day.exercises) {
    if (exercise.homeAlternative === "") {
      problems.push(`PPL ${day.date} ${exercise.name} : alternative maison manquante`);
    }
  }
}

if (ladders.length < 5) problems.push(`Seulement ${ladders.length} échelles extraites`);
if (targets.length < 5) problems.push(`Seulement ${targets.length} objectifs extraits`);

if (problems.length > 0) {
  problems.slice(0, 20).forEach((p) => console.error("  INCOHÉRENCE :", p));
  fail(`${problems.length} incohérence(s) détectée(s). Seed non écrit.`);
}

// ---------------------------------------------------------------------------
// Écriture
// ---------------------------------------------------------------------------
mkdirSync("data/seed", { recursive: true });

const seed = {
  generatedAt: new Date().toISOString(),
  year: YEAR,
  source: {
    ppl: "1-musculation-ppl-soir (1).pdf",
    calisthenie: "2-calisthenie (1).pdf",
    extraction: "pdftotext -table",
  },
  ppl: { weeks: pplWeeks, days: pplDays },
  calisthenie: { weeks: cali.weeks, days: cali.days },
  ladders,
  testMetrics,
  targets,
};

writeFileSync("data/seed/programme.json", JSON.stringify(seed, null, 2), "utf8");

// ---------------------------------------------------------------------------
// Document de relecture
// ---------------------------------------------------------------------------
const lines: string[] = [];
lines.push("# Revue du programme extrait des PDF");
lines.push("");
lines.push(`Généré le ${new Date().toISOString().slice(0, 10)} · à relire avant \`npm run db:seed\`.`);
lines.push("");
lines.push(
  "Ce document est la contrepartie lisible de `programme.json`. Vérifie surtout les **charges** :",
);
lines.push("une valeur fausse ici te ferait charger la mauvaise barre pendant quatre mois.");
lines.push("");
lines.push("Extraction : `pdftotext -table`, les 17 semaines des deux programmes.");
lines.push("");

lines.push("## Programme de salle -- PPL");
lines.push("");
for (const week of pplWeeks) {
  const days = pplDays.filter((d) => d.weekNumber === week.weekNumber);
  lines.push(`### Semaine ${week.weekNumber} — ${week.blockName}`);
  if (week.startDate) lines.push(`_${week.startDate} → ${week.endDate}_`);
  if (week.instruction) lines.push(`> ${week.instruction}`);
  lines.push("");
  for (const day of days) {
    if (day.isRestDay) {
      lines.push(`**${day.weekday} ${day.date}** — repos`);
      lines.push("");
      continue;
    }
    lines.push(`**${day.weekday} ${day.date} — ${day.sessionType}**`);
    lines.push("");
    lines.push("| # | Exercice | Séries × reps | Charge | Haltères | Repos | Alternative maison |");
    lines.push("|---|---|---|---|---|---|---|");
    for (const e of day.exercises) {
      const reps =
        e.sets === null
          ? e.repsRaw
          : `${e.sets} × ${e.repsLow === e.repsHigh ? e.repsLow : `${e.repsLow}-${e.repsHigh}`}${e.perSide ? " / côté" : ""}`;
      const rest = e.restSeconds === 0 ? "enchaîner" : `${e.restSeconds} s`;
      lines.push(
        `| ${e.order} | ${e.name} | ${reps} | ${e.loadRaw || "--"} | ${e.dumbbellRaw || "--"} | ${rest} | ${e.homeAlternative || "--"} |`,
      );
    }
    lines.push("");
  }
}

lines.push("## Programme de calisthénie");
lines.push("");
for (const week of cali.weeks) {
  const days = cali.days.filter((d) => d.weekNumber === week.weekNumber);
  lines.push(`### Semaine ${week.weekNumber} — ${week.blockName}`);
  if (week.startDate) lines.push(`_${week.startDate} → ${week.endDate}_`);
  if (week.instruction) lines.push(`> ${week.instruction}`);
  lines.push("");
  for (const day of days) {
    if (day.isRestDay) {
      lines.push(`**${day.weekday} ${day.date}** — ${day.theme}`);
      lines.push("");
      continue;
    }
    lines.push(`**${day.weekday} ${day.date} — ${day.theme}**`);
    lines.push("");
    if (day.blocks.length === 0) {
      lines.push("_Journée de test — pas de bloc matin/soir._");
      lines.push("");
      continue;
    }
    for (const block of day.blocks) {
      lines.push(`_${block.slot === "matin" ? "Matin" : "Soir"}_`);
      lines.push("");
      lines.push("| Exercice | Volume | Repère | Repos |");
      lines.push("|---|---|---|---|");
      for (const e of block.exercises) {
        const volume = e.repsFromMaxRule
          ? `${e.sets} séries — reps = max − 1`
          : e.holdSeconds !== null
            ? `${e.sets} × ${e.holdSeconds} s`
            : e.sets !== null
              ? `${e.sets} × ${e.repsLow === e.repsHigh ? e.repsLow : `${e.repsLow}-${e.repsHigh}`}${e.perSide ? " / côté" : ""}`
              : e.repsRaw;
        lines.push(
          `| ${e.name} | ${volume} | ${e.cueRaw || "--"} | ${e.restSeconds === null ? "--" : `${e.restSeconds} s`} |`,
        );
      }
      lines.push("");
    }
  }
}

writeFileSync("data/seed/REVUE.md", lines.join("\n"), "utf8");

// ---------------------------------------------------------------------------
const pplExercises = pplDays.reduce((sum, d) => sum + d.exercises.length, 0);
const caliExercises = cali.days.reduce(
  (sum, d) => sum + d.blocks.reduce((s, b) => s + b.exercises.length, 0),
  0,
);

console.log("✓ Seed écrit.");
console.log(`  Échelles     : ${ladders.length} (${ladders.reduce((n, l) => n + l.levels.length, 0)} niveaux)`);
console.log(`  Tests        : ${testMetrics.length} métriques`);
console.log(`  Objectifs    : ${targets.length} mouvements`);
console.log(`  Salle        : ${pplWeeks.length} semaines, ${pplDays.length} jours, ${pplExercises} lignes`);
console.log(`  Calisthénie  : ${cali.weeks.length} semaines, ${cali.days.length} jours, ${caliExercises} lignes`);
if (cali.warnings.length > 0) {
  console.log(`  ${cali.warnings.length} avertissement(s) calisthénie (champ « repère » laissé vide) :`);
  cali.warnings.slice(0, 5).forEach((w) => console.log(`    - ${w}`));
}
console.log("\n  Relis data/seed/REVUE.md avant d'importer.");
