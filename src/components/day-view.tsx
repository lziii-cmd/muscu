"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, CloudOff, RefreshCw } from "lucide-react";
import { SessionScreen, type SessionData } from "@/components/session/session-screen";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { addDays, formatDate, today as todayIso } from "@/lib/utils";
import { cacheSession, readCachedSession } from "@/lib/local/db";

interface DayPayload {
  date: string;
  sessions: SessionData[];
  weeks: {
    weekNumber: number;
    blockName: string;
    instruction: string | null;
    programCode: string;
  }[];
}

/**
 * Vue d'une journée.
 *
 * Charge les données par l'API plutôt que par un composant serveur, pour deux
 * raisons : la page doit rester consultable hors-ligne (la réponse est mise en
 * cache dans IndexedDB), et la navigation d'un jour à l'autre ne doit pas
 * repasser par un rendu serveur complet.
 */
export function DayView({ date }: { date: string }) {
  const [data, setData] = useState<DayPayload | null>(null);
  const [state, setState] = useState<"chargement" | "en_ligne" | "cache" | "vide">("chargement");

  const load = useCallback(async () => {
    // L'état initial est déjà « chargement » : le repasser ici déclencherait un
    // setState synchrone depuis l'effet, et un rendu en cascade inutile.
    try {
      const response = await fetch(`/api/jour/${date}`, { cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      const payload: DayPayload = await response.json();
      setData(payload);
      setState("en_ligne");
      await cacheSession(date, "salle", payload);
    } catch {
      const cached = (await readCachedSession(date, "salle")) as DayPayload | null;
      if (cached) {
        setData(cached);
        setState("cache");
      } else {
        setData(null);
        setState("vide");
      }
    }
  }, [date]);

  useEffect(() => {
    // Chargement initial et rechargement au changement de date. La règle
    // « pas de setState dans un effet » vise les rendus en cascade ; ici, l'état
    // n'est écrit qu'après la réponse réseau ou la lecture du cache local,
    // c'est-à-dire depuis un système externe — le cas que les effets servent
    // précisément à synchroniser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const isToday = date === todayIso();
  const isPast = date < todayIso();

  return (
    <>
      <PageHeader
        title={isToday ? "Aujourd'hui" : formatDate(date, { withWeekday: true })}
        subtitle={
          isToday ? (
            formatDate(date, { withWeekday: true })
          ) : isPast ? (
            "Saisie rétroactive — la séance sera marquée enregistrée avec du retard."
          ) : (
            "Séance à venir"
          )
        }
        action={
          <nav className="flex items-center gap-1" aria-label="Changer de jour">
            <Link
              href={`/seance/${addDays(date, -1)}`}
              className="tap grid place-items-center rounded-lg border border-border text-muted"
              aria-label="Jour précédent"
            >
              <ChevronLeft size={18} />
            </Link>
            {!isToday ? (
              <Link
                href="/"
                className="tap rounded-lg border border-border px-3 text-sm text-muted"
              >
                Aujourd'hui
              </Link>
            ) : null}
            <Link
              href={`/seance/${addDays(date, 1)}`}
              className="tap grid place-items-center rounded-lg border border-border text-muted"
              aria-label="Jour suivant"
            >
              <ChevronRight size={18} />
            </Link>
          </nav>
        }
      />

      {state === "cache" ? (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-warning/40 bg-warning/5 px-3 py-2 text-sm text-warning">
          <CloudOff size={15} aria-hidden />
          Affiché depuis le cache local. Tes saisies seront envoyées au retour du réseau.
        </div>
      ) : null}

      {data?.weeks?.length ? (
        <Card className="mb-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            {data.weeks.map((week) => (
              <span key={`${week.programCode}-${week.weekNumber}`} className="text-muted">
                <span className="font-medium text-text">
                  {week.programCode === "ppl" ? "Salle" : "Calisthénie"} · S{week.weekNumber}
                </span>{" "}
                {week.blockName}
              </span>
            ))}
          </div>
          {data.weeks.find((w) => w.instruction) ? (
            <p className="mt-2 border-l-2 border-accent/50 pl-3 text-sm text-muted">
              {data.weeks.find((w) => w.instruction)?.instruction}
            </p>
          ) : null}
        </Card>
      ) : null}

      {state === "chargement" ? (
        <Card>
          <p className="flex items-center gap-2 text-sm text-muted">
            <RefreshCw size={15} className="animate-spin" aria-hidden />
            Chargement…
          </p>
        </Card>
      ) : null}

      {state === "vide" ? (
        <EmptyState
          title="Journée introuvable"
          detail="Aucune donnée en cache et pas de réseau. Réessaie une fois connecté."
        />
      ) : null}

      {data && data.sessions.length === 0 && state !== "chargement" ? (
        <EmptyState
          title="Aucune séance prévue ce jour"
          detail="Le programme court du 24 août au 20 décembre 2026."
        />
      ) : null}

      <div className="space-y-4">
        {data?.sessions.map((session) => (
          <SessionScreen
            key={`${date}-${session.slot}`}
            date={date}
            session={session}
            isPast={isPast}
            onSaved={load}
          />
        ))}
      </div>
    </>
  );
}
