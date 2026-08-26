import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { PasswordForm } from "@/components/account/password-form";
import { LogoutButton } from "@/components/account/logout-button";
import { requireUser } from "@/lib/auth/current-user";

export const metadata = { title: "Compte" };

/**
 * Compte : identité, mot de passe, déconnexion.
 *
 * Les données d'entraînement sont cloisonnées par compte ; cette page est le
 * seul endroit où l'on voit sous quelle identité on travaille.
 */
export default async function ComptePage() {
  const user = await requireUser();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Compte</h1>
        <p className="mt-1 text-sm text-muted">
          Connecté en tant que <span className="text-text">{user.displayName}</span> ·{" "}
          <code className="text-faint">{user.username}</code>
          {user.role === "admin" ? " · administrateur" : null}
        </p>
      </header>

      {user.usesDefaultPassword ? (
        <p className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
          Ce compte utilise encore son mot de passe d'origine. L'application est accessible depuis
          Internet : change-le maintenant.
        </p>
      ) : null}

      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="mb-4 text-sm font-medium">Changer mon mot de passe</h2>
        <PasswordForm />
      </section>

      {user.role === "admin" ? (
        <Link
          href="/admin"
          className="tap flex items-center justify-center gap-2 rounded-xl border border-accent/40 bg-accent/10 px-4 text-sm text-accent"
        >
          <ShieldCheck size={16} aria-hidden />
          Gérer les comptes
        </Link>
      ) : null}

      <LogoutButton />
    </div>
  );
}
