/**
 * Importe les seules fiches d'exécution d'un compte.
 *
 *   npm run db:guides -- --user abdou
 *   npm run db:guides -- --user nourah --seed data/seed/nourah.json
 *
 * `db:seed` réécrit tout le programme, ce qu'il refuse — à raison — dès qu'une
 * séance a été enregistrée : les lignes du journal référencent les exercices
 * prescrits. Or les fiches n'ont rien à voir avec le programme lui-même, elles
 * décrivent des mouvements. Elles ont donc leur propre import, qui ne touche à
 * rien d'autre.
 */
import { readFileSync } from "node:fs";
import { openDatabase, q } from "./db";

interface SeedGuide {
  exercise: string;
  position: string;
  execution: string;
  mistake: string;
  note: string;
  fromProgram: boolean;
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

function argument(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

async function main() {
  const username = (argument("user") ?? "").trim().toLowerCase();
  if (username === "") {
    console.error("✗ Précise le compte visé : npm run db:guides -- --user abdou");
    process.exit(1);
  }

  const seedFile = argument("seed") ?? "data/seed/programme.json";
  const db = await openDatabase();
  console.log(`Base : ${db.label}`);

  const [account] = await db.query<{ id: number; display_name: string }>(
    `select id, display_name from users where username = ${q(username)}`,
  );
  if (!account) {
    console.error(`✗ Compte « ${username} » introuvable.`);
    process.exit(1);
  }

  const seed: { guides?: SeedGuide[] } = JSON.parse(readFileSync(seedFile, "utf8"));
  const guides = seed.guides ?? [];
  if (guides.length === 0) {
    console.error(`✗ Aucune fiche dans ${seedFile}. Reconstruis le seed d'abord.`);
    process.exit(1);
  }

  const exerciseIds = new Map<string, number>();
  for (const row of await db.query<{ id: number; slug: string }>("select id, slug from exercises")) {
    exerciseIds.set(row.slug, row.id);
  }

  let written = 0;
  const unknown: string[] = [];

  for (const guide of guides) {
    const exerciseId = exerciseIds.get(slugify(guide.exercise.replace(/\s+/g, " ").trim()));
    if (!exerciseId) {
      unknown.push(guide.exercise);
      continue;
    }

    await db.execute(
      `insert into exercise_guides (user_id, exercise_id, position, execution, common_mistake, note, from_program)
       values (${account.id}, ${exerciseId}, ${q(guide.position || null)}, ${q(guide.execution || null)},
               ${q(guide.mistake || null)}, ${q(guide.note || null)}, ${q(guide.fromProgram)})
       on conflict (user_id, exercise_id) do update set
         position = excluded.position, execution = excluded.execution,
         common_mistake = excluded.common_mistake, note = excluded.note,
         from_program = excluded.from_program`,
    );
    written += 1;
  }

  await db.close();

  console.log(`✓ ${written} fiches écrites pour ${account.display_name}.`);
  if (unknown.length > 0) {
    // Un exercice absent du catalogue signale un programme jamais importé, pas
    // une fiche en trop : on le dit plutôt que de l'ignorer.
    console.log(`  ⚠ ${unknown.length} exercice(s) inconnu(s) du catalogue : ${unknown.join(", ")}`);
  }
}

main().catch((error) => {
  console.error("✗ Import échoué :", error instanceof Error ? error.message : error);
  process.exit(1);
});
