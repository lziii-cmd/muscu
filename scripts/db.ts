/**
 * Client de base pour les scripts (migration, seed, remise à zéro).
 *
 * Deux cibles possibles :
 *   - Neon, si DATABASE_URL est renseignée ;
 *   - PGlite (Postgres compilé en WebAssembly, dossier .pglite/), sinon.
 *
 * PGlite permet de vérifier migrations et seed en local, sans daemon Docker et
 * sans manipuler les identifiants Neon. Le SQL exécuté est le même.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";

if (existsSync(".env.local")) config({ path: ".env.local", quiet: true });
else if (existsSync(".env")) config({ path: ".env", quiet: true });

export type SqlRunner = {
  execute: (sql: string) => Promise<void>;
  query: <T = Record<string, unknown>>(sql: string) => Promise<T[]>;
  label: string;
  close: () => Promise<void>;
};

export async function openDatabase(): Promise<SqlRunner> {
  // `||` et non `??` : une variable *présente mais vide* — un gabarit d'env où
  // la ligne existe sans valeur — doit se comporter comme une absence. Avec
  // `??`, une chaîne vide gagnait sur `DATABASE_URL` renseignée, et le script
  // basculait sur PGlite sans rien dire : on croyait viser Neon.
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

  // Demander une base locale nommée l'emporte sur `.env.local`. Vider les
  // variables Neon ne suffit pas : sous PowerShell, une variable vidée est
  // supprimée, et dotenv la recharge aussitôt depuis le fichier — un essai
  // local partait alors écrire sur la production.
  if (url && !process.env.PGLITE_DIR) {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(url);
    return {
      label: `Neon (${new URL(url.replace(/^postgres(ql)?:/, "https:")).host})`,
      execute: async (statement) => {
        await sql.query(statement);
      },
      query: async <T>(statement: string) => (await sql.query(statement)) as T[],
      close: async () => {},
    };
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite(process.env.PGLITE_DIR ?? ".pglite");
  return {
    label: `PGlite locale (${process.env.PGLITE_DIR ?? ".pglite"}/)`,
    execute: async (statement) => {
      await db.exec(statement);
    },
    query: async <T>(statement: string) => (await db.query<T>(statement)).rows,
    close: async () => {
      await db.close();
    },
  };
}

/** Applique les migrations générées par drizzle-kit, dans l'ordre. */
export async function applyMigrations(db: SqlRunner): Promise<string[]> {
  const dir = "drizzle";
  if (!existsSync(dir)) throw new Error("Dossier drizzle/ absent. Lance d'abord npm run db:generate.");

  await db.execute(
    `create table if not exists _migrations (
       name text primary key,
       applied_at timestamptz not null default now()
     )`,
  );

  const applied = new Set(
    (await db.query<{ name: string }>("select name from _migrations")).map((row) => row.name),
  );

  const files = readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  const run: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(dir, file), "utf8");
    // drizzle-kit sépare les instructions par ce marqueur.
    for (const statement of sql.split("--> statement-breakpoint")) {
      const trimmed = statement.trim();
      if (trimmed) await db.execute(trimmed);
    }
    await db.execute(`insert into _migrations (name) values ('${file}')`);
    run.push(file);
  }
  return run;
}

/** Échappe une valeur pour une insertion SQL littérale. */
export function q(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  return `'${value.replace(/'/g, "''")}'`;
}
