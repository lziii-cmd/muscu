import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { hashPassword, verifyPassword } from "@/lib/auth/session";

export const runtime = "nodejs";

const body = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8).max(200),
});

/**
 * Changement de son propre mot de passe.
 *
 * L'ancien mot de passe est redemandé : un téléphone laissé déverrouillé ne
 * doit pas suffire à verrouiller le compte de son propriétaire.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "non connecté" }, { status: 401 });

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Mot de passe trop court (8 caractères minimum)." }, { status: 400 });
  }

  const db = getDb();
  const [row] = await db.select().from(schema.users).where(eq(schema.users.id, user.id));
  if (!row) return NextResponse.json({ error: "compte introuvable" }, { status: 404 });

  if (!(await verifyPassword(parsed.data.currentPassword, row.passwordHash))) {
    return NextResponse.json({ error: "Mot de passe actuel incorrect." }, { status: 403 });
  }

  await db
    .update(schema.users)
    .set({
      passwordHash: await hashPassword(parsed.data.newPassword),
      // Le bandeau d'avertissement disparaît dès que le mot de passe d'origine
      // n'est plus en place.
      usesDefaultPassword: false,
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, user.id));

  return NextResponse.json({ ok: true });
}
