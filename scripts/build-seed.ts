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
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolveGuides } from "./lib/resolve-guides";
import {
  parseCalisthenicsDocument,
  parseProgramme,
  CHECKPOINT_DATES,
  type ProgramDay,
} from "./lib/program-parser";
import type { Volume } from "./lib/volume";
import { weekdayOf } from "./lib/dates";

const YEAR = 2026;
const SOURCE = "PROGRAMME-COMPLET.md";
/** Programme de calisthénie autonome, s'il existe (version 2 : séance unique). */
const CALISTHENICS_SOURCE = "PROGRAMME-CALISTHENIE.md";

function fail(message: string): never {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

const parsed = parseProgramme(readFileSync(SOURCE, "utf8"), YEAR);

/*
 * La calisthénie peut vivre dans son propre document. Il complète alors le
 * programme de salle : sa partie, ses objectifs aux jalons, ses mesures de
 * test, son point de départ et ses jours de test. Les échelles de progression
 * n'y existent plus ; on ne les exige donc que du format en deux parties.
 */
const standaloneCalisthenics = parsed.calisthenie.weeks.length === 0 && existsSync(CALISTHENICS_SOURCE);
if (standaloneCalisthenics) {
  const cali = parseCalisthenicsDocument(readFileSync(CALISTHENICS_SOURCE, "utf8"), YEAR);
  parsed.calisthenie = cali.calisthenie;
  parsed.targets = cali.targets;
  parsed.testMetrics = cali.testMetrics;
  parsed.startingMax = cali.startingMax;
  parsed.checkpoints = [...new Set([...parsed.checkpoints, ...cali.checkpoints])].sort();
  parsed.errors.push(...cali.errors);
}

if (parsed.errors.length > 0) {
  parsed.errors.slice(0, 20).forEach((e) => console.error("  ERREUR :", e));
  fail(`${parsed.errors.length} erreur(s) d'analyse. Seed non écrit.`);
}

// ---------------------------------------------------------------------------
// Contrôles de cohérence
// ---------------------------------------------------------------------------
const problems: string[] = [];

/**
 * La calisthénie est facultative : un document peut n'être que de la
 * musculation. Elle l'était pour le premier programme, elle ne l'est plus pour
 * le troisième — d'où l'absence de contrôle qui l'exigerait.
 */
const hasCalisthenics = parsed.calisthenie.weeks.length > 0;

for (const [name, part] of [
  ["salle", parsed.ppl],
  ...(hasCalisthenics ? ([["calisthénie", parsed.calisthenie]] as const) : []),
] as const) {
  if (part.weeks.length === 0) {
    problems.push(`${name} : aucune semaine`);
  }

  // Les semaines doivent se suivre : un trou signale une semaine non reconnue,
  // et le programme afficherait un vide là où il devrait prescrire.
  const numbers = part.weeks.map((w) => w.weekNumber);
  for (let i = 1; i < numbers.length; i++) {
    if (numbers[i] !== numbers[i - 1] + 1) {
      problems.push(`${name} : saut de semaine, S${numbers[i - 1]} puis S${numbers[i]}`);
    }
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

/*
 * Structure de la séance, énoncée par le document lui-même : « compounds 2 à
 * 2 min 30 · isolation 45 s à 1 min · superset (a → b) enchaîné sans repos ».
 *
 * Le contrôle porte sur cette règle et non sur un barème par numéro de ligne :
 * un barème positionnel était juste pour un programme et faux pour le suivant,
 * exactement le travers que ce projet paie à chaque nouveau document. Ce qui
 * reste vérifié, c'est qu'un repos existe, qu'il tient dans une séance d'une
 * heure, et que le premier membre d'un superset s'enchaîne bien sans pause.
 */
const COMPOUND_REST_MIN = 120;
const ISOLATION_REST_MAX = 90;
for (const day of parsed.ppl.days) {
  if (day.isRestDay) continue;
  for (const session of day.sessions) {
    for (const exercise of session.exercises) {
      const where = `salle ${day.date} #${exercise.order} ${exercise.name}`;
      const rest = exercise.restSeconds;

      if (rest === null) {
        problems.push(`${where} : repos illisible « ${exercise.restRaw} »`);
      } else if (/^\d+a$/.test(exercise.order)) {
        // Premier membre d'un superset : il s'enchaîne, le repos vient après b.
        if (rest !== 0) problems.push(`${where} : superset, repos ${rest}s au lieu de 0`);
      } else if (exercise.order === "1" || exercise.order === "2") {
        if (rest < COMPOUND_REST_MIN) {
          problems.push(`${where} : compound à ${rest}s, moins de ${COMPOUND_REST_MIN}s`);
        }
      } else if (rest === 0 || rest > ISOLATION_REST_MAX) {
        problems.push(`${where} : repos ${rest}s hors de 1–${ISOLATION_REST_MAX}s`);
      }

      if (exercise.homeAlternative === "") {
        problems.push(`${where} : alternative maison manquante`);
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

// Échelles, objectifs et métriques appartiennent à la calisthénie : les exiger
// d'un document qui n'en contient pas refuserait un programme pourtant valide.
if (hasCalisthenics && standaloneCalisthenics) {
  if (parsed.targets.length === 0) problems.push("calisthénie : aucun objectif aux jalons");
  if (parsed.testMetrics.length === 0) problems.push("calisthénie : aucune mesure de test");
  if (Object.keys(parsed.startingMax).length === 0) problems.push("calisthénie : point de départ introuvable");
} else if (hasCalisthenics) {
  if (parsed.ladders.length < 5) problems.push(`${parsed.ladders.length} échelles seulement`);
  if (parsed.targets.length < 5) problems.push(`${parsed.targets.length} objectifs seulement`);
  if (parsed.testMetrics.length < 5) problems.push(`${parsed.testMetrics.length} métriques seulement`);
}

if (problems.length > 0) {
  problems.slice(0, 20).forEach((p) => console.error("  INCOHÉRENCE :", p));
  fail(`${problems.length} incohérence(s) détectée(s). Seed non écrit.`);
}

/*
 * Cellules qui empilent deux prescriptions : « 3 × 20 / 3 × 45 s » décrit des
 * hollow rocks *et* une planche. Le volume n'ayant qu'un jeu de colonnes, la
 * seconde est retenue et la première disparaît — silencieusement, avec une
 * valeur qui reste plausible. Non bloquant : le document a le droit de grouper
 * deux mouvements sur une ligne. Mais il faut le voir, pas le découvrir en
 * salle.
 */
const composite = new Map<string, { raw: string; count: number }>();
for (const day of parsed.ppl.days) {
  for (const session of day.sessions) {
    for (const exercise of session.exercises) {
      if (!/\d\s*[×x]\s*\d[^/]*\/\s*\d\s*[×x]/.test(exercise.volume.raw)) continue;
      const entry = composite.get(exercise.name);
      if (entry) entry.count += 1;
      else composite.set(exercise.name, { raw: exercise.volume.raw, count: 1 });
    }
  }
}
if (composite.size > 0) {
  console.warn(`\n⚠ ${composite.size} exercice(s) portent deux prescriptions dans une seule cellule.`);
  console.warn("  Seule la seconde est enregistrée. À scinder en deux lignes si les deux comptent :");
  for (const [name, { raw, count }] of composite) {
    console.warn(`   · ${name} — « ${raw} » (${count} occurrences)`);
  }
  console.warn("");
}

// ---------------------------------------------------------------------------
// Écriture
// ---------------------------------------------------------------------------
mkdirSync("data/seed", { recursive: true });

// Bornes réelles du programme, lues depuis les jours — pas depuis une constante.
const allDates = [...parsed.ppl.days, ...parsed.calisthenie.days].map((day) => day.date).sort();
const programStart = allDates[0] ?? "";
const programEnd = allDates[allDates.length - 1] ?? "";

/*
 * Fiches d'exécution : une par exercice du programme. Le document du compte
 * l'emporte sur le fonds commun, et l'absence d'une fiche est bloquante — une
 * page « comment faire » avec des trous ne remplit pas son office.
 */
const exerciseNames = [
  ...new Set(
    [...parsed.ppl.days, ...parsed.calisthenie.days]
      .flatMap((day) => day.sessions)
      .flatMap((session) => session.exercises)
      .map((exercise) => exercise.name.replace(/\s+/g, " ").trim()),
  ),
];
const { guides, missing: missingGuides } = resolveGuides(exerciseNames, {
  own: { path: SOURCE, heading: "## Comment faire chaque exercice" },
});
if (missingGuides.length > 0) {
  console.error("✗ Seed NON écrit — exercices sans fiche d'exécution :");
  for (const name of missingGuides) console.error(`   · ${name}`);
  process.exit(1);
}

writeFileSync(
  "data/seed/programme.json",
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      year: YEAR,
      source: standaloneCalisthenics ? `${SOURCE} + ${CALISTHENICS_SOURCE}` : SOURCE,
      /*
       * Les contrôles physiques ne valent que s'ils tombent pendant le
       * programme. Les émettre tels quels daterait de septembre 2026 des
       * contrôles pour un programme qui court jusqu'en janvier 2027.
       */
      checkpointDates:
        parsed.checkpoints.length > 0
          ? parsed.checkpoints
          : CHECKPOINT_DATES.filter((date) => date >= programStart && date <= programEnd),
      /*
       * Les programmes sont listés plutôt que nommés en dur : chaque personne
       * n'a pas le même découpage. Nourah en a un seul, à domicile ; le
       * document d'Abdou en a deux, musculation et calisthénie.
       */
      programs: [
        {
          code: "ppl",
          name: "Musculation PPL -- Soir",
          defaultSlot: "salle",
          weeks: parsed.ppl.weeks,
          days: parsed.ppl.days,
        },
        // Un programme vide n'est pas un programme : l'omettre fait disparaître
        // l'onglet, là où un onglet vide se lirait comme une panne.
        ...(hasCalisthenics
          ? [
              {
                code: "calisthenie",
                name: "Calisthénie",
                defaultSlot: "matin",
                weeks: parsed.calisthenie.weeks,
                days: parsed.calisthenie.days,
              },
            ]
          : []),
      ],
      guides,
      ladders: parsed.ladders,
      targets: parsed.targets,
      testMetrics: parsed.testMetrics,
      startingMax: parsed.startingMax,
    },
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
          ? "| # | Exercice | Bloc | Séries × reps | Charge | Haltères | Repos | Alternative maison |"
          : "| Exercice | Bloc | Volume | Repère | Repos |",
      );
      out.push(withHome ? "|---|---|---|---|---|---|---|---|" : "|---|---|---|---|---|");

      for (const e of session.exercises) {
        const rest = e.restSeconds === 0 ? "enchaîner" : e.restSeconds === null ? "—" : `${e.restSeconds} s`;
        const tier = e.optional ? "complément" : "noyau";
        out.push(
          withHome
            ? `| ${e.order} | ${e.name} | ${tier} | ${volumeLabel(e.volume)} | ${e.loadRaw || "—"} | ${e.dumbbellRaw || "—"} | ${rest} | ${e.homeAlternative || "—"} |`
            : `| ${e.name} | ${tier} | ${volumeLabel(e.volume)} | ${e.cue || "—"} | ${rest} |`,
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

if (hasCalisthenics) {
  out.push("## Programme de calisthénie");
  out.push("");
  for (const week of parsed.calisthenie.weeks) {
    out.push(`### Semaine ${week.weekNumber} — ${week.blockName}`);
    out.push(`_${week.startDate} → ${week.endDate}_`);
    if (week.instruction) out.push(`> ${week.instruction}`);
    out.push("");
    writeDays(parsed.calisthenie.days, week.weekNumber, false);
  }
}

if (parsed.ladders.length > 0) out.push("## Échelles de progression");
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

if (parsed.targets.length > 0) {
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
}

if (parsed.testMetrics.length > 0) {
  out.push("## Métriques des 4 tests");
  out.push("");
  for (const metric of parsed.testMetrics) out.push(`- ${metric.label}`);
  out.push("");
}

writeFileSync("data/seed/REVUE.md", out.join("\n"), "utf8");

// ---------------------------------------------------------------------------
const count = (part: typeof parsed.ppl) =>
  part.days.reduce((sum, day) => sum + day.sessions.reduce((s, x) => s + x.exercises.length, 0), 0);

console.log("✓ Seed écrit.");
console.log(`  Source       : ${SOURCE}${standaloneCalisthenics ? ` + ${CALISTHENICS_SOURCE}` : ""}`);
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
console.log(
  `  Contrôles    : ${parsed.checkpoints.length > 0 ? parsed.checkpoints.join(", ") : "(repli sur les dates par défaut)"}`,
);
console.log("\n  Relis data/seed/REVUE.md avant d'importer.");
