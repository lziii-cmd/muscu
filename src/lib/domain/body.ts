/**
 * Suivi corporel et lecture de la recomposition.
 *
 * Le point clé du programme : « le poids seul ment en recomposition ». Une
 * courbe de poids brute induit en erreur ; ces fonctions produisent la lecture
 * croisée que le document réclame — poids lissé, tour de taille, charges.
 *
 * Source : « Nutrition -- recomposition », « Contrôles » et « Suivi et
 * ajustement » des documents.
 */

export interface WeightEntry {
  date: string;
  weightKg: number;
}

/**
 * Moyenne mobile sur 7 jours.
 *
 * Le poids quotidien varie de 1 à 2 kg pour des raisons d'eau et de digestion :
 * c'est la moyenne qu'il faut regarder, jamais la pesée du jour. Chaque point
 * moyenne les pesées des 7 jours qui le précèdent, bornes incluses.
 */
export function movingAverage(entries: WeightEntry[], windowDays = 7): WeightEntry[] {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));

  return sorted.map((entry) => {
    const end = new Date(`${entry.date}T00:00:00Z`).getTime();
    const start = end - (windowDays - 1) * 86_400_000;

    const window = sorted.filter((candidate) => {
      const time = new Date(`${candidate.date}T00:00:00Z`).getTime();
      return time >= start && time <= end;
    });

    const sum = window.reduce((total, item) => total + item.weightKg, 0);
    return { date: entry.date, weightKg: Math.round((sum / window.length) * 100) / 100 };
  });
}

export type LossVerdict = "trop_rapide" | "dans_la_cible" | "trop_lent" | "prise";

export interface WeeklyChange {
  /** Variation en kg sur la semaine, négatif = perte. */
  deltaKg: number;
  /** Variation en pourcentage du poids de corps. */
  deltaPercent: number;
  verdict: LossVerdict;
  message: string;
}

/**
 * Compare la variation hebdomadaire à la cible du document : -0,3 à -0,5 %
 * du poids de corps par semaine. Au-delà de -0,7 %, on perd du muscle.
 */
export function weeklyChange(
  averages: WeightEntry[],
  targetLowPercent = 0.3,
  targetHighPercent = 0.5,
  tooFastPercent = 0.7,
): WeeklyChange | null {
  if (averages.length < 2) return null;

  const sorted = [...averages].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted[sorted.length - 1];
  const latestTime = new Date(`${latest.date}T00:00:00Z`).getTime();

  // Point le plus proche d'une semaine avant.
  let reference = sorted[0];
  let bestGap = Infinity;
  for (const candidate of sorted.slice(0, -1)) {
    const days = (latestTime - new Date(`${candidate.date}T00:00:00Z`).getTime()) / 86_400_000;
    const gap = Math.abs(days - 7);
    if (gap < bestGap) {
      bestGap = gap;
      reference = candidate;
    }
  }

  const deltaKg = Math.round((latest.weightKg - reference.weightKg) * 100) / 100;
  const deltaPercent = Math.round((deltaKg / reference.weightKg) * 10000) / 100;
  const lossPercent = -deltaPercent;

  let verdict: LossVerdict;
  let message: string;

  if (lossPercent > tooFastPercent) {
    verdict = "trop_rapide";
    message = `-${lossPercent.toFixed(2)} %/semaine : trop vite, tu perds du muscle. Ajoute une portion de riz ou une collation.`;
  } else if (lossPercent >= targetLowPercent) {
    verdict = "dans_la_cible";
    message = `-${lossPercent.toFixed(2)} %/semaine : dans la cible ${targetLowPercent}-${targetHighPercent} %.`;
  } else if (lossPercent > 0) {
    verdict = "trop_lent";
    message = `-${lossPercent.toFixed(2)} %/semaine : sous la cible. Réduis l'huile ou supprime la collation de 17h30.`;
  } else {
    verdict = "prise";
    message = `+${Math.abs(deltaPercent).toFixed(2)} %/semaine : le poids monte.`;
  }

  return { deltaKg, deltaPercent, verdict, message };
}

// ---------------------------------------------------------------------------
// Verdict de recomposition
// ---------------------------------------------------------------------------

export type Trend = "hausse" | "stable" | "baisse" | "inconnu";

export interface RecompositionInputs {
  weightTrend: Trend;
  waistTrend: Trend;
  strengthTrend: Trend;
}

export type RecompositionVerdict =
  | "recomposition"
  | "perte_de_gras"
  | "prise_de_muscle"
  | "sous_alimentation"
  | "stagnation"
  | "donnees_insuffisantes";

export interface RecompositionResult {
  verdict: RecompositionVerdict;
  headline: string;
  detail: string;
}

/**
 * Rend explicite ce que trois courbes séparées ne disent pas.
 *
 * Le cas nommé par le document : « si le poids stagne mais que le tour de taille
 * baisse et que les charges montent, la recomposition fonctionne ». C'est
 * exactement ce que l'app doit dire, au lieu de laisser interpréter.
 */
export function recompositionVerdict(inputs: RecompositionInputs): RecompositionResult {
  const { weightTrend, waistTrend, strengthTrend } = inputs;

  if (weightTrend === "inconnu" || waistTrend === "inconnu" || strengthTrend === "inconnu") {
    return {
      verdict: "donnees_insuffisantes",
      headline: "Pas encore assez de données",
      detail:
        "Il faut au moins trois semaines de pesées, une mensuration de taille et des séances enregistrées.",
    };
  }

  const waistDown = waistTrend === "baisse";
  const strengthUp = strengthTrend === "hausse";
  const weightStable = weightTrend === "stable";
  const weightDown = weightTrend === "baisse";

  if (waistDown && strengthUp && (weightStable || weightDown)) {
    return {
      verdict: "recomposition",
      headline: "La recomposition fonctionne",
      detail:
        "Tour de taille en baisse, charges en hausse. C'est précisément le signal recherché — ne change rien.",
    };
  }

  if (waistDown && !strengthUp) {
    return {
      verdict: "perte_de_gras",
      headline: "Tu perds du gras, mais la force ne suit pas",
      detail:
        "Vérifie les protéines et le sommeil : en déficit, c'est la force qui décroche en premier.",
    };
  }

  if (!waistDown && strengthUp) {
    return {
      verdict: "prise_de_muscle",
      headline: "La force monte, le gras ne bouge pas",
      detail: "Réduis l'huile de cuisson avant de toucher au reste : c'est le levier le plus rentable.",
    };
  }

  if (weightDown && !strengthUp && !waistDown) {
    return {
      verdict: "sous_alimentation",
      headline: "Le poids baisse sans que la taille ni la force suivent",
      detail: "Signe classique de calories trop basses. Remonte les calories.",
    };
  }

  return {
    verdict: "stagnation",
    headline: "Rien ne bouge",
    detail:
      "Poids, tour de taille et charges stables sur la période. Réduis l'huile encore un peu, ou supprime la collation de 17h30.",
  };
}

/** Tendance d'une série de valeurs, avec un seuil d'indifférence en %. */
export function trendOf(values: number[], thresholdPercent = 1): Trend {
  if (values.length < 2) return "inconnu";

  const first = values[0];
  const last = values[values.length - 1];
  if (first === 0) return "inconnu";

  const change = ((last - first) / first) * 100;
  if (Math.abs(change) < thresholdPercent) return "stable";
  return change > 0 ? "hausse" : "baisse";
}

/**
 * Indice de masse corporelle.
 *
 * Volontairement rendu sans commentaire de catégorie : l'IMC ne distingue pas
 * le muscle de la graisse, et sur quelqu'un qui prend du muscle il monte
 * pendant que la composition s'améliore. Il est affiché comme un repère parmi
 * d'autres, jamais comme un verdict.
 */
export function bmi(weightKg: number, heightCm: number): number | null {
  if (!Number.isFinite(weightKg) || !Number.isFinite(heightCm)) return null;
  if (weightKg <= 0 || heightCm <= 0) return null;
  const meters = heightCm / 100;
  return Math.round((weightKg / (meters * meters)) * 10) / 10;
}

/**
 * Rapport tour de taille / stature.
 *
 * Plus utile que l'IMC en recomposition : il ne bouge que si le tour de taille
 * bouge, donc il suit la graisse abdominale et ignore le muscle pris ailleurs.
 * Le repère communément retenu est « moins de 0,5 ».
 */
export function waistToHeight(waistCm: number, heightCm: number): number | null {
  if (!Number.isFinite(waistCm) || !Number.isFinite(heightCm)) return null;
  if (waistCm <= 0 || heightCm <= 0) return null;
  return Math.round((waistCm / heightCm) * 100) / 100;
}

/** Âge en années révolues à une date donnée. */
export function ageOn(birthDate: string, onDate: string): number | null {
  const birth = new Date(`${birthDate}T00:00:00Z`);
  const on = new Date(`${onDate}T00:00:00Z`);
  if (Number.isNaN(birth.getTime()) || Number.isNaN(on.getTime())) return null;
  if (birth > on) return null;

  let years = on.getUTCFullYear() - birth.getUTCFullYear();
  const monthDiff = on.getUTCMonth() - birth.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && on.getUTCDate() < birth.getUTCDate())) years -= 1;
  return years;
}
