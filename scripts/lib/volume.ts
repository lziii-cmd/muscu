/**
 * Lecture des cellules de volume et de repos.
 *
 * Ces fonctions encodent trois distinctions que la version précédente écrasait,
 * et qui changent l'entraînement :
 *
 *  1. Une **fourchette de tenue** (« 4 × 20–30 s ») n'est pas une tenue unique.
 *     Ne garder que la borne haute prescrit 45 s là où le programme demande
 *     30 à 45 s.
 *  2. Un **décalage sur le max** peut valoir −1 ou −2. Le jeudi est la journée
 *     de volume, volontairement plus légère : tout ramener à −1 donne deux
 *     journées lourdes de tractions par semaine.
 *  3. Un volume peut être **implicite** (« 6 séries »), les répétitions se
 *     calculant alors depuis le max courant.
 */

export interface Volume {
  sets: number | null;
  repsLow: number | null;
  repsHigh: number | null;
  /** Tenue isométrique, bornes basse et haute (égales si valeur unique). */
  holdSecondsLow: number | null;
  holdSecondsHigh: number | null;
  /** Reps à déduire du max courant : max − `maxOffset`. */
  maxOffset: number | null;
  perSide: boolean;
  raw: string;
}

const EMPTY: Omit<Volume, "raw" | "perSide"> = {
  sets: null,
  repsLow: null,
  repsHigh: null,
  holdSecondsLow: null,
  holdSecondsHigh: null,
  maxOffset: null,
};

/** Normalise tirets et signes moins pour un traitement uniforme. */
export function normaliseDashes(value: string): string {
  return value
    .replace(/[–—−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extrait le décalage sur le max depuis le libellé d'un exercice.
 * « Traction stricte — (max − 2) par série » -> 2
 */
export function readMaxOffset(label: string): number | null {
  const match = normaliseDashes(label).match(/max\s*-\s*(\d+)/i);
  return match ? Number(match[1]) : null;
}

/**
 * Analyse une cellule « Séries × reps ».
 *
 * Formes rencontrées :
 *   « 4 × 6-8 »        -> 4 séries, 6 à 8 reps
 *   « 6 × 2 »          -> 6 séries, 2 reps
 *   « 3 × 30 s »       -> 3 séries, tenue de 30 s
 *   « 4 × 20-30 s »    -> 4 séries, tenue de 20 à 30 s
 *   « 3 × 10 / côté »  -> par côté
 *   « 6 séries »       -> 6 séries, reps déduites du max
 *   « 5 min »          -> une seule série de 5 minutes
 */
export function parseVolume(raw: string, label = ""): Volume {
  const text = normaliseDashes(raw);
  const perSide = /\/\s*(jambe|bras|côté|cote|main)/i.test(text);
  const base = { ...EMPTY, perSide, raw: raw.trim() };

  if (text === "") return base;

  // Tenue, éventuellement en fourchette : « 4 × 20-30 s »
  const hold = text.match(/(\d+)\s*[×x]\s*(\d+)(?:\s*-\s*(\d+))?\s*s\b/i);
  if (hold) {
    const low = Number(hold[2]);
    const high = hold[3] ? Number(hold[3]) : low;
    return { ...base, sets: Number(hold[1]), holdSecondsLow: low, holdSecondsHigh: high };
  }

  // Répétitions, éventuellement en fourchette : « 4 × 6-8 »
  const reps = text.match(/(\d+)\s*[×x]\s*(\d+)(?:\s*-\s*(\d+))?/);
  if (reps) {
    const low = Number(reps[2]);
    return { ...base, sets: Number(reps[1]), repsLow: low, repsHigh: reps[3] ? Number(reps[3]) : low };
  }

  // Séries seules : les répétitions viennent du max courant.
  const seriesOnly = text.match(/^(\d+)\s*s[ée]ries?$/i);
  if (seriesOnly) {
    return { ...base, sets: Number(seriesOnly[1]), maxOffset: readMaxOffset(label) ?? 1 };
  }

  // Durée seule : « 5 min », « 8 min ».
  const minutes = text.match(/^(\d+)\s*min$/i);
  if (minutes) {
    const seconds = Number(minutes[1]) * 60;
    return { ...base, sets: 1, holdSecondsLow: seconds, holdSecondsHigh: seconds };
  }

  return base;
}

/**
 * Analyse une cellule de repos.
 * « 2 min 30 » -> 150 ; « 90 s » -> 90 ; « 2-3 min » -> 150 (milieu de fourchette) ;
 * « enchaîner » -> 0 ; vide -> null.
 */
export function parseRest(raw: string): number | null {
  const text = normaliseDashes(raw).toLowerCase();
  if (text === "" || text === "--") return null;
  if (text.includes("enchaîner") || text.includes("enchainer")) return 0;

  // Fourchette de minutes : on retient le milieu, faute de mieux à afficher
  // sur un chronomètre.
  const range = text.match(/^(\d+)\s*-\s*(\d+)\s*min$/);
  if (range) return Math.round(((Number(range[1]) + Number(range[2])) / 2) * 60);

  const minutes = text.match(/(\d+)\s*min(?:\s*(\d+))?/);
  if (minutes) return Number(minutes[1]) * 60 + (minutes[2] ? Number(minutes[2]) : 0);

  const seconds = text.match(/(\d+)\s*s/);
  if (seconds) return Number(seconds[1]);

  return null;
}

/** « 30 kg » -> 30 ; « 7,5 kg » -> 7.5 ; « Poids du corps » -> null. */
export function parseKg(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const match = normaliseDashes(raw).match(/(\d+(?:[.,]\d+)?)\s*kg/i);
  return match ? Number(match[1].replace(",", ".")) : null;
}
