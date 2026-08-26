import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { isAuthenticated } from "@/lib/auth/session";

/**
 * Connexion.
 *
 * Les comptes sont créés par l'administrateur : il n'y a pas d'inscription
 * libre, l'application étant publiée sur une adresse publique.
 */
export default async function LoginPage() {
  if (await isAuthenticated()) redirect("/");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Muscu</h1>
        <p className="mt-1 text-sm text-muted">Suivi d&apos;entraînement, de diète et de progression</p>
      </div>

      <LoginForm />
    </main>
  );
}
