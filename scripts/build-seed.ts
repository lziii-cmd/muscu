/**
 * Construit les fichiers de seed depuis `PROGRAMME-COMPLET.md`.
 *
 *   npm run seed:build
 *
 * Produit :
 *   data/seed/programme.json  — données importées en base
 *   data/seed/REVUE.md        — même contenu, lisible, à relire avant import
 *
 * Le document Markdown se déclare source de vérité et remplace l'extraction
 * depuis les PDF. Les contrôles de cohérence restent : un seed faux est pire
 * qu'un seed absent, et une charge fausse ferait charger la mauvaise barre.
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { parseProgramme, CHECKPOINT_DATES, type ProgramDay } from "./lib/program-parser";
import type { Volume } from "./lib/volume";
import { weekdayOf } from "./lib/dates";

const YEAR = 2026;
const SOURCE = "PROGRAMME-COMPLET.md";

function fail(message: string): never {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

const parsed = parseProgramme(readFileSync(SOURCE, "utf8"), YEAR);

if (parsed.errors.length > 0) {
  parsed.errors.slice(0, 20).forEach((e) => console.error("  ERREUR :", e));
  fail(`${parsed.errors.length} erreur(s) d'analyse. Seed non écrit.`);
}

// ---------------------------------------------------------------------------
// Contrôles de cohérence
// ---------------------------------------------------------------------------
const problems: string[] = [];

for (const [name, part] of [
  ["salle", parsed.ppl],
  ["calisthénie", parsed.calisthenie],
] as const) {
  if (part.weeks.length !== 17) {
    problems.push(`${name} : ${part.weeks.length} semaines au lieu de 17`);
  }

  const seen = new Set<string>();
  for (const day of part.days) {
    if (weekdayOf(day.date) !== day.weekday) {
      problems.push(`${name} ${day.date} : annoncé ${day.weekday}, calculé ${weekdayOf(day.date)}`);
    }
    if (seen.has(day.date)) problems.push(`${name} : date en double ${day.date}`);
    seen.add(day.date);
  }

  for (const week of part.weeks) {
    if (week.instruction === "") problems.push(`${name} S${week.weekNumber} : consigne vide`);
  }
}

// Structure des 60 minutes : repos imposés par position, semaines 2 à 17.
const EXPECTED_REST: Record<string, number> = { "1": 150, "2": 120, "3": 90, "4a": 0, "4b": 75 };
for (const day of parsed.ppl.days) {
  if (day.weekNumber < 2 || day.isRestDay) continue;
  for (const session of day.sessions) {
    for (const exercise of session.exercises) {
      const expected = EXPECTED_REST[exercise.order];
      if (expected !== undefined && exercise.restSeconds !== expected) {
        problems.push(
          `salle ${day.date} #${exercise.order} : repos ${exercise.restSeconds}s au lieu de ${expected}s`,
        );
      }
      if (exercise.homeAlternative === "") {
        problems.push(`salle ${day.date} ${exercise.name} : alternative maison manquante`);
      }
    }
  }
}

/*
 * Le jeudi est la journée de volume : son décalage sur le max doit être plus
 * important que celui du lundi, sinon deux journées lourdes de tractions se
 * suivent dans la semaine. C'est précisément l'erreur qu'une normalisation
 * hâtive avait introduite dans la version précédente.
 */
const offsetsByWeekday = new Map<string, Set<number>>();
for (const day of parsed.calisthenie.days) {
  for (const session of day.sessions) {
    for (const exercise of session.exercises) {
      if (exercise.volume.maxOffset === null) continue;
      if (!offsetsByWeekday.has(day.weekday)) offsetsByWeekday.set(day.weekday, new Set());
      offsetsByWeekday.get(day.weekday)!.add(exercise.volume.maxOffset);
    }
  }
}
const mondayOffsets = offsetsByWeekday.get("Lundi");
const thursdayOffsets = offsetsByWeekday.get("Jeudi");
if (mondayOffsets && thursdayOffsets) {
  const monday = Math.min(...mondayOffsets);
  const thursday = Math.min(...thursdayOffsets);
  if (thursday <= monday) {
    problems.push(
      `calisthénie : jeudi prescrit à max-${thursday} et lundi à max-${monday} — le jeudi doit être plus léger`,
    );
  }
}

if (parsed.ladders.length < 5) problems.push(`${parsed.ladders.length} échelles seulement`);
if (parsed.targets.length < 5) problems.push(`${parsed.targets.length} objectifs seulement`);
if (parsed.testMetrics.length < 5) problems.push(`${parsed.testMetrics.length} métriques seulement`);

if (problems.length > 0) {
  problems.slice(0, 20).forEach((p) => console.error("  INCOHÉRENCE :", p));
  fail(`${problems.length} incohérence(s) détectée(s). Seed non écrit.`);
}

// ---------------------------------------------------------------------------
// Écriture
// ---------------------------------------------------------------------------
mkdirSync("data/seed", { recursive: true });

writeFileSync(
  "data/seed/programme.json",
  JSON.stringify(
    { generatedAt: new Date().toISOString(), year: YEAR, source: SOURCE, checkpointDates: CHECKPOINT_DATES, ...parsed },
    null,
    2,
  ),
  "utf8",
);

// ---------------------------------------------------------------------------
// Document de relecture
// ---------------------------------------------------------------------------
function volumeLabel(volume: Volume): string {
  if (volume.maxOffset !== null) return `${volume.sets} séries — reps = max − ${volume.maxOffset}`;
  if (volume.holdSecondsLow !== null) {
    const hold =
      volume.holdSecondsLow === volume.holdSecondsHigh
        ? `${volume.holdSecondsLow} s`
        : `${volume.holdSecondsLow}–${volume.holdSecondsHigh} s`;
    return `${volume.sets} × ${hold}`;
  }
  if (volume.sets === null) return volume.raw;
  const reps =
    volume.repsLow === volume.repsHigh ? `${volume.repsLow}` : `${volume.repsLow}–${volume.repsHigh}`;
  return `${volume.sets} × ${reps}${volume.perSide ? " / côté" : ""}`;
}

const out: string[] = [];

out.push("# Revue du programme importé");
out.push("");
out.push(`Généré le ${new Date().toISOString().slice(0, 10)} depuis \`${SOURCE}\`.`);
out.push("");
out.push("À relire avant `npm run db:seed`, en particulier les **charges** et les");
out.push("**alternatives maison**. Une valeur fausse ici te ferait charger la mauvaise barre.");
out.push("");

function writeDays(days: ProgramDay[], weekNumber: number, withHome: boolean) {
  for (const day of days.filter((d) => d.weekNumber === weekNumber)) {
    if (day.isRestDay) {
      out.push(`**${day.weekday} ${day.date}** — ${day.label}`);
      out.push("");
      continue;
    }
    out.push(`**${day.weekday} ${day.date} — ${day.label}**`);
    out.push("");

    for (const session of day.sessions) {
      if (!withHome) {
        out.push(`_${session.heading}_`);
        out.push("");
      }
      out.push(
        withHome
          ? "| # | Exercice | Séries × reps | Charge | Haltères | Repos | Alternative maison |"
          : "| Exercice | Volume | Repère | Repos |",
      );
      out.push(withHome ? "|---|---|---|---|---|---|---|" : "|---|---|---|---|");

      for (const e of session.exercises) {
        const rest = e.restSeconds === 0 ? "enchaîner" : e.restSeconds === null ? "—" : `${e.restSeconds} s`;
        out.push(
          withHome
            ? `| ${e.order} | ${e.name} | ${volumeLabel(e.volume)} | ${e.loadRaw || "—"} | ${e.dumbbellRaw || "—"} | ${rest} | ${e.homeAlternative || "—"} |`
            : `| ${e.name} | ${volumeLabel(e.volume)} | ${e.cue || "—"} | ${rest} |`,
        );
      }
      out.push("");
    }
  }
}

out.push("## Programme de salle");
out.push("");
for (const week of parsed.ppl.weeks) {
  out.push(`### Semaine ${week.weekNumber} — ${week.blockName}`);
  out.push(`_${week.startDate} → ${week.endDate}_`);
  if (week.instruction) out.push(`> ${week.instruction}`);
  out.push("");
  writeDays(parsed.ppl.days, week.weekNumber, true);
}

out.push("## Programme de calisthénie");
out.push("");
for (const week of parsed.calisthenie.weeks) {
  out.push(`### Semaine ${week.weekNumber} — ${week.blockName}`);
  out.push(`_${week.startDate} → ${week.endDate}_`);
  if (week.instruction) out.push(`> ${week.instruction}`);
  out.push("");
  writeDays(parsed.calisthenie.days, week.weekNumber, false);
}

out.push("## Échelles de progression");
out.push("");
for (const ladder of parsed.ladders) {
  out.push(`### ${ladder.name} — départ au niveau ${ladder.startLevel}`);
  out.push("");
  out.push("| Niv. | Mouvement | Critère |");
  out.push("|---|---|---|");
  for (const level of ladder.levels) {
    const mark = level.level === ladder.startLevel ? " ←" : "";
    out.push(`| ${level.level}${mark} | ${level.movement} | ${level.criterion} |`);
  }
  out.push("");
}

out.push("## Objectifs jalonnés");
out.push("");
out.push("| Mouvement | Départ | 19 sept | 17 oct | 14 nov | 19 déc |");
out.push("|---|---|---|---|---|---|");
for (const target of parsed.targets) {
  const cells = Object.values(target.byDate).map((value) =>
    value === null ? "—" : `${value}${target.unit === "seconds" ? " s" : ""}`,
  );
  out.push(`| ${target.movement} | ${target.startLabel} | ${cells.join(" | ")} |`);
}
out.push("");

out.push("## Métriques des 4 tests");
out.push("");
for (const metric of parsed.testMetrics) out.push(`- ${metric.label}`);
out.push("");

writeFileSync("data/seed/REVUE.md", out.join("\n"), "utf8");

// ---------------------------------------------------------------------------
const count = (part: typeof parsed.ppl) =>
  part.days.reduce((sum, day) => sum + day.sessions.reduce((s, x) => s + x.exercises.length, 0), 0);

console.log("✓ Seed écrit.");
console.log(`  Source       : ${SOURCE}`);
console.log(
  `  Salle        : ${parsed.ppl.weeks.length} semaines, ${parsed.ppl.days.length} jours, ${count(parsed.ppl)} lignes`,
);
console.log(
  `  Calisthénie  : ${parsed.calisthenie.weeks.length} semaines, ${parsed.calisthenie.days.length} jours, ${count(parsed.calisthenie)} lignes`,
);
console.log(
  `  Échelles     : ${parsed.ladders.length} (${parsed.ladders.reduce((n, l) => n + l.levels.length, 0)} niveaux)`,
);
console.log(`  Objectifs    : ${parsed.targets.length} · Métriques : ${parsed.testMetrics.length}`);
console.log(`  Max de départ : ${JSON.stringify(parsed.startingMax)}`);
console.log("\n  Relis data/seed/REVUE.md avant d'importer.");
