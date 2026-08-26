"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Changement de son propre mot de passe.
 *
 * La confirmation est vérifiée ici, avant l'aller-retour réseau : se tromper
 * de frappe est le cas courant, il ne mérite pas d'attendre le serveur.
 */
export function PasswordForm() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setDone(false);

    if (newPassword.length < 8) {
      setError("Le nouveau mot de passe doit faire 8 caractères au minimum.");
      return;
    }
    if (newPassword !== confirmation) {
      setError("Les deux saisies ne correspondent pas.");
      return;
    }

    setPending(true);
    try {
      const response = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(payload.error ?? "Échec du changement de mot de passe.");
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmation("");
      setDone(true);
      router.refresh();
    } catch {
      setError("Serveur injoignable. Réessaie une fois connecté.");
    } finally {
      setPending(false);
    }
  };

  const field =
    "tap mt-1 w-full rounded-xl border border-border bg-surface px-3 outline-none focus:border-accent";

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block text-sm">
        <span className="text-faint">Mot de passe actuel</span>
        <input
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          className={field}
          required
        />
      </label>

      <label className="block text-sm">
        <span className="text-faint">Nouveau mot de passe</span>
        <input
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          className={field}
          required
        />
      </label>

      <label className="block text-sm">
        <span className="text-faint">Confirmation</span>
        <input
          type="password"
          autoComplete="new-password"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          className={field}
          required
        />
      </label>

      {error ? (
        <p
          className="rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {done ? (
        <p
          className="rounded-lg border border-success/40 bg-success/5 px-3 py-2 text-sm text-success"
          role="status"
        >
          Mot de passe changé.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="tap w-full rounded-xl bg-accent px-4 font-medium text-accent-contrast disabled:opacity-60"
      >
        {pending ? "…" : "Changer le mot de passe"}
      </button>
    </form>
  );
}
