/**
 * Diète : objectifs et leviers.
 *
 * Le document est explicite sur la hiérarchie — protéines d'abord, huile
 * ensuite, quantité de riz enfin. Ces fonctions encodent cet ordre plutôt que
 * de traiter toutes les calories à égalité.
 *
 * Source : « Les 3 leviers, par ordre d'importance » du document de diète.
 */

/** Une cuillère à soupe d'huile : 15 ml, 135 kcal. */
export const OIL_KCAL_PER_TABLESPOON = 135;
export const OIL_ML_PER_TABLESPOON = 15;

export interface ProteinTarget {
  lowG: number;
  highG: number;
  perIntakeG: number;
  intakes: number;
  message: string;
}

/**
 * Objectif protéines : 1,8 à 2,2 g par kg de poids de corps, réparti sur 4 prises.
 * C'est le seul chiffre que le document dit de ne jamais négliger.
 */
export function proteinTarget(
  bodyweightKg: number,
  perKgLow = 1.8,
  perKgHigh = 2.2,
  intakes = 4,
): ProteinTarget {
  const lowG = Math.round(bodyweightKg * perKgLow);
  const highG = Math.round(bodyweightKg * perKgHigh);
  const perIntakeG = Math.round(lowG / intakes / 5) * 5;

  return {
    lowG,
    highG,
    perIntakeG,
    intakes,
    message: `${lowG} à ${highG} g par jour, soit ${intakes} prises d'environ ${perIntakeG} g.`,
  };
}

export type ProteinStatus = "atteint" | "proche" | "insuffisant";

export interface ProteinProgress {
  consumedG: number;
  target: ProteinTarget;
  percent: number;
  status: ProteinStatus;
  remainingG: number;
  message: string;
}

export function proteinProgress(consumedG: number, target: ProteinTarget): ProteinProgress {
  const percent = Math.round((consumedG / target.lowG) * 100);
  const remainingG = Math.max(0, target.lowG - consumedG);

  let status: ProteinStatus;
  if (consumedG >= target.lowG) status = "atteint";
  else if (percent >= 80) status = "proche";
  else status = "insuffisant";

  return {
    consumedG,
    target,
    percent,
    status,
    remainingG,
    message:
      status === "atteint"
        ? `Objectif atteint (${consumedG} g).`
        : `Il te manque ${remainingG} g — soit ${Math.ceil(remainingG / 6)} œufs ou ${Math.ceil((remainingG / 27) * 100)} g de poulet.`,
  };
}

// ---------------------------------------------------------------------------
// Huile : le levier n°2
// ---------------------------------------------------------------------------

export interface OilStatus {
  tablespoons: number;
  kcal: number;
  ml: number;
  overBudget: boolean;
  message: string;
}

/**
 * Le document identifie l'huile comme « la source n°1 de calories invisibles » :
 * un plat sénégalais classique en contient 60 à 100 ml, soit 550 à 900 kcal.
 * D'où un compteur dédié plutôt qu'une ligne noyée dans les macros.
 */
export function oilStatus(tablespoons: number, dailyBudget = 3): OilStatus {
  const kcal = Math.round(tablespoons * OIL_KCAL_PER_TABLESPOON);
  const ml = Math.round(tablespoons * OIL_ML_PER_TABLESPOON);
  const overBudget = tablespoons > dailyBudget;

  return {
    tablespoons,
    kcal,
    ml,
    overBudget,
    message: overBudget
      ? `${tablespoons} c.à.s = ${kcal} kcal. Au-delà de ${dailyBudget}, l'huile mange tout ton déficit.`
      : `${tablespoons} c.à.s = ${kcal} kcal (${ml} ml).`,
  };
}

// ---------------------------------------------------------------------------
// Déficit et hydratation
// ---------------------------------------------------------------------------

export interface DeficitTarget {
  lowKcal: number;
  highKcal: number;
  message: string;
}

/** Le document fixe -300 à -400 kcal/jour, et prévient contre plus. */
export function deficitTarget(): DeficitTarget {
  return {
    lowKcal: 300,
    highKcal: 400,
    message:
      "-300 à -400 kcal/jour. Pas plus : un gros déficit fait fondre le muscle en premier et sabote la séance de 22h.",
  };
}

export interface WaterStatus {
  liters: number;
  targetLiters: number;
  percent: number;
  message: string;
}

export function waterStatus(liters: number, targetLiters = 3.5): WaterStatus {
  const percent = Math.round((liters / targetLiters) * 100);
  return {
    liters,
    targetLiters,
    percent,
    message:
      percent >= 100
        ? "Objectif d'hydratation atteint."
        : `${(targetLiters - liters).toFixed(1)} L restants. Une déshydratation légère fait chuter la performance de 10 %.`,
  };
}

// ---------------------------------------------------------------------------
// Ajustement selon l'évolution du poids
// ---------------------------------------------------------------------------

export type DietAdjustment =
  | "ne_rien_changer"
  | "ajouter_des_calories"
  | "reduire_l_huile"
  | "remonter_les_calories";

export interface DietAdvice {
  adjustment: DietAdjustment;
  message: string;
}

/**
 * Table d'ajustement du document, appliquée telle quelle.
 * Elle croise poids, tour de taille et force — jamais le poids seul.
 */
export function dietAdvice(inputs: {
  weightStable: boolean;
  waistFalling: boolean;
  loadsRising: boolean;
  weeklyLossPercent: number;
  strengthCollapsing: boolean;
  weeksStalled: number;
}): DietAdvice {
  if (inputs.strengthCollapsing) {
    return {
      adjustment: "remonter_les_calories",
      message: "Force en chute et fatigue permanente : tu manges trop peu. Remonte les calories immédiatement.",
    };
  }

  if (inputs.weeklyLossPercent > 0.7) {
    return {
      adjustment: "ajouter_des_calories",
      message: "Plus de 0,7 %/semaine : tu perds du muscle. Ajoute une portion de riz ou une collation.",
    };
  }

  if (inputs.weightStable && inputs.waistFalling && inputs.loadsRising) {
    return {
      adjustment: "ne_rien_changer",
      message: "Poids stable, taille en baisse, charges en hausse : c'est la recomposition. Ne change rien.",
    };
  }

  if (inputs.weeksStalled >= 3) {
    return {
      adjustment: "reduire_l_huile",
      message:
        "Poids et tour de taille stables depuis 3 semaines : réduis l'huile encore un peu, ou supprime la collation de 17h30.",
    };
  }

  return { adjustment: "ne_rien_changer", message: "Rien à ajuster pour l'instant." };
}
