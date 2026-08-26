"use client";

import { useMemo, useState } from "react";
import { Check, Plus, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { enqueue } from "@/lib/local/db";

/**
 * Sélecteur d'exercice, pour ajouter une ligne hors programme à une séance.
 *
 * Deux cas couverts :
 *  - un exercice déjà connu (les 111 du programme, plus ceux déjà créés) ;
 *  - un exercice qui n'existe pas encore, créé à la volée avec **son unité**.
 *    C'est ce dernier point qui compte : une corde à sauter se compte en sauts,
 *    une course en mètres. Forcer « répétitions » sur toute activité rendrait la
 *    saisie absurde.
 */

export interface ExerciseOption {
  id: number;
  name: string;
  muscleGroup: string | null;
  equipment: string | null;
  unit: "reps" | "seconds";
  measureLabel: string;
  isCustom: boolean;
}

/** Unités proposées pour un exercice créé à la main. */
const UNITS = [
  { label: "répétitions", measureLabel: "reps", unit: "reps" as const },
  { label: "sauts", measureLabel: "sauts", unit: "reps" as const },
  { label: "mètres", measureLabel: "m", unit: "reps" as const },
  { label: "secondes", measureLabel: "s", unit: "seconds" as const },
  { label: "minutes", measureLabel: "min", unit: "seconds" as const },
];

function normalise(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function ExercisePicker({
  exercises,
  onPick,
  onClose,
}: {
  exercises: ExerciseOption[];
  onPick: (exercise: ExerciseOption) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [unitIndex, setUnitIndex] = useState(0);
  const [pending, setPending] = useState(false);

  const results = useMemo(() => {
    const needle = normalise(query.trim());
    if (needle === "") return exercises.slice(0, 40);
    return exercises.filter((exercise) => normalise(exercise.name).includes(needle)).slice(0, 40);
  }, [exercises, query]);

  const exactMatch = results.some(
    (exercise) => normalise(exercise.name) === normalise(query.trim()),
  );
  const canCreate = query.trim().length >= 2 && !exactMatch;

  const create = async () => {
    const name = query.trim();
    const unit = UNITS[unitIndex];
    setPending(true);
    try {
      await enqueue("exercise.create", {
        name,
        measureLabel: unit.measureLabel,
        unit: unit.unit,
        muscleGroup: "autre",
        equipment: "autre",
      });

      /*
       * L'exercice vient d'être mis en file : le serveur ne lui a pas encore
       * attribué d'identifiant. On en pose un négatif, provisoire, qui suffit à
       * la saisie locale — la ligne sera rattachée au vrai exercice à la
       * synchronisation suivante.
       */
      onPick({
        id: -Date.now(),
        name,
        muscleGroup: "autre",
        equipment: "autre",
        unit: unit.unit,
        measureLabel: unit.measureLabel,
        isCustom: true,
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-raised p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Ajouter un exercice</p>
        <button type="button" onClick={onClose} className="tap text-muted" aria-label="Fermer">
          <X size={16} />
        </button>
      </div>

      <label className="mb-3 flex items-center gap-2 rounded-lg border border-border bg-surface px-2">
        <Search size={15} className="shrink-0 text-faint" aria-hidden />
        <span className="sr-only">Chercher un exercice</span>
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setCreating(false);
          }}
          placeholder="Corde à sauter, développé couché…"
          className="tap w-full bg-transparent outline-none"
          autoFocus
        />
      </label>

      {canCreate ? (
        <div className="mb-3 rounded-lg border border-accent/40 bg-accent/5 p-3">
          {!creating ? (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="tap flex w-full items-center gap-2 text-sm text-accent"
            >
              <Plus size={15} aria-hidden />
              Créer « {query.trim()} »
            </button>
          ) : (
            <>
              <p className="text-sm font-medium">Créer « {query.trim()} »</p>
              <p className="mt-1 text-xs text-faint">Qu'est-ce que tu comptes sur cet exercice ?</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {UNITS.map((unit, index) => (
                  <button
                    key={unit.label}
                    type="button"
                    onClick={() => setUnitIndex(index)}
                    aria-pressed={unitIndex === index}
                    className={cn(
                      "tap rounded-full border px-3 text-sm",
                      unitIndex === index
                        ? "border-accent bg-accent/15 text-accent"
                        : "border-border text-muted",
                    )}
                  >
                    {unit.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={create}
                disabled={pending}
                className="tap mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 text-sm font-medium text-accent-contrast disabled:opacity-60"
              >
                <Check size={15} aria-hidden />
                {pending ? "…" : "Créer et ajouter"}
              </button>
            </>
          )}
        </div>
      ) : null}

      <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-lg border border-border bg-surface">
        {results.length === 0 ? (
          <li className="px-3 py-4 text-sm text-faint">
            Aucun exercice trouvé. Tape un nom pour en créer un.
          </li>
        ) : (
          results.map((exercise) => (
            <li key={exercise.id}>
              <button
                type="button"
                onClick={() => onPick(exercise)}
                className="tap flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-raised"
              >
                <span className="min-w-0 truncate">{exercise.name}</span>
                <span className="shrink-0 text-xs text-faint">
                  {exercise.measureLabel}
                  {exercise.isCustom ? " · perso" : ""}
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
