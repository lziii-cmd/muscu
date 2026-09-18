import { describe, expect, it } from "vitest";
import { dietAdvice, oilStatus, proteinProgress, proteinTarget, waterStatus } from "./nutrition";

describe("proteinTarget", () => {
  it("applique 1,8 à 2,2 g par kg", () => {
    const target = proteinTarget(75);
    expect(target.lowG).toBe(135);
    expect(target.highG).toBe(165);
  });

  it("correspond au barème du document", () => {
    // Le tableau du document : 65 kg -> 120-145 g, 85 kg -> 155-185 g.
    expect(proteinTarget(65).lowG).toBe(117);
    expect(proteinTarget(65).highG).toBe(143);
    expect(proteinTarget(85).lowG).toBe(153);
    expect(proteinTarget(85).highG).toBe(187);
  });

  it("répartit sur 4 prises", () => {
    expect(proteinTarget(75).intakes).toBe(4);
    expect(proteinTarget(75).perIntakeG).toBe(35);
  });
});

describe("proteinProgress", () => {
  const target = proteinTarget(75);

  it("déclare l'objectif atteint au seuil bas", () => {
    expect(proteinProgress(135, target).status).toBe("atteint");
  });

  it("traduit le manque en aliments concrets", () => {
    const progress = proteinProgress(100, target);
    expect(progress.status).toBe("insuffisant");
    expect(progress.message).toMatch(/œufs ou \d+ g de poulet/);
  });

  it("qualifie de proche au-delà de 80 %", () => {
    expect(proteinProgress(115, target).status).toBe("proche");
  });
});

describe("oilStatus -- le levier n°2", () => {
  it("convertit les cuillères en kcal", () => {
    expect(oilStatus(2).kcal).toBe(270);
    expect(oilStatus(2).ml).toBe(30);
  });

  it("alerte au-delà du budget quotidien", () => {
    expect(oilStatus(5).overBudget).toBe(true);
    expect(oilStatus(5).message).toMatch(/déficit/i);
  });

  it("reste silencieux dans le budget", () => {
    expect(oilStatus(3).overBudget).toBe(false);
  });
});

describe("waterStatus", () => {
  it("mesure l'écart à l'objectif", () => {
    expect(waterStatus(2, 3.5).percent).toBe(57);
  });

  it("valide l'objectif atteint", () => {
    expect(waterStatus(4, 3.5).message).toMatch(/atteint/i);
  });
});

describe("dietAdvice -- table d'ajustement du document", () => {
  const base = {
    weightStable: false,
    waistFalling: false,
    loadsRising: false,
    weeklyLossPercent: 0.4,
    strengthCollapsing: false,
    weeksStalled: 0,
  };

  it("dit de ne rien changer quand la recomposition marche", () => {
    const advice = dietAdvice({ ...base, weightStable: true, waistFalling: true, loadsRising: true });
    expect(advice.adjustment).toBe("ne_rien_changer");
  });

  it("fait remonter les calories quand la force s'effondre", () => {
    const advice = dietAdvice({ ...base, strengthCollapsing: true });
    expect(advice.adjustment).toBe("remonter_les_calories");
  });

  it("ajoute des calories si la perte dépasse 0,7 %/semaine", () => {
    const advice = dietAdvice({ ...base, weeklyLossPercent: 0.9 });
    expect(advice.adjustment).toBe("ajouter_des_calories");
  });

  it("priorise la force qui s'effondre sur la perte trop rapide", () => {
    const advice = dietAdvice({ ...base, weeklyLossPercent: 0.9, strengthCollapsing: true });
    expect(advice.adjustment).toBe("remonter_les_calories");
  });

  it("réduit l'huile après 3 semaines de stagnation", () => {
    const advice = dietAdvice({ ...base, weeksStalled: 3 });
    expect(advice.adjustment).toBe("reduire_l_huile");
  });
});
