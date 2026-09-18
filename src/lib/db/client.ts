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

/*
 * Le client est mémorisé sur `globalThis`, pas dans une variable de module.
 *
 * Next découpe l'application en plusieurs graphes de modules — les pages d'un
 * côté, les routes d'API de l'autre. Une variable de module y est dupliquée,
 * ce qui donnerait DEUX instances PGlite sur le même dossier. Or PGlite est
 * mono-processus : la page ne verrait alors jamais ce que la route vient
 * d'écrire. Le symptôme est trompeur — la synchronisation répond « ok » et
 * l'écran reste vide.
 *
 * Neon n'a pas ce problème (c'est un serveur distant partagé), mais passer par
 * le même chemin évite d'avoir deux comportements à comprendre.
 */
const CLIENT_KEY = Symbol.for("muscu.db.client");

type GlobalWithClient = typeof globalThis & { [CLIENT_KEY]?: Database };

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
  const container = globalThis as GlobalWithClient;
  const existing = container[CLIENT_KEY];
  if (existing) return existing;

  // Une base locale nommée (`PGLITE_DIR`, posée par le test de fumée) l'emporte
  // sur `.env.local` : sans cela, un test lancé depuis un poste configuré pour
  // Neon écrirait sur la production. Jamais sur Vercel, où la garde de
  // `createLocalClient` refuse de toute façon la base locale.
  const url = process.env.PGLITE_DIR && !process.env.VERCEL ? "" : process.env.DATABASE_URL;
  const client = url ? createNeonClient(url) : createLocalClient();
  container[CLIENT_KEY] = client;
  return client;
}

export { schema };
