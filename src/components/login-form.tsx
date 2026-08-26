"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Connexion, ou création du compte au premier lancement.
 *
 * Le mot de passe n'est jamais stocké côté client : il part au serveur, qui le
 * hache avec scrypt et pose un cookie de session chiffré.
 */
export function LoginForm({ mode }: { mode: "connexion" | "creation" }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const isCreation = mode === "creation";

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (isCreation) {
      if (username.trim().length < 2) {
        setError("Choisis un identifiant d'au moins 2 caractères.");
        return;
      }
      if (password.length < 8) {
        setError("Le mot de passe doit faire 8 caractères minimum.");
        return;
      }
      if (password !== confirm) {
        setError("Les deux mots de passe diffèrent.");
        return;
      }
    }

    setPending(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password, create: isCreation }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.error ?? "Échec de la connexion.");
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setError("Serveur injoignable. Vérifie ta connexion.");
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block text-sm">
        <span className="text-faint">Identifiant</span>
        <input
          type="text"
          autoComplete={isCreation ? "username" : "username"}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          className="tap mt-1 w-full rounded-xl border border-border bg-surface px-3 outline-none focus:border-accent"
          required
        />
      </label>

      <div>
        <label className="block text-sm">
          <span className="text-faint">Mot de passe</span>
          <input
            type="password"
            autoComplete={isCreation ? "new-password" : "current-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="tap mt-1 w-full rounded-xl border border-border bg-surface px-3 outline-none focus:border-accent"
            required
          />
        </label>
        {isCreation ? (
          <p className="mt-1 text-xs text-faint">
            Un seul compte, le tien. 8 caractères minimum pour le mot de passe.
          </p>
        ) : null}
      </div>

      {isCreation ? (
        <label className="block text-sm">
          <span className="text-faint">Confirme le mot de passe</span>
          <input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            className="tap mt-1 w-full rounded-xl border border-border bg-surface px-3 outline-none focus:border-accent"
            required
          />
        </label>
      ) : null}

      {error ? (
        <p
          className="rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="tap w-full rounded-xl bg-accent px-4 font-medium text-accent-contrast disabled:opacity-60"
      >
        {pending ? "…" : isCreation ? "Créer mon compte" : "Entrer"}
      </button>
    </form>
  );
}
