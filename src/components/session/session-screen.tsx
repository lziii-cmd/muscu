"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Clock, Dumbbell, History, Home, Timer, X } from "lucide-react";
import { RestTimer } from "./rest-timer";
import { Badge, Card } from "@/components/ui";
import { cn, formatDuration, formatKg, formatSeconds, SLOT_LABELS, type Slot } from "@/lib/utils";
import { enqueue } from "@/lib/local/db";
import { advanceDoubleProgression, bodyPartOf } from "@/lib/domain/progression";
import { MISSED_REASON_LABELS, lateLogging, type MissedReason } from "@/lib/domain/adherence";

/*
 * Écran de saisie d'une séance.
 *
 * Contraintes de conception, dans cet ordre :
 *   1. saisir une série doit prendre moins de trois secondes, d'une main, à 23h ;
 *   2. rien ne doit être perdu si le réseau tombe ;
 *   3. la charge se saisit UNE fois par exercice, le détail série par série
 *      restant facultatif.
 */

export interface PrescribedExercise {
  id: number;
  exerciseId: number;
  name: string;
  muscleGroup: string | null;
  equipment: string | null;
  unit: "reps" | "seconds";
  orderLabel: string;
  orderIndex: number;
  supersetGroup: string | null;
  sets: number | null;
  repsLow: number | null;
  repsHigh: number | null;
  holdSeconds: number | null;
  repsFromMaxRule: boolean;
  perSide: boolean;
  loadRaw: string | null;
  loadKg: number | null;
  dumbbellKg: number | null;
  restSeconds: number | null;
  cue: string | null;
  /** Équivalent maison fourni par le programme pour cet exercice. */
  homeAlternative: string | null;
}

export interface SessionData {
  slot: Slot;
  programSessionId: number | null;
  weekNumber: number | null;
  label: string;
  heading: string | null;
  isRestDay: boolean;
  isTestDay: boolean;
  prescribed: PrescribedExercise[];
  logged: {
    id: number;
    status: string;
    location: string;
    durationSeconds: number | null;
    rpe: number | null;
    note: string | null;
    missedReason: string | null;
    loggedAt: string | null;
    exercises: {
      programExerciseId: number | null;
      exerciseId: number;
      done: boolean;
      weightKg: number | null;
      loadUnit: string | null;
      setsDone: number | null;
      repsDone: number | null;
      holdSecondsDone: number | null;
      machineNote: string | null;
      note: string | null;
    }[];
  } | null;
}

type LoadUnit = "barre_machine" | "kg_par_haltere" | "poids_du_corps";

interface EntryState {
  done: boolean;
  weightKg: string;
  loadUnit: LoadUnit;
  setsDone: string;
  repsDone: string;
  holdSecondsDone: string;
  machineNote: string;
  skipReason: string;
}

function initialEntry(exercise: PrescribedExercise, logged?: SessionData["logged"]): EntryState {
  const previous = logged?.exercises.find((e) => e.programExerciseId === exercise.id);

  // La charge proposée vient d'abord de ce qui a déjà été saisi, sinon du
  // programme : les kg du tableau sont un point de départ, pas une consigne.
  const suggestedUnit: LoadUnit =
    exercise.loadKg !== null
      ? "barre_machine"
      : exercise.dumbbellKg !== null
        ? "kg_par_haltere"
        : "poids_du_corps";

  const suggestedWeight = exercise.loadKg ?? exercise.dumbbellKg ?? null;

  return {
    done: previous?.done ?? false,
    weightKg:
      previous?.weightKg !== null && previous?.weightKg !== undefined
        ? String(previous.weightKg)
        : suggestedWeight !== null
          ? String(suggestedWeight)
          : "",
    loadUnit: (previous?.loadUnit as LoadUnit) ?? suggestedUnit,
    setsDone: previous?.setsDone != null ? String(previous.setsDone) : exercise.sets != null ? String(exercise.sets) : "",
    repsDone: previous?.repsDone != null ? String(previous.repsDone) : exercise.repsLow != null ? String(exercise.repsLow) : "",
    holdSecondsDone:
      previous?.holdSecondsDone != null
        ? String(previous.holdSecondsDone)
        : exercise.holdSeconds != null
          ? String(exercise.holdSeconds)
          : "",
    machineNote: previous?.machineNote ?? "",
    skipReason: "",
  };
}

function prescriptionLabel(exercise: PrescribedExercise): string {
  if (exercise.repsFromMaxRule) return `${exercise.sets ?? "?"} séries — reps = ton max − 1`;
  if (exercise.holdSeconds !== null) return `${exercise.sets ?? 1} × ${exercise.holdSeconds} s`;
  if (exercise.sets === null) return "—";
  const reps =
    exercise.repsLow === exercise.repsHigh
      ? `${exercise.repsLow}`
      : `${exercise.repsLow}-${exercise.repsHigh}`;
  return `${exercise.sets} × ${reps}${exercise.perSide ? " / côté" : ""}`;
}

export function SessionScreen({
  date,
  session,
  isPast,
  onSaved,
}: {
  date: string;
  session: SessionData;
  isPast: boolean;
  onSaved?: () => void;
}) {
  const [entries, setEntries] = useState<Record<number, EntryState>>(() =>
    Object.fromEntries(
      session.prescribed.map((exercise) => [exercise.id, initialEntry(exercise, session.logged)]),
    ),
  );
  const [expanded, setExpanded] = useState<number | null>(null);
  // La clé change à chaque nouveau repos : le chronomètre est remonté proprement.
  const [rest, setRest] = useState<{ seconds: number; label: string; key: number } | null>(null);
  const [elapsed, setElapsed] = useState(session.logged?.durationSeconds ?? 0);
  const [running, setRunning] = useState(false);
  const [view, setView] = useState<"saisie" | "resume">("saisie");
  /**
   * Salle ou maison. Le programme fournit un équivalent maison pour chaque
   * exercice afin de déplacer une séance plutôt que de la rater — mais il
   * précise que les deux ne se comparent pas : la progression en charge se
   * mesure sur les séances de salle uniquement.
   */
  const [location, setLocation] = useState<"salle" | "maison">(
    (session.logged?.location as "salle" | "maison") ?? "salle",
  );
  const [rpe, setRpe] = useState<number | null>(session.logged?.rpe ?? null);
  const [note, setNote] = useState(session.logged?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const startRef = useRef<number | null>(null);

  // Chronomètre de séance : 60 minutes chrono, c'est la contrainte du programme.
  useEffect(() => {
    if (!running) return;
    if (startRef.current === null) startRef.current = Date.now() - elapsed * 1000;

    const tick = () =>
      setElapsed(Math.round((Date.now() - (startRef.current ?? Date.now())) / 1000));
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [running, elapsed]);

  const update = (id: number, patch: Partial<EntryState>) =>
    setEntries((current) => ({ ...current, [id]: { ...current[id], ...patch } }));

  const toggleDone = (exercise: PrescribedExercise) => {
    const entry = entries[exercise.id];
    const nextDone = !entry.done;
    update(exercise.id, { done: nextDone, skipReason: nextDone ? "" : entry.skipReason });

    if (!running && nextDone) setRunning(true);

    // Le repos démarre à la validation, avec le temps prescrit. Un superset
    // s'enchaîne sans repos : seul le second mouvement en déclenche un.
    if (nextDone && exercise.restSeconds !== null && exercise.restSeconds > 0) {
      // Compteur monotone plutôt qu'horodatage : lire l'horloge depuis le corps
      // du composant est un effet de bord, et un simple incrément suffit à
      // remonter le chronomètre.
      setRest((previous) => ({
        seconds: exercise.restSeconds!,
        label: exercise.name,
        key: (previous?.key ?? 0) + 1,
      }));
    }
  };

  const doneCount = session.prescribed.filter((e) => entries[e.id]?.done).length;
  const total = session.prescribed.length;

  const late = useMemo(() => lateLogging(date, new Date().toISOString()), [date]);

  /**
   * Conseils de double progression, calculés sur ce qui vient d'être saisi.
   * Rien à la maison : sans charge comparable, la règle n'a pas de sens.
   */
  const advices = useMemo(() => {
    if (location === "maison") return [];
    return session.prescribed
      .filter((exercise) => {
        const entry = entries[exercise.id];
        return (
          entry?.done &&
          exercise.repsLow !== null &&
          exercise.repsHigh !== null &&
          Number(entry.repsDone) > 0
        );
      })
      .map((exercise) => {
        const entry = entries[exercise.id];
        const sets = Math.max(1, Number(entry.setsDone) || exercise.sets || 1);
        const reps = Number(entry.repsDone);
        const weight = entry.weightKg === "" ? null : Number(entry.weightKg.replace(",", "."));

        const advice = advanceDoubleProgression(
          Array.from({ length: sets }, () => ({ reps, weightKg: weight })),
          { low: exercise.repsLow!, high: exercise.repsHigh! },
          bodyPartOf(exercise.muscleGroup),
        );

        return { exercise, advice };
      })
      .filter(({ advice }) => advice.action === "augmenter_charge");
  }, [entries, session.prescribed, location]);

  const save = async (status: "done" | "partial") => {
    setSaving(true);
    try {
      await enqueue("session.upsert", {
        date,
        slot: session.slot,
        programSessionId: session.programSessionId,
        status,
        location,
        durationSeconds: elapsed > 0 ? elapsed : null,
        rpe,
        note: note.trim() === "" ? null : note.trim(),
        loggedAt: new Date().toISOString(),
        exercises: session.prescribed.map((exercise) => {
          const entry = entries[exercise.id];
          const weight = entry.weightKg === "" ? null : Number(entry.weightKg.replace(",", "."));
          return {
            programExerciseId: exercise.id,
            exerciseId: exercise.exerciseId,
            orderIndex: exercise.orderIndex,
            orderLabel: exercise.orderLabel,
            done: entry.done,
            skipReason: entry.done || entry.skipReason === "" ? null : entry.skipReason,
            weightKg: entry.loadUnit === "poids_du_corps" ? null : Number.isFinite(weight) ? weight : null,
            loadUnit: entry.loadUnit,
            machineNote: entry.machineNote.trim() === "" ? null : entry.machineNote.trim(),
            setsDone: entry.setsDone === "" ? null : Number(entry.setsDone),
            repsDone: entry.repsDone === "" ? null : Number(entry.repsDone),
            holdSecondsDone: entry.holdSecondsDone === "" ? null : Number(entry.holdSecondsDone),
            note: null,
          };
        }),
      });
      setSavedAt(new Date().toISOString());
      onSaved?.();
    } finally {
      setSaving(false);
    }
  };

  const declareMissed = async (reason: MissedReason) => {
    setSaving(true);
    try {
      await enqueue("session.miss", {
        date,
        slot: session.slot,
        programSessionId: session.programSessionId,
        status: "missed",
        missedReason: reason,
        loggedAt: new Date().toISOString(),
      });
      setSavedAt(new Date().toISOString());
      onSaved?.();
    } finally {
      setSaving(false);
    }
  };

  if (session.isRestDay) {
    return (
      <Card>
        <div className="flex items-center gap-3">
          <Badge tone={session.slot}>{SLOT_LABELS[session.slot]}</Badge>
          <p className="text-sm text-muted">Repos prévu. C'est une consigne, pas une option.</p>
        </div>
      </Card>
    );
  }

  if (savedAt) {
    return (
      <Card>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-success/15 text-success">
            <Check size={18} />
          </span>
          <div>
            <p className="font-medium">Séance enregistrée</p>
            <p className="mt-1 text-sm text-muted">
              {doneCount}/{total} exercices faits
              {elapsed > 0 ? ` · ${formatDuration(elapsed)}` : ""}
            </p>
            {late.isLate ? (
              <p className="mt-2">
                <Badge tone="warning">{late.label}</Badge>
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => setSavedAt(null)}
              className="tap mt-3 text-sm text-accent underline underline-offset-4"
            >
              Modifier
            </button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card className="p-0">
        <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 sm:px-5">
          <Badge tone={session.slot}>{SLOT_LABELS[session.slot]}</Badge>
          <h2 className="min-w-0 flex-1 truncate font-semibold">{session.label}</h2>

          {session.weekNumber ? <Badge>S{session.weekNumber}</Badge> : null}

          {isPast ? (
            <Badge tone="warning">
              <History size={12} aria-hidden /> Saisie en retard
            </Badge>
          ) : null}

          {session.prescribed.some((exercise) => exercise.homeAlternative) ? (
            <button
              type="button"
              onClick={() => setLocation((value) => (value === "salle" ? "maison" : "salle"))}
              aria-pressed={location === "maison"}
              className={cn(
                "tap flex items-center gap-1.5 rounded-lg border px-2.5 text-sm",
                location === "maison"
                  ? "border-soir/50 bg-soir/10 text-soir"
                  : "border-border text-muted",
              )}
            >
              <Home size={15} aria-hidden />
              {location === "maison" ? "À la maison" : "En salle"}
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => setRunning((value) => !value)}
            className={cn(
              "tap flex items-center gap-1.5 rounded-lg border px-2.5 text-sm tabular-nums",
              running ? "border-accent/50 bg-accent/10 text-accent" : "border-border text-muted",
            )}
            aria-label={running ? "Mettre le chrono en pause" : "Démarrer le chrono de séance"}
          >
            <Timer size={15} aria-hidden />
            {formatDuration(elapsed)}
          </button>
        </header>

        {view === "saisie" ? (
          <>
            {location === "maison" ? (
              <div className="mx-4 mt-3 rounded-xl border border-soir/40 bg-soir/5 px-3 py-2 text-sm sm:mx-5">
                <p className="font-medium text-soir">Séance à la maison</p>
                <p className="mt-1 text-muted">
                  Même jour, même séance. Sans charge, compense par les répétitions et le tempo, et va
                  près de l'échec — contrairement à la salle où tu gardes 2 reps en réserve. Ces
                  performances ne comptent pas dans ta progression en charge.
                </p>
              </div>
            ) : null}

            <div className="flex items-center justify-between px-4 py-2 text-xs text-faint sm:px-5">
              <span>
                {doneCount}/{total} exercices
              </span>
              {elapsed > 3600 ? (
                <span className="text-warning">Au-delà des 60 min visées</span>
              ) : null}
            </div>

            <ul className="divide-y divide-border">
              {session.prescribed.map((exercise) => {
                const entry = entries[exercise.id];
                const isOpen = expanded === exercise.id;
                const isSuperset = exercise.supersetGroup !== null;

                return (
                  <li key={exercise.id} className="px-4 py-3 sm:px-5">
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => toggleDone(exercise)}
                        aria-pressed={entry.done}
                        aria-label={`${exercise.name} : ${entry.done ? "fait" : "à faire"}`}
                        className={cn(
                          "tap mt-0.5 grid size-11 shrink-0 place-items-center rounded-xl border-2 transition-colors",
                          entry.done
                            ? "border-success bg-success/20 text-success"
                            : "border-border-strong text-faint",
                        )}
                      >
                        {entry.done ? <Check size={22} /> : <span className="text-xs">{exercise.orderLabel}</span>}
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <span className={cn("font-medium", entry.done && "text-muted line-through")}>
                            {exercise.name}
                          </span>
                          {isSuperset ? <Badge tone="accent">superset {exercise.supersetGroup}</Badge> : null}
                        </div>

                        {location === "maison" && exercise.homeAlternative ? (
                          <p className="mt-0.5 flex items-start gap-1.5 text-sm text-soir">
                            <Home size={13} className="mt-0.5 shrink-0" aria-hidden />
                            {exercise.homeAlternative}
                          </p>
                        ) : (
                          <p className="mt-0.5 text-sm text-faint">
                            {prescriptionLabel(exercise)}
                            {exercise.restSeconds !== null
                              ? ` · repos ${formatSeconds(exercise.restSeconds)}`
                              : ""}
                            {exercise.loadRaw && exercise.loadRaw !== "--"
                              ? ` · prévu ${exercise.loadRaw}`
                              : ""}
                          </p>
                        )}

                        {location === "salle" && exercise.homeAlternative ? (
                          <p className="mt-0.5 text-xs text-faint">
                            Maison : {exercise.homeAlternative}
                          </p>
                        ) : null}

                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {entry.loadUnit !== "poids_du_corps" ? (
                            <label className="flex items-center gap-1.5">
                              <span className="sr-only">Charge utilisée pour {exercise.name}</span>
                              <input
                                inputMode="decimal"
                                value={entry.weightKg}
                                onChange={(event) =>
                                  update(exercise.id, { weightKg: event.target.value })
                                }
                                placeholder="kg"
                                className="tap w-20 rounded-lg border border-border bg-raised px-2 text-center text-base tabular-nums outline-none focus:border-accent"
                              />
                              <span className="text-sm text-faint">kg</span>
                            </label>
                          ) : null}

                          <select
                            value={entry.loadUnit}
                            onChange={(event) =>
                              update(exercise.id, { loadUnit: event.target.value as LoadUnit })
                            }
                            aria-label={`Type de charge pour ${exercise.name}`}
                            className="tap rounded-lg border border-border bg-raised px-2 text-sm text-muted outline-none focus:border-accent"
                          >
                            <option value="barre_machine">barre / machine</option>
                            <option value="kg_par_haltere">par haltère</option>
                            <option value="poids_du_corps">poids du corps</option>
                          </select>

                          <button
                            type="button"
                            onClick={() => setExpanded(isOpen ? null : exercise.id)}
                            className="tap flex items-center gap-1 rounded-lg px-2 text-sm text-muted"
                            aria-expanded={isOpen}
                          >
                            Détail
                            <ChevronDown
                              size={14}
                              className={cn("transition-transform", isOpen && "rotate-180")}
                              aria-hidden
                            />
                          </button>
                        </div>

                        {isOpen ? (
                          <div className="mt-3 grid gap-2 rounded-xl bg-raised p-3 sm:grid-cols-2">
                            <label className="text-sm">
                              <span className="text-faint">Séries faites</span>
                              <input
                                inputMode="numeric"
                                value={entry.setsDone}
                                onChange={(event) => update(exercise.id, { setsDone: event.target.value })}
                                className="tap mt-1 w-full rounded-lg border border-border bg-surface px-2 tabular-nums outline-none focus:border-accent"
                              />
                            </label>

                            {exercise.unit === "seconds" ? (
                              <label className="text-sm">
                                <span className="text-faint">Tenue (s)</span>
                                <input
                                  inputMode="numeric"
                                  value={entry.holdSecondsDone}
                                  onChange={(event) =>
                                    update(exercise.id, { holdSecondsDone: event.target.value })
                                  }
                                  className="tap mt-1 w-full rounded-lg border border-border bg-surface px-2 tabular-nums outline-none focus:border-accent"
                                />
                              </label>
                            ) : (
                              <label className="text-sm">
                                <span className="text-faint">Reps par série</span>
                                <input
                                  inputMode="numeric"
                                  value={entry.repsDone}
                                  onChange={(event) => update(exercise.id, { repsDone: event.target.value })}
                                  className="tap mt-1 w-full rounded-lg border border-border bg-surface px-2 tabular-nums outline-none focus:border-accent"
                                />
                              </label>
                            )}

                            {exercise.equipment === "machine" ? (
                              <label className="text-sm sm:col-span-2">
                                <span className="text-faint">
                                  Quelle machine ? (les kilos ne sont comparables qu'à eux-mêmes)
                                </span>
                                <input
                                  value={entry.machineNote}
                                  onChange={(event) =>
                                    update(exercise.id, { machineNote: event.target.value })
                                  }
                                  className="tap mt-1 w-full rounded-lg border border-border bg-surface px-2 outline-none focus:border-accent"
                                />
                              </label>
                            ) : null}

                            {!entry.done ? (
                              <label className="text-sm sm:col-span-2">
                                <span className="text-faint">Pourquoi pas fait ?</span>
                                <select
                                  value={entry.skipReason}
                                  onChange={(event) =>
                                    update(exercise.id, { skipReason: event.target.value })
                                  }
                                  className="tap mt-1 w-full rounded-lg border border-border bg-surface px-2 outline-none focus:border-accent"
                                >
                                  <option value="">—</option>
                                  <option value="machine_occupee">Machine occupée</option>
                                  <option value="douleur">Douleur</option>
                                  <option value="manque_de_temps">Manque de temps</option>
                                  <option value="remplace">Remplacé par autre chose</option>
                                  <option value="autre">Autre</option>
                                </select>
                              </label>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            <footer className="flex flex-wrap gap-2 border-t border-border px-4 py-3 sm:px-5">
              <button
                type="button"
                onClick={() => setView("resume")}
                className="tap flex-1 rounded-xl bg-accent px-4 font-medium text-accent-contrast"
              >
                Terminer la séance
              </button>
              <MissedMenu onSelect={declareMissed} disabled={saving} />
            </footer>
          </>
        ) : (
          <Summary
            session={session}
            entries={entries}
            doneCount={doneCount}
            total={total}
            elapsed={elapsed}
            rpe={rpe}
            setRpe={setRpe}
            note={note}
            setNote={setNote}
            advices={advices}
            late={isPast}
            location={location}
            saving={saving}
            onBack={() => setView("saisie")}
            onSave={() => save(doneCount === total ? "done" : "partial")}
          />
        )}
      </Card>

      {rest ? (
        <RestTimer key={rest.key} seconds={rest.seconds} label={rest.label} onDismiss={() => setRest(null)} />
      ) : null}
    </>
  );
}

function MissedMenu({
  onSelect,
  disabled,
}: {
  onSelect: (reason: MissedReason) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="tap rounded-xl border border-border px-4 text-sm text-muted"
      >
        Séance manquée
      </button>
    );
  }

  return (
    <div className="w-full rounded-xl border border-border bg-raised p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium">Pourquoi cette séance n'a pas eu lieu ?</p>
        <button type="button" onClick={() => setOpen(false)} className="tap text-muted" aria-label="Annuler">
          <X size={16} />
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(MISSED_REASON_LABELS) as MissedReason[]).map((reason) => (
          <button
            key={reason}
            type="button"
            onClick={() => onSelect(reason)}
            className="tap rounded-full border border-border bg-surface px-3 text-sm text-muted hover:border-accent hover:text-accent"
          >
            {MISSED_REASON_LABELS[reason]}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-faint">
        Une séance manquée n'est pas un trou : le motif sert à repérer ce qui revient.
      </p>
    </div>
  );
}

function Summary({
  session,
  entries,
  doneCount,
  total,
  elapsed,
  rpe,
  setRpe,
  note,
  setNote,
  advices,
  late,
  location,
  saving,
  onBack,
  onSave,
}: {
  session: SessionData;
  entries: Record<number, EntryState>;
  doneCount: number;
  total: number;
  elapsed: number;
  rpe: number | null;
  setRpe: (value: number) => void;
  note: string;
  setNote: (value: string) => void;
  advices: { exercise: PrescribedExercise; advice: { message: string } }[];
  late: boolean;
  location: "salle" | "maison";
  saving: boolean;
  onBack: () => void;
  onSave: () => void;
}) {
  return (
    <div className="px-4 py-4 sm:px-5">
      <h3 className="mb-3 font-semibold">Résumé de la séance</h3>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <div>
          <div className="text-xs text-faint">Exercices</div>
          <div className="text-xl font-semibold tabular-nums">
            {doneCount}/{total}
          </div>
        </div>
        <div>
          <div className="text-xs text-faint">Durée</div>
          <div className="text-xl font-semibold tabular-nums">
            {elapsed > 0 ? formatDuration(elapsed) : "—"}
          </div>
        </div>
        <div>
          <div className="text-xs text-faint">Cible</div>
          <div className={cn("text-xl font-semibold tabular-nums", elapsed > 3600 && "text-warning")}>
            60 min
          </div>
        </div>
      </div>

      <ul className="mb-4 divide-y divide-border rounded-xl border border-border">
        {session.prescribed.map((exercise) => {
          const entry = entries[exercise.id];
          return (
            <li key={exercise.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span
                className={cn(
                  "grid size-5 shrink-0 place-items-center rounded",
                  entry.done ? "bg-success/20 text-success" : "bg-raised text-faint",
                )}
                aria-hidden
              >
                {entry.done ? <Check size={13} /> : <X size={13} />}
              </span>
              <span className={cn("min-w-0 flex-1 truncate", !entry.done && "text-faint")}>
                {exercise.name}
              </span>
              <span className="shrink-0 tabular-nums text-muted">
                {entry.loadUnit === "poids_du_corps"
                  ? "PDC"
                  : entry.weightKg
                    ? formatKg(Number(entry.weightKg.replace(",", ".")))
                    : "—"}
              </span>
            </li>
          );
        })}
      </ul>

      {advices.length > 0 ? (
        <div className="mb-4 rounded-xl border border-success/40 bg-success/5 p-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-success">
            <Dumbbell size={15} aria-hidden />
            Pour la prochaine fois
          </p>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            {advices.map(({ exercise, advice }) => (
              <li key={exercise.id}>
                <span className="font-medium text-text">{exercise.name}</span> — {advice.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {location === "maison" ? (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-soir/40 bg-soir/5 p-3 text-sm">
          <Home size={16} className="mt-0.5 shrink-0 text-soir" aria-hidden />
          <p className="text-muted">
            Séance enregistrée comme <strong className="text-soir">faite à la maison</strong>. Elle
            compte pour ton assiduité, mais pas pour ta progression en charge : les deux échelles ne
            se comparent pas.
          </p>
        </div>
      ) : null}

      {late ? (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/5 p-3 text-sm">
          <History size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden />
          <p className="text-muted">
            Cette séance sera marquée <strong className="text-warning">enregistrée avec du retard</strong>.
            Sa durée et ses temps de repos ne seront pas comptés dans les analyses : ils n'ont pas été mesurés.
          </p>
        </div>
      ) : null}

      <fieldset className="mb-4">
        <legend className="mb-2 text-sm text-faint">Ressenti global</legend>
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setRpe(value)}
              aria-pressed={rpe === value}
              className={cn(
                "tap size-10 rounded-lg border text-sm tabular-nums",
                rpe === value
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-border text-muted",
              )}
            >
              {value}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="mb-4 block text-sm">
        <span className="text-faint">Note libre</span>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={2}
          placeholder="Machine occupée, douleur, sensation…"
          className="mt-1 w-full rounded-xl border border-border bg-raised px-3 py-2 outline-none focus:border-accent"
        />
      </label>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onBack}
          className="tap rounded-xl border border-border px-4 text-sm text-muted"
        >
          Retour
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="tap flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 font-medium text-accent-contrast disabled:opacity-60"
        >
          <Clock size={16} aria-hidden />
          {saving ? "Enregistrement…" : "Enregistrer la séance"}
        </button>
      </div>
    </div>
  );
}
