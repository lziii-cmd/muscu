/**
 * Gestion des comptes en ligne de commande.
 *
 *   npm run users -- list
 *   npm run users -- create --user abdou --name Abdou --password "…" --role user
 *   npm run users -- password --user abdou --password "…"
 *   npm run users -- rename --user abdou --name Abdou
 *   npm run users -- delete --user untel
 *
 * Les mots de passe passent par argument et ne sont jamais écrits dans le
 * dépôt : ce fichier ne contient aucune valeur en dur.
 *
 * L'administration se fait aussi depuis l'application, mais ce script permet de
 * créer le tout premier compte, quand personne ne peut encore se connecter.
 */
import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";
import { openDatabase, q } from "./db";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
) => Promise<Buffer>;

/** Même format que `src/lib/auth/session.ts` : scrypt, sel aléatoire. */
async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

function argument(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

async function main() {
  const command = process.argv[2];
  const db = await openDatabase();
  console.log(`Base : ${db.label}`);

  if (command === "list") {
    const rows = await db.query(
      `select id, username, display_name, role, uses_default_password, created_at
       from users order by id`,
    );
    console.table(rows);
    await db.close();
    return;
  }

  const username = (argument("user") ?? "").trim().toLowerCase();
  if (username === "") fail("Précise le compte : --user abdou");

  if (command === "create") {
    const password = argument("password") ?? "";
    const displayName = argument("name") ?? username;
    const role = argument("role") ?? "user";

    if (password.length < 5) fail("Mot de passe trop court.");
    if (role !== "user" && role !== "admin") fail("Rôle attendu : user ou admin.");

    const existing = await db.query(`select id from users where username = ${q(username)}`);
    if (existing.length > 0) fail(`Le compte « ${username} » existe déjà.`);

    const hash = await hashPassword(password);
    await db.execute(
      `insert into users (username, password_hash, display_name, role, uses_default_password)
       values (${q(username)}, ${q(hash)}, ${q(displayName)}, ${q(role)}, true)`,
    );
    console.log(`✓ Compte « ${username} » créé (${role}).`);
    if (password.length < 8) {
      console.log("  ⚠ Mot de passe court : à changer depuis l'application.");
    }
  } else if (command === "password") {
    const password = argument("password") ?? "";
    if (password.length < 5) fail("Mot de passe trop court.");

    const hash = await hashPassword(password);
    const rows = await db.query(
      `update users set password_hash = ${q(hash)}, uses_default_password = true,
              updated_at = now()
       where username = ${q(username)} returning id`,
    );
    if (rows.length === 0) fail(`Compte « ${username} » introuvable.`);
    console.log(`✓ Mot de passe de « ${username} » remplacé.`);
  } else if (command === "rename") {
    const displayName = (argument("name") ?? "").trim();
    if (displayName === "") fail("Précise le nom affiché : --name Abdou");

    const rows = await db.query(
      `update users set display_name = ${q(displayName)}, updated_at = now()
       where username = ${q(username)} returning id`,
    );
    if (rows.length === 0) fail(`Compte « ${username} » introuvable.`);
    console.log(`✓ « ${username} » s'affiche désormais « ${displayName} ».`);
  } else if (command === "delete") {
    // La suppression emporte le programme et le journal du compte : les clés
    // étrangères sont en cascade.
    const rows = await db.query(`delete from users where username = ${q(username)} returning id`);
    if (rows.length === 0) fail(`Compte « ${username} » introuvable.`);
    console.log(`✓ Compte « ${username} » supprimé, avec son programme et son journal.`);
  } else {
    fail("Commande attendue : list | create | password | rename | delete");
  }

  await db.close();
}

main().catch((error) => {
  console.error("✗ Échec :", error instanceof Error ? error.message : error);
  process.exit(1);
});
