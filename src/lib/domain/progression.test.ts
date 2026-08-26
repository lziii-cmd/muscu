import { describe, expect, it } from "vitest";
import {
  advanceDoubleProgression,
  countsForLoadProgression,
  forLoadProgression,
  bestEstimatedOneRepMax,
  bodyPartOf,
  detectPersonalRecords,
  detectStagnation,
  estimatedOneRepMax,
  evaluateTestSet,
  loadIncrement,
  tonnage,
  type ExerciseHistoryPoint,
} from "./progression";

describe("séances maison", () => {
  it("exclut la maison de la progression en charge", () => {
    expect(countsForLoadProgression("salle")).toBe(true);
    expect(countsForLoadProgression("maison")).toBe(false);
  });

  it("filtre un historique mixte", () => {
    const history = [
      { date: "2026-09-01", location: "salle" as const },
      { date: "2026-09-03", location: "maison" as const },
      { date: "2026-09-05", location: "salle" as const },
    ];
    expect(forLoadProgression(history).map((entry) => entry.date)).toEqual([
      "2026-09-01",
      "2026-09-05",
    ]);
  });

  it("ne casse pas un historique entièrement fait à la maison", () => {
    const history = [{ date: "2026-09-01", location: "maison" as const }];
    expect(forLoadProgression(history)).toEqual([]);
  });
});

describe("loadIncrement", () => {
  it("impose +2,5 kg en haut du corps et +5 kg en bas", () => {
    expect(loadIncrement("haut")).toBe(2.5);
    expect(loadIncrement("bas")).toBe(5);
  });

  it("classe les jambes en bas du corps", () => {
    expect(bodyPartOf("legs")).toBe("bas");
    expect(bodyPartOf("push")).toBe("haut");
    expect(bodyPartOf(null)).toBe("haut");
  });
});

describe("evaluateTestSet -- la règle de la série test", () => {
  const range = { low: 6, high: 8 };

  it("conseille d'alourdir quand on dépasse le haut de fourchette", () => {
    const advice = evaluateTestSet({ reps: 10, weightKg: 30 }, range, "haut");
    expect(advice.verdict).toBe("trop_leger");
    expect(advice.adjustmentKg).toBe(2.5);
  });

  it("conseille d'alléger quand on n'atteint pas le bas de fourchette", () => {
    const advice = evaluateTestSet({ reps: 4, weightKg: 30 }, range, "bas");
    expect(advice.verdict).toBe("trop_lourd");
    expect(advice.adjustmentKg).toBe(-5);
  });

  it("valide la charge quand on finit dans la fourchette", () => {
    expect(evaluateTestSet({ reps: 7, weightKg: 30 }, range, "haut").verdict).toBe("bonne_charge");
  });

  it("traite les bornes de la fourchette comme incluses", () => {
    expect(evaluateTestSet({ reps: 6, weightKg: 30 }, range, "haut").verdict).toBe("bonne_charge");
    expect(evaluateTestSet({ reps: 8, weightKg: 30 }, range, "haut").verdict).toBe("bonne_charge");
  });
});

describe("advanceDoubleProgression", () => {
  const range = { low: 6, high: 8 };

  it("monte la charge quand le haut de fourchette est tenu sur TOUTES les séries", () => {
    const advice = advanceDoubleProgression(
      [
        { reps: 8, weightKg: 30 },
        { reps: 8, weightKg: 30 },
        { reps: 8, weightKg: 30 },
        { reps: 8, weightKg: 30 },
      ],
      range,
      "haut",
    );
    expect(advice.action).toBe("augmenter_charge");
    expect(advice.nextWeightKg).toBe(32.5);
    // Le document impose de redescendre au bas de la fourchette après la hausse.
    expect(advice.nextRepsTarget).toBe(6);
  });

  it("ne monte pas la charge si une seule série reste sous le haut de fourchette", () => {
    const advice = advanceDoubleProgression(
      [
        { reps: 8, weightKg: 30 },
        { reps: 8, weightKg: 30 },
        { reps: 7, weightKg: 30 },
      ],
      range,
      "haut",
    );
    expect(advice.action).toBe("ajouter_une_rep");
    expect(advice.nextWeightKg).toBe(30);
    expect(advice.nextRepsTarget).toBe(8);
  });

  it("ajoute une répétition à partir de la série la plus faible", () => {
    const advice = advanceDoubleProgression(
      [
        { reps: 8, weightKg: 30 },
        { reps: 6, weightKg: 30 },
      ],
      range,
      "haut",
    );
    expect(advice.nextRepsTarget).toBe(7);
  });

  it("plafonne l'objectif au haut de la fourchette", () => {
    const advice = advanceDoubleProgression([{ reps: 8, weightKg: 30 }], { low: 6, high: 8 }, "haut");
    expect(advice.nextRepsTarget).toBeLessThanOrEqual(8);
  });

  it("ignore les séries ratées techniquement : la forme décide", () => {
    const advice = advanceDoubleProgression(
      [
        { reps: 8, weightKg: 30 },
        { reps: 8, weightKg: 30 },
        { reps: 9, weightKg: 30, technicalFailure: true },
      ],
      range,
      "haut",
    );
    expect(advice.action).toBe("augmenter_charge");
  });

  it("maintient la charge quand aucune série n'est propre", () => {
    const advice = advanceDoubleProgression(
      [{ reps: 8, weightKg: 30, technicalFailure: true }],
      range,
      "haut",
    );
    expect(advice.action).toBe("maintenir");
    expect(advice.nextWeightKg).toBe(30);
  });

  it("applique +5 kg sur le bas du corps", () => {
    const advice = advanceDoubleProgression(
      [
        { reps: 8, weightKg: 60 },
        { reps: 8, weightKg: 60 },
      ],
      range,
      "bas",
    );
    expect(advice.nextWeightKg).toBe(65);
  });

  it("reste utilisable au poids du corps, sans charge connue", () => {
    const advice = advanceDoubleProgression(
      [
        { reps: 8, weightKg: null },
        { reps: 8, weightKg: null },
      ],
      range,
      "haut",
    );
    expect(advice.action).toBe("augmenter_charge");
    expect(advice.nextWeightKg).toBeNull();
  });
});

describe("tonnage et 1RM estimé", () => {
  it("somme charge × reps", () => {
    expect(
      tonnage([
        { reps: 10, weightKg: 30 },
        { reps: 8, weightKg: 30 },
      ]),
    ).toBe(540);
  });

  it("ignore les séries sans charge", () => {
    expect(tonnage([{ reps: 10, weightKg: null }])).toBe(0);
  });

  it("calcule Epley", () => {
    // 100 kg x 5 reps -> 100 * (1 + 5/30) = 116,7
    expect(estimatedOneRepMax(100, 5)).toBeCloseTo(116.7, 1);
  });

  it("renvoie la charge elle-même à 1 répétition", () => {
    expect(estimatedOneRepMax(80, 1)).toBe(80);
  });

  it("refuse d'estimer au-delà de 12 reps, où la formule mesure l'endurance", () => {
    expect(estimatedOneRepMax(40, 20)).toBeNull();
  });

  it("refuse les entrées absurdes", () => {
    expect(estimatedOneRepMax(0, 5)).toBeNull();
    expect(estimatedOneRepMax(50, 0)).toBeNull();
  });

  it("retient le meilleur 1RM estimé d'une séance", () => {
    const best = bestEstimatedOneRepMax([
      { reps: 8, weightKg: 30 },
      { reps: 3, weightKg: 40 },
    ]);
    expect(best).toBeCloseTo(44, 0);
  });
});

describe("detectPersonalRecords", () => {
  const point = (
    date: string,
    weight: number,
    reps: number,
    orm: number,
    tons: number,
  ): ExerciseHistoryPoint => ({
    date,
    bestWeightKg: weight,
    bestReps: reps,
    estimatedOneRepMax: orm,
    tonnage: tons,
  });

  it("ne déclare aucun record sur une première séance", () => {
    expect(detectPersonalRecords([point("2026-09-01", 30, 8, 38, 900)])).toEqual([]);
  });

  it("détecte un record de charge", () => {
    const records = detectPersonalRecords([
      point("2026-09-01", 30, 8, 38, 900),
      point("2026-09-08", 32.5, 6, 39, 800),
    ]);
    expect(records.map((r) => r.kind)).toContain("charge");
  });

  it("ne déclare pas de record quand rien n'est dépassé", () => {
    const records = detectPersonalRecords([
      point("2026-09-01", 30, 8, 38, 900),
      point("2026-09-08", 30, 7, 37, 800),
    ]);
    expect(records).toEqual([]);
  });

  it("compare au meilleur historique, pas à la séance précédente", () => {
    const records = detectPersonalRecords([
      point("2026-09-01", 40, 8, 50, 900),
      point("2026-09-08", 30, 8, 38, 800),
      point("2026-09-15", 35, 8, 44, 850),
    ]);
    expect(records).toEqual([]);
  });
});

describe("detectStagnation", () => {
  const p = (date: string, orm: number): ExerciseHistoryPoint => ({
    date,
    bestWeightKg: 30,
    bestReps: 8,
    estimatedOneRepMax: orm,
    tonnage: 900,
  });

  it("ne juge pas sur un historique trop court", () => {
    expect(detectStagnation([p("2026-09-01", 38), p("2026-09-08", 38)]).stagnant).toBe(false);
  });

  it("signale 3 séances sans progresser", () => {
    const verdict = detectStagnation([
      p("2026-09-01", 40),
      p("2026-09-08", 39),
      p("2026-09-15", 39),
      p("2026-09-22", 38),
    ]);
    expect(verdict.stagnant).toBe(true);
    expect(verdict.sessionsWithoutProgress).toBe(3);
  });

  it("ne signale rien quand la dernière séance est la meilleure", () => {
    const verdict = detectStagnation([
      p("2026-09-01", 38),
      p("2026-09-08", 39),
      p("2026-09-15", 39),
      p("2026-09-22", 41),
    ]);
    expect(verdict.stagnant).toBe(false);
    expect(verdict.sessionsWithoutProgress).toBe(0);
  });

  it("compte une répétition de plus à charge égale comme un progrès", () => {
    // Même charge, une rep de plus -> 1RM estimé supérieur -> pas de stagnation.
    const before = estimatedOneRepMax(30, 7)!;
    const after = estimatedOneRepMax(30, 8)!;
    expect(after).toBeGreaterThan(before);
  });
});
