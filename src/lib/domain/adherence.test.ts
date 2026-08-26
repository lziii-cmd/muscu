import { describe, expect, it } from "vitest";
import {
  adherence,
  adherenceBySlot,
  lateLogging,
  loggingQuality,
  missPatterns,
  streaks,
  type SessionRecord,
} from "./adherence";

const record = (partial: Partial<SessionRecord> & { date: string }): SessionRecord => ({
  slot: "salle",
  status: "done",
  ...partial,
});

describe("lateLogging", () => {
  it("ne marque pas une saisie le jour même", () => {
    expect(lateLogging("2026-09-01", "2026-09-01T23:30:00Z").isLate).toBe(false);
  });

  it("marque une saisie du lendemain", () => {
    const result = lateLogging("2026-09-01", "2026-09-02T09:00:00Z");
    expect(result.isLate).toBe(true);
    expect(result.daysLate).toBe(1);
    expect(result.label).toMatch(/lendemain/i);
  });

  it("compte les jours de retard", () => {
    const result = lateLogging("2026-09-01", "2026-09-04T09:00:00Z");
    expect(result.daysLate).toBe(3);
    expect(result.label).toMatch(/3 jours/);
  });

  it("ne marque rien sans horodatage de saisie", () => {
    expect(lateLogging("2026-09-01", null).isLate).toBe(false);
  });
});

describe("adherence", () => {
  it("compte les séances faites et partielles comme honorées", () => {
    const stats = adherence([
      record({ date: "2026-09-01", status: "done" }),
      record({ date: "2026-09-02", status: "partial" }),
      record({ date: "2026-09-03", status: "missed" }),
    ]);
    expect(stats.rate).toBe(67);
  });

  it("sort les séances déplacées du dénominateur : reporter n'est pas échouer", () => {
    const stats = adherence([
      record({ date: "2026-09-01", status: "done" }),
      record({ date: "2026-09-02", status: "moved" }),
    ]);
    expect(stats.rate).toBe(100);
    expect(stats.moved).toBe(1);
  });

  it("ne divise pas par zéro", () => {
    expect(adherence([]).rate).toBe(0);
  });

  it("ventile par créneau", () => {
    const stats = adherenceBySlot([
      record({ date: "2026-09-01", slot: "salle", status: "done" }),
      record({ date: "2026-09-01", slot: "matin", status: "done" }),
      record({ date: "2026-09-01", slot: "soir", status: "missed" }),
    ]);
    expect(stats.salle.rate).toBe(100);
    expect(stats.soir.rate).toBe(0);
  });
});

describe("missPatterns", () => {
  it("ne conclut rien sous trois absences", () => {
    const patterns = missPatterns([
      record({ date: "2026-09-01", status: "missed", missedReason: "fatigue" }),
      record({ date: "2026-09-02", status: "missed", missedReason: "travail" }),
    ]);
    expect(patterns.insight).toBeNull();
  });

  it("nomme le créneau qui saute le plus", () => {
    const patterns = missPatterns([
      record({ date: "2026-09-01", slot: "matin", status: "missed", missedReason: "sommeil" }),
      record({ date: "2026-09-02", slot: "matin", status: "missed", missedReason: "sommeil" }),
      record({ date: "2026-09-03", slot: "matin", status: "missed", missedReason: "fatigue" }),
      record({ date: "2026-09-04", slot: "salle", status: "missed", missedReason: "travail" }),
    ]);
    expect(patterns.insight).toMatch(/matin/i);
  });

  it("classe les motifs par fréquence", () => {
    const patterns = missPatterns([
      record({ date: "2026-09-01", status: "missed", missedReason: "sommeil" }),
      record({ date: "2026-09-02", status: "missed", missedReason: "sommeil" }),
      record({ date: "2026-09-03", status: "missed", missedReason: "travail" }),
    ]);
    expect(patterns.reasonCounts[0].reason).toBe("sommeil");
    expect(patterns.reasonCounts[0].count).toBe(2);
  });

  it("ignore les séances faites", () => {
    const patterns = missPatterns([record({ date: "2026-09-01", status: "done" })]);
    expect(patterns.reasonCounts).toEqual([]);
  });
});

describe("streaks", () => {
  it("compte la meilleure série de jours consécutifs", () => {
    const stats = streaks(
      [
        record({ date: "2026-09-01" }),
        record({ date: "2026-09-02" }),
        record({ date: "2026-09-03" }),
        record({ date: "2026-09-06" }),
      ],
      "2026-09-06",
    );
    expect(stats.best).toBe(3);
  });

  it("compte la série en cours jusqu'à aujourd'hui", () => {
    const stats = streaks(
      [record({ date: "2026-09-05" }), record({ date: "2026-09-06" })],
      "2026-09-06",
    );
    expect(stats.current).toBe(2);
  });

  it("tolère que la séance du jour ne soit pas encore faite", () => {
    const stats = streaks(
      [record({ date: "2026-09-04" }), record({ date: "2026-09-05" })],
      "2026-09-06",
    );
    expect(stats.current).toBe(2);
  });

  it("renvoie zéro sans séance", () => {
    expect(streaks([], "2026-09-06")).toEqual({ current: 0, best: 0 });
  });
});

describe("loggingQuality", () => {
  it("mesure la part de saisies tardives", () => {
    const quality = loggingQuality([
      record({ date: "2026-09-01", loggedAt: "2026-09-01T23:00:00Z" }),
      record({ date: "2026-09-02", loggedAt: "2026-09-05T09:00:00Z" }),
    ]);
    expect(quality.latePercent).toBe(50);
  });

  it("signale une dérive au-delà de la moitié des séances", () => {
    const quality = loggingQuality([
      record({ date: "2026-09-01", loggedAt: "2026-09-04T09:00:00Z" }),
      record({ date: "2026-09-02", loggedAt: "2026-09-05T09:00:00Z" }),
      record({ date: "2026-09-03", loggedAt: "2026-09-06T09:00:00Z" }),
      record({ date: "2026-09-04", loggedAt: "2026-09-04T22:00:00Z" }),
    ]);
    expect(quality.drifting).toBe(true);
    expect(quality.message).toMatch(/mémoire/i);
  });

  it("gère l'absence de séances enregistrées", () => {
    expect(loggingQuality([]).latePercent).toBe(0);
  });
});
