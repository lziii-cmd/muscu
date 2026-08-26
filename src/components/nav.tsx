"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  Activity,
  Apple,
  BedDouble,
  CalendarDays,
  CalendarRange,
  Dumbbell,
  Flame,
  LineChart,
  Moon,
  Ruler,
  Target,
  BookOpen,
  CloudOff,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { flushOutbox, pendingCount } from "@/lib/local/db";

/**
 * Navigation.
 *
 * Sur téléphone : barre inférieure avec les cinq destinations les plus
 * fréquentes, atteignables au pouce. Sur tablette et ordinateur : colonne
 * latérale complète. C'est la même application, pas deux interfaces.
 */

const PRIMARY = [
  { href: "/", label: "Aujourd'hui", icon: Flame },
  { href: "/journal", label: "Journal", icon: CalendarDays },
  { href: "/progression", label: "Progression", icon: LineChart },
  { href: "/diete", label: "Diète", icon: Apple },
  { href: "/bilan", label: "Bilan", icon: Target },
];

const SECONDARY = [
  { href: "/programme", label: "Programme", icon: CalendarRange },
  { href: "/calisthenie", label: "Calisthénie", icon: Activity },
  { href: "/corps", label: "Corps", icon: Ruler },
  { href: "/tests", label: "Tests & contrôles", icon: Dumbbell },
  { href: "/sommeil", label: "Sommeil", icon: BedDouble },
  { href: "/exercices", label: "Exercices", icon: BookOpen },
  { href: "/compte", label: "Profil", icon: UserRound },
];

function useIsActive() {
  const pathname = usePathname();
  return (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
}

/**
 * État de la connexion, lu comme une source externe.
 *
 * `useSyncExternalStore` est la façon prévue par React de s'abonner à une valeur
 * qui vit hors de React : elle évite d'initialiser l'état depuis `navigator`
 * pendant le rendu, ce qui casserait le rendu serveur.
 */
function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function useOnline() {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    // Côté serveur, on suppose la connexion présente : le bandeau ne doit pas
    // clignoter au premier rendu.
    () => true,
  );
}

/** Indicateur discret : nombre de saisies en attente de synchronisation. */
function SyncIndicator() {
  const [pending, setPending] = useState(0);
  const online = useOnline();

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const count = await pendingCount();
      if (!cancelled) setPending(count);
    };

    void refresh();
    const timer = window.setInterval(refresh, 15_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  // Au retour du réseau, on vide la file puis on rafraîchit le compteur.
  useEffect(() => {
    if (!online) return;
    void flushOutbox().then(async () => setPending(await pendingCount()));
  }, [online]);

  if (online && pending === 0) return null;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
      <CloudOff size={14} aria-hidden />
      <span>
        {online
          ? `${pending} saisie${pending > 1 ? "s" : ""} en attente`
          : "Hors ligne — tes saisies sont gardées"}
      </span>
    </div>
  );
}

export function Sidebar() {
  const isActive = useIsActive();

  return (
    <aside className="hidden w-60 shrink-0 flex-col gap-6 border-r border-border bg-surface px-3 py-6 lg:flex">
      <div className="px-3">
        <p className="text-lg font-semibold tracking-tight">Muscu</p>
        <p className="text-xs text-faint">24 août → 20 décembre 2026</p>
      </div>

      <nav className="flex flex-col gap-1" aria-label="Navigation principale">
        {[...PRIMARY, ...SECONDARY].map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(href) ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors tap",
              isActive(href)
                ? "bg-accent/10 font-medium text-accent"
                : "text-muted hover:bg-raised hover:text-text",
            )}
          >
            <Icon size={18} aria-hidden />
            {label}
          </Link>
        ))}
      </nav>

      <div className="mt-auto px-1">
        <SyncIndicator />
      </div>
    </aside>
  );
}

export function BottomNav() {
  const isActive = useIsActive();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Navigation principale"
    >
      <ul className="grid grid-cols-5">
        {PRIMARY.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              aria-current={isActive(href) ? "page" : undefined}
              className={cn(
                "flex flex-col items-center gap-1 px-1 py-2 text-[11px] tap",
                isActive(href) ? "text-accent" : "text-faint",
              )}
            >
              <Icon size={20} aria-hidden />
              <span className="truncate">{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Accès aux sections secondaires depuis le téléphone. */
export function SecondaryNav() {
  const isActive = useIsActive();

  return (
    <div className="scroll-x -mx-4 mb-4 px-4 lg:hidden">
      <div className="flex gap-2">
        {SECONDARY.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(href) ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs whitespace-nowrap",
              isActive(href)
                ? "border-accent/40 bg-accent/10 text-accent"
                : "border-border bg-surface text-muted",
            )}
          >
            <Icon size={14} aria-hidden />
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}

export function MobileSyncIndicator() {
  return (
    <div className="mb-4 lg:hidden">
      <SyncIndicator />
    </div>
  );
}

export { Moon };
