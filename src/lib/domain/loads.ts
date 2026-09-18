/**
 * Charges : type de charge, unité de saisie, et charge proposée.
 *
 * Trois règles portent ce module.
 *
 * 1. Une charge n'a de sens qu'avec son type. 40 kg à la barre, 40 kg sur une
 *    machine guidée et 40 kg « par haltère » (soit 80 kg au total) sont trois
 *    choses différentes : l'écran les distingue, la base aussi.
 *
 * 2. La base stocke des kilos, la personne saisit ce qu'elle lit. Beaucoup de
 *    machines affichent des livres : on garde le nombre saisi et son unité pour
 *    le réafficher tel quel, et on convertit en kilos pour tout calcul.
 *
 * 3. La charge proposée suit un ordre : ce qui a déjà été saisi dans la séance,
 *    puis la charge habituelle de la personne, puis celle du programme. Les
 *    kilos du document sont un point de départ ; ceux qu'on soulève vraiment
 *    sont la référence.
 */

export type LoadUnit = "barre" | "machine" | "kg_par_haltere" | "poids_du_corps" | "barre_machine";
export type WeightUnit = "kg" | "lb";

/** Définition exacte de la livre avoirdupois. */
export const KG_PER_LB = 0.45359237;

/** Types proposés à la saisie. `barre_machine` n'est que relu, pour l'historique. */
export const LOAD_UNIT_CHOICES: { value: LoadUnit; label: string }[] = [
  { value: "barre", label: "barre" },
  { value: "machine", label: "machine" },
  { value: "kg_par_haltere", label: "haltères" },
  { value: "poids_du_corps", label: "poids du corps" },
];

export interface HabitualLoad {
  loadUnit: LoadUnit;
  weightKg: number | null;
  weightUnit: WeightUnit;
}

export interface LoadSource {
  name: string;
  equipment: string | null;
  /** Charge barre/machine prescrite, en kilos. */
  loadKg: number | null;
  /** Charge par haltère prescrite, en kilos. */
  dumbbellKg: number | null;
  habitual?: HabitualLoad | null;
}

export interface LoadSuggestion {
  loadUnit: LoadUnit;
  /** Nombre à afficher dans le champ, dans l'unité `weightUnit`. Vide si rien. */
  weight: string;
  weightUnit: WeightUnit;
}

/** Nombre saisi → kilos, arrondis au centième (précision de la colonne). */
export function toKg(value: number, unit: WeightUnit): number {
  const kg = unit === "lb" ? value * KG_PER_LB : value;
  return Math.round(kg * 100) / 100;
}

/**
 * Kilos stockés → nombre à afficher. Arrondi au dixième : 50 lb stockés
 * 22,68 kg reviennent à 50,0 et non à 49,9998.
 */
export function fromKg(kg: number, unit: WeightUnit): number {
  const value = unit === "lb" ? kg / KG_PER_LB : kg;
  return Math.round(value * 10) / 10;
}

/** Nombre saisi (« 27,5 », « 27.5 ») → nombre, ou null s'il est illisible. */
export function parseWeight(raw: string): number | null {
  const n = Number(raw.trim().replace(",", "."));
  return raw.trim() !== "" && Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Barre ou machine, pour une charge prescrite dans la colonne qui les confond.
 * Le matériel de l'exercice décide ; à défaut, son nom.
 */
export function barOrMachine(name: string, equipment: string | null): "barre" | "machine" {
  if (equipment === "barre") return "barre";
  if (equipment === "machine" || equipment === "poulie") return "machine";
  const n = name.toLowerCase();
  if (/machine|poulie|presse|pec-deck|leg (curl|extension)|tirage/.test(n)) return "machine";
  return "barre";
}

const text = (kg: number | null, unit: WeightUnit): string =>
  kg === null ? "" : String(fromKg(kg, unit));

/** Charge du programme pour un type donné, en kilos. */
function prescribedFor(source: LoadSource, unit: LoadUnit): number | null {
  if (unit === "kg_par_haltere") return source.dumbbellKg;
  if (unit === "poids_du_corps") return null;
  return source.loadKg;
}

/**
 * Charge proposée pour un exercice.
 *
 * Sans `unit` : la charge habituelle si elle existe, sinon celle du programme
 * avec son type. Avec `unit` (la personne vient de changer de type) : la
 * charge habituelle si elle est de ce type, sinon celle du programme pour ce
 * type — jamais le nombre d'avant, qui ne voudrait plus rien dire : 30 kg à la
 * barre ne font pas 30 kg par haltère.
 */
export function suggestLoad(source: LoadSource, unit?: LoadUnit): LoadSuggestion {
  const habitual = source.habitual ?? null;

  if (!unit) {
    if (habitual && habitual.loadUnit !== "barre_machine") {
      return {
        loadUnit: habitual.loadUnit,
        weight: text(habitual.weightKg, habitual.weightUnit),
        weightUnit: habitual.weightUnit,
      };
    }
    if (source.loadKg !== null) {
      return { loadUnit: barOrMachine(source.name, source.equipment), weight: text(source.loadKg, "kg"), weightUnit: "kg" };
    }
    if (source.dumbbellKg !== null) {
      return { loadUnit: "kg_par_haltere", weight: text(source.dumbbellKg, "kg"), weightUnit: "kg" };
    }
    return { loadUnit: "poids_du_corps", weight: "", weightUnit: "kg" };
  }

  if (habitual && habitual.loadUnit === unit) {
    return { loadUnit: unit, weight: text(habitual.weightKg, habitual.weightUnit), weightUnit: habitual.weightUnit };
  }
  return { loadUnit: unit, weight: text(prescribedFor(source, unit), "kg"), weightUnit: "kg" };
}

/** Libellé court d'une charge : « 27,5 kg », « 50 lb », « 12 kg / haltère », « PDC ». */
export function formatLoad(weight: number | null, loadUnit: LoadUnit, weightUnit: WeightUnit): string {
  if (loadUnit === "poids_du_corps") return "PDC";
  if (weight === null) return "—";
  const n = String(weight).replace(".", ",");
  return `${n} ${weightUnit}${loadUnit === "kg_par_haltere" ? " / haltère" : ""}`;
}

// ---------------------------------------------------------------------------
// Charge proposée d'après la dernière séance
// ---------------------------------------------------------------------------

/** Ce qui a été fait la dernière fois sur cet exercice, en salle. */
export interface LastPerformance {
  date: string;
  loadUnit: LoadUnit;
  weightKg: number | null;
  weightUnit: WeightUnit;
  sets: number | null;
  reps: number | null;
}

/** Charge habituelle enrichie : ce qu'il faut viser aujourd'hui, et pourquoi. */
export interface AdaptedLoad extends HabitualLoad {
  /** Répétitions à viser par série, ou null si le programme n'en fixe pas. */
  repsTarget: number | null;
  /** Explication courte, affichée sous l'exercice. */
  reason: string | null;
}

/**
 * Pas de charge de la double progression, dans l'unité de saisie : +2,5 kg en
 * haut du corps, +5 kg en bas. En livres, les machines avancent par 5 lb : on
 * garde le même rapport, 5 lb en haut, 10 lb en bas — plutôt qu'un 5,5 lb qui
 * n'existe sur aucune pile de plaques.
 */
export function loadStep(part: "haut" | "bas", unit: WeightUnit): number {
  if (unit === "lb") return part === "bas" ? 10 : 5;
  return part === "bas" ? 5 : 2.5;
}

const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const comma = (n: number) => String(n).replace(".", ",");

/**
 * Charge à proposer d'après la dernière séance, selon la double progression du
 * programme : haut de fourchette tenu sur toutes les séries → on monte d'un pas
 * et on redescend au bas de la fourchette ; sinon même charge, une répétition
 * de plus. Le calcul se fait dans l'unité de saisie, pour que la proposition
 * tombe sur une charge qui existe : 55 lb, pas 24,9 kg.
 */
export function adaptFromLast(
  last: LastPerformance,
  range: { low: number; high: number } | null,
  part: "haut" | "bas",
): AdaptedLoad {
  const base = { loadUnit: last.loadUnit, weightUnit: last.weightUnit };
  const typed = last.weightKg === null ? null : fromKg(last.weightKg, last.weightUnit);
  const when = shortDate(last.date);

  if (!range || last.reps === null || last.reps <= 0) {
    return { ...base, weightKg: last.weightKg, repsTarget: null, reason: `Ta charge du ${when}` };
  }

  const volume = `${last.sets ?? "?"} × ${last.reps}`;
  if (last.reps >= range.high) {
    const step = loadStep(part, last.weightUnit);
    if (typed === null || last.loadUnit === "poids_du_corps") {
      return {
        ...base,
        weightKg: last.weightKg,
        repsTarget: range.low,
        reason: `${volume} tenus le ${when} : haut de fourchette, passe à la variante plus dure`,
      };
    }
    const next = Math.round((typed + step) * 100) / 100;
    return {
      ...base,
      weightKg: toKg(next, last.weightUnit),
      repsTarget: range.low,
      reason: `+${comma(step)} ${last.weightUnit} : ${volume} tenus le ${when}, haut de fourchette`,
    };
  }

  const target = Math.min(last.reps + 1, range.high);
  return {
    ...base,
    weightKg: last.weightKg,
    repsTarget: target,
    reason: `Même charge, vise ${target} reps (${volume} le ${when})`,
  };
}
