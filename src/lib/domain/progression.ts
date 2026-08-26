/**
 * Règles de progression du programme de salle.
 *
 * Ces fonctions sont pures : ni base de données, ni React. C'est ici que vit la
 * valeur du produit, et c'est ici qu'une erreur coûterait le plus cher — une
 * règle fausse ferait charger la mauvaise barre pendant quatre mois. D'où la
 * couverture de tests systématique.
 *
 * Source : « La règle de la série test » et « Comment tu progresses (double
 * progression) » du programme PPL.
 */

export type SessionLocation = "salle" | "maison";

/**
 * Une séance faite à la maison compte-t-elle pour la progression en charge ?
 *
 * Non. Le programme fournit un équivalent maison pour chaque exercice afin de
 * déplacer une séance plutôt que de la rater, mais il pose la limite : « ne
 * compare pas ses performances à celles de la salle, ce sont deux échelles
 * différentes. Ta progression en charge se mesure sur les séances de salle
 * uniquement. »
 *
 * Les séances maison comptent en revanche pleinement pour l'assiduité : c'est
 * tout leur intérêt.
 */
export function countsForLoadProgression(location: SessionLocation): boolean {
  return location === "salle";
}

/** Retire les séances maison d'un historique avant toute analyse de charge. */
export function forLoadProgression<T extends { location: SessionLocation }>(entries: T[]): T[] {
  return entries.filter((entry) => countsForLoadProgression(entry.location));
}

export interface RepRange {
  low: number;
  high: number;
}

export interface PerformedSet {
  reps: number;
  weightKg: number | null;
  rir?: number | null;
  technicalFailure?: boolean;
}

/**
 * Incrément de charge selon la partie du corps.
 * Le document impose +2,5 kg en haut du corps et +5 kg en bas.
 */
export type BodyPart = "haut" | "bas";

export function loadIncrement(part: BodyPart): number {
  return part === "bas" ? 5 : 2.5;
}

/** Les groupes musculaires considérés comme « bas du corps ». */
export function bodyPartOf(muscleGroup: string | null | undefined): BodyPart {
  return muscleGroup === "legs" ? "bas" : "haut";
}

// ---------------------------------------------------------------------------
// Règle de la série test
// ---------------------------------------------------------------------------

export type TestSetVerdict = "trop_leger" | "trop_lourd" | "bonne_charge";

export interface TestSetAdvice {
  verdict: TestSetVerdict;
  /** Ajustement conseillé en kg, 0 si la charge est bonne. */
  adjustmentKg: number;
  message: string;
}

/**
 * Évalue la première série d'un exercice pour fixer la charge.
 *
 * Règle du document :
 *   - au-delà du haut de la fourchette, sans forcer  -> trop léger, +2,5 à 5 kg
 *   - en dessous du bas de la fourchette             -> trop lourd, -2,5 à 5 kg
 *   - dans la fourchette avec 2-3 reps en réserve    -> c'est la charge
 */
export function evaluateTestSet(
  performed: PerformedSet,
  range: RepRange,
  part: BodyPart,
): TestSetAdvice {
  const step = loadIncrement(part);

  if (performed.reps > range.high) {
    return {
      verdict: "trop_leger",
      adjustmentKg: step,
      message: `${performed.reps} reps au-dessus du haut de fourchette (${range.high}) : ajoute ${step} kg.`,
    };
  }

  if (performed.reps < range.low) {
    return {
      verdict: "trop_lourd",
      adjustmentKg: -step,
      message: `${performed.reps} reps sous le bas de fourchette (${range.low}) : retire ${step} kg.`,
    };
  }

  return {
    verdict: "bonne_charge",
    adjustmentKg: 0,
    message: `${performed.reps} reps dans la fourchette ${range.low}-${range.high} : c'est ta charge.`,
  };
}

// ---------------------------------------------------------------------------
// Double progression
// ---------------------------------------------------------------------------

export type ProgressionAction = "augmenter_charge" | "ajouter_une_rep" | "maintenir";

export interface ProgressionAdvice {
  action: ProgressionAction;
  /** Charge conseillée pour la prochaine séance, si connue. */
  nextWeightKg: number | null;
  /** Objectif de reps pour la prochaine séance. */
  nextRepsTarget: number;
  message: string;
}

/**
 * Applique la double progression à partir des séries réalisées.
 *
 * Règle du document :
 *   1. commencer au bas de la fourchette ;
 *   2. +1 rep par série chaque semaine ;
 *   3. quand le haut de la fourchette est tenu SUR TOUTES LES SÉRIES,
 *      +2,5 kg (haut) ou +5 kg (bas) et retour au bas de la fourchette.
 *
 * Une série ratée techniquement ne compte pas comme tenue : la forme décide.
 */
export function advanceDoubleProgression(
  sets: PerformedSet[],
  range: RepRange,
  part: BodyPart,
): ProgressionAdvice {
  const valid = sets.filter((set) => !set.technicalFailure);

  if (valid.length === 0) {
    return {
      action: "maintenir",
      nextWeightKg: sets[0]?.weightKg ?? null,
      nextRepsTarget: range.low,
      message: "Aucune série propre : on garde la même charge.",
    };
  }

  const weight = valid.find((set) => set.weightKg !== null)?.weightKg ?? null;
  const allAtTop = valid.every((set) => set.reps >= range.high);

  if (allAtTop) {
    const step = loadIncrement(part);
    return {
      action: "augmenter_charge",
      nextWeightKg: weight === null ? null : round25(weight + step),
      nextRepsTarget: range.low,
      message:
        weight === null
          ? `Haut de fourchette tenu sur les ${valid.length} séries : monte d'un cran et redescends à ${range.low} reps.`
          : `Haut de fourchette tenu sur les ${valid.length} séries : passe à ${round25(weight + step)} kg et redescends à ${range.low} reps.`,
    };
  }

  const lowest = Math.min(...valid.map((set) => set.reps));
  const target = Math.min(lowest + 1, range.high);

  return {
    action: "ajouter_une_rep",
    nextWeightKg: weight,
    nextRepsTarget: target,
    message: `Vise ${target} reps par série à ${weight === null ? "la même charge" : `${weight} kg`}.`,
  };
}

/**
 * Nettoie le bruit de virgule flottante sur une charge.
 *
 * On n'arrondit PAS au palier de 2,5 kg : les machines et les poulies ont leurs
 * propres incréments, et forcer un arrondi produirait une charge inexistante en
 * salle. L'incrément vient de `loadIncrement`, la base reste celle mesurée.
 */
export function round25(value: number): number {
  return Math.round(value * 100) / 100;
}

// ---------------------------------------------------------------------------
// Indicateurs
// ---------------------------------------------------------------------------

/** Tonnage d'un exercice : somme des charges × répétitions. */
export function tonnage(sets: PerformedSet[]): number {
  return sets.reduce((total, set) => total + (set.weightKg ?? 0) * set.reps, 0);
}

/**
 * 1RM estimé, formule d'Epley.
 *
 * Perd sa validité au-delà d'une dizaine de répétitions : au-dessus, la formule
 * mesure surtout l'endurance. On la borne donc à 12 reps.
 */
export function estimatedOneRepMax(weightKg: number, reps: number): number | null {
  if (weightKg <= 0 || reps <= 0 || reps > 12) return null;
  if (reps === 1) return weightKg;
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10;
}

/** Meilleur 1RM estimé sur un ensemble de séries. */
export function bestEstimatedOneRepMax(sets: PerformedSet[]): number | null {
  let best: number | null = null;
  for (const set of sets) {
    if (set.weightKg === null) continue;
    const estimate = estimatedOneRepMax(set.weightKg, set.reps);
    if (estimate !== null && (best === null || estimate > best)) best = estimate;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Records et stagnation
// ---------------------------------------------------------------------------

export interface ExerciseHistoryPoint {
  date: string;
  bestWeightKg: number | null;
  bestReps: number;
  estimatedOneRepMax: number | null;
  tonnage: number;
}

export type PersonalRecordKind = "charge" | "reps" | "1rm_estime" | "tonnage";

export interface PersonalRecord {
  kind: PersonalRecordKind;
  value: number;
  previous: number | null;
}

/**
 * Records battus par le dernier point de l'historique.
 * L'historique doit être trié par date croissante.
 */
export function detectPersonalRecords(history: ExerciseHistoryPoint[]): PersonalRecord[] {
  if (history.length === 0) return [];

  const latest = history[history.length - 1];
  const earlier = history.slice(0, -1);
  if (earlier.length === 0) return [];

  const records: PersonalRecord[] = [];
  const best = (pick: (p: ExerciseHistoryPoint) => number | null): number | null => {
    const values = earlier.map(pick).filter((v): v is number => v !== null);
    return values.length === 0 ? null : Math.max(...values);
  };

  const checks: { kind: PersonalRecordKind; value: number | null; previous: number | null }[] = [
    { kind: "charge", value: latest.bestWeightKg, previous: best((p) => p.bestWeightKg) },
    { kind: "reps", value: latest.bestReps, previous: best((p) => p.bestReps) },
    {
      kind: "1rm_estime",
      value: latest.estimatedOneRepMax,
      previous: best((p) => p.estimatedOneRepMax),
    },
    { kind: "tonnage", value: latest.tonnage, previous: best((p) => p.tonnage) },
  ];

  for (const check of checks) {
    if (check.value === null || check.previous === null) continue;
    if (check.value > check.previous) {
      records.push({ kind: check.kind, value: check.value, previous: check.previous });
    }
  }

  return records;
}

export interface StagnationVerdict {
  stagnant: boolean;
  sessionsWithoutProgress: number;
  message: string;
}

/**
 * Détecte une stagnation sur un exercice.
 *
 * On compare le 1RM estimé, qui absorbe les variations de charge ET de reps :
 * ajouter une répétition à charge égale est un progrès, et doit être vu comme tel.
 */
export function detectStagnation(
  history: ExerciseHistoryPoint[],
  threshold = 3,
): StagnationVerdict {
  const points = history.filter((p) => p.estimatedOneRepMax !== null);
  if (points.length < threshold + 1) {
    return {
      stagnant: false,
      sessionsWithoutProgress: 0,
      message: "Pas encore assez de séances pour juger.",
    };
  }

  const best = Math.max(...points.map((p) => p.estimatedOneRepMax!));
  let sessionsWithoutProgress = 0;
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].estimatedOneRepMax! >= best) break;
    sessionsWithoutProgress++;
  }

  const stagnant = sessionsWithoutProgress >= threshold;
  return {
    stagnant,
    sessionsWithoutProgress,
    message: stagnant
      ? `${sessionsWithoutProgress} séances sans progresser. Vérifie le sommeil et les calories avant de forcer la charge.`
      : "La progression suit.",
  };
}
