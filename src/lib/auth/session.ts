import "server-only";
import { getIronSession, type IronSession } from "iron-session";
import { cookies } from "next/headers";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/*
 * Authentification.
 *
 * Plusieurs comptes, chacun avec son programme et son journal. Le rôle
 * `admin` ne donne pas accès aux données d'entraînement des autres : il permet
 * de gérer les comptes, rien de plus.
 *
 * Le hachage utilise scrypt, fourni par Node : mémoire-dur, résistant aux
 * attaques par GPU, et sans dépendance native à compiler.
 */

// Le type promisifié de `scrypt` n'expose pas la surcharge avec options ;
// on la rétablit explicitement pour pouvoir régler le coût du hachage.
const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
) => Promise<Buffer>;

const SCRYPT_KEYLEN = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1 };

export interface SessionData {
  userId?: number;
  username?: string;
  role?: "user" | "admin";
  since?: string;
}

function sessionSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "AUTH_SECRET manquante ou trop courte (32 caractères minimum). Voir .env.example.",
    );
  }
  return secret;
}

export async function getSession(): Promise<IronSession<SessionData>> {
  // Next 16 : cookies() est asynchrone, l'accès synchrone a été supprimé.
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, {
    password: sessionSecret(),
    cookieName: "muscu_session",
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      // Le programme dure 17 semaines : inutile de redemander le mot de passe
      // chaque semaine sur un téléphone personnel.
      maxAge: 60 * 60 * 24 * 180,
    },
  });
}

export async function isAuthenticated(): Promise<boolean> {
  const session = await getSession();
  return typeof session.userId === "number";
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scryptAsync(password, salt, SCRYPT_KEYLEN, SCRYPT_OPTIONS)) as Buffer;
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;

  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const derived = (await scryptAsync(password, salt, expected.length, SCRYPT_OPTIONS)) as Buffer;

  // Comparaison à temps constant : une comparaison naïve laisse fuiter la
  // longueur du préfixe correct.
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
