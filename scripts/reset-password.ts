/**
 * Efface le mot de passe du compte local.
 *
 *   npm run db:reset-password
 *
 * Le prochain lancement de l'application repropose l'écran de création.
 * À n'utiliser que sur la base locale, serveur arrêté : PGlite est
 * mono-processus et une écriture concurrente ne serait pas vue.
 */
import { openDatabase } from "./db";

async function main() {
  const db = await openDatabase();
  console.log(`Base : ${db.label}`);
  await db.execute("update settings set password_hash = null where id = 1");
  await db.close();
  console.log("✓ Mot de passe effacé. L'application proposera d'en créer un au prochain lancement.");
}

main().catch((error) => {
  console.error("✗ Échec :", error instanceof Error ? error.message : error);
  process.exit(1);
});
