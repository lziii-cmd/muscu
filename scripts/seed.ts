/**
 * Importe le référentiel en base : exercices, échelles, objectifs, métriques de
 * test, aliments, jalons, et les 17 semaines des deux programmes.
 *
 *   npm run db:seed
 *
 * Idempotent : le référentiel est réécrit à chaque exécution, le journal des
 * séances réalisées n'est jamais touché.
 */
import { readFileSync } from "node:fs";
import { openDatabase, q } from "./db";
import { FOODS } from "./lib/reference-data";
import type { ParsedProgram, ProgramDay, ProgramWeek } from "./lib/program-parser";

interface SeedFile extends ParsedProgram {
  source: string;
  checkpointDates: string[];
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

function equipmentOf(name: string): string {
  const n = name.toLowerCase();
  if (/poulie|tirage vertical|face pull/.test(n)) return "poulie";
  if (/haltère|halteres|goblet|oiseau/.test(n)) return "haltere";
  if (/machine|presse|leg curl|leg extension|pec-deck/.test(n)) return "machine";
  if (
    /traction|dips|pompe|pike|atr|hspu|lever|l-sit|hollow|planche|gainage|pistol|suspension|hang|scapula|mobilit|dead bug|poignets|squat une jambe/.test(
      n,
    )
  )
    return "poids_du_corps";
  if (/barre/.test(n)) return "barre";
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
  if (l.includes("PRISE")) return "prise";
  return "autre";
}

async function main() {
  const db = await openDatabase();
  console.log(`Base : ${db.label}`);

  const seed: SeedFile = JSON.parse(readFileSync("data/seed/programme.json", "utf8"));
  console.log(`Source : ${seed.source}`);

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
    if (clean === "") return;
    const slug = slugify(clean);
    const existing = exercises.get(slug);
    if (existing) {
      // Un exercice mesuré au moins une fois en tenue est un isométrique.
      if (isHold) existing.unit = "seconds";
      return;
    }
    const equipment = equipmentOf(clean);
    exercises.set(slug, {
      slug,
      name: clean,
      unit: isHold ? "seconds" : "reps",
      equipment,
      muscleGroup: groupOf(label),
      isBodyweight: equipment === "poids_du_corps",
    });
  };

  for (const part of [seed.ppl, seed.calisthenie]) {
    for (const day of part.days) {
      for (const session of day.sessions) {
        for (const exercise of session.exercises) {
          remember(exercise.name, day.label, exercise.volume.holdSecondsLow !== null);
        }
      }
    }
  }
  console.log(`  ${exercises.size} exercices distincts`);

  // -------------------------------------------------------------------------
  // Réécriture du référentiel (le journal n'est pas touché).
  // -------------------------------------------------------------------------
  for (const table of [
    "program_exercises",
    "program_sessions",
    "program_weeks",
    "programs",
    "ladder_levels",
    "ladders",
    "foods",
    "targets",
    "test_metrics",
  ]) {
    await db.execute(`delete from ${table}`);
  }

  for (const e of exercises.values()) {
    await db.execute(
      `insert into exercises (slug, name, muscle_group, equipment, unit, is_bodyweight)
       values (${q(e.slug)}, ${q(e.name)}, ${q(e.muscleGroup)}, ${q(e.equipment)}, ${q(e.unit)}, ${q(e.isBodyweight)})
       on conflict (slug) do update set
         name = excluded.name, muscle_group = excluded.muscle_group,
         equipment = excluded.equipment, unit = excluded.unit,
         is_bodyweight = excluded.is_bodyweight`,
    );
  }

  const exerciseIds = new Map<string, number>();
  for (const row of await db.query<{ id: number; slug: string }>("select id, slug from exercises")) {
    exerciseIds.set(row.slug, row.id);
  }

  // -------------------------------------------------------------------------
  // Échelles de progression, avec le niveau de départ du document.
  // -------------------------------------------------------------------------
  for (const ladder of seed.ladders) {
    const [{ id }] = await db.query<{ id: number }>(
      `insert into ladders (slug, name, description, start_level)
       values (${q(ladder.slug)}, ${q(ladder.name)}, null, ${ladder.startLevel})
       returning id`,
    );
    for (const level of ladder.levels) {
      await db.execute(
        `insert into ladder_levels (ladder_id, level, movement, criterion)
         values (${id}, ${level.level}, ${q(level.movement)}, ${q(level.criterion)})`,
      );
    }
    // La progression démarre au niveau que le document désigne comme le tien.
    await db.execute(
      `insert into ladder_progress (ladder_id, current_level, clean_streak)
       values (${id}, ${ladder.startLevel}, 0)
       on conflict (ladder_id) do update set current_level = excluded.current_level`,
    );
  }
  console.log(`  ${seed.ladders.length} échelles`);

  // -------------------------------------------------------------------------
  // Objectifs et métriques de test
  // -------------------------------------------------------------------------
  for (const target of seed.targets) {
    for (const [date, value] of Object.entries(target.byDate)) {
      await db.execute(
        `insert into targets (slug, movement, unit, date, value, start_label)
         values (${q(target.slug)}, ${q(target.movement)}, ${q(target.unit)}, ${q(date)},
                 ${q(value)}, ${q(target.startLabel)})
         on conflict (slug, date) do update set
           value = excluded.value, movement = excluded.movement,
           unit = excluded.unit, start_label = excluded.start_label`,
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
  // Aliments et jalons
  // -------------------------------------------------------------------------
  for (const food of FOODS) {
    await db.execute(
      `insert into foods (slug, name, portion_label, protein_g, kcal, price_fcfa, is_local, note)
       values (${q(food.slug)}, ${q(food.name)}, ${q(food.portionLabel)}, ${food.proteinG},
               ${q(food.kcal)}, ${q(food.priceFcfa)}, true, ${q(food.note)})`,
    );
  }
  console.log(`  ${FOODS.length} aliments`);

  for (const date of seed.checkpointDates) {
    await db.execute(
      `insert into checkpoints (date, label)
       values (${q(date)}, ${q("Contrôle -- mensurations, photos, meilleures séries")})
       on conflict (date) do nothing`,
    );
  }

  // -------------------------------------------------------------------------
  // Programmes
  // -------------------------------------------------------------------------
  async function insertProgram(code: string, name: string, weeks: ProgramWeek[], days: ProgramDay[]) {
    const dates = days.map((d) => d.date).sort();
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

    let lines = 0;
    for (const day of days) {
      // Un jour sans bloc (repos, jour de test) est tout de même enregistré :
      // le calendrier doit le distinguer d'un trou.
      const sessions =
        day.sessions.length > 0
          ? day.sessions
          : [
              {
                slot: code === "ppl" ? ("salle" as const) : ("matin" as const),
                heading: "",
                exercises: [],
              },
            ];

      for (const session of sessions) {
        const [{ id: sessionId }] = await db.query<{ id: number }>(
          `insert into program_sessions
             (program_id, week_number, date, slot, label, heading, is_rest_day, is_test_day)
           values (${programId}, ${day.weekNumber}, ${q(day.date)}, ${q(session.slot)},
                   ${q(day.label)}, ${q(session.heading || null)}, ${q(day.isRestDay)}, ${q(day.isTestDay)})
           returning id`,
        );

        for (const [index, e] of session.exercises.entries()) {
          const exerciseId = exerciseIds.get(slugify(e.name.replace(/\s+/g, " ").trim()));
          if (!exerciseId) throw new Error(`Exercice inconnu à l'import : « ${e.name} »`);

          await db.execute(
            `insert into program_exercises
               (program_session_id, exercise_id, order_label, order_index, superset_group,
                sets, reps_low, reps_high, hold_seconds_low, hold_seconds_high, max_offset,
                per_side, load_raw, load_kg, dumbbell_raw, dumbbell_kg, rest_seconds, cue,
                home_alternative)
             values (${sessionId}, ${exerciseId}, ${q(e.order)}, ${index}, ${q(e.supersetGroup)},
                     ${q(e.volume.sets)}, ${q(e.volume.repsLow)}, ${q(e.volume.repsHigh)},
                     ${q(e.volume.holdSecondsLow)}, ${q(e.volume.holdSecondsHigh)}, ${q(e.volume.maxOffset)},
                     ${q(e.volume.perSide)}, ${q(e.loadRaw || null)}, ${q(e.loadKg)},
                     ${q(e.dumbbellRaw || null)}, ${q(e.dumbbellKg)}, ${q(e.restSeconds)},
                     ${q(e.cue || null)}, ${q(e.homeAlternative || null)})`,
          );
          lines++;
        }
      }
    }
    console.log(`  ${name} : ${days.length} jours, ${lines} lignes`);
  }

  await insertProgram("ppl", "Musculation PPL -- Soir", seed.ppl.weeks, seed.ppl.days);
  await insertProgram("calisthenie", "Calisthénie", seed.calisthenie.weeks, seed.calisthenie.days);

  await db.execute("insert into settings (id) values (1) on conflict (id) do nothing");

  await db.close();
  console.log("\n✓ Référentiel importé.");
}

main().catch((error) => {
  console.error("\n✗ Import échoué :", error instanceof Error ? error.message : error);
  process.exit(1);
});
