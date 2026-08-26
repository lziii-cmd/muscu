import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db/client";
import { getSession, verifyPassword } from "@/lib/auth/session";

export const runtime = "nodejs";

const body = z.object({
  username: z.string().min(1).max(60),
  password: z.string().min(1).max(200),
});

/**
 * Connexion.
 *
 * Les comptes sont créés par l'administrateur, pas par ce point d'entrée : une
 * inscription libre sur une adresse publique donnerait à n'importe qui un accès
 * à l'application.
 */
export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "requête invalide" }, { status: 400 });
  }

  const db = getDb();
  const username = parsed.data.username.trim().toLowerCase();

  const [user] = await db.select().from(schema.users).where(eq(schema.users.username, username));

  /*
   * Même message et même travail de hachage que l'identifiant existe ou non :
   * sans cela, le temps de réponse indiquerait quels comptes existent.
   */
  const reference =
    user?.passwordHash ??
    "scrypt$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000";
  const passwordMatches = await verifyPassword(parsed.data.password, reference);

  if (!user || !passwordMatches) {
    return NextResponse.json({ error: "identifiant ou mot de passe incorrect" }, { status: 401 });
  }

  const session = await getSession();
  session.userId = user.id;
  session.username = user.username;
  session.role = user.role as "user" | "admin";
  session.since = new Date().toISOString();
  await session.save();

  return NextResponse.json({
    ok: true,
    role: user.role,
    usesDefaultPassword: user.usesDefaultPassword,
  });
}
