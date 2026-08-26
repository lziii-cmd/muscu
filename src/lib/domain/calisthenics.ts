/**
 * Règles de progression de la calisthénie.
 *
 * En calisthénie la force ne vient pas de la charge mais de la difficulté du
 * levier : le programme est une échelle de niveaux à gravir, pas une liste
 * d'exercices. Ces fonctions encodent les deux règles qui pilotent tout.
 *
 * Source : « Ton point de départ : 2 tractions » et « Les échelles de
 * progression » du programme de calisthénie.
 */

// ---------------------------------------------------------------------------
// Règle du (max - 1)
// ---------------------------------------------------------------------------

export interface SetFormat {
  repsPerSet: number;
  sets: number;
  /** Vrai quand le max est assez haut pour passer au lest plutôt qu'aux reps. */
  shouldAddWeight: boolean;
  message: string;
}

/**
 * Détermine le format de travail à partir du max courant.
 *
 * Le document est catégorique : « ne fais JAMAIS plus de (ton max - 1) reps par
 * série ». Avec un max de 2, on fait des séries de 1 et on ajoute des séries,
 * jamais des reps — six séries de 1 rep fraîche valent mieux que deux séries
 * dégradées à l'échec.
 *
 * Barème du document :
 *   max 2      -> 1 rep  × 6 séries
 *   max 3      -> 2 reps × 6 séries
 *   max 4-5    -> 3 reps × 5 séries
 *   max 6-7    -> 4 reps × 5 séries
 *   max 8 et + -> 5 reps × 5 séries, puis passage au lest
 */
export function setFormatForMax(max: number): SetFormat {
  if (max < 2) {
    return {
      repsPerSet: 1,
      sets: 6,
      shouldAddWeight: false,
      message: "Travaille les régressions : australienne pour le volume, négative pour le contrôle.",
    };
  }
  if (max === 2) {
    return { repsPerSet: 1, sets: 6, shouldAddWeight: false, message: "6 séries de 1 rep parfaite." };
  }
  if (max === 3) {
    return { repsPerSet: 2, sets: 6, shouldAddWeight: false, message: "6 séries de 2 reps." };
  }
  if (max <= 5) {
    return { repsPerSet: 3, sets: 5, shouldAddWeight: false, message: "5 séries de 3 reps." };
  }
  if (max <= 7) {
    return { repsPerSet: 4, sets: 5, shouldAddWeight: false, message: "5 séries de 4 reps." };
  }
  return {
    repsPerSet: 5,
    sets: 5,
    shouldAddWeight: true,
    message: "5 séries de 5 reps — tu es prêt pour le lest.",
  };
}

/** Sécurité brute : jamais plus de (max - 1) répétitions par série. */
export function maxRepsPerSet(max: number): number {
  return Math.max(1, max - 1);
}

// ---------------------------------------------------------------------------
// Passage de niveau
// ---------------------------------------------------------------------------

export interface LadderAttempt {
  date: string;
  /** Le critère chiffré du niveau a-t-il été atteint ? */
  criterionMet: boolean;
  /** La forme a-t-elle tenu ? Coude plié ou dos arrondi = non. */
  cleanForm: boolean;
}

export interface LevelAdvice {
  action: "monter" | "rester" | "redescendre";
  cleanStreak: number;
  message: string;
}

/**
 * Décide du passage de niveau.
 *
 * Critère du document, valable sur toutes les échelles : « réussir proprement,
 * deux séances de suite ». Une réussite unique en forçant ne compte pas — c'est
 * l'erreur n°1 listée par le programme.
 *
 * Et la réciproque : si la forme se dégrade (coude qui plie, dos qui s'arrondit),
 * on redescend d'un niveau.
 */
export function evaluateLevelProgression(
  attempts: LadderAttempt[],
  requiredStreak = 2,
): LevelAdvice {
  if (attempts.length === 0) {
    return { action: "rester", cleanStreak: 0, message: "Aucune tentative enregistrée." };
  }

  const recent = attempts[attempts.length - 1];

  // Deux séances de suite avec forme dégradée : le niveau est trop dur.
  const lastTwo = attempts.slice(-2);
  if (lastTwo.length === 2 && lastTwo.every((a) => !a.cleanForm)) {
    return {
      action: "redescendre",
      cleanStreak: 0,
      message:
        "Deux séances avec une forme dégradée : redescends d'un niveau. C'est ce qui provoque les tendinites.",
    };
  }

  if (!recent.criterionMet || !recent.cleanForm) {
    return {
      action: "rester",
      cleanStreak: 0,
      message: "Série non validée : le compteur repart à zéro.",
    };
  }

  let streak = 0;
  for (let i = attempts.length - 1; i >= 0; i--) {
    if (attempts[i].criterionMet && attempts[i].cleanForm) streak++;
    else break;
  }

  if (streak >= requiredStreak) {
    return {
      action: "monter",
      cleanStreak: streak,
      message: `${streak} séances propres d'affilée : tu peux passer au niveau suivant.`,
    };
  }

  return {
    action: "rester",
    cleanStreak: streak,
    message: `${streak} séance propre sur ${requiredStreak}. Encore une et tu montes.`,
  };
}

// ---------------------------------------------------------------------------
// Retest du max
// ---------------------------------------------------------------------------

/**
 * Le document limite le retest à « un lundi sur deux, jamais plus » :
 * tester coûte de la fatigue et ne fait pas progresser.
 */
export function shouldRetestMax(lastTestDate: string | null, today: string): boolean {
  const date = new Date(`${today}T00:00:00Z`);
  if (date.getUTCDay() !== 1) return false; // lundi seulement
  if (lastTestDate === null) return true;

  const days = Math.round(
    (date.getTime() - new Date(`${lastTestDate}T00:00:00Z`).getTime()) / 86_400_000,
  );
  return days >= 14;
}

// ---------------------------------------------------------------------------
// Objectifs jalonnés
// ---------------------------------------------------------------------------

export interface TargetStatus {
  target: number;
  current: number;
  gap: number;
  onTrack: boolean;
  message: string;
}

/** Compare le max courant à l'objectif du prochain jalon. */
export function pullupTargetStatus(current: number, target: number): TargetStatus {
  const gap = target - current;
  return {
    target,
    current,
    gap,
    onTrack: gap <= 0,
    message:
      gap <= 0
        ? `Objectif de ${target} tractions atteint.`
        : `${gap} traction${gap > 1 ? "s" : ""} d'écart avec l'objectif de ${target}.`,
  };
}
