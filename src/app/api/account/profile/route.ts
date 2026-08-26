import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db/client";
import { getCurrentUser } from "@/lib/auth/current-user";

export const runtime = "nodejs";

/**
 * Un champ vidé remet la valeur à « non renseigné » plutôt que de la laisser
 * telle quelle : sans ça, une valeur saisie par erreur serait impossible à
 * retirer depuis l'interface.
 */
const optionalNumber = z.union([z.number(), z.null()]);

const body = z.object({
  displayName: z.string().min(1).max(60).optional(),
  /* Bornes larges mais pas absurdes : elles n'ont pas vocation à juger le
   * corps de quelqu'un, seulement à rattraper une virgule mal placée. */
  heightCm: optionalNumber.refine((v) => v === null || (v >= 100 && v <= 250), {
    message: "Taille attendue entre 100 et 250 cm.",
  }).optional(),
  targetWeightKg: optionalNumber.refine((v) => v === null || (v >= 30 && v <= 250), {
    message: "Poids visé attendu entre 30 et 250 kg.",
  }).optional(),
  birthDate: z
    .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date attendue au format AAAA-MM-JJ."), z.null()])
    .optional(),
  proteinPerKgLow: z.number().min(0.5).max(5).optional(),
  proteinPerKgHigh: z.number().min(0.5).max(5).optional(),
  waterTargetLiters: z.number().min(0.5).max(10).optional(),
});

/** Mise à jour de sa propre fiche. Le mot de passe a sa propre route. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "non connecté" }, { status: 401 });

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const first = parsed.error?.issues[0]?.message ?? "Valeur invalide.";
    return NextResponse.json({ error: first }, { status: 400 });
  }

  const data = parsed.data;
  const low = data.proteinPerKgLow ?? user.proteinPerKgLow;
  const high = data.proteinPerKgHigh ?? user.proteinPerKgHigh;
  if (high < low) {
    return NextResponse.json(
      { error: "La borne haute de protéines doit être supérieure à la borne basse." },
      { status: 400 },
    );
  }

  const changes: Partial<typeof schema.users.$inferInsert> = { updatedAt: new Date() };
  if (data.displayName !== undefined) changes.displayName = data.displayName.trim();
  if (data.heightCm !== undefined) changes.heightCm = data.heightCm === null ? null : String(data.heightCm);
  if (data.targetWeightKg !== undefined) {
    changes.targetWeightKg = data.targetWeightKg === null ? null : String(data.targetWeightKg);
  }
  if (data.birthDate !== undefined) changes.birthDate = data.birthDate;
  if (data.proteinPerKgLow !== undefined) changes.proteinPerKgLow = String(data.proteinPerKgLow);
  if (data.proteinPerKgHigh !== undefined) changes.proteinPerKgHigh = String(data.proteinPerKgHigh);
  if (data.waterTargetLiters !== undefined) {
    changes.waterTargetLiters = String(data.waterTargetLiters);
  }

  const db = getDb();
  await db.update(schema.users).set(changes).where(eq(schema.users.id, user.id));

  return NextResponse.json({ ok: true });
}
