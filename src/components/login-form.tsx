"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Connexion.
 *
 * Le mot de passe n'est jamais stocké côté client : il part au serveur, qui le
 * compare à une empreinte scrypt et pose un cookie de session chiffré.
 *
 * Il n'y a pas d'inscription : les comptes sont créés par l'administrateur.
 * Une inscription libre sur une adresse publique donnerait un accès à
 * n'importe qui.
 */
export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
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
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          className="tap mt-1 w-full rounded-xl border border-border bg-surface px-3 outline-none focus:border-accent"
          required
        />
      </label>

      <label className="block text-sm">
        <span className="text-faint">Mot de passe</span>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="tap mt-1 w-full rounded-xl border border-border bg-surface px-3 outline-none focus:border-accent"
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

      <button
        type="submit"
        disabled={pending}
        className="tap w-full rounded-xl bg-accent px-4 font-medium text-accent-contrast disabled:opacity-60"
      >
        {pending ? "…" : "Entrer"}
      </button>
    </form>
  );
}
