"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Trash2, UserPlus } from "lucide-react";

/**
 * Gestion des comptes.
 *
 * L'administrateur ne voit jamais un mot de passe : il en impose un nouveau,
 * que la personne change ensuite depuis sa page Compte. C'est la seule
 * manoeuvre possible quand quelqu'un a oublié le sien, l'empreinte scrypt
 * n'étant pas réversible.
 */

export interface AdminUser {
  id: number;
  username: string;
  displayName: string;
  role: "user" | "admin";
  usesDefaultPassword: boolean;
}

const FIELD =
  "tap mt-1 w-full rounded-xl border border-border bg-base px-3 outline-none focus:border-accent";

export function AdminUsers({ users, currentUserId }: { users: AdminUser[]; currentUserId: number }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Formulaire de création.
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");

  // Réinitialisation : un champ par compte, ouvert à la demande.
  const [resetting, setResetting] = useState<number | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  const call = async (url: string, method: string, payload?: unknown): Promise<boolean> => {
    setError(null);
    setPending(true);
    try {
      const response = await fetch(url, {
        method,
        headers: payload ? { "Content-Type": "application/json" } : undefined,
        body: payload ? JSON.stringify(payload) : undefined,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.error ?? "Opération refusée.");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("Serveur injoignable.");
      return false;
    } finally {
      setPending(false);
    }
  };

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 8) {
      setError("Le mot de passe doit faire 8 caractères au minimum.");
      return;
    }
    const ok = await call("/api/admin/users", "POST", {
      username: username.trim().toLowerCase(),
      displayName: displayName.trim() || username.trim(),
      password,
      role,
    });
    if (ok) {
      setUsername("");
      setDisplayName("");
      setPassword("");
      setRole("user");
    }
  };

  const reset = async (id: number) => {
    if (resetPassword.length < 8) {
      setError("Le mot de passe doit faire 8 caractères au minimum.");
      return;
    }
    const ok = await call(`/api/admin/users/${id}`, "PATCH", { password: resetPassword });
    if (ok) {
      setResetting(null);
      setResetPassword("");
    }
  };

  const remove = async (user: AdminUser) => {
    const confirmed = window.confirm(
      `Supprimer « ${user.displayName} » ?\n\nSon programme, son journal et ses mesures sont effacés définitivement.`,
    );
    if (!confirmed) return;
    await call(`/api/admin/users/${user.id}`, "DELETE");
  };

  return (
    <div className="space-y-6">
      {error ? (
        <p
          className="rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <ul className="space-y-3">
        {users.map((user) => (
          <li key={user.id} className="rounded-2xl border border-border bg-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">
                  {user.displayName}
                  {user.id === currentUserId ? <span className="text-faint"> · toi</span> : null}
                </p>
                <p className="text-xs text-faint">
                  <code>{user.username}</code>
                  {user.role === "admin" ? " · administrateur" : null}
                </p>
                {user.usesDefaultPassword ? (
                  <p className="mt-1 text-xs text-warning">Mot de passe d&apos;origine non changé</p>
                ) : null}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setResetting(resetting === user.id ? null : user.id);
                    setResetPassword("");
                  }}
                  className="tap flex items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-muted"
                >
                  <KeyRound size={14} aria-hidden />
                  Mot de passe
                </button>
                {user.id === currentUserId ? null : (
                  <button
                    type="button"
                    onClick={() => remove(user)}
                    disabled={pending}
                    className="tap flex items-center gap-1.5 rounded-lg border border-danger/40 px-3 text-xs text-danger disabled:opacity-60"
                  >
                    <Trash2 size={14} aria-hidden />
                    Supprimer
                  </button>
                )}
              </div>
            </div>

            {resetting === user.id ? (
              <div className="mt-3 border-t border-border pt-3">
                <label className="block text-sm">
                  <span className="text-faint">Nouveau mot de passe pour {user.displayName}</span>
                  <input
                    type="text"
                    autoComplete="off"
                    value={resetPassword}
                    onChange={(event) => setResetPassword(event.target.value)}
                    className={FIELD}
                  />
                </label>
                <p className="mt-1 text-xs text-faint">
                  Transmets-le de vive voix ; la personne le changera depuis sa page Compte.
                </p>
                <button
                  type="button"
                  onClick={() => reset(user.id)}
                  disabled={pending}
                  className="tap mt-2 w-full rounded-xl bg-accent px-4 text-sm font-medium text-accent-contrast disabled:opacity-60"
                >
                  {pending ? "…" : "Remplacer"}
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      <form onSubmit={create} className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">
          <UserPlus size={16} aria-hidden />
          Nouveau compte
        </h2>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-faint">Identifiant</span>
            <input
              type="text"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className={FIELD}
              required
            />
          </label>

          <label className="block text-sm">
            <span className="text-faint">Nom affiché</span>
            <input
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className={FIELD}
            />
          </label>

          <label className="block text-sm">
            <span className="text-faint">Mot de passe provisoire</span>
            <input
              type="text"
              autoComplete="off"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={FIELD}
              required
            />
          </label>

          <label className="block text-sm">
            <span className="text-faint">Rôle</span>
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as "user" | "admin")}
              className={FIELD}
            >
              <option value="user">Utilisateur</option>
              <option value="admin">Administrateur</option>
            </select>
          </label>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="tap mt-4 w-full rounded-xl bg-accent px-4 font-medium text-accent-contrast disabled:opacity-60"
        >
          {pending ? "…" : "Créer le compte"}
        </button>

        <p className="mt-3 text-xs text-faint">
          Un compte créé ici n&apos;a pas encore de programme. Son import se fait en ligne de
          commande : <code className="text-muted">npm run db:seed -- --user identifiant</code>.
        </p>
      </form>
    </div>
  );
}
