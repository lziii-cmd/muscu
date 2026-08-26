import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db/client";
import { getSession, hashPassword, verifyPassword } from "@/lib/auth/session";

export const runtime = "nodejs";

const body = z.object({
  password: z.string().min(1).max(200),
  create: z.boolean().default(false),
});

/**
 * Connexion, ou création du mot de passe au premier lancement.
 *
 * La création n'est possible que tant qu'aucun mot de passe n'existe : sinon
 * n'importe qui pourrait réinitialiser le compte en appelant cette route.
 */
export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "requête invalide" }, { status: 400 });
  }

  const db = getDb();
  const [settings] = await db.select().from(schema.settings).where(eq(schema.settings.id, 1));

  if (!settings) {
    return NextResponse.json(
      { error: "base non initialisée — lance npm run db:seed" },
      { status: 503 },
    );
  }

  if (parsed.data.create) {
    if (settings.passwordHash) {
      return NextResponse.json({ error: "un mot de passe existe déjà" }, { status: 409 });
    }
    if (parsed.data.password.length < 8) {
      return NextResponse.json({ error: "8 caractères minimum" }, { status: 400 });
    }

    const hash = await hashPassword(parsed.data.password);
    await db
      .update(schema.settings)
      .set({ passwordHash: hash, updatedAt: new Date() })
      .where(eq(schema.settings.id, 1));
  } else {
    if (!settings.passwordHash) {
      return NextResponse.json({ error: "aucun mot de passe défini" }, { status: 409 });
    }
    const valid = await verifyPassword(parsed.data.password, settings.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "mot de passe incorrect" }, { status: 401 });
    }
  }

  const session = await getSession();
  session.authenticated = true;
  session.since = new Date().toISOString();
  await session.save();

  return NextResponse.json({ ok: true });
}
