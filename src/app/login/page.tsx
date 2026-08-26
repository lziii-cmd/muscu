import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getSettings } from "@/lib/queries";
import { isAuthenticated } from "@/lib/auth/session";

/**
 * Connexion.
 *
 * Application mono-utilisateur : au premier lancement, il n'y a pas encore de
 * mot de passe et l'écran sert à en définir un. Ensuite il sert à se connecter.
 */
export default async function LoginPage() {
  if (await isAuthenticated()) redirect("/");

  let hasPassword = false;
  let databaseReady = true;

  try {
    const settings = await getSettings();
    hasPassword = Boolean(settings?.passwordHash);
  } catch {
    // Base non configurée ou injoignable : on le dit plutôt que d'afficher
    // un formulaire qui échouera de toute façon.
    databaseReady = false;
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Muscu</h1>
        <p className="mt-1 text-sm text-muted">24 août → 20 décembre 2026 · 17 semaines</p>
      </div>

      {!databaseReady ? (
        <div className="rounded-2xl border border-danger/40 bg-danger/5 p-4 text-sm">
          <p className="font-medium text-danger">Base de données injoignable</p>
          <p className="mt-1 text-muted">
            Renseigne <code className="text-text">DATABASE_URL</code> dans <code className="text-text">.env.local</code>,
            puis lance <code className="text-text">npm run db:migrate</code> et{" "}
            <code className="text-text">npm run db:seed</code>.
          </p>
        </div>
      ) : (
        <LoginForm mode={hasPassword ? "connexion" : "creation"} />
      )}
    </main>
  );
}
