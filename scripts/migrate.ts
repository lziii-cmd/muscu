import { openDatabase, applyMigrations } from "./db";

async function main() {
  const db = await openDatabase();
  console.log(`Base : ${db.label}`);
  const applied = await applyMigrations(db);
  if (applied.length === 0) console.log("  Aucune migration à appliquer.");
  else applied.forEach((name) => console.log(`  appliquée : ${name}`));
  await db.close();
  console.log("✓ Migrations à jour.");
}

main().catch((error) => {
  console.error("✗ Migration échouée :", error instanceof Error ? error.message : error);
  process.exit(1);
});
