import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { AdminUsers, type AdminUser } from "@/components/account/admin-users";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getDb, schema } from "@/lib/db/client";

export const metadata = { title: "Comptes" };

/**
 * Gestion des comptes.
 *
 * Redirection plutôt qu'erreur quand le rôle manque : un compte ordinaire qui
 * tombe sur l'adresse n'a pas à voir une page d'erreur, il n'a rien fait de mal.
 */
export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/compte");

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

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Comptes</h1>
        <p className="mt-1 text-sm text-muted">
          Chaque compte a son propre programme et son propre journal. L&apos;administration ne donne
          pas accès aux données d&apos;entraînement des autres.
        </p>
      </header>

      <AdminUsers users={rows as AdminUser[]} currentUserId={user.id} />
    </div>
  );
}
