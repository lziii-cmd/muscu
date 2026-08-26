import { openDatabase } from "./db";

/** Vide entièrement le schéma public. Destructif : réservé au développement. */
async function main() {
  const db = await openDatabase();
  console.log(`Base : ${db.label}`);
  await db.execute("drop schema public cascade");
  await db.execute("create schema public");
  await db.close();
  console.log("✓ Schéma remis à zéro. Relance npm run db:migrate puis npm run db:seed.");
}

main().catch((error) => {
  console.error("✗ Remise à zéro échouée :", error instanceof Error ? error.message : error);
  process.exit(1);
});
