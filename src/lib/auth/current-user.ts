import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { getSession } from "./session";

/**
 * Compte connecté.
 *
 * Toutes les lectures de données passent par ici pour connaître leur portée :
 * deux personnes utilisent l'application, et aucune requête ne doit pouvoir
 * renvoyer les données de l'autre. Faire porter la portée par le serveur, et
 * non par un paramètre passé depuis la page, évite qu'un oubli d'appelant
 * expose le journal du voisin.
 *
 * `cache` mémorise le résultat pour la durée d'une requête : chaque page
 * enchaîne plusieurs requêtes, une seule lecture du compte suffit.
 */

export interface CurrentUser {
  id: number;
  username: string;
  displayName: string;
  role: "user" | "admin";
  usesDefaultPassword: boolean;
  heightCm: number | null;
  birthDate: string | null;
  targetWeightKg: number | null;
  proteinPerKgLow: number;
  proteinPerKgHigh: number;
  waterTargetLiters: number;
}

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getSession();
  if (typeof session.userId !== "number") return null;

  const db = getDb();
  const [row] = await db.select().from(schema.users).where(eq(schema.users.id, session.userId));
  if (!row) return null;

  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    role: row.role as "user" | "admin",
    usesDefaultPassword: row.usesDefaultPassword,
    heightCm: row.heightCm === null ? null : Number(row.heightCm),
    birthDate: row.birthDate,
    targetWeightKg: row.targetWeightKg === null ? null : Number(row.targetWeightKg),
    proteinPerKgLow: Number(row.proteinPerKgLow),
    proteinPerKgHigh: Number(row.proteinPerKgHigh),
    waterTargetLiters: Number(row.waterTargetLiters),
  };
});

/**
 * Compte connecté, ou erreur.
 *
 * Les pages sont déjà protégées par la coquille `(app)` : arriver ici sans
 * compte signale un défaut de programmation, pas une visite anonyme.
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Aucun compte connecté.");
  return user;
}

/** Identifiant du compte connecté, pour filtrer une requête. */
export async function currentUserId(): Promise<number> {
  return (await requireUser()).id;
}

/**
 * Compte connecté, à condition qu'il soit administrateur.
 *
 * Le rôle est relu en base à chaque appel plutôt que pris dans le cookie : un
 * rôle retiré doit prendre effet tout de suite, sans attendre l'expiration
 * d'une session de six mois.
 */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "admin") throw new Error("Réservé à l'administrateur.");
  return user;
}
