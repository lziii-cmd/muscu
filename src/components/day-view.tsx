"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, CloudOff, Plus, RefreshCw } from "lucide-react";
import { SessionScreen, type SessionData } from "@/components/session/session-screen";
import type { ExerciseOption } from "@/components/session/exercise-picker";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { addDays, formatDate, today as todayIso } from "@/lib/utils";
import { cacheSession, readCachedSession } from "@/lib/local/db";

interface DayPayload {
  date: string;
  pullupMax: number;
  exercises: ExerciseOption[];
  sessions: SessionData[];
  weeks: {
    weekNumber: number;
    blockName: string;
    instruction: string | null;
    programCode: string;
    programName: string;
  }[];
}

/**
 * Nom court du programme, pour une pastille.
 *
 * Les noms complets décrivent le programme (« Musculation & mobilité --
 * Maison ») ; sur une pastille il ne reste de la place que pour le premier
 * segment. Le nom vient de la base : chaque personne a les siens, et une liste
 * de codes en dur laisserait la seconde afficher le programme de la première.
 */
function shortProgramName(name: string): string {
  const first = name.split(/\s+--\s+|\s+—\s+/)[0].trim();
  return first.length > 18 ? `${first.slice(0, 17)}…` : first;
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
  /** Séance libre ouverte à la saisie, tant qu'elle n'est pas enregistrée. */
  const [freeSession, setFreeSession] = useState(false);

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
  // Une séance libre déjà enregistrée revient dans la liste : inutile d'en
  // proposer une seconde.
  const hasFreeSession = (data?.sessions ?? []).some((session) => session.slot === "libre");

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
                  {shortProgramName(week.programName)} · S{week.weekNumber}
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
          detail="Cette date est en dehors du programme importé."
        />
      ) : null}

      <div className="space-y-4">
        {data?.sessions.map((session) => (
          <SessionScreen
            key={`${date}-${session.slot}`}
            date={date}
            session={session}
            isPast={isPast}
            pullupMax={data.pullupMax ?? 3}
            exercises={data.exercises ?? []}
            onSaved={load}
          />
        ))}

        {data && state !== "chargement" ? (
          hasFreeSession || freeSession ? (
            !hasFreeSession ? (
              <SessionScreen
                key={`${date}-libre`}
                date={date}
                session={{
                  slot: "libre",
                  programSessionId: null,
                  weekNumber: null,
                  label: "Entraînement libre",
                  heading: null,
                  isRestDay: false,
                  isTestDay: false,
                  prescribed: [],
                  logged: null,
                }}
                isPast={isPast}
                pullupMax={data.pullupMax ?? 3}
                exercises={data.exercises ?? []}
                onSaved={() => {
                  setFreeSession(false);
                  void load();
                }}
              />
            ) : null
          ) : (
            <button
              type="button"
              onClick={() => setFreeSession(true)}
              className="tap flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border-strong py-4 text-sm text-muted"
            >
              <Plus size={16} aria-hidden />
              Ajouter un entraînement libre
            </button>
          )
        ) : null}
      </div>
    </>
  );
}
