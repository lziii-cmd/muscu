import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { hashPassword } from "@/lib/auth/session";

export const runtime = "nodejs";

const body = z.object({
  password: z.string().min(8).max(200).optional(),
  displayName: z.string().min(1).max(60).optional(),
  role: z.enum(["user", "admin"]).optional(),
});

/**
 * Modification d'un compte par l'administrateur.
 *
 * Le mot de passe est remplacé sans demander l'ancien : c'est précisément à ça
 * que sert le rôle, quand quelqu'un a oublié le sien. Le compte est alors
 * remis en « mot de passe provisoire » pour que le bandeau réapparaisse.
 */
export async function PATCH(request: Request, { params }: RouteContext<"/api/admin/users/[id]">) {
  const admin = await getCurrentUser();
  if (!admin) return NextResponse.json({ error: "non connecté" }, { status: 401 });
  if (admin.role !== "admin") return NextResponse.json({ error: "réservé à l'administrateur" }, { status: 403 });

  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "compte invalide" }, { status: 400 });

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const first = parsed.error?.issues[0]?.message ?? "requête invalide";
    return NextResponse.json({ error: first }, { status: 400 });
  }

  const db = getDb();
  const [target] = await db.select().from(schema.users).where(eq(schema.users.id, id));
  if (!target) return NextResponse.json({ error: "compte introuvable" }, { status: 404 });

  // Se retirer soi-même le rôle admin fermerait la porte de l'extérieur s'il
  // n'y a qu'un administrateur.
  if (parsed.data.role === "user" && target.id === admin.id) {
    return NextResponse.json(
      { error: "Impossible de retirer son propre rôle d'administrateur." },
      { status: 400 },
    );
  }

  const changes: Partial<typeof schema.users.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.displayName) changes.displayName = parsed.data.displayName.trim();
  if (parsed.data.role) changes.role = parsed.data.role;
  if (parsed.data.password) {
    changes.passwordHash = await hashPassword(parsed.data.password);
    changes.usesDefaultPassword = true;
  }

  await db.update(schema.users).set(changes).where(eq(schema.users.id, id));
  return NextResponse.json({ ok: true });
}

/**
 * Suppression d'un compte.
 *
 * Les clés étrangères sont en cascade : le programme, le journal et les
 * mesures du compte partent avec lui. C'est irréversible, l'interface le
 * demande deux fois.
 */
export async function DELETE(_request: Request, { params }: RouteContext<"/api/admin/users/[id]">) {
  const admin = await getCurrentUser();
  if (!admin) return NextResponse.json({ error: "non connecté" }, { status: 401 });
  if (admin.role !== "admin") return NextResponse.json({ error: "réservé à l'administrateur" }, { status: 403 });

  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "compte invalide" }, { status: 400 });
  if (id === admin.id) {
    return NextResponse.json({ error: "Impossible de supprimer son propre compte." }, { status: 400 });
  }

  const db = getDb();
  await db.delete(schema.users).where(eq(schema.users.id, id));
  return NextResponse.json({ ok: true });
}
