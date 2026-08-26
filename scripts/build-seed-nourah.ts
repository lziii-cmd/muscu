/**
 * Construit le seed du programme de Nourah depuis `PROGRAMME-NOURAH.md`.
 *
 *   npm run nourah:seed
 *
 * Produit `data/seed/nourah.json`, importé ensuite par
 * `npm run db:seed -- --user nourah --seed data/seed/nourah.json`, et
 * `data/seed/REVUE-NOURAH.md`, qui dit la même chose en lisible — c'est ce
 * document-là qu'on relit avant d'importer.
 *
 * Le script REFUSE d'écrire si un contrôle de cohérence échoue. Une donnée
 * fausse mais plausible ne se voit pas à la relecture ; un invariant, si.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { column, readTable } from "./lib/markdown";
import { parseVolume, parseRest, parseKg } from "./lib/volume";
import { parseFrenchDate } from "./lib/dates";

const SOURCE = "PROGRAMME-NOURAH.md";
const YEAR = 2026;

/** Contrôles physiques : samedis annoncés dans le document « Objectifs ». */
const CHECKPOINT_DATES = ["2026-09-26", "2026-10-31", "2026-12-12", "2026-12-26"];

const WEEKDAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const WEEK_HEADING = /^###\s+Semaine\s+(\d{1,2})\s*·\s*(.+?)\s*—\s*(.+)$/;
const DAY_HEADING = new RegExp(
  `^####\\s+(${WEEKDAYS.join("|")})\\s+(\\d{1,2})\\s+([a-zûéèôîà]+)\\s*—\\s*(.+)$`,
);

interface Line {
  order: string;
  name: string;
  volumeRaw: string;
  loadRaw: string;
  restRaw: string;
}

interface Day {
  weekNumber: number;
  date: string;
  weekday: string;
  label: string;
  isRestDay: boolean;
  isTestDay: boolean;
  lines: Line[];
}

interface Week {
  weekNumber: number;
  blockName: string;
  startDate: string | null;
  endDate: string | null;
  instruction: string;
}

const problems: string[] = [];
const warnings: string[] = [];

function parse(raw: string) {
  const lines = raw.split("\n");
  const weeks: Week[] = [];
  const days: Day[] = [];

  let weekNumber = 0;
  let pendingInstruction = "";

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    const weekMatch = line.match(WEEK_HEADING);
    if (weekMatch) {
      weekNumber = Number(weekMatch[1]);
      const range = weekMatch[2];
      const blockName = weekMatch[3].trim();

      // « 26 août – 30 août » : les deux bornes portent leur mois.
      const [from, to] = range.split(/\s*[–-]\s*/);
      weeks.push({
        weekNumber,
        blockName,
        startDate: parseFrenchDate(from ?? "", YEAR),
        endDate: parseFrenchDate(to ?? "", YEAR),
        instruction: "",
      });
      pendingInstruction = "";
      continue;
    }

    if (line.startsWith("**Consigne :**")) {
      pendingInstruction = line.replace("**Consigne :**", "").trim();
      const week = weeks.at(-1);
      if (week) week.instruction = pendingInstruction;
      continue;
    }

    const dayMatch = line.match(DAY_HEADING);
    if (!dayMatch) continue;

    const date = parseFrenchDate(`${dayMatch[2]} ${dayMatch[3]}`, YEAR);
    const label = dayMatch[4].trim();
    if (!date) {
      problems.push(`date illisible : « ${line} »`);
      continue;
    }

    const isRestDay = /^REPOS\b/i.test(label);
    const table = readTable(lines, i + 1);

    const parsedLines: Line[] = [];
    if (table) {
      for (const row of table.rows) {
        const name = column(table, row, "Exercice");
        if (name === "") continue;
        parsedLines.push({
          order: column(table, row, "#"),
          name,
          volumeRaw: column(table, row, "Séries"),
          loadRaw: column(table, row, "Charge"),
          restRaw: column(table, row, "Repos"),
        });
      }
    }

    days.push({
      weekNumber,
      date,
      weekday: dayMatch[1],
      label,
      isRestDay,
      // La semaine 18 est annoncée « Semaine de test » : ses séances servent à
      // mesurer, pas à progresser.
      isTestDay: weekNumber === 18,
      lines: parsedLines,
    });
  }

  return { weeks, days };
}

/** Traduit les lignes lues en la forme attendue par le seed. */
function toProgramDays(days: Day[]) {
  return days.map((day) => ({
    weekNumber: day.weekNumber,
    date: day.date,
    weekday: day.weekday,
    label: day.label,
    isRestDay: day.isRestDay,
    isTestDay: day.isTestDay,
    sessions: day.lines.length === 0
      ? []
      : [
          {
            // Une seule séance par jour, toujours à 22h, toujours à la maison.
            slot: "soir" as const,
            heading: day.label,
            exercises: day.lines.map((line) => {
              const volume = parseVolume(line.volumeRaw);
              const rest = parseRest(line.restRaw);
              const kg = parseKg(line.loadRaw);
              /*
               * « 2 × 8 kg » désigne une paire d'haltères, huit kilos dans
               * chaque main. « Haltère 8 kg » en désigne un seul, tenu à deux
               * mains. Confondre les deux doublerait ou diviserait la charge
               * réelle sans que rien ne le signale.
               */
              const perSide = /^\s*2\s*[×x]/.test(line.loadRaw);
              return {
                order: line.order,
                name: line.name,
                volume,
                loadRaw: perSide ? "" : line.loadRaw,
                loadKg: perSide ? null : kg,
                dumbbellRaw: perSide ? line.loadRaw : "",
                dumbbellKg: perSide ? kg : null,
                restSeconds: rest,
                restRaw: line.restRaw,
                supersetGroup: null,
                // Le programme est déjà à domicile : il n'y a pas d'alternative
                // maison à prévoir, c'est la séance elle-même.
                homeAlternative: "",
                cue: "",
              };
            }),
          },
        ],
  }));
}

/**
 * Objectifs chiffrés du document « Objectifs », section « Force ».
 *
 * Transcrits ici plutôt que parsés : le tableau source mélange charges et
 * répétitions dans une même cellule (« 2 × 8 kg × 12 »), et un parseur y
 * gagnerait surtout des occasions de se tromper. Ils tiennent en sept lignes.
 */
const TARGETS = [
  { slug: "hip-thrust", movement: "Hip thrust", startLabel: "Poids du corps", value: 10 },
  { slug: "squat-bulgare", movement: "Squat bulgare", startLabel: "Poids du corps", value: 12 },
  { slug: "souleve-terre-roumain", movement: "Soulevé de terre roumain", startLabel: "Poids du corps", value: 10 },
  { slug: "goblet-squat", movement: "Goblet squat", startLabel: "Bouteille 1,5 L", value: 12 },
  { slug: "rowing-halteres", movement: "Rowing haltères", startLabel: "2 × 1,5 L", value: 12 },
  { slug: "pompes", movement: "Pompes au sol", startLabel: "0", value: 8 },
] as const;

const HOLD_TARGETS = [
  { slug: "planche", movement: "Planche", startLabel: "20 s", value: 60 },
] as const;

/** Ce qu'on relève aux quatre contrôles. */
const TEST_METRICS = [
  { slug: "poids", label: "Poids", unit: "reps" as const },
  { slug: "tour-hanches", label: "Tour de hanches", unit: "reps" as const },
  { slug: "tour-cuisses", label: "Tour de cuisses", unit: "reps" as const },
  { slug: "tour-bras", label: "Tour de bras", unit: "reps" as const },
  { slug: "tour-taille", label: "Tour de taille", unit: "reps" as const },
  { slug: "hip-thrust-charge", label: "Hip thrust — charge", unit: "reps" as const },
  { slug: "squat-bulgare-charge", label: "Squat bulgare — charge", unit: "reps" as const },
  { slug: "planche-secondes", label: "Planche", unit: "seconds" as const },
  { slug: "pompes-max", label: "Pompes (max)", unit: "reps" as const },
];

function main() {
  const raw = readFileSync(SOURCE, "utf8");
  const { weeks, days } = parse(raw);

  // ---------------------------------------------------------------------------
  // Contrôles de cohérence. Bloquants : mieux vaut ne rien écrire qu'écrire faux.
  // ---------------------------------------------------------------------------
  if (weeks.length !== 18) problems.push(`18 semaines attendues, ${weeks.length} lues`);

  const dates = new Set<string>();
  for (const day of days) {
    if (dates.has(day.date)) problems.push(`date en double : ${day.date}`);
    dates.add(day.date);
  }

  for (const week of weeks) {
    if (!week.startDate || !week.endDate) {
      problems.push(`semaine ${week.weekNumber} : dates illisibles`);
      continue;
    }
    if (week.startDate > week.endDate) {
      problems.push(`semaine ${week.weekNumber} : ${week.startDate} après ${week.endDate}`);
    }
    if (week.instruction === "") warnings.push(`semaine ${week.weekNumber} : consigne absente`);
  }

  for (const day of days) {
    if (day.isRestDay) {
      if (day.lines.length > 0) {
        problems.push(`${day.date} : jour de repos avec ${day.lines.length} exercices`);
      }
      continue;
    }
    if (day.lines.length === 0) {
      problems.push(`${day.date} (${day.label}) : aucune ligne d'exercice`);
    }
    for (const line of day.lines) {
      const volume = parseVolume(line.volumeRaw);
      if (volume.sets === null && volume.holdSecondsLow === null && !/tour/i.test(line.volumeRaw)) {
        problems.push(`${day.date} · ${line.name} : volume illisible « ${line.volumeRaw} »`);
      }
    }
  }

  // Le repos du dimanche est une règle du document : s'il saute, c'est un
  // décalage de dates, pas une variante.
  const sundaysWorked = days.filter((day) => day.weekday === "Dimanche" && !day.isRestDay);
  if (sundaysWorked.length > 0) {
    problems.push(`dimanche(s) non marqué(s) en repos : ${sundaysWorked.map((d) => d.date).join(", ")}`);
  }

  // Trois séances de musculation par semaine, sauf la première (elle démarre un
  // mercredi) — c'est l'ossature du programme.
  for (const week of weeks) {
    const strength = days.filter(
      (day) => day.weekNumber === week.weekNumber && /^MUSCULATION/.test(day.label),
    ).length;
    const expected = week.weekNumber === 1 ? 2 : 3;
    if (strength !== expected) {
      problems.push(
        `semaine ${week.weekNumber} : ${strength} séances de musculation au lieu de ${expected}`,
      );
    }
  }

  if (problems.length > 0) {
    console.error("✗ Seed NON écrit — contrôles de cohérence en échec :");
    for (const problem of problems) console.error(`   · ${problem}`);
    process.exit(1);
  }

  const programDays = toProgramDays(days);
  const lastDay = CHECKPOINT_DATES[CHECKPOINT_DATES.length - 1];

  const targets = [
    ...TARGETS.map((target) => ({
      slug: target.slug,
      movement: target.movement,
      startLabel: target.startLabel,
      unit: "reps" as const,
      byDate: { "2026-12-27": target.value },
    })),
    ...HOLD_TARGETS.map((target) => ({
      slug: target.slug,
      movement: target.movement,
      startLabel: target.startLabel,
      unit: "seconds" as const,
      byDate: { "2026-12-27": target.value },
    })),
  ];

  mkdirSync("data/seed", { recursive: true });
  writeFileSync(
    "data/seed/nourah.json",
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        year: YEAR,
        source: SOURCE,
        checkpointDates: CHECKPOINT_DATES,
        programs: [
          {
            code: "maison",
            name: "Musculation & mobilité -- Maison",
            defaultSlot: "soir",
            weeks,
            days: programDays,
          },
        ],
        // Pas de calisthénie dans ce programme : aucune échelle de progression.
        ladders: [],
        targets,
        testMetrics: TEST_METRICS,
      },
      null,
      2,
    ),
    "utf8",
  );

  // ---------------------------------------------------------------------------
  // Document de revue.
  // ---------------------------------------------------------------------------
  const out: string[] = [];
  out.push("# Revue du seed — programme de Nourah");
  out.push("");
  out.push(`Source : \`${SOURCE}\` · généré le ${new Date().toISOString().slice(0, 10)}`);
  out.push("");
  out.push("Relis ce document avant d'importer. Il dit exactement ce qui entrera en base.");
  out.push("");
  out.push(`- ${weeks.length} semaines, du ${weeks[0].startDate} au ${weeks.at(-1)?.endDate}`);
  out.push(`- ${days.length} jours, dont ${days.filter((d) => d.isRestDay).length} de repos`);
  out.push(`- ${days.reduce((n, d) => n + d.lines.length, 0)} lignes d'exercice`);
  out.push(`- ${targets.length} objectifs jalonnés au 27 décembre`);
  out.push(`- ${TEST_METRICS.length} mesures relevées aux ${CHECKPOINT_DATES.length} contrôles`);
  out.push("- aucune échelle de calisthénie : ce programme n'en comporte pas");
  out.push("");

  for (const week of weeks) {
    out.push(`## Semaine ${week.weekNumber} — ${week.blockName}`);
    out.push("");
    out.push(`${week.startDate} → ${week.endDate}`);
    if (week.instruction) {
      out.push("");
      out.push(`*${week.instruction}*`);
    }
    out.push("");

    for (const day of days.filter((d) => d.weekNumber === week.weekNumber)) {
      out.push(`### ${day.weekday} ${day.date} — ${day.label}`);
      if (day.isRestDay) {
        out.push("");
        out.push("Repos — rituel quotidien seul.");
        out.push("");
        continue;
      }
      out.push("");
      out.push("| # | Exercice | Volume | Charge | Repos |");
      out.push("|---|---|---|---|---|");
      for (const line of day.lines) {
        out.push(
          `| ${line.order} | ${line.name} | ${line.volumeRaw} | ${line.loadRaw} | ${line.restRaw} |`,
        );
      }
      out.push("");
    }
  }

  writeFileSync("data/seed/REVUE-NOURAH.md", out.join("\n"), "utf8");

  console.log("✓ Seed écrit.");
  console.log(`  Source        : ${SOURCE}`);
  console.log(`  Programme     : ${weeks.length} semaines, ${days.length} jours, ${days.reduce((n, d) => n + d.lines.length, 0)} lignes`);
  console.log(`  Objectifs     : ${targets.length} · Métriques : ${TEST_METRICS.length}`);
  console.log(`  Contrôles     : ${CHECKPOINT_DATES.join(", ")}`);
  console.log(`  Dernier jour  : ${days.at(-1)?.date} (contrôle final ${lastDay})`);
  if (warnings.length > 0) {
    console.log("");
    for (const warning of warnings) console.log(`  ⚠ ${warning}`);
  }
  console.log("");
  console.log("  Relis data/seed/REVUE-NOURAH.md avant d'importer.");
}

main();
