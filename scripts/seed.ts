/**
 * Importe le programme d'un compte : exercices, échelles, objectifs, métriques
 * de test, jalons, et les 17 semaines.
 *
 *   npm run db:seed -- --user abdou
 *   npm run db:seed -- --user nourah --seed data/seed/nourah.json
 *
 * Chaque personne a son propre programme : le seed vise donc un compte, et ne
 * touche qu'à ses données. Le catalogue d'exercices et la table des aliments
 * sont partagés, ce sont des référentiels neutres.
 *
 * Idempotent : le référentiel du compte est réécrit à chaque exécution, son
 * journal de séances n'est jamais touché.
 */
import { readFileSync } from "node:fs";
import { openDatabase, q } from "./db";
import { FOODS } from "./lib/reference-data";
import type { ParsedProgram, ProgramDay, ProgramWeek } from "./lib/program-parser";

/** Un programme importable : ses semaines, ses jours, son créneau par défaut. */
interface SeedProgram {
  code: string;
  name: string;
  defaultSlot: "salle" | "matin" | "soir" | "libre";
  weeks: ProgramWeek[];
  days: ProgramDay[];
}

/**
 * Fichier de seed.
 *
 * Les programmes sont une liste, pas deux champs nommés : le document de
 * Nourah n'a qu'un programme à domicile, celui d'Abdou en a deux. Nommer les
 * parties en dur obligerait à inventer une calisthénie vide pour elle.
 */
/** Fiche d'exécution résolue à la construction du seed. */
interface SeedGuide {
  exercise: string;
  position: string;
  execution: string;
  mistake: string;
  note: string;
  fromProgram: boolean;
}

interface SeedFile {
  source: string;
  checkpointDates: string[];
  programs: SeedProgram[];
  guides: SeedGuide[];
  ladders: ParsedProgram["ladders"];
  targets: ParsedProgram["targets"];
  testMetrics: ParsedProgram["testMetrics"];
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

/** `--user abcd` -> "abcd" */
function argument(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

async function main() {
  const username = (argument("user") ?? "").trim().toLowerCase();
  if (username === "") {
    console.error("✗ Précise le compte visé : npm run db:seed -- --user abdou");
    process.exit(1);
  }

  const seedFile = argument("seed") ?? "data/seed/programme.json";

  const db = await openDatabase();
  console.log(`Base : ${db.label}`);

  const [account] = await db.query<{ id: number; display_name: string }>(
    `select id, display_name from users where username = ${q(username)}`,
  );
  if (!account) {
    console.error(`✗ Compte « ${username} » introuvable. Crée-le avec npm run users:create.`);
    process.exit(1);
  }
  const userId = account.id;

  const seed: SeedFile = JSON.parse(readFileSync(seedFile, "utf8"));
  console.log(`Compte : ${account.display_name} (${username})`);
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

  for (const part of seed.programs) {
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
  // Réécriture du programme de CE compte. Les autres comptes et le journal des
  // séances réalisées ne sont pas touchés.
  // -------------------------------------------------------------------------
  await db.execute(`
    delete from program_exercises where program_session_id in (
      select ps.id from program_sessions ps
      join programs p on p.id = ps.program_id
      where p.user_id = ${userId})`);
  await db.execute(`
    delete from program_sessions where program_id in (
      select id from programs where user_id = ${userId})`);
  await db.execute(`
    delete from program_weeks where program_id in (
      select id from programs where user_id = ${userId})`);
  await db.execute(`delete from programs where user_id = ${userId}`);
  await db.execute(`
    delete from ladder_levels where ladder_id in (
      select id from ladders where user_id = ${userId})`);
  await db.execute(`delete from ladders where user_id = ${userId}`);
  await db.execute(`delete from exercise_guides where user_id = ${userId}`);
  await db.execute(`delete from targets where user_id = ${userId}`);
  await db.execute(`delete from test_metrics where user_id = ${userId}`);

  // Le catalogue d'aliments est partagé : on le réécrit une seule fois.
  await db.execute("delete from foods");

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
  // Fiches d'exécution, propres au compte : le même mouvement ne s'explique pas
  // de la même façon selon le matériel dont la personne dispose.
  // -------------------------------------------------------------------------
  let guideCount = 0;
  for (const guide of seed.guides ?? []) {
    const exerciseId = exerciseIds.get(slugify(guide.exercise.replace(/\s+/g, " ").trim()));
    if (!exerciseId) continue;

    await db.execute(
      `insert into exercise_guides (user_id, exercise_id, position, execution, common_mistake, note, from_program)
       values (${userId}, ${exerciseId}, ${q(guide.position || null)}, ${q(guide.execution || null)},
               ${q(guide.mistake || null)}, ${q(guide.note || null)}, ${q(guide.fromProgram)})
       on conflict (user_id, exercise_id) do update set
         position = excluded.position, execution = excluded.execution,
         common_mistake = excluded.common_mistake, note = excluded.note,
         from_program = excluded.from_program`,
    );
    guideCount += 1;
  }
  console.log(`  ${guideCount} fiches d'exécution`);

  // -------------------------------------------------------------------------
  // Échelles de progression, avec le niveau de départ du document.
  // -------------------------------------------------------------------------
  for (const ladder of seed.ladders) {
    const [{ id }] = await db.query<{ id: number }>(
      `insert into ladders (user_id, slug, name, description, start_level)
       values (${userId}, ${q(ladder.slug)}, ${q(ladder.name)}, null, ${ladder.startLevel})
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
        `insert into targets (user_id, slug, movement, unit, date, value, start_label)
         values (${userId}, ${q(target.slug)}, ${q(target.movement)}, ${q(target.unit)}, ${q(date)},
                 ${q(value)}, ${q(target.startLabel)})
         on conflict (user_id, slug, date) do update set
           value = excluded.value, movement = excluded.movement,
           unit = excluded.unit, start_label = excluded.start_label`,
      );
    }
  }
  console.log(`  ${seed.targets.length} objectifs jalonnés`);

  for (const [index, metric] of seed.testMetrics.entries()) {
    await db.execute(
      `insert into test_metrics (user_id, slug, label, unit, order_index)
       values (${userId}, ${q(metric.slug)}, ${q(metric.label)}, ${q(metric.unit)}, ${index})
       on conflict (user_id, slug) do update set
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
      `insert into checkpoints (user_id, date, label)
       values (${userId}, ${q(date)}, ${q("Contrôle -- mensurations, photos, meilleures séries")})
       on conflict (user_id, date) do nothing`,
    );
  }

  // -------------------------------------------------------------------------
  // Programmes
  // -------------------------------------------------------------------------
  async function insertProgram({ code, name, defaultSlot, weeks, days }: SeedProgram) {
    const dates = days.map((d) => d.date).sort();
    const [{ id: programId }] = await db.query<{ id: number }>(
      `insert into programs (user_id, code, name, start_date, end_date)
       values (${userId}, ${q(code)}, ${q(name)}, ${q(dates[0])}, ${q(dates[dates.length - 1])})
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
              { slot: defaultSlot, heading: "", exercises: [] },
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

  for (const program of seed.programs) await insertProgram(program);

  await db.close();
  console.log(`\n✓ Programme importé pour ${account.display_name}.`);
}

main().catch((error) => {
  console.error("\n✗ Import échoué :", error instanceof Error ? error.message : error);
  process.exit(1);
});
