import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { hashPassword } from "@/lib/auth/session";

export const runtime = "nodejs";

const body = z.object({
  username: z
    .string()
    .min(2)
    .max(60)
    // Un identifiant sert à se connecter au clavier d'un téléphone : on écarte
    // les espaces et les accents, sources d'échecs de connexion incompréhensibles.
    .regex(/^[a-z0-9._-]+$/, "Identifiant : lettres minuscules, chiffres, . _ - uniquement."),
  displayName: z.string().min(1).max(60),
  password: z.string().min(8).max(200),
  role: z.enum(["user", "admin"]).default("user"),
});

/** Création d'un compte. Réservé à l'administrateur. */
export async function POST(request: Request) {
  const admin = await getCurrentUser();
  if (!admin) return NextResponse.json({ error: "non connecté" }, { status: 401 });
  if (admin.role !== "admin") return NextResponse.json({ error: "réservé à l'administrateur" }, { status: 403 });

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const first = parsed.error?.issues[0]?.message ?? "requête invalide";
    return NextResponse.json({ error: first }, { status: 400 });
  }

  const db = getDb();
  const username = parsed.data.username.trim().toLowerCase();

  const [existing] = await db.select().from(schema.users).where(eq(schema.users.username, username));
  if (existing) {
    return NextResponse.json({ error: `L'identifiant « ${username} » est déjà pris.` }, { status: 409 });
  }

  const [created] = await db
    .insert(schema.users)
    .values({
      username,
      displayName: parsed.data.displayName.trim(),
      passwordHash: await hashPassword(parsed.data.password),
      role: parsed.data.role,
      usesDefaultPassword: true,
    })
    .returning({ id: schema.users.id });

  return NextResponse.json({ ok: true, id: created.id });
}

/** Liste des comptes, sans les empreintes de mot de passe. */
export async function GET() {
  const admin = await getCurrentUser();
  if (!admin) return NextResponse.json({ error: "non connecté" }, { status: 401 });
  if (admin.role !== "admin") return NextResponse.json({ error: "réservé à l'administrateur" }, { status: 403 });

  const db = getDb();
  const rows = await db
    .select({
      id: schema.users.id,
      username: schema.users.username,
      displayName: schema.users.displayName,
      role: schema.users.role,
      usesDefaultPassword: schema.users.usesDefaultPassword,
    })
    .from(schema.users)
    .orderBy(asc(schema.users.id));

  return NextResponse.json({ users: rows });
}
