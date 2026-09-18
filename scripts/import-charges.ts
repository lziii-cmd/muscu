/**
 * Importe les charges habituelles d'un compte depuis `MES-CHARGES.md`.
 *
 *   npx tsx scripts/import-charges.ts --user abdou --essai     (n'écrit rien)
 *   npx tsx scripts/import-charges.ts --user abdou
 *
 * Le tableau se remplit à la main : Type (barre, machine, haltères, pdc),
 * Charge (celle d'UN haltère pour les haltères), Unité (kg ou lb). Chaque ligne
 * devient la charge habituelle de l'exercice, datée du jour de l'import : elle
 * l'emporte sur les séances plus anciennes, et une séance faite ensuite la
 * remplacera à son tour.
 *
 * Refuse d'écrire si une ligne est illisible : un type inconnu ou une unité
 * fausse ferait proposer la mauvaise charge en salle.
 */
import { readFileSync } from "node:fs";
import { openDatabase, q } from "./db";
import { column, readTable } from "./lib/markdown";
import { parseWeight, toKg, type LoadUnit, type WeightUnit } from "../src/lib/domain/loads";

const arg = (flag: string) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
};
const username = arg("--user");
const source = arg("--source") ?? "MES-CHARGES.md";
const dryRun = process.argv.includes("--essai");
if (!username) {
  console.error("Usage : npx tsx scripts/import-charges.ts --user <compte> [--source MES-CHARGES.md] [--essai]");
  process.exit(1);
}

const TYPES: Record<string, LoadUnit> = {
  barre: "barre",
  machine: "machine",
  "haltères": "kg_par_haltere",
  halteres: "kg_par_haltere",
  "haltère": "kg_par_haltere",
  haltere: "kg_par_haltere",
  pdc: "poids_du_corps",
  "poids du corps": "poids_du_corps",
};

async function main() {
  const lines = readFileSync(source, "utf8").replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((line) => /^\|\s*Séance\s*\|/.test(line));
  const table = start === -1 ? null : readTable(lines, start);
  if (!table) throw new Error(`Tableau introuvable dans ${source}.`);

  const problems: string[] = [];
  const loads: { name: string; loadUnit: LoadUnit; weightKg: number | null; weightUnit: WeightUnit; typed: string }[] = [];

  for (const row of table.rows) {
    const name = column(table, row, "Exercice");
    const typeRaw = column(table, row, "Type").toLowerCase();
    const chargeRaw = column(table, row, "Charge");
    const unitRaw = (column(table, row, "Unité") || "kg").toLowerCase();
    if (name === "") continue;

    const loadUnit = TYPES[typeRaw];
    if (!loadUnit) {
      problems.push(`« ${name} » : type « ${typeRaw} » inconnu (barre, machine, haltères ou pdc)`);
      continue;
    }
    if (loadUnit === "poids_du_corps") {
      loads.push({ name, loadUnit, weightKg: null, weightUnit: "kg", typed: "poids du corps" });
      continue;
    }
    if (chargeRaw === "") continue; // pas de charge : le programme fera foi
    const typed = parseWeight(chargeRaw);
    if (typed === null) {
      problems.push(`« ${name} » : charge « ${chargeRaw} » illisible`);
      continue;
    }
    if (unitRaw !== "kg" && unitRaw !== "lb") {
      problems.push(`« ${name} » : unité « ${unitRaw} » inconnue (kg ou lb)`);
      continue;
    }
    const weightUnit = unitRaw as WeightUnit;
    loads.push({
      name,
      loadUnit,
      weightKg: toKg(typed, weightUnit),
      weightUnit,
      typed: `${String(typed).replace(".", ",")} ${weightUnit}${loadUnit === "kg_par_haltere" ? " / haltère" : ""} (${typeRaw})`,
    });
  }

  const db = await openDatabase();
  console.log(`Base : ${db.label}${dryRun ? "  (essai, rien n'est écrit)" : ""}`);
  const [owner] = await db.query<{ id: number }>(`select id from users where username = ${q(username!)}`);
  if (!owner) throw new Error(`Compte « ${username} » introuvable.`);

  const catalogue = new Map(
    (await db.query<{ id: number; name: string }>("select id, name from exercises")).map((e) => [e.name, e.id]),
  );
  for (const load of loads) {
    if (!catalogue.has(load.name)) problems.push(`« ${load.name} » : exercice absent du catalogue`);
  }

  if (problems.length > 0) {
    problems.forEach((p) => console.error(`  ✗ ${p}`));
    await db.close();
    console.error(`\n✗ ${problems.length} ligne(s) à corriger dans ${source}. Rien n'a été écrit.`);
    process.exit(1);
  }

  const today = new Date().toISOString().slice(0, 10);
  for (const load of loads) {
    console.log(`  ${load.name.padEnd(46)} ${load.typed}`);
    if (dryRun) continue;
    await db.execute(
      `insert into exercise_loads (user_id, exercise_id, load_unit, weight_kg, weight_unit, as_of)
       values (${owner.id}, ${catalogue.get(load.name)}, ${q(load.loadUnit)}, ${q(load.weightKg)},
               ${q(load.weightUnit)}, ${q(today)})
       on conflict (user_id, exercise_id) do update set
         load_unit = excluded.load_unit, weight_kg = excluded.weight_kg,
         weight_unit = excluded.weight_unit, as_of = excluded.as_of, updated_at = now()`,
    );
  }
  await db.close();
  console.log(`\n${dryRun ? "Essai" : "✓ Import"} : ${loads.length} charge(s) habituelle(s).`);
}

main().catch((error) => {
  console.error(`✗ ${error.message}`);
  process.exit(1);
});
