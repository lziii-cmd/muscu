/**
 * Test de fumée : vérifie que chaque page répond et contient ce qu'on attend,
 * et que l'API de synchronisation se comporte correctement.
 *
 *   npm run build && npm run smoke
 *
 * Le test est autonome : il monte SA PROPRE base PGlite et lance SON PROPRE
 * serveur sur un port libre. PGlite est mono-processus — partager le dossier
 * avec un serveur de développement déjà lancé donnerait des lectures
 * incohérentes, ce qui produirait des échecs qui n'existent pas.
 *
 * Ne s'exécute jamais en production : il refuse de démarrer si DATABASE_URL est
 * renseignée.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { rmSync } from "node:fs";
import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";
import { applyMigrations, openDatabase, q } from "./db";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
) => Promise<Buffer>;

const PGLITE_DIR = ".pglite-smoke";
const PORT = 3411;
const BASE = `http://127.0.0.1:${PORT}`;

function decodeEntities(html: string): string {
  return html
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

const PAGES: { path: string; expect: string[] }[] = [
  { path: "/", expect: ["Aujourd'hui"] },
  { path: "/journal", expect: ["Journal", "Calendrier du programme", "Assiduité par créneau"] },
  { path: "/progression", expect: ["Progression"] },
  { path: "/calisthenie", expect: ["Calisthénie", "échelles", "Max tractions"] },
  { path: "/corps", expect: ["Corps", "Pesée"] },
  { path: "/tests", expect: ["Tests & contrôles", "Test de force"] },
  { path: "/diete", expect: ["Diète", "Protéines", "Huile", "Repas de la journée"] },
  { path: "/sommeil", expect: ["Sommeil", "Nuit dernière"] },
  { path: "/bilan", expect: ["Bilan de la semaine"] },
  { path: "/exercices", expect: ["Exercices"] },
  { path: "/seance/2026-08-26", expect: ["août"] },
];

/** Attend que le serveur réponde, ou abandonne. */
async function waitForServer(timeoutMs = 60_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE}/login`, { redirect: "manual" });
      if (response.status < 500) return true;
    } catch {
      // pas encore prêt
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

async function main() {
  if (process.env.DATABASE_URL) {
    console.error("✗ SMOKE refusé : DATABASE_URL est renseignée. Ce script est réservé au local.");
    process.exit(1);
  }

  // Base dédiée, repartie de zéro à chaque exécution.
  rmSync(PGLITE_DIR, { recursive: true, force: true });
  process.env.PGLITE_DIR = PGLITE_DIR;

  console.log("  préparation de la base de test…");
  const db = await openDatabase();
  await applyMigrations(db);

  // Mot de passe jetable, régénéré à chaque exécution.
  const password = randomBytes(12).toString("hex");
  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  const hash = `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;

  await db.execute(`insert into settings (id) values (1) on conflict (id) do nothing`);
  await db.execute(`update settings set password_hash = ${q(hash)} where id = 1`);
  await db.close();

  console.log("  import du référentiel…");
  await new Promise<void>((resolve, reject) => {
    const seed = spawn("npx", ["tsx", "scripts/seed.ts"], {
      env: { ...process.env, PGLITE_DIR },
      stdio: "ignore",
      shell: true,
    });
    seed.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`seed a échoué (${code})`))));
  });

  console.log(`  démarrage du serveur sur le port ${PORT}…`);
  server = spawn("npx", ["next", "start", "-p", String(PORT)], {
    env: { ...process.env, PGLITE_DIR },
    stdio: "ignore",
    shell: true,
  });

  if (!(await waitForServer())) {
    console.error("✗ Le serveur n'a pas démarré à temps.");
    stopServer();
    process.exit(1);
  }

  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password, create: false }),
  });

  if (!login.ok) {
    console.error(`✗ Connexion refusée (${login.status}) :`, await login.text());
    process.exit(1);
  }

  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) {
    console.error("✗ Aucun cookie de session renvoyé.");
    process.exit(1);
  }

  let failures = 0;

  for (const page of PAGES) {
    const response = await fetch(`${BASE}${page.path}`, {
      headers: { cookie },
      redirect: "manual",
    });
    // React échappe les entités HTML : « Aujourd'hui » sort en
    // « Aujourd&#x27;hui ». On décode avant de comparer, sinon le test échoue
    // sur du texte pourtant correct.
    const body = response.ok ? decodeEntities(await response.text()) : "";
    const missing = page.expect.filter((needle) => !body.includes(needle));

    if (!response.ok) {
      console.log(`  ✗ ${page.path.padEnd(24)} HTTP ${response.status}`);
      failures++;
    } else if (missing.length > 0) {
      console.log(`  ✗ ${page.path.padEnd(24)} contenu manquant : ${missing.join(", ")}`);
      failures++;
    } else {
      console.log(`  ✓ ${page.path.padEnd(24)} ${(body.length / 1024).toFixed(0)} Ko`);
    }
  }

  // L'API de synchronisation doit refuser une requête non authentifiée.
  const unauthorized = await fetch(`${BASE}/api/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "x", kind: "oil.upsert", payload: { date: "2026-08-26", value: 1 } }),
  });
  if (unauthorized.status === 401) {
    console.log("  ✓ /api/sync sans session      401 comme attendu");
  } else {
    console.log(`  ✗ /api/sync sans session      ${unauthorized.status} au lieu de 401`);
    failures++;
  }

  // Et l'accepter avec session, de façon idempotente.
  const mutation = { id: `smoke-${Date.now()}`, kind: "oil.upsert", payload: { date: "2026-08-26", value: 2 } };
  const first = await fetch(`${BASE}/api/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify(mutation),
  });
  const second = await fetch(`${BASE}/api/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify(mutation),
  });
  const secondBody = (await second.json()) as { duplicate?: boolean };

  if (first.ok && second.ok && secondBody.duplicate === true) {
    console.log("  ✓ /api/sync idempotent        rejeu détecté");
  } else {
    console.log(`  ✗ /api/sync idempotent        ${first.status}/${second.status}`);
    failures++;
  }

  // Une mutation invalide doit être rejetée en 422, pour que le client la retire
  // de sa file au lieu de la rejouer indéfiniment.
  const invalid = await fetch(`${BASE}/api/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ id: "bad", kind: "oil.upsert", payload: { date: "pas-une-date", value: 1 } }),
  });
  if (invalid.status === 422) {
    console.log("  ✓ /api/sync mutation invalide 422 comme attendu");
  } else {
    console.log(`  ✗ /api/sync mutation invalide ${invalid.status} au lieu de 422`);
    failures++;
  }

  stopServer();
  rmSync(PGLITE_DIR, { recursive: true, force: true });

  console.log(
    failures === 0 ? "\n✓ Test de fumée : tout passe." : `\n✗ Test de fumée : ${failures} échec(s).`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

let server: ChildProcess | null = null;

function stopServer() {
  if (!server?.pid) return;
  // Le serveur est lancé via un shell : il faut tuer l'arbre complet, sinon le
  // port reste occupé par le processus Node fils.
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      server.kill("SIGTERM");
    }
  } catch {
    server.kill("SIGTERM");
  }
  server = null;
}

process.on("SIGINT", () => {
  stopServer();
  process.exit(130);
});

main().catch((error) => {
  console.error("✗ Test de fumée en erreur :", error instanceof Error ? error.message : error);
  stopServer();
  process.exit(1);
});
