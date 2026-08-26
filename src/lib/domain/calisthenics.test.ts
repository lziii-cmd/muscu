import { describe, expect, it } from "vitest";
import {
  evaluateLevelProgression,
  repsForMax,
  maxRepsPerSet,
  pullupTargetStatus,
  setFormatForMax,
  shouldRetestMax,
  type LadderAttempt,
} from "./calisthenics";

describe("setFormatForMax -- la règle du (max - 1)", () => {
  it("donne 6 séries de 1 rep pour un max de 2", () => {
    const format = setFormatForMax(2);
    expect(format.repsPerSet).toBe(1);
    expect(format.sets).toBe(6);
  });

  it("suit le barème du document", () => {
    expect(setFormatForMax(3)).toMatchObject({ repsPerSet: 2, sets: 6 });
    expect(setFormatForMax(4)).toMatchObject({ repsPerSet: 3, sets: 5 });
    expect(setFormatForMax(5)).toMatchObject({ repsPerSet: 3, sets: 5 });
    expect(setFormatForMax(6)).toMatchObject({ repsPerSet: 4, sets: 5 });
    expect(setFormatForMax(7)).toMatchObject({ repsPerSet: 4, sets: 5 });
    expect(setFormatForMax(8)).toMatchObject({ repsPerSet: 5, sets: 5 });
    expect(setFormatForMax(9)).toMatchObject({ repsPerSet: 5, sets: 5 });
    expect(setFormatForMax(10)).toMatchObject({ repsPerSet: 6, sets: 5 });
  });

  it("bascule sur le lest à partir de 10 reps", () => {
    expect(setFormatForMax(10).shouldAddWeight).toBe(true);
    expect(setFormatForMax(9).shouldAddWeight).toBe(false);
  });

  it("renvoie vers les régressions sous 2 tractions", () => {
    expect(setFormatForMax(1).repsPerSet).toBe(1);
    expect(setFormatForMax(0).message).toMatch(/régressions/i);
  });

  it("ne dépasse jamais (max - 1) reps par série", () => {
    for (let max = 2; max <= 12; max++) {
      expect(setFormatForMax(max).repsPerSet).toBeLessThanOrEqual(maxRepsPerSet(max));
    }
  });
});

describe("repsForMax -- le décalage n'est pas toujours de 1", () => {
  it("applique max - 1 les jours de force", () => {
    expect(repsForMax(3, 1)).toBe(2);
    expect(repsForMax(6, 1)).toBe(5);
  });

  it("applique max - 2 le jeudi, journée de volume", () => {
    // Confondre les deux donnerait deux journées lourdes de tractions par
    // semaine — l'erreur que le programme cherche précisément à éviter.
    expect(repsForMax(3, 2)).toBe(1);
    expect(repsForMax(6, 2)).toBe(4);
  });

  it("garde le jeudi strictement plus léger que le lundi", () => {
    for (let max = 3; max <= 12; max++) {
      expect(repsForMax(max, 2)).toBeLessThan(repsForMax(max, 1));
    }
  });

  it("ne descend jamais sous une répétition", () => {
    expect(repsForMax(2, 2)).toBe(1);
    expect(repsForMax(1, 2)).toBe(1);
  });
});

describe("evaluateLevelProgression -- deux séances propres de suite", () => {
  const ok = (date: string): LadderAttempt => ({ date, criterionMet: true, cleanForm: true });
  const ko = (date: string): LadderAttempt => ({ date, criterionMet: false, cleanForm: true });
  const sloppy = (date: string): LadderAttempt => ({ date, criterionMet: true, cleanForm: false });

  it("ne fait pas monter sur une seule réussite", () => {
    const advice = evaluateLevelProgression([ok("2026-09-01")]);
    expect(advice.action).toBe("rester");
    expect(advice.cleanStreak).toBe(1);
  });

  it("fait monter après deux séances propres consécutives", () => {
    const advice = evaluateLevelProgression([ok("2026-09-01"), ok("2026-09-03")]);
    expect(advice.action).toBe("monter");
  });

  it("remet le compteur à zéro après un échec", () => {
    const advice = evaluateLevelProgression([ok("2026-09-01"), ko("2026-09-03"), ok("2026-09-05")]);
    expect(advice.action).toBe("rester");
    expect(advice.cleanStreak).toBe(1);
  });

  it("ne compte pas une réussite obtenue avec une forme dégradée", () => {
    const advice = evaluateLevelProgression([ok("2026-09-01"), sloppy("2026-09-03")]);
    expect(advice.action).toBe("rester");
  });

  it("fait redescendre après deux séances à forme dégradée", () => {
    const advice = evaluateLevelProgression([sloppy("2026-09-01"), sloppy("2026-09-03")]);
    expect(advice.action).toBe("redescendre");
  });

  it("gère un historique vide", () => {
    expect(evaluateLevelProgression([]).action).toBe("rester");
  });
});

describe("shouldRetestMax", () => {
  // 2026-09-07 est un lundi, 2026-09-08 un mardi.
  it("n'autorise le retest que le lundi", () => {
    expect(shouldRetestMax(null, "2026-09-08")).toBe(false);
    expect(shouldRetestMax(null, "2026-09-07")).toBe(true);
  });

  it("impose un lundi sur deux", () => {
    expect(shouldRetestMax("2026-09-07", "2026-09-14")).toBe(false);
    expect(shouldRetestMax("2026-09-07", "2026-09-21")).toBe(true);
  });
});

describe("pullupTargetStatus", () => {
  it("mesure l'écart à l'objectif du jalon", () => {
    const status = pullupTargetStatus(2, 4);
    expect(status.gap).toBe(2);
    expect(status.onTrack).toBe(false);
  });

  it("valide l'objectif atteint ou dépassé", () => {
    expect(pullupTargetStatus(4, 4).onTrack).toBe(true);
    expect(pullupTargetStatus(6, 4).onTrack).toBe(true);
  });
});
