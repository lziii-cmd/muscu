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
 * Ne touche JAMAIS à la base de production : les variables Neon sont retirées de
 * l'environnement avant toute connexion, y compris pour les processus enfants.
 * Une garde qui se contenterait de refuser de tourner rendrait le test
 * inutilisable dès que le projet est branché sur Neon.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
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
  // Les échelles n'existent plus dans la version 2 : la page tient sur le max et les objectifs.
  { path: "/calisthenie", expect: ["Calisthénie", "Max tractions", "Objectifs jalonnés"] },
  { path: "/corps", expect: ["Corps", "Pesée"] },
  { path: "/tests", expect: ["Tests & contrôles", "Test de force"] },
  { path: "/diete", expect: ["Diète", "Protéines", "Huile", "Repas de la journée"] },
  { path: "/sommeil", expect: ["Sommeil", "Nuit dernière"] },
  { path: "/bilan", expect: ["Bilan de la semaine"] },
  { path: "/exercices", expect: ["Exercices"] },
  { path: "/guide", expect: ["Comment faire", "Position —", "À éviter —"] },
  { path: "/programme", expect: ["Programme", "Séances prévues", "semaine en cours"] },
  { path: "/seance/2026-08-26", expect: ["août"] },
  { path: "/compte", expect: ["Smoke", "Profil", "Mot de passe", "Pesée du jour", "Fiche"] },
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
  /*
   * Neon est écarté de l'environnement avant la moindre connexion. Les
   * processus enfants héritent de `process.env` : les supprimer ici suffit à
   * garantir que ni le seed ni le serveur de test ne verront la production.
   */
  const hadProduction = Boolean(process.env.DATABASE_URL);

  /*
   * Les variables sont mises à la chaîne vide, pas supprimées, et transmises
   * telles quelles aux processus enfants.
   *
   * Les supprimer ne suffit pas : chaque enfant recharge `.env.local` par
   * dotenv et y retrouve l'URL Neon. dotenv, lui, n'écrase jamais une variable
   * déjà présente — une chaîne vide compte comme présente, et reste falsy.
   */
  process.env.DATABASE_URL = "";
  process.env.DATABASE_URL_UNPOOLED = "";
  if (hadProduction) {
    console.log("  base de production neutralisée : le test tourne sur PGlite");
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

  const otherPassword = randomBytes(12).toString("hex");
  const otherSalt = randomBytes(16);
  const otherDerived = await scryptAsync(otherPassword, otherSalt, 64, { N: 16384, r: 8, p: 1 });
  const otherHash = `scrypt$${otherSalt.toString("hex")}$${otherDerived.toString("hex")}`;

  const adminPassword = randomBytes(12).toString("hex");
  const adminSalt = randomBytes(16);
  const adminDerived = await scryptAsync(adminPassword, adminSalt, 64, { N: 16384, r: 8, p: 1 });
  const adminHash = `scrypt$${adminSalt.toString("hex")}$${adminDerived.toString("hex")}`;

  await db.execute(
    `insert into users (username, password_hash, display_name, role, uses_default_password)
     values ('smoke', ${q(hash)}, 'Smoke', 'user', false),
            ('smoke-admin', ${q(adminHash)}, 'Smoke admin', 'admin', false),
            ('smoke-autre', ${q(otherHash)}, 'Smoke autre', 'user', false)`,
  );
  await db.close();

  console.log("  import du référentiel…");
  await new Promise<void>((resolve, reject) => {
    const seed = spawn("npx", ["tsx", "scripts/seed.ts", "--user", "smoke"], {
      env: { ...process.env, PGLITE_DIR, DATABASE_URL: "", DATABASE_URL_UNPOOLED: "" },
      stdio: "inherit",
      shell: true,
    });
    seed.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`seed a échoué (${code})`))));
  });

  // Un serveur oublié par une exécution précédente répondrait avec du code
  // périmé, et produirait des échecs incompréhensibles.
  try {
    const stale = await fetch(`${BASE}/login`, { redirect: "manual" });
    if (stale.status < 500) {
      console.error(
        `✗ Le port ${PORT} est déjà occupé par un serveur. Arrête-le avant de relancer le test.`,
      );
      process.exit(1);
    }
  } catch {
    // port libre, c'est ce qu'on veut
  }

  console.log(`  démarrage du serveur sur le port ${PORT}…`);
  server = spawn("npx", ["next", "start", "-p", String(PORT)], {
    env: { ...process.env, PGLITE_DIR, DATABASE_URL: "", DATABASE_URL_UNPOOLED: "" },
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
    body: JSON.stringify({ username: "smoke", password }),
  });

  if (!login.ok) {
    console.error(`✗ Connexion refusée (${login.status}) :`, await login.text());
    stopServer();
    process.exit(1);
  }

  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) {
    console.error("✗ Aucun cookie de session renvoyé.");
    stopServer();
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

  /*
   * Une écriture passée par l'API doit être visible sur la page qui la lit.
   *
   * Ce contrôle vise un défaut précis : Next découpe pages et routes d'API en
   * graphes de modules distincts, et un client de base mémorisé par module y
   * est dupliqué. En local, cela donnait deux instances PGlite sur le même
   * dossier — la synchronisation répondait « ok » et l'écran restait vide.
   */
  const pesee = await fetch(`${BASE}/api/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({
      id: `smoke-poids-${Date.now()}`,
      kind: "bodyweight.upsert",
      payload: { date: "2026-08-26", weightKg: 74.2 },
    }),
  });
  const corps = await fetch(`${BASE}/corps`, { headers: { cookie } });
  const corpsBody = corps.ok ? decodeEntities(await corps.text()) : "";

  if (pesee.ok && corpsBody.includes("74.2")) {
    console.log("  ✓ écriture relue par la page  pesée visible sur /corps");
  } else {
    console.log(`  ✗ écriture relue par la page  sync ${pesee.status}, pesée absente de /corps`);
    failures++;
  }

  /*
   * Une séance déclarée manquée doit afficher son motif.
   *
   * Elle n'a par définition aucun exercice à montrer : sans le motif, la carte
   * se lit comme un enregistrement vide, c'est-à-dire comme une saisie perdue.
   */
  const manquee = await fetch(`${BASE}/api/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({
      id: `smoke-manquee-${Date.now()}`,
      kind: "session.miss",
      payload: {
        date: "2026-08-26",
        slot: "salle",
        status: "missed",
        missedReason: "salle_indisponible",
        loggedAt: new Date().toISOString(),
      },
    }),
  });
  const jour = await fetch(`${BASE}/api/jour/2026-08-26`, { headers: { cookie } });
  const jourBody = jour.ok ? ((await jour.json()) as { sessions: { slot: string; logged: { status: string; missedReason: string | null } | null }[] }) : null;
  const salle = jourBody?.sessions.find((session) => session.slot === "salle");

  if (manquee.ok && salle?.logged?.status === "missed" && salle.logged.missedReason === "salle_indisponible") {
    console.log("  ✓ séance manquée               motif conservé et renvoyé");
  } else {
    console.log(`  ✗ séance manquée               motif absent (${manquee.status})`);
    failures++;
  }

  /*
   * Cloisonnement des données : deux comptes qui se pèsent le même jour ne
   * doivent jamais voir le poids de l'autre. C'est la propriété qui justifie
   * `user_id` dans les index d'unicité — sans lui, la seconde pesée entrerait
   * en conflit avec la première au lieu de coexister.
   */
  const otherLogin = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "smoke-autre", password: otherPassword }),
  });
  const otherCookie = otherLogin.headers.get("set-cookie")?.split(";")[0];

  if (!otherCookie) {
    console.log("  ✗ cloisonnement               connexion du second compte impossible");
    failures++;
  } else {
    await fetch(`${BASE}/api/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: otherCookie },
      body: JSON.stringify({
        id: `smoke-poids-autre-${Date.now()}`,
        kind: "bodyweight.upsert",
        payload: { date: "2026-08-26", weightKg: 55.5 },
      }),
    });

    const sien = await fetch(`${BASE}/corps`, { headers: { cookie: otherCookie } });
    const sienBody = sien.ok ? decodeEntities(await sien.text()) : "";
    const mien = await fetch(`${BASE}/corps`, { headers: { cookie } });
    const mienBody = mien.ok ? decodeEntities(await mien.text()) : "";

    const chacunLeSien =
      sienBody.includes("55.5") &&
      !sienBody.includes("74.2") &&
      mienBody.includes("74.2") &&
      !mienBody.includes("55.5");

    if (chacunLeSien) {
      console.log("  ✓ cloisonnement               chacun ne voit que sa pesée");
    } else {
      console.log("  ✗ cloisonnement               une pesée a franchi la frontière des comptes");
      failures++;
    }
  }

  /*
   * Cloisonnement : un compte ordinaire ne doit pas atteindre l'administration,
   * ni par la page ni par l'API. C'est la garantie qui empêche l'un des comptes
   * de remettre à zéro le mot de passe de l'autre.
   */
  const forbiddenPage = await fetch(`${BASE}/admin`, { headers: { cookie }, redirect: "manual" });
  if (forbiddenPage.status === 307 || forbiddenPage.status === 302) {
    console.log("  ✓ /admin sans le rôle         redirigé comme attendu");
  } else {
    console.log(`  ✗ /admin sans le rôle         ${forbiddenPage.status} au lieu d'une redirection`);
    failures++;
  }

  const forbiddenApi = await fetch(`${BASE}/api/admin/users`, { headers: { cookie } });
  if (forbiddenApi.status === 403) {
    console.log("  ✓ /api/admin/users sans rôle  403 comme attendu");
  } else {
    console.log(`  ✗ /api/admin/users sans rôle  ${forbiddenApi.status} au lieu de 403`);
    failures++;
  }

  const adminLogin = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "smoke-admin", password: adminPassword }),
  });
  const adminCookie = adminLogin.headers.get("set-cookie")?.split(";")[0];

  if (!adminCookie) {
    console.log("  ✗ connexion administrateur    aucun cookie renvoyé");
    failures++;
  } else {
    const adminPage = await fetch(`${BASE}/admin`, {
      headers: { cookie: adminCookie },
      redirect: "manual",
    });
    const adminBody = adminPage.ok ? decodeEntities(await adminPage.text()) : "";
    if (adminPage.ok && adminBody.includes("Comptes") && adminBody.includes("Nouveau compte")) {
      console.log("  ✓ /admin                      liste des comptes");
    } else {
      console.log(`  ✗ /admin                      HTTP ${adminPage.status}`);
      failures++;
    }
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
      // Arrêt SYNCHRONE : `process.exit` suit immédiatement, un kill asynchrone
      // n'aurait pas le temps d'agir et le serveur survivrait à l'exécution.
      spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
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
