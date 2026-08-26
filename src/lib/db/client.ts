import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

/**
 * Client de base de données.
 *
 * En production : Neon via son driver HTTP serverless, le seul adapté à
 * l'exécution sur Vercel où chaque requête peut tomber sur une instance froide.
 *
 * En développement sans `DATABASE_URL` : PGlite, un Postgres compilé en
 * WebAssembly qui lit le dossier `.pglite/`. Cela permet de faire tourner
 * l'application complète en local, sans daemon et sans manipuler d'identifiants.
 * Le SQL exécuté est le même dans les deux cas.
 */

type Database =
  | ReturnType<typeof drizzleNeon<typeof schema>>
  // Le client PGlite expose la même API Drizzle ; son type est résolu au
  // chargement dynamique, on l'aligne donc sur celui de Neon.
  | ReturnType<typeof drizzleNeon<typeof schema>>;

let cached: Database | null = null;

function createNeonClient(url: string): Database {
  return drizzleNeon(neon(url), { schema });
}

/**
 * PGlite est chargé de façon synchrone via `require` : `getDb()` est appelée
 * depuis des composants serveur qui ne peuvent pas attendre une importation
 * dynamique, et ce chemin ne s'exécute qu'en développement.
 */
function createLocalClient(): Database {
  // Le risque à couvrir est un déploiement sans base : l'application écrirait
  // alors dans un fichier local éphémère, et les données disparaîtraient au
  // redéploiement. On teste donc l'environnement Vercel, pas NODE_ENV — un
  // build de production tourne aussi en local, notamment pour les tests.
  if (process.env.VERCEL) {
    throw new Error(
      "DATABASE_URL manquante. En déploiement, la base Neon est obligatoire — vérifie les variables d'environnement du projet Vercel.",
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PGlite } = require("@electric-sql/pglite") as typeof import("@electric-sql/pglite");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { drizzle } = require("drizzle-orm/pglite") as typeof import("drizzle-orm/pglite");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { resolve } = require("node:path") as typeof import("node:path");

  // PGlite convertit son chemin de données en URL de fichier : un chemin
  // relatif échoue avec « File URL path must be absolute », en particulier sous
  // Windows où le serveur Next ne partage pas forcément le répertoire courant.
  // `PGLITE_DIR` permet à un test d'intégration d'utiliser sa propre base :
  // PGlite est mono-processus, deux serveurs ne peuvent pas partager un dossier.
  const client = new PGlite(resolve(process.cwd(), process.env.PGLITE_DIR ?? ".pglite"));
  return drizzle(client, { schema }) as unknown as Database;
}

export function getDb(): Database {
  if (cached) return cached;

  const url = process.env.DATABASE_URL;
  cached = url ? createNeonClient(url) : createLocalClient();
  return cached;
}

export { schema };
