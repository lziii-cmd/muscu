"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";

/** Déconnexion : détruit le cookie de session côté serveur. */
export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const logout = async () => {
    setPending(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    router.replace("/login");
    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={logout}
      disabled={pending}
      className="tap flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm text-muted disabled:opacity-60"
    >
      <LogOut size={16} aria-hidden />
      {pending ? "…" : "Se déconnecter"}
    </button>
  );
}
