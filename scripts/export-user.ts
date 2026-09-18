/**
 * Export complet des données d'un compte — lecture seule.
 *
 * Sert de filet avant toute opération qui touche au programme : le journal
 * d'un compte (séances vécues, pesées, mensurations, tests, diète, sommeil)
 * est irremplaçable, le programme prescrit se re-sème.
 *
 *   npm run db:export -- --user abdou
 *
 * Écrit `data/export/<compte>-<horodatage>.json` et un résumé lisible à côté.
 * Le script n'exécute que des `select` : il ne peut rien modifier.
 */
/*
 * Les colonnes `date` sont rendues par le pilote comme « minuit, heure
 * locale ». Sur une machine en UTC+1, le 19 septembre devient
 * 2026-09-18T23:00:00Z dans le JSON — une date fausse d'un jour, et plausible.
 * En UTC, minuit local et minuit UTC coïncident : la date écrite est la bonne.
 * Doit précéder tout chargement du pilote.
 */
process.env.TZ = "UTC";

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { openDatabase, q, type SqlRunner } from "./db";

type Args = { user: string; outDir: string };

function parseArgs(argv: string[]): Args {
  const read = (flag: string) => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };
  const user = read("--user");
  if (!user) {
    console.error("Usage : npm run db:export -- --user <compte> [--out <dossier>]");
    process.exit(1);
  }
  return { user, outDir: read("--out") ?? join("data", "export") };
}

/** Garde-fou : ce script ne doit jamais écrire en base. */
async function select<T = Record<string, unknown>>(db: SqlRunner, sql: string): Promise<T[]> {
  if (!/^\s*select\b/i.test(sql)) throw new Error(`Requête non autorisée (lecture seule) : ${sql.slice(0, 60)}`);
  return db.query<T>(sql);
}

async function main() {
  const { user, outDir } = parseArgs(process.argv.slice(2));
  const db = await openDatabase();
  console.log(`Source : ${db.label}`);

  const owner = await select<{ id: number; username: string; display_name: string; role: string }>(
    db,
    `select id, username, display_name, role from users where username = ${q(user)}`,
  );
  if (owner.length === 0) {
    console.error(`Compte « ${user} » introuvable. Comptes existants :`);
    for (const row of await select<{ username: string }>(db, "select username from users order by username")) {
      console.error(`  ${row.username}`);
    }
    await db.close();
    process.exit(1);
  }
  const userId = owner[0].id;

  /** Tables portant directement `user_id`. */
  const direct = [
    "programs",
    "ladders",
    "exercise_guides",
    "sessions",
    "bodyweight_entries",
    "measurements",
    "progress_photos",
    "checkpoints",
    "strength_tests",
    "test_metrics",
    "targets",
    "meal_logs",
    "oil_logs",
    "water_logs",
    "rice_logs",
    "sleep_logs",
    "alerts",
    "pain_logs",
  ];

  /** Tables rattachées au compte par un parent. */
  const derived: Record<string, string> = {
    program_weeks: `select w.* from program_weeks w join programs p on p.id = w.program_id where p.user_id = ${userId} order by w.id`,
    program_sessions: `select s.* from program_sessions s join programs p on p.id = s.program_id where p.user_id = ${userId} order by s.id`,
    program_exercises: `select pe.* from program_exercises pe join program_sessions s on s.id = pe.program_session_id join programs p on p.id = s.program_id where p.user_id = ${userId} order by pe.id`,
    ladder_levels: `select l.* from ladder_levels l join ladders d on d.id = l.ladder_id where d.user_id = ${userId} order by l.id`,
    ladder_progress: `select lp.* from ladder_progress lp join ladders d on d.id = lp.ladder_id where d.user_id = ${userId} order by lp.ladder_id`,
    session_exercises: `select se.* from session_exercises se join sessions s on s.id = se.session_id where s.user_id = ${userId} order by se.id`,
    session_sets: `select ss.* from session_sets ss join session_exercises se on se.id = ss.session_exercise_id join sessions s on s.id = se.session_id where s.user_id = ${userId} order by ss.id`,
    meal_items: `select mi.* from meal_items mi join meal_logs m on m.id = mi.meal_log_id where m.user_id = ${userId} order by mi.id`,
  };

  const data: Record<string, unknown[]> = {};
  for (const table of direct) {
    data[table] = await select(db, `select * from ${table} where user_id = ${userId} order by id`);
  }
  for (const [table, sql] of Object.entries(derived)) {
    data[table] = await select(db, sql);
  }
  // Référentiels partagés : utiles pour relire l'export sans la base.
  data.exercises = await select(db, "select * from exercises order by id");
  data.foods = await select(db, "select * from foods order by id");

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  mkdirSync(outDir, { recursive: true });
  const jsonPath = join(outDir, `${user}-${stamp}.json`);
  writeFileSync(
    jsonPath,
    JSON.stringify(
      { exportedAt: new Date().toISOString(), source: db.label, user: owner[0], tables: data },
      null,
      2,
    ),
    "utf8",
  );

  // Le journal — ce qui a été vécu — est distingué du programme, qui se re-sème.
  const journal = [
    "sessions",
    "session_exercises",
    "session_sets",
    "bodyweight_entries",
    "measurements",
    "progress_photos",
    "checkpoints",
    "strength_tests",
    "meal_logs",
    "meal_items",
    "oil_logs",
    "water_logs",
    "rice_logs",
    "sleep_logs",
    "alerts",
    "pain_logs",
    "ladder_progress",
  ];

  const lines = [
    `# Export du compte ${owner[0].username} — ${owner[0].display_name}`,
    "",
    `Source : ${db.label}`,
    `Date : ${new Date().toISOString()}`,
    "",
    "## Journal — ce qui a été vécu, irremplaçable",
    "",
    "| Table | Lignes |",
    "|---|---:|",
    ...journal.map((t) => `| ${t} | ${data[t]?.length ?? 0} |`),
    "",
    "## Programme — prescrit, reconstructible depuis le document source",
    "",
    "| Table | Lignes |",
    "|---|---:|",
    ...Object.keys(data)
      .filter((t) => !journal.includes(t))
      .map((t) => `| ${t} | ${data[t].length} |`),
    "",
  ];
  const mdPath = join(outDir, `${user}-${stamp}.md`);
  writeFileSync(mdPath, lines.join("\n"), "utf8");

  const totalJournal = journal.reduce((n, t) => n + (data[t]?.length ?? 0), 0);
  console.log(`\nJournal : ${totalJournal} lignes sur ${journal.length} tables`);
  for (const t of journal) {
    const n = data[t]?.length ?? 0;
    if (n > 0) console.log(`  ${t.padEnd(22)} ${n}`);
  }
  console.log(`\nÉcrit : ${jsonPath}`);
  console.log(`        ${mdPath}`);

  await db.close();
}

main();
