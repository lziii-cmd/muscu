import { describe, expect, it } from "vitest";
import {
  ageOn,
  bmi,
  movingAverage,
  recompositionVerdict,
  trendOf,
  waistToHeight,
  weeklyChange,
} from "./body";

describe("movingAverage", () => {
  it("lisse les pesées sur 7 jours", () => {
    const entries = [
      { date: "2026-09-01", weightKg: 75 },
      { date: "2026-09-02", weightKg: 76 },
      { date: "2026-09-03", weightKg: 74 },
    ];
    const averages = movingAverage(entries);
    expect(averages[0].weightKg).toBe(75);
    expect(averages[1].weightKg).toBe(75.5);
    expect(averages[2].weightKg).toBe(75);
  });

  it("absorbe une variation quotidienne trompeuse", () => {
    // Le document prévient : le poids quotidien varie de 1 à 2 kg pour des
    // raisons d'eau. La moyenne doit rester bien plus stable que les pesées.
    const entries = [
      { date: "2026-09-01", weightKg: 75 },
      { date: "2026-09-02", weightKg: 77 },
      { date: "2026-09-03", weightKg: 74 },
      { date: "2026-09-04", weightKg: 76 },
    ];
    const averages = movingAverage(entries);
    const spread = Math.max(...averages.map((a) => a.weightKg)) - Math.min(...averages.map((a) => a.weightKg));
    expect(spread).toBeLessThan(2);
  });

  it("ne fait pas déborder la fenêtre au-delà de 7 jours", () => {
    const entries = [
      { date: "2026-09-01", weightKg: 80 },
      { date: "2026-09-20", weightKg: 70 },
    ];
    const averages = movingAverage(entries);
    expect(averages[1].weightKg).toBe(70);
  });

  it("trie les entrées désordonnées", () => {
    const averages = movingAverage([
      { date: "2026-09-03", weightKg: 74 },
      { date: "2026-09-01", weightKg: 76 },
    ]);
    expect(averages[0].date).toBe("2026-09-01");
  });
});

describe("weeklyChange", () => {
  it("place une perte de 0,4 %/semaine dans la cible", () => {
    const change = weeklyChange([
      { date: "2026-09-01", weightKg: 75 },
      { date: "2026-09-08", weightKg: 74.7 },
    ]);
    expect(change?.verdict).toBe("dans_la_cible");
  });

  it("signale une perte trop rapide au-delà de 0,7 %", () => {
    const change = weeklyChange([
      { date: "2026-09-01", weightKg: 75 },
      { date: "2026-09-08", weightKg: 74.2 },
    ]);
    expect(change?.verdict).toBe("trop_rapide");
    expect(change?.message).toMatch(/muscle/i);
  });

  it("signale une perte trop lente", () => {
    const change = weeklyChange([
      { date: "2026-09-01", weightKg: 75 },
      { date: "2026-09-08", weightKg: 74.95 },
    ]);
    expect(change?.verdict).toBe("trop_lent");
  });

  it("détecte une prise de poids", () => {
    const change = weeklyChange([
      { date: "2026-09-01", weightKg: 75 },
      { date: "2026-09-08", weightKg: 75.5 },
    ]);
    expect(change?.verdict).toBe("prise");
  });

  it("renvoie null quand il n'y a pas de quoi comparer", () => {
    expect(weeklyChange([{ date: "2026-09-01", weightKg: 75 }])).toBeNull();
  });
});

describe("trendOf", () => {
  it("qualifie une variation sous le seuil de stable", () => {
    expect(trendOf([100, 100.5])).toBe("stable");
  });

  it("détecte hausse et baisse", () => {
    expect(trendOf([100, 105])).toBe("hausse");
    expect(trendOf([100, 95])).toBe("baisse");
  });

  it("ne conclut pas sur un seul point", () => {
    expect(trendOf([100])).toBe("inconnu");
  });
});

describe("recompositionVerdict", () => {
  it("reconnaît le cas nommé par le document : poids stable, taille en baisse, charges en hausse", () => {
    const result = recompositionVerdict({
      weightTrend: "stable",
      waistTrend: "baisse",
      strengthTrend: "hausse",
    });
    expect(result.verdict).toBe("recomposition");
    expect(result.detail).toMatch(/ne change rien/i);
  });

  it("signale une perte de gras sans gain de force", () => {
    const result = recompositionVerdict({
      weightTrend: "baisse",
      waistTrend: "baisse",
      strengthTrend: "baisse",
    });
    expect(result.verdict).toBe("perte_de_gras");
  });

  it("oriente vers l'huile quand la force monte sans que le gras bouge", () => {
    const result = recompositionVerdict({
      weightTrend: "stable",
      waistTrend: "stable",
      strengthTrend: "hausse",
    });
    expect(result.verdict).toBe("prise_de_muscle");
    expect(result.detail).toMatch(/huile/i);
  });

  it("détecte la sous-alimentation", () => {
    const result = recompositionVerdict({
      weightTrend: "baisse",
      waistTrend: "stable",
      strengthTrend: "baisse",
    });
    expect(result.verdict).toBe("sous_alimentation");
  });

  it("refuse de conclure sans données", () => {
    const result = recompositionVerdict({
      weightTrend: "inconnu",
      waistTrend: "baisse",
      strengthTrend: "hausse",
    });
    expect(result.verdict).toBe("donnees_insuffisantes");
  });
});

describe("bmi", () => {
  it("calcule l'indice au dixième près", () => {
    expect(bmi(70, 175)).toBe(22.9);
  });

  it("refuse une taille ou un poids absurde", () => {
    expect(bmi(70, 0)).toBeNull();
    expect(bmi(0, 175)).toBeNull();
    expect(bmi(Number.NaN, 175)).toBeNull();
  });
});

describe("waistToHeight", () => {
  it("rapporte le tour de taille à la stature", () => {
    expect(waistToHeight(80, 175)).toBe(0.46);
  });

  it("refuse des valeurs nulles", () => {
    expect(waistToHeight(80, 0)).toBeNull();
  });
});

describe("ageOn", () => {
  it("compte les années révolues", () => {
    expect(ageOn("1996-08-27", "2026-08-26")).toBe(29);
    expect(ageOn("1996-08-26", "2026-08-26")).toBe(30);
  });

  it("refuse une naissance postérieure à la date demandée", () => {
    expect(ageOn("2027-01-01", "2026-08-26")).toBeNull();
  });

  it("refuse une date invalide", () => {
    expect(ageOn("pas-une-date", "2026-08-26")).toBeNull();
  });
});
