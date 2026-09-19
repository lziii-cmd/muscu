"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Clock,
  Dumbbell,
  History,
  Home,
  Plus,
  Repeat,
  Timer,
  Trash2,
  X,
} from "lucide-react";
import { RestTimer } from "./rest-timer";
import { ExercisePicker, type ExerciseOption } from "./exercise-picker";
import { Badge, Card } from "@/components/ui";
import { cn, formatDuration, formatSeconds, SLOT_LABELS, type Slot } from "@/lib/utils";
import { clearDraft, enqueue, flushOutbox, readDraft, saveDraft } from "@/lib/local/db";
import { advanceDoubleProgression, bodyPartOf } from "@/lib/domain/progression";
import { repsForMax } from "@/lib/domain/calisthenics";
import { MISSED_REASON_LABELS, lateLogging, type MissedReason } from "@/lib/domain/adherence";
import {
  barOrMachine,
  formatLoad,
  fromKg,
  LOAD_UNIT_CHOICES,
  parseWeight,
  suggestLoad,
  toKg,
  type AdaptedLoad,
  type LoadUnit,
  type WeightUnit,
} from "@/lib/domain/loads";

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
  holdSecondsLow: number | null;
  holdSecondsHigh: number | null;
  /** Répétitions déduites du max courant : max − `maxOffset`. */
  maxOffset: number | null;
  perSide: boolean;
  loadRaw: string | null;
  loadKg: number | null;
  /** Charge prescrite par haltère, telle qu'écrite dans le programme. */
  dumbbellRaw: string | null;
  dumbbellKg: number | null;
  restSeconds: number | null;
  cue: string | null;
  /** Équivalent maison fourni par le programme pour cet exercice. */
  homeAlternative: string | null;
  /**
   * Ligne du bloc COMPLÉMENT : prescrite, jamais obligatoire. Elle s'affiche
   * après le noyau et ne compte pas dans le décompte de la séance — sans quoi
   * une séance faite entièrement afficherait « 5/8 » et se lirait comme un
   * échec.
   */
  optional: boolean;
  /** Charge proposée d'après la dernière séance, et pourquoi. */
  habitual?: AdaptedLoad | null;
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
    title: string | null;
    durationSeconds: number | null;
    rpe: number | null;
    note: string | null;
    missedReason: string | null;
    /** Précision libre saisie avec le motif. */
    missedNote: string | null;
    loggedAt: string | null;
    exercises: {
      programExerciseId: number | null;
      exerciseId: number;
      done: boolean;
      weightKg: number | null;
      loadUnit: string | null;
      weightUnit?: WeightUnit;
      setsDone: number | null;
      repsDone: number | null;
      holdSecondsDone: number | null;
      machineNote: string | null;
      note: string | null;
      isExtra: boolean;
      name: string;
      measureLabel: string;
    }[];
  } | null;
}


/**
 * Ligne ajoutée à la séance en dehors du programme : entraînement
 * supplémentaire, ou substitut d'un exercice dont la machine était occupée.
 */
interface ExtraLine {
  key: string;
  exerciseId: number;
  name: string;
  measureLabel: string;
  unit: "reps" | "seconds";
  /** Renseigné quand cette ligne remplace un exercice du programme. */
  replacesLabel: string | null;
  done: boolean;
  weightKg: string;
  loadUnit: LoadUnit;
  /** Unité du nombre saisi dans `weightKg` (le nom du champ est historique). */
  weightUnit: WeightUnit;
  setsDone: string;
  repsDone: string;
  restSeconds: string;
}

interface EntryState {
  done: boolean;
  weightKg: string;
  loadUnit: LoadUnit;
  /** Unité du nombre saisi dans `weightKg` (le nom du champ est historique). */
  weightUnit: WeightUnit;
  /**
   * Séries validées d'un toucher sur l'icône. Facultatif : un brouillon écrit
   * avant son introduction ne le porte pas, il se déduit alors de `done`.
   */
  setsCompleted?: number;
  setsDone: string;
  repsDone: string;
  holdSecondsDone: string;
  machineNote: string;
  skipReason: string;
}

/** Nombre de séries à valider : celui du programme, à défaut celui saisi. */
function targetSets(exercise: PrescribedExercise, typed?: string | number | null): number {
  return Math.max(1, exercise.sets ?? (Number(typed) || 1));
}

/** Séries déjà validées, y compris pour un brouillon antérieur au décompte par série. */
function completedSets(entry: EntryState, target: number): number {
  return Math.min(target, entry.setsCompleted ?? (entry.done ? target : 0));
}

function initialEntry(exercise: PrescribedExercise, logged?: SessionData["logged"]): EntryState {
  const previous = logged?.exercises.find((e) => e.programExerciseId === exercise.id);

  // La charge proposée vient d'abord de ce qui a déjà été saisi, puis de la
  // charge habituelle, puis du programme : les kg du tableau sont un point de
  // départ, pas une consigne. L'ancien type « barre_machine » est ramené à
  // barre ou machine selon l'exercice.
  const previousUnit: LoadUnit | null = !previous?.loadUnit
    ? null
    : previous.loadUnit === "barre_machine"
      ? barOrMachine(exercise.name, exercise.equipment)
      : (previous.loadUnit as LoadUnit);
  const previousWeightUnit: WeightUnit = previous?.weightUnit ?? "kg";
  const load =
    previousUnit === null
      ? suggestLoad(exercise)
      : previous?.weightKg != null
        ? {
            loadUnit: previousUnit,
            weight: String(fromKg(previous.weightKg, previousWeightUnit)),
            weightUnit: previousWeightUnit,
          }
        : suggestLoad(exercise, previousUnit);

  return {
    done: previous?.done ?? false,
    setsCompleted: previous?.done ? targetSets(exercise, previous.setsDone) : 0,
    weightKg: load.weight,
    loadUnit: load.loadUnit,
    weightUnit: load.weightUnit,
    setsDone: previous?.setsDone != null ? String(previous.setsDone) : exercise.sets != null ? String(exercise.sets) : "",
    repsDone:
      previous?.repsDone != null
        ? String(previous.repsDone)
        : exercise.habitual?.repsTarget != null
          ? String(exercise.habitual.repsTarget)
          : exercise.repsLow != null
            ? String(exercise.repsLow)
            : "",
    holdSecondsDone:
      previous?.holdSecondsDone != null
        ? String(previous.holdSecondsDone)
        : exercise.holdSecondsLow != null
          ? String(exercise.holdSecondsLow)
          : "",
    machineNote: previous?.machineNote ?? "",
    skipReason: "",
  };
}

/**
 * Libellé de la prescription.
 *
 * Deux nuances que le programme distingue et qu'il ne faut pas écraser :
 * une fourchette de tenue (« 20-30 s ») n'est pas une tenue unique, et le
 * décalage sur le max vaut 1 les jours de force mais 2 le jeudi, journée de
 * volume volontairement plus légère.
 */
/**
 * Charge prescrite, telle qu'elle est écrite dans le programme.
 *
 * Deux colonnes la portent : la charge d'une barre ou d'une machine, et celle
 * d'un haltère — « 8 kg » y signifie huit kilos dans chaque main. Longtemps
 * seule la première était affichée, ce qui privait de repère toutes les lignes
 * aux haltères : 167 sur le programme de salle, 128 sur celui de la maison.
 */
/** Libellé lisible d'un motif d'absence, ou null si le motif est inconnu. */
function missedLabel(reason: string | null | undefined): string | null {
  if (!reason) return null;
  return MISSED_REASON_LABELS[reason as MissedReason] ?? reason;
}

function prescribedLoad(exercise: { loadRaw: string | null; dumbbellRaw: string | null }): string {
  const barre = exercise.loadRaw && exercise.loadRaw !== "--" ? exercise.loadRaw : "";
  // Une charge chiffrée est « prévue » ; « Série test » ou « Modéré » sont des
  // repères, pas des charges : « prévu Série test » ne voulait rien dire.
  if (barre !== "") return /\d/.test(barre) ? ` · prévu ${barre}` : ` · repère : ${barre}`;

  const haltere = exercise.dumbbellRaw && exercise.dumbbellRaw !== "--" ? exercise.dumbbellRaw : "";
  if (haltere !== "") return ` · prévu ${haltere} par haltère`;

  return "";
}

function prescriptionLabel(exercise: PrescribedExercise, pullupMax: number): string {
  if (exercise.maxOffset !== null) {
    // Seul le max de tractions est connu de l'application : l'appliquer aux
    // pompes donnait « 3 × 1 » à quelqu'un qui en fait vingt.
    if (!/traction/i.test(exercise.name)) {
      return `${exercise.sets ?? "?"} × (ton max − ${exercise.maxOffset})`;
    }
    const reps = repsForMax(pullupMax, exercise.maxOffset);
    return `${exercise.sets ?? "?"} × ${reps} (max ${pullupMax} − ${exercise.maxOffset})`;
  }

  if (exercise.holdSecondsLow !== null) {
    const hold =
      exercise.holdSecondsHigh === null || exercise.holdSecondsLow === exercise.holdSecondsHigh
        ? `${exercise.holdSecondsLow} s`
        : `${exercise.holdSecondsLow}-${exercise.holdSecondsHigh} s`;
    return `${exercise.sets ?? 1} × ${hold}`;
  }

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
  pullupMax,
  exercises,
  onSaved,
}: {
  date: string;
  session: SessionData;
  isPast: boolean;
  /** Max de tractions courant, pour résoudre les prescriptions « max − N ». */
  pullupMax: number;
  /** Catalogue complet, pour ajouter ou substituer un exercice. */
  exercises: ExerciseOption[];
  onSaved?: () => void;
}) {
  const [entries, setEntries] = useState<Record<number, EntryState>>(() =>
    Object.fromEntries(
      session.prescribed.map((exercise) => [exercise.id, initialEntry(exercise, session.logged)]),
    ),
  );
  const [expanded, setExpanded] = useState<number | null>(null);
  const [extras, setExtras] = useState<ExtraLine[]>(() =>
    (session.logged?.exercises ?? [])
      .filter((entry) => entry.isExtra)
      .map((entry, index) => ({
        key: `saved-${entry.exerciseId}-${index}`,
        exerciseId: entry.exerciseId,
        name: entry.name ?? "Exercice",
        measureLabel: entry.measureLabel ?? "reps",
        unit: "reps" as const,
        replacesLabel: null,
        done: entry.done,
        weightKg: entry.weightKg === null ? "" : String(fromKg(entry.weightKg, entry.weightUnit ?? "kg")),
        loadUnit: (entry.loadUnit as LoadUnit) ?? "poids_du_corps",
        weightUnit: entry.weightUnit ?? "kg",
        setsDone: entry.setsDone === null ? "" : String(entry.setsDone),
        repsDone: entry.repsDone === null ? "" : String(entry.repsDone),
        restSeconds: "",
      })),
  );
  /** Ouvert pour un ajout simple, ou pour remplacer l'exercice ciblé. */
  const [picker, setPicker] = useState<{ replacing: number | null } | null>(null);
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
  /** Titre d'une séance libre : « Corde à sauter », « Football », … */
  const [title, setTitle] = useState(session.logged?.title ?? "");
  const [saving, setSaving] = useState(false);
  /*
   * État « déjà enregistrée », repris du serveur et non seulement de la saisie
   * en cours. Sans cela, revenir sur une séance enregistrée rouvrait le
   * formulaire comme si de rien n'était : les champs pré-remplis par le
   * programme ressemblent à s'y méprendre à une saisie perdue.
   */
  const [savedAt, setSavedAt] = useState<string | null>(() =>
    session.logged && ["done", "partial", "missed", "moved"].includes(session.logged.status)
      ? (session.logged.loggedAt ?? new Date().toISOString())
      : null,
  );
  const startRef = useRef<number | null>(null);

  /*
   * Brouillon local.
   *
   * Tout ce qui est tapé ne vivait que dans l'état React : quitter l'écran, ou
   * laisser iOS décharger la page pendant que le téléphone est verrouillé,
   * suffisait à tout perdre. À 23h en salle, c'est le pire moment pour
   * redemander à quelqu'un de retaper ses charges.
   *
   * Le brouillon est écrit à chaque frappe et relu au montage. Il n'est
   * appliqué que si la personne n'a encore rien touché : une lecture qui
   * arriverait après une première saisie l'écraserait.
   */
  const touched = useRef(false);
  const draftLoaded = useRef(false);
  /** Une saisie est en cours et n'est pas encore partie au serveur. */
  const [hasDraft, setHasDraft] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      const draft = await readDraft(date, session.slot);
      if (cancelled || touched.current || !draft) {
        draftLoaded.current = true;
        return;
      }

      const payload = draft.payload as Partial<{
        entries: Record<number, EntryState>;
        extras: ExtraLine[];
        location: "salle" | "maison";
        rpe: number | null;
        note: string;
        title: string;
        elapsed: number;
      }>;

      if (payload.entries) setEntries((current) => ({ ...current, ...payload.entries }));
      if (payload.extras) setExtras(payload.extras);
      if (payload.location) setLocation(payload.location);
      if (payload.rpe !== undefined) setRpe(payload.rpe);
      if (typeof payload.note === "string") setNote(payload.note);
      if (typeof payload.title === "string") setTitle(payload.title);
      if (typeof payload.elapsed === "number" && payload.elapsed > 0) setElapsed(payload.elapsed);

      setHasDraft(true);
      draftLoaded.current = true;
    };

    void restore();
    return () => {
      cancelled = true;
    };
  }, [date, session.slot]);

  // Écriture du brouillon, une fois la restauration passée pour ne pas
  // réécrire par-dessus ce qu'on vient tout juste de lire.
  useEffect(() => {
    if (!draftLoaded.current || !touched.current) return;
    setHasDraft(true);
    void saveDraft(date, session.slot, { entries, extras, location, rpe, note, title, elapsed });
  }, [date, session.slot, entries, extras, location, rpe, note, title, elapsed]);

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

  const update = (id: number, patch: Partial<EntryState>) => {
    touched.current = true;
    setEntries((current) => {
      const next = { ...current[id], ...patch };
      // Changer de type change la charge proposée : 30 kg à la barre ne font
      // pas 30 kg par haltère. On reprend l'habitude de ce type, sinon le
      // programme — jamais le nombre d'avant.
      if (patch.loadUnit && patch.loadUnit !== current[id].loadUnit) {
        const exercise = session.prescribed.find((e) => e.id === id);
        if (exercise) {
          const suggestion = suggestLoad(exercise, patch.loadUnit);
          next.weightKg = suggestion.weight;
          next.weightUnit = suggestion.weightUnit;
        }
      }
      return { ...current, [id]: next };
    });
  };

  /**
   * Un toucher = une série. L'icône se remplit série après série ; pleine,
   * l'exercice est fait. Toucher une icône déjà pleine la vide : c'est la
   * correction d'une fausse manœuvre, pas un geste courant.
   */
  const tapSet = (exercise: PrescribedExercise) => {
    const entry = entries[exercise.id];
    const target = targetSets(exercise, entry.setsDone);
    const completed = completedSets(entry, target);

    if (completed >= target) {
      update(exercise.id, { setsCompleted: 0, done: false, setsDone: String(target) });
      setRest(null);
      return;
    }

    const next = completed + 1;
    const full = next >= target;
    update(exercise.id, {
      setsCompleted: next,
      setsDone: String(next),
      done: full,
      skipReason: full ? "" : entry.skipReason,
    });

    if (!running) setRunning(true);

    // Le repos démarre à chaque série validée, avec le temps prescrit : c'est
    // le repos ENTRE les séries. Le premier mouvement d'un superset s'enchaîne
    // sans repos (0 s au programme) ; le repos vient après le second.
    if (exercise.restSeconds !== null && exercise.restSeconds > 0) {
      // Compteur monotone plutôt qu'horodatage : lire l'horloge depuis le corps
      // du composant est un effet de bord, et un simple incrément suffit à
      // remonter le chronomètre.
      setRest((previous) => ({
        seconds: exercise.restSeconds!,
        label: full ? `${exercise.name} — terminé, exercice suivant` : `${exercise.name} — série ${next + 1}/${target} ensuite`,
        key: (previous?.key ?? 0) + 1,
      }));
    }
  };

  const addExercise = (option: ExerciseOption, replacing: number | null) => {
    const replaced = replacing === null ? null : session.prescribed.find((e) => e.id === replacing);

    // Remplacer, c'est marquer l'original non fait avec son motif, puis ajouter
    // le substitut. La séance garde ainsi la trace de ce qui était prévu.
    if (replaced) {
      update(replaced.id, { done: false, skipReason: "machine_occupee" });
    }

    touched.current = true;
    setExtras((current) => [
      ...current,
      {
        key: `new-${current.length}-${option.id}`,
        exerciseId: option.id,
        name: option.name,
        measureLabel: option.measureLabel,
        unit: option.unit,
        replacesLabel: replaced ? replaced.name : null,
        done: false,
        weightKg: "",
        loadUnit: "poids_du_corps",
        weightUnit: "kg",
        setsDone: "3",
        repsDone: "",
        restSeconds: "",
      },
    ]);
    setPicker(null);
    if (!running) setRunning(true);
  };

  const updateExtra = (key: string, patch: Partial<ExtraLine>) => {
    touched.current = true;
    setExtras((current) => current.map((e) => (e.key === key ? { ...e, ...patch } : e)));
  };

  const removeExtra = (key: string) => {
    touched.current = true;
    setExtras((current) => current.filter((e) => e.key !== key));
  };

  /*
   * Le décompte porte sur le noyau : c'est lui qui définit « la séance faite ».
   * Le complément s'y ajoute quand il est coché, mais ne gonfle jamais le
   * dénominateur — une séance complète du noyau doit pouvoir afficher 5/5.
   */
  const core = session.prescribed.filter((e) => !e.optional);
  const complement = session.prescribed.filter((e) => e.optional);
  const doneCount =
    core.filter((e) => entries[e.id]?.done).length + extras.filter((e) => e.done).length;
  const total = core.length + extras.length;
  const complementDone = complement.filter((e) => entries[e.id]?.done).length;

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
        const typed = parseWeight(entry.weightKg);
        const weight = typed === null ? null : toKg(typed, entry.weightUnit ?? "kg");

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
        title: session.slot === "libre" ? title.trim() || "Entraînement libre" : null,
        durationSeconds: elapsed > 0 ? elapsed : null,
        rpe,
        note: note.trim() === "" ? null : note.trim(),
        loggedAt: new Date().toISOString(),
        exercises: [
          ...session.prescribed.map((exercise) => {
          const entry = entries[exercise.id];
          const typed = parseWeight(entry.weightKg);
          return {
            programExerciseId: exercise.id,
            exerciseId: exercise.exerciseId,
            orderIndex: exercise.orderIndex,
            orderLabel: exercise.orderLabel,
            // Des séries validées sont du travail réel, même si l'exercice n'a
            // pas été mené au bout : elles comptent, avec leur nombre exact.
            done: entry.done || (entry.setsCompleted ?? 0) > 0,
            isExtra: false,
            skipReason: entry.done || entry.skipReason === "" ? null : entry.skipReason,
            weightKg:
              entry.loadUnit === "poids_du_corps" || typed === null ? null : toKg(typed, entry.weightUnit ?? "kg"),
            loadUnit: entry.loadUnit,
            weightUnit: entry.weightUnit ?? "kg",
            machineNote: entry.machineNote.trim() === "" ? null : entry.machineNote.trim(),
            setsDone: entry.setsDone === "" ? null : Number(entry.setsDone),
            repsDone: entry.repsDone === "" ? null : Number(entry.repsDone),
            holdSecondsDone: entry.holdSecondsDone === "" ? null : Number(entry.holdSecondsDone),
            note: null,
          };
        }),
          // Lignes ajoutées : entraînement supplémentaire ou substitut d'un
          // exercice indisponible. Elles portent `isExtra` pour ne pas être
          // comparées à une prescription qui n'existe pas.
          ...extras.map((extra, index) => {
            const typed = parseWeight(extra.weightKg);
            return {
              programExerciseId: null,
              exerciseId: extra.exerciseId,
              orderIndex: session.prescribed.length + index,
              orderLabel: null,
              done: extra.done,
              isExtra: true,
              skipReason: null,
              weightKg:
                extra.loadUnit === "poids_du_corps" || typed === null ? null : toKg(typed, extra.weightUnit ?? "kg"),
              loadUnit: extra.loadUnit,
              weightUnit: extra.weightUnit ?? "kg",
              machineNote: null,
              setsDone: extra.setsDone === "" ? null : Number(extra.setsDone),
              repsDone: extra.repsDone === "" ? null : Number(extra.repsDone),
              holdSecondsDone: null,
              note: extra.replacesLabel ? `Remplace : ${extra.replacesLabel}` : null,
            };
          }),
        ],
      });
      /*
       * On attend l'envoi avant de prévenir l'écran parent.
       *
       * `enqueue` écrit en local et pousse la file sans attendre. Le parent
       * rechargeait donc la journée depuis le serveur AVANT que la séance n'y
       * soit arrivée, et réaffichait l'état d'avant l'enregistrement — ce qui
       * se lit exactement comme « rien n'a été enregistré ».
       *
       * Hors ligne, `flushOutbox` rend la main tout de suite : la file part au
       * retour du réseau, et le brouillon local garde la saisie en attendant.
       */
      await flushOutbox();

      // La séance est partie : le brouillon n'a plus lieu d'être.
      await clearDraft(date, session.slot);
      touched.current = false;
      setHasDraft(false);
      setSavedAt(new Date().toISOString());
      onSaved?.();
    } finally {
      setSaving(false);
    }
  };

  /**
   * Déclarer une séance manquée efface les exercices déjà saisis, côté serveur
   * comme en local : une séance ratée n'a pas d'exercices réalisés. Le geste
   * est irréversible et le bouton voisine avec « Terminer la séance », d'où la
   * confirmation — mais seulement s'il y a quelque chose à perdre.
   */
  const declareMissed = async (reason: MissedReason) => {
    const entered =
      extras.length > 0 ||
      session.prescribed.some((exercise) => {
        const entry = entries[exercise.id];
        const initial = initialEntry(exercise, session.logged);
        return (
          entry?.done ||
          entry?.weightKg !== initial.weightKg ||
          entry?.setsDone !== initial.setsDone ||
          entry?.repsDone !== initial.repsDone
        );
      });

    if (entered) {
      const confirmed = window.confirm(
        "Marquer cette séance comme manquée effacera les exercices et les charges déjà saisis.\n\nContinuer ?",
      );
      if (!confirmed) return;
    }

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
      await flushOutbox();
      await clearDraft(date, session.slot);
      touched.current = false;
      setHasDraft(false);
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
          <Badge tone={session.slot === "libre" ? "accent" : session.slot}>
            {SLOT_LABELS[session.slot]}
          </Badge>
          <p className="text-sm text-muted">Repos prévu. C'est une consigne, pas une option.</p>
        </div>
      </Card>
    );
  }

  if (savedAt) {
    // Une séance déclarée manquée n'a pas été « enregistrée » au sens où on
    // l'entend : le dire autrement évite de laisser croire à une saisie perdue.
    const missed = session.logged?.status === "missed";

    return (
      <Card>
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "mt-0.5 grid size-8 shrink-0 place-items-center rounded-full",
              missed ? "bg-danger/15 text-danger" : "bg-success/15 text-success",
            )}
          >
            {missed ? <X size={18} /> : <Check size={18} />}
          </span>
          <div>
            <p className="font-medium">{missed ? "Séance marquée manquée" : "Séance enregistrée"}</p>

            {missed ? (
              <>
                {/* Le motif est la seule information utile d'une séance ratée :
                    c'est lui qui alimente la lecture des absences. */}
                <p className="mt-1 text-sm text-muted">
                  Motif :{" "}
                  <span className="text-text">
                    {missedLabel(session.logged?.missedReason) ?? "non précisé"}
                  </span>
                </p>
                {session.logged?.missedNote ? (
                  <p className="mt-0.5 text-sm text-faint">{session.logged.missedNote}</p>
                ) : null}
                <p className="mt-1 text-sm text-faint">
                  Aucun exercice conservé — c&apos;est ce que veut dire « manquée ».
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm text-muted">
                {doneCount}/{total} exercices faits
                {elapsed > 0 ? ` · ${formatDuration(elapsed)}` : ""}
              </p>
            )}
            {late.isLate ? (
              <p className="mt-2">
                <Badge>{late.label}</Badge>
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
          <Badge tone={session.slot === "libre" ? "accent" : (session.slot as "salle" | "matin" | "soir")}>
            {SLOT_LABELS[session.slot]}
          </Badge>
          {session.slot === "libre" ? (
            <input
              value={title}
              onChange={(event) => {
                touched.current = true;
                setTitle(event.target.value);
              }}
              placeholder="Entraînement libre"
              aria-label="Titre de la séance"
              className="tap min-w-0 flex-1 rounded-lg border border-border bg-raised px-2 font-semibold outline-none focus:border-accent"
            />
          ) : (
            <h2 className="min-w-0 flex-1 truncate font-semibold">{session.label}</h2>
          )}

          {session.weekNumber ? <Badge>S{session.weekNumber}</Badge> : null}

          {isPast ? (
            <Badge>
              <History size={12} aria-hidden /> Saisie après coup
            </Badge>
          ) : null}

          {session.slot === "salle" || session.slot === "libre" ? (
            <button
              type="button"
              onClick={() => {
                touched.current = true;
                setLocation((value) => (value === "salle" ? "maison" : "salle"));
              }}
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
                {session.prescribed.every((exercise) => !exercise.homeAlternative) ? (
                  <p className="mt-2 text-muted">
                    Le programme ne fournit pas d'équivalent maison pour cette semaine — la colonne
                    commence en semaine 2. Adapte au poids du corps : pompes pour la poussée,
                    traction ou traction australienne pour le tirage, fentes et squats une jambe pour
                    les jambes.
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="flex items-center justify-between px-4 py-2 text-xs text-faint sm:px-5">
              <span>
                {doneCount}/{total} exercices
                {complement.length > 0
                  ? ` · complément ${complementDone}/${complement.length}`
                  : ""}
              </span>
              {elapsed > 3600 ? (
                <span className="text-warning">Au-delà des 60 min visées</span>
              ) : null}
            </div>

            <ul className="divide-y divide-border">
              {[...core, ...complement].map((exercise, index, list) => {
                const entry = entries[exercise.id];
                const isOpen = expanded === exercise.id;
                const isSuperset = exercise.supersetGroup !== null;
                // Première ligne du complément : c'est là que la séance
                // obligatoire s'arrête et que le bonus commence.
                const opensComplement =
                  exercise.optional && (index === 0 || !list[index - 1].optional);

                return (
                  <li key={exercise.id} className="px-4 py-3 sm:px-5">
                    {opensComplement ? (
                      <div className="-mx-4 mb-3 border-y border-border bg-raised px-4 py-2 sm:-mx-5 sm:px-5">
                        <p className="text-sm font-medium">Complément — facultatif</p>
                        <p className="mt-0.5 text-xs text-muted">
                          Le noyau est fait. La suite se fait les bons jours : la sauter n'est pas un
                          échec, et ne compte pas contre toi.
                        </p>
                      </div>
                    ) : null}
                    <div className="flex items-start gap-3">
                      <SetProgressButton
                        label={exercise.orderLabel}
                        name={exercise.name}
                        completed={completedSets(entry, targetSets(exercise, entry.setsDone))}
                        target={targetSets(exercise, entry.setsDone)}
                        onTap={() => tapSet(exercise)}
                      />

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <span className={cn("font-medium", entry.done && "text-muted line-through")}>
                            {exercise.name}
                          </span>
                          {isSuperset ? <Badge tone="accent">superset {exercise.supersetGroup}</Badge> : null}
                          {(() => {
                            const target = targetSets(exercise, entry.setsDone);
                            const completed = completedSets(entry, target);
                            return completed > 0 && completed < target ? (
                              <span className="text-xs tabular-nums text-accent">
                                série {completed}/{target}
                              </span>
                            ) : null;
                          })()}
                        </div>

                        {location === "maison" ? (
                          <p className="mt-0.5 flex items-start gap-1.5 text-sm text-soir">
                            <Home size={13} className="mt-0.5 shrink-0" aria-hidden />
                            {exercise.homeAlternative || (
                              <span className="text-faint">
                                Pas d'équivalent fourni — adapte au poids du corps
                              </span>
                            )}
                          </p>
                        ) : (
                          <p className="mt-0.5 text-sm text-faint">
                            {prescriptionLabel(exercise, pullupMax)}
                            {exercise.restSeconds !== null
                              ? ` · repos ${formatSeconds(exercise.restSeconds)}`
                              : ""}
                            {prescribedLoad(exercise)}
                          </p>
                        )}

                        {location === "salle" && exercise.habitual?.reason ? (
                          <p className="mt-0.5 text-xs text-accent">{exercise.habitual.reason}</p>
                        ) : location === "salle" &&
                          !exercise.habitual &&
                          exercise.loadKg === null &&
                          exercise.dumbbellKg === null &&
                          entry.loadUnit !== "poids_du_corps" ? (
                          // Aucune charge connue : c'est la première fois. La série
                          // test la fixe, et la séance suivante partira de là.
                          <p className="mt-0.5 text-xs text-accent">
                            Série test : trouve ta charge à la 1re série (2–3 reps en réserve), puis note-la.
                          </p>
                        ) : null}

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
                                placeholder={entry.weightUnit ?? "kg"}
                                className="tap w-20 rounded-lg border border-border bg-raised px-2 text-center text-base tabular-nums outline-none focus:border-accent"
                              />
                              <WeightUnitToggle
                                unit={entry.weightUnit ?? "kg"}
                                onChange={(weightUnit) => update(exercise.id, { weightUnit })}
                                label={exercise.name}
                              />
                              <LoadHint weight={entry.weightKg} loadUnit={entry.loadUnit} weightUnit={entry.weightUnit ?? "kg"} />
                            </label>
                          ) : null}

                          <LoadUnitSelect
                            value={entry.loadUnit}
                            onChange={(loadUnit) => update(exercise.id, { loadUnit })}
                            label={exercise.name}
                          />

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

                            <div className="sm:col-span-2">
                              <button
                                type="button"
                                onClick={() => setPicker({ replacing: exercise.id })}
                                className="tap flex items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm text-muted"
                              >
                                <Repeat size={14} aria-hidden />
                                Remplacer — machine occupée
                              </button>
                              <p className="mt-1 text-xs text-faint">
                                L'exercice prévu sera marqué non fait, et le substitut ajouté à la
                                séance.
                              </p>
                            </div>

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

            {extras.length > 0 ? (
              <ul className="divide-y divide-border border-t border-border">
                {extras.map((extra) => (
                  <li key={extra.key} className="px-4 py-3 sm:px-5">
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => updateExtra(extra.key, { done: !extra.done })}
                        aria-pressed={extra.done}
                        aria-label={`${extra.name} : ${extra.done ? "fait" : "à faire"}`}
                        className={cn(
                          "tap mt-0.5 grid size-11 shrink-0 place-items-center rounded-xl border-2 transition-colors",
                          extra.done
                            ? "border-success bg-success/20 text-success"
                            : "border-border-strong text-faint",
                        )}
                      >
                        {extra.done ? <Check size={22} /> : <Plus size={18} />}
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className={cn("font-medium", extra.done && "text-muted line-through")}>
                            {extra.name}
                          </span>
                          <Badge tone={extra.replacesLabel ? "warning" : "accent"}>
                            {extra.replacesLabel ? "remplace" : "en plus"}
                          </Badge>
                        </div>

                        {extra.replacesLabel ? (
                          <p className="mt-0.5 text-xs text-faint">
                            À la place de « {extra.replacesLabel} »
                          </p>
                        ) : null}

                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <label className="flex items-center gap-1.5">
                            <span className="sr-only">Séries pour {extra.name}</span>
                            <input
                              inputMode="numeric"
                              value={extra.setsDone}
                              onChange={(event) =>
                                updateExtra(extra.key, { setsDone: event.target.value })
                              }
                              placeholder="séries"
                              className="tap w-16 rounded-lg border border-border bg-raised px-2 text-center tabular-nums outline-none focus:border-accent"
                            />
                            <span className="text-sm text-faint">×</span>
                          </label>

                          <label className="flex items-center gap-1.5">
                            <span className="sr-only">
                              {extra.measureLabel} pour {extra.name}
                            </span>
                            <input
                              inputMode="numeric"
                              value={extra.repsDone}
                              onChange={(event) =>
                                updateExtra(extra.key, { repsDone: event.target.value })
                              }
                              placeholder={extra.measureLabel}
                              className="tap w-20 rounded-lg border border-border bg-raised px-2 text-center tabular-nums outline-none focus:border-accent"
                            />
                            <span className="text-sm text-faint">{extra.measureLabel}</span>
                          </label>

                          {extra.loadUnit !== "poids_du_corps" ? (
                            <label className="flex items-center gap-1.5">
                              <span className="sr-only">Charge pour {extra.name}</span>
                              <input
                                inputMode="decimal"
                                value={extra.weightKg}
                                onChange={(event) =>
                                  updateExtra(extra.key, { weightKg: event.target.value })
                                }
                                placeholder={extra.weightUnit ?? "kg"}
                                className="tap w-20 rounded-lg border border-border bg-raised px-2 text-center tabular-nums outline-none focus:border-accent"
                              />
                              <WeightUnitToggle
                                unit={extra.weightUnit ?? "kg"}
                                onChange={(weightUnit) => updateExtra(extra.key, { weightUnit })}
                                label={extra.name}
                              />
                              <LoadHint weight={extra.weightKg} loadUnit={extra.loadUnit} weightUnit={extra.weightUnit ?? "kg"} />
                            </label>
                          ) : null}

                          <LoadUnitSelect
                            value={extra.loadUnit}
                            onChange={(loadUnit) => updateExtra(extra.key, { loadUnit })}
                            label={extra.name}
                          />

                          <button
                            type="button"
                            onClick={() => removeExtra(extra.key)}
                            className="tap grid place-items-center rounded-lg text-faint hover:text-danger"
                            aria-label={`Retirer ${extra.name}`}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="border-t border-border px-4 py-3 sm:px-5">
              {picker ? (
                <ExercisePicker
                  exercises={exercises}
                  onPick={(option) => addExercise(option, picker.replacing)}
                  onClose={() => setPicker(null)}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setPicker({ replacing: null })}
                  className="tap flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong text-sm text-muted"
                >
                  <Plus size={16} aria-hidden />
                  Ajouter un exercice
                </button>
              )}
            </div>

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

            {hasDraft ? (
              <p className="px-4 pb-4 text-xs text-faint sm:px-5">
                Saisie en cours, gardée sur cet appareil. Elle ne compte que lorsque tu touches
                « Terminer la séance ».
              </p>
            ) : null}
          </>
        ) : (
          <Summary
            session={session}
            entries={entries}
            doneCount={doneCount}
            total={total}
            elapsed={elapsed}
            rpe={rpe}
            setRpe={(value) => {
              touched.current = true;
              setRpe(value);
            }}
            note={note}
            setNote={(value) => {
              touched.current = true;
              setNote(value);
            }}
            advices={advices}
            late={isPast}
            location={location}
            extras={extras}
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
  extras,
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
  extras: ExtraLine[];
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
                {formatLoad(parseWeight(entry.weightKg), entry.loadUnit, entry.weightUnit ?? "kg")}
              </span>
            </li>
          );
        })}
        {extras.map((extra) => (
          <li key={extra.key} className="flex items-center gap-3 px-3 py-2 text-sm">
            <span
              className={cn(
                "grid size-5 shrink-0 place-items-center rounded",
                extra.done ? "bg-success/20 text-success" : "bg-raised text-faint",
              )}
              aria-hidden
            >
              {extra.done ? <Check size={13} /> : <X size={13} />}
            </span>
            <span className={cn("min-w-0 flex-1 truncate", !extra.done && "text-faint")}>
              {extra.name}
              <span className="ml-1 text-xs text-faint">
                {extra.replacesLabel ? "· remplace" : "· en plus"}
              </span>
            </span>
            <span className="shrink-0 tabular-nums text-muted">
              {extra.setsDone && extra.repsDone
                ? `${extra.setsDone} × ${extra.repsDone} ${extra.measureLabel}`
                : "—"}
            </span>
          </li>
        ))}
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
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-border bg-raised p-3 text-sm">
          <History size={16} className="mt-0.5 shrink-0 text-faint" aria-hidden />
          <p className="text-muted">
            Séance saisie après coup : tes charges et tes répétitions comptent normalement. Seules la
            durée et les pauses, qui n'ont pas été chronométrées, restent hors des analyses de temps.
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

/**
 * Bascule kg / lb. Elle ne convertit pas le nombre : elle dit dans quelle
 * unité il a été lu. Sur une machine graduée en livres, on tape ce qu'on lit,
 * on touche « lb », et l'application convertit en kilos à l'enregistrement.
 */
function WeightUnitToggle({
  unit,
  onChange,
  label,
}: {
  unit: WeightUnit;
  onChange: (unit: WeightUnit) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(unit === "kg" ? "lb" : "kg")}
      aria-label={`Unité de la charge pour ${label} : ${unit === "kg" ? "kilos" : "livres"}. Toucher pour changer.`}
      className="tap min-w-11 rounded-lg border border-border bg-raised px-2 text-sm font-medium tabular-nums text-muted outline-none focus:border-accent"
    >
      {unit}
    </button>
  );
}

/** « par haltère » pour les haltères, et l'équivalent en kilos d'une saisie en livres. */
function LoadHint({ weight, loadUnit, weightUnit }: { weight: string; loadUnit: LoadUnit; weightUnit: WeightUnit }) {
  const typed = parseWeight(weight);
  const parts: string[] = [];
  if (loadUnit === "kg_par_haltere") parts.push("par haltère");
  if (weightUnit === "lb" && typed !== null) parts.push(`≈ ${String(fromKg(toKg(typed, "lb"), "kg")).replace(".", ",")} kg`);
  if (parts.length === 0) return null;
  return <span className="text-xs text-faint">{parts.join(" · ")}</span>;
}

/** Type de charge. L'ancien « barre / machine » n'est montré que s'il est déjà enregistré. */
function LoadUnitSelect({
  value,
  onChange,
  label,
}: {
  value: LoadUnit;
  onChange: (unit: LoadUnit) => void;
  label: string;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as LoadUnit)}
      aria-label={`Type de charge pour ${label}`}
      className="tap rounded-lg border border-border bg-raised px-2 text-sm text-muted outline-none focus:border-accent"
    >
      {value === "barre_machine" ? <option value="barre_machine">barre / machine</option> : null}
      {LOAD_UNIT_CHOICES.map((choice) => (
        <option key={choice.value} value={choice.value}>
          {choice.label}
        </option>
      ))}
    </select>
  );
}

/**
 * Icône d'exercice qui se remplit série après série.
 *
 * Le remplissage monte à l'intérieur de l'icône, par paliers égaux : deux
 * séries, deux moitiés ; quatre séries, quatre quarts. Pleine, elle passe au
 * vert avec une coche. La cible reste de 44 px : elle se touche d'une main,
 * entre deux séries.
 */
function SetProgressButton({
  label,
  name,
  completed,
  target,
  onTap,
}: {
  label: string;
  name: string;
  completed: number;
  target: number;
  onTap: () => void;
}) {
  const full = completed >= target;
  const percent = Math.round((completed / target) * 100);
  return (
    <button
      type="button"
      onClick={onTap}
      aria-pressed={full}
      aria-label={
        full
          ? `${name} : fait, ${target} séries sur ${target}. Toucher pour annuler.`
          : `${name} : ${completed} série${completed > 1 ? "s" : ""} sur ${target}. Toucher pour valider la suivante.`
      }
      className={cn(
        "tap relative mt-0.5 grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl border-2 transition-colors",
        full ? "border-success text-success" : completed > 0 ? "border-accent text-text" : "border-border-strong text-faint",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-x-0 bottom-0 transition-[height] duration-300 ease-out",
          full ? "bg-success/25" : "bg-accent/30",
        )}
        style={{ height: `${percent}%` }}
      />
      {target > 1 && !full ? (
        <span aria-hidden className="absolute inset-x-1 top-1 flex gap-0.5">
          {Array.from({ length: target }, (_, i) => (
            <span key={i} className={cn("h-0.5 flex-1 rounded-full", i < completed ? "bg-accent" : "bg-border-strong")} />
          ))}
        </span>
      ) : null}
      <span className="relative">{full ? <Check size={22} /> : <span className="text-xs">{label}</span>}</span>
    </button>
  );
}
