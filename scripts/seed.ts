/**
 * Importe le référentiel en base : exercices, échelles, aliments, jalons,
 * et les 17 semaines des deux programmes.
 *
 *   npm run db:seed
 *
 * Idempotent : le référentiel est réécrit à chaque exécution, le journal des
 * séances réalisées n'est jamais touché.
 */
import { readFileSync } from "node:fs";
import { openDatabase, q } from "./db";
import { FOODS } from "./lib/reference-data";
import { CHECKPOINT_DATES, type LadderSeed, type TargetSeed, type TestMetricSeed } from "./lib/cali-reference";
import type { PplDay, PplWeek } from "./lib/ppl-parser";
import type { CaliDay, CaliWeek } from "./lib/cali-parser";

interface SeedFile {
  year: number;
  ppl: { weeks: PplWeek[]; days: PplDay[] };
  calisthenie: { weeks: CaliWeek[]; days: CaliDay[] };
  ladders: LadderSeed[];
  testMetrics: TestMetricSeed[];
  targets: TargetSeed[];
}

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

/** « 30 kg » -> 30 ; « 7,5 kg » -> 7.5 ; « Poids du corps » / « -- » -> null. */
export function parseKg(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const match = raw.match(/(\d+(?:[.,]\d+)?)\s*kg/i);
  if (!match) return null;
  return Number(match[1].replace(",", "."));
}

function equipmentOf(name: string): string {
  const n = name.toLowerCase();
  if (/poulie|tirage vertical|face pull/.test(n)) return "poulie";
  if (/barre/.test(n)) return "barre";
  if (/haltère|halteres|goblet|oiseau/.test(n)) return "haltere";
  if (/machine|presse|leg curl|leg extension|pec-deck/.test(n)) return "machine";
  if (/traction|dips|pompe|pike|atr|hspu|lever|l-sit|hollow|planche|gainage|pistol|suspension|hang|scapula|mobilit/.test(n))
    return "poids_du_corps";
  return "autre";
}

function groupOf(label: string): string {
  const l = label.toUpperCase();
  if (l.includes("PUSH") || l.includes("POUSSÉE")) return "push";
  if (l.includes("PULL") || l.includes("TIRAGE")) return "pull";
  if (l.includes("LEGS") || l.includes("JAMBE")) return "legs";
  if (l.includes("CORE") || l.includes("GAINAGE")) return "core";
  if (l.includes("MOBILIT")) return "mobilite";
  if (l.includes("BRAS TENDUS")) return "bras_tendus";
  return "autre";
}

async function main() {
  const db = await openDatabase();
  console.log(`Base : ${db.label}`);

  const seed: SeedFile = JSON.parse(readFileSync("data/seed/programme.json", "utf8"));

  // -------------------------------------------------------------------------
  // Exercices : dérivés des deux programmes, dédoublonnés par slug.
  // -------------------------------------------------------------------------
  interface ExerciseAcc {
    slug: string;
    name: string;
    unit: "reps" | "seconds";
    equipment: string;
    muscleGroup: string;
    isBodyweight: boolean;
  }
  const exercises = new Map<string, ExerciseAcc>();

  const remember = (name: string, label: string, isHold: boolean) => {
    const clean = name.replace(/\s+/g, " ").trim();
    if (!clean) return;
    const slug = slugify(clean);
    const equipment = equipmentOf(clean);
    const existing = exercises.get(slug);
    if (existing) {
      // Un exercice mesuré au moins une fois en tenue est un isométrique.
      if (isHold) existing.unit = "seconds";
      return;
    }
    exercises.set(slug, {
      slug,
      name: clean,
      unit: isHold ? "seconds" : "reps",
      equipment,
      muscleGroup: groupOf(label),
      isBodyweight: equipment === "poids_du_corps",
    });
  };

  for (const day of seed.ppl.days) {
    for (const e of day.exercises) remember(e.name, day.sessionType, false);
  }
  for (const day of seed.calisthenie.days) {
    for (const block of day.blocks) {
      for (const e of block.exercises) remember(e.name, day.theme, e.holdSeconds !== null);
    }
  }

  console.log(`  ${exercises.size} exercices distincts`);

  // -------------------------------------------------------------------------
  // Réécriture du référentiel (le journal n'est pas touché).
  // -------------------------------------------------------------------------
  await db.execute("delete from program_exercises");
  await db.execute("delete from program_sessions");
  await db.execute("delete from program_weeks");
  await db.execute("delete from programs");
  await db.execute("delete from ladder_levels");
  await db.execute("delete from ladders");
  await db.execute("delete from foods");
  await db.execute("delete from targets");
  await db.execute("delete from test_metrics");

  for (const e of exercises.values()) {
    await db.execute(
      `insert into exercises (slug, name, muscle_group, equipment, unit, is_bodyweight)
       values (${q(e.slug)}, ${q(e.name)}, ${q(e.muscleGroup)}, ${q(e.equipment)}, ${q(e.unit)}, ${q(e.isBodyweight)})
       on conflict (slug) do update set
         name = excluded.name,
         muscle_group = excluded.muscle_group,
         equipment = excluded.equipment,
         unit = excluded.unit,
         is_bodyweight = excluded.is_bodyweight`,
    );
  }

  const exerciseIds = new Map<string, number>();
  for (const row of await db.query<{ id: number; slug: string }>("select id, slug from exercises")) {
    exerciseIds.set(row.slug, row.id);
  }

  // -------------------------------------------------------------------------
  // Échelles de progression
  // -------------------------------------------------------------------------
  for (const ladder of seed.ladders) {
    const [{ id }] = await db.query<{ id: number }>(
      `insert into ladders (slug, name, description)
       values (${q(ladder.slug)}, ${q(ladder.name)}, ${q(ladder.description)})
       returning id`,
    );
    for (const level of ladder.levels) {
      await db.execute(
        `insert into ladder_levels (ladder_id, level, movement, criterion)
         values (${id}, ${level.level}, ${q(level.movement)}, ${q(level.criterion)})`,
      );
    }
    await db.execute(
      `insert into ladder_progress (ladder_id, current_level, clean_streak)
       values (${id}, 1, 0)
       on conflict (ladder_id) do nothing`,
    );
  }
  console.log(`  ${seed.ladders.length} échelles de progression`);

  // -------------------------------------------------------------------------
  // Objectifs jalonnés
  // -------------------------------------------------------------------------
  for (const target of seed.targets) {
    for (const [date, value] of Object.entries(target.byDate)) {
      await db.execute(
        `insert into targets (slug, movement, unit, date, value, start_label)
         values (${q(target.slug)}, ${q(target.movement)}, ${q(target.unit)}, ${q(date)},
                 ${q(value)}, ${q(target.start)})
         on conflict (slug, date) do update set
           value = excluded.value,
           movement = excluded.movement,
           unit = excluded.unit,
           start_label = excluded.start_label`,
      );
    }
  }
  console.log(`  ${seed.targets.length} objectifs jalonnés`);

  for (const [index, metric] of seed.testMetrics.entries()) {
    await db.execute(
      `insert into test_metrics (slug, label, unit, order_index)
       values (${q(metric.slug)}, ${q(metric.label)}, ${q(metric.unit)}, ${index})
       on conflict (slug) do update set
         label = excluded.label, unit = excluded.unit, order_index = excluded.order_index`,
    );
  }
  console.log(`  ${seed.testMetrics.length} métriques de test`);

  // -------------------------------------------------------------------------
  // Aliments
  // -------------------------------------------------------------------------
  for (const food of FOODS) {
    await db.execute(
      `insert into foods (slug, name, portion_label, protein_g, kcal, price_fcfa, is_local, note)
       values (${q(food.slug)}, ${q(food.name)}, ${q(food.portionLabel)}, ${food.proteinG},
               ${q(food.kcal)}, ${q(food.priceFcfa)}, true, ${q(food.note)})`,
    );
  }
  console.log(`  ${FOODS.length} aliments`);

  // -------------------------------------------------------------------------
  // Jalons de contrôle
  // -------------------------------------------------------------------------
  for (const date of CHECKPOINT_DATES) {
    await db.execute(
      `insert into checkpoints (date, label)
       values (${q(date)}, ${q("Contrôle -- mensurations, photos, meilleures séries")})
       on conflict (date) do nothing`,
    );
  }

  // -------------------------------------------------------------------------
  // Programmes
  // -------------------------------------------------------------------------
  async function insertProgram(
    code: string,
    name: string,
    weeks: (PplWeek | CaliWeek)[],
    sessions: {
      weekNumber: number;
      date: string;
      slot: string;
      label: string;
      heading: string | null;
      isRestDay: boolean;
      isTestDay: boolean;
      exercises: {
        orderLabel: string;
        orderIndex: number;
        supersetGroup: string | null;
        name: string;
        sets: number | null;
        repsLow: number | null;
        repsHigh: number | null;
        holdSeconds: number | null;
        repsFromMaxRule: boolean;
        perSide: boolean;
        loadRaw: string | null;
        dumbbellRaw: string | null;
        restSeconds: number | null;
        cue: string | null;
        homeAlternative: string | null;
      }[];
    }[],
  ) {
    const dates = sessions.map((s) => s.date).sort();
    const [{ id: programId }] = await db.query<{ id: number }>(
      `insert into programs (code, name, start_date, end_date)
       values (${q(code)}, ${q(name)}, ${q(dates[0])}, ${q(dates[dates.length - 1])})
       returning id`,
    );

    for (const week of weeks) {
      await db.execute(
        `insert into program_weeks (program_id, week_number, block_name, start_date, end_date, instruction)
         values (${programId}, ${week.weekNumber}, ${q(week.blockName)},
                 ${q(week.startDate)}, ${q(week.endDate)}, ${q(week.instruction)})`,
      );
    }

    let exerciseCount = 0;
    for (const session of sessions) {
      const [{ id: sessionId }] = await db.query<{ id: number }>(
        `insert into program_sessions (program_id, week_number, date, slot, label, heading, is_rest_day, is_test_day)
         values (${programId}, ${session.weekNumber}, ${q(session.date)}, ${q(session.slot)},
                 ${q(session.label)}, ${q(session.heading)}, ${q(session.isRestDay)}, ${q(session.isTestDay)})
         returning id`,
      );

      for (const e of session.exercises) {
        const exerciseId = exerciseIds.get(slugify(e.name.replace(/\s+/g, " ").trim()));
        if (!exerciseId) throw new Error(`Exercice inconnu au moment de l'import : « ${e.name} »`);
        await db.execute(
          `insert into program_exercises
             (program_session_id, exercise_id, order_label, order_index, superset_group,
              sets, reps_low, reps_high, hold_seconds, reps_from_max_rule, per_side,
              load_raw, load_kg, dumbbell_raw, dumbbell_kg, rest_seconds, cue, home_alternative)
           values (${sessionId}, ${exerciseId}, ${q(e.orderLabel)}, ${e.orderIndex}, ${q(e.supersetGroup)},
                   ${q(e.sets)}, ${q(e.repsLow)}, ${q(e.repsHigh)}, ${q(e.holdSeconds)},
                   ${q(e.repsFromMaxRule)}, ${q(e.perSide)},
                   ${q(e.loadRaw)}, ${q(parseKg(e.loadRaw))}, ${q(e.dumbbellRaw)}, ${q(parseKg(e.dumbbellRaw))},
                   ${q(e.restSeconds)}, ${q(e.cue)}, ${q(e.homeAlternative)})`,
        );
        exerciseCount++;
      }
    }
    console.log(`  ${name} : ${sessions.length} séances, ${exerciseCount} lignes`);
  }

  await insertProgram(
    "ppl",
    "Musculation PPL -- Soir",
    seed.ppl.weeks,
    seed.ppl.days.map((day) => ({
      weekNumber: day.weekNumber,
      date: day.date,
      slot: "salle",
      label: day.sessionType,
      heading: null,
      isRestDay: day.isRestDay,
      isTestDay: false,
      exercises: day.exercises.map((e, index) => ({
        orderLabel: e.order,
        orderIndex: index,
        supersetGroup: e.supersetGroup,
        name: e.name,
        sets: e.sets,
        repsLow: e.repsLow,
        repsHigh: e.repsHigh,
        holdSeconds: null,
        repsFromMaxRule: false,
        perSide: e.perSide,
        loadRaw: e.loadRaw || null,
        dumbbellRaw: e.dumbbellRaw || null,
        restSeconds: e.restSeconds,
        cue: null,
        homeAlternative: e.homeAlternative || null,
      })),
    })),
  );

  type ProgramSessionInput = Parameters<typeof insertProgram>[3][number];

  const caliSessions: ProgramSessionInput[] = seed.calisthenie.days.flatMap((day): ProgramSessionInput[] => {
    const isTestDay = /test/i.test(day.theme);
    if (day.blocks.length === 0) {
      return [
        {
          weekNumber: day.weekNumber,
          date: day.date,
          slot: "matin",
          label: day.theme || "Repos",
          heading: null,
          isRestDay: day.isRestDay,
          isTestDay,
          exercises: [],
        },
      ];
    }
    return day.blocks.map((block) => ({
      weekNumber: day.weekNumber,
      date: day.date,
      slot: block.slot,
      label: day.theme,
      heading: block.heading,
      isRestDay: false,
      isTestDay,
      exercises: block.exercises.map((e, index) => ({
        orderLabel: String(e.order),
        orderIndex: index,
        supersetGroup: null,
        name: e.name,
        sets: e.sets,
        repsLow: e.repsLow,
        repsHigh: e.repsHigh,
        holdSeconds: e.holdSeconds,
        repsFromMaxRule: e.repsFromMaxRule,
        perSide: e.perSide,
        loadRaw: null,
        dumbbellRaw: null,
        restSeconds: e.restSeconds,
        cue: e.cueRaw || null,
        homeAlternative: null,
      })),
    }));
  });

  await insertProgram("calisthenie", "Calisthénie", seed.calisthenie.weeks, caliSessions);

  await db.execute(
    `insert into settings (id) values (1) on conflict (id) do nothing`,
  );

  await db.close();
  console.log("\n✓ Référentiel importé.");
}

main().catch((error) => {
  console.error("\n✗ Import échoué :", error instanceof Error ? error.message : error);
  process.exit(1);
});
