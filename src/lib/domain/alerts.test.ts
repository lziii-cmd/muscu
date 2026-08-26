import { describe, expect, it } from "vitest";
import {
  evaluateAlerts,
  jointPainAlert,
  performanceDropAlert,
  restingHrAlert,
  sleepAlert,
  type SleepEntry,
} from "./alerts";

describe("jointPainAlert", () => {
  it("alerte sur une douleur articulaire qui dépasse 48 h", () => {
    const alert = jointPainAlert(
      [
        { date: "2026-09-01", area: "épaule", intensity: 3, isJoint: true },
        { date: "2026-09-03", area: "épaule", intensity: 3, isJoint: true },
      ],
      "2026-09-03",
    );
    expect(alert?.kind).toBe("douleur_articulaire");
    expect(alert?.severity).toBe("danger");
  });

  it("n'alerte pas sur une douleur d'un seul jour", () => {
    const alert = jointPainAlert(
      [{ date: "2026-09-01", area: "épaule", intensity: 3, isJoint: true }],
      "2026-09-02",
    );
    expect(alert).toBeNull();
  });

  it("ignore les courbatures : le document les distingue explicitement", () => {
    const alert = jointPainAlert(
      [
        { date: "2026-09-01", area: "quadriceps", intensity: 4, isJoint: false },
        { date: "2026-09-04", area: "quadriceps", intensity: 4, isJoint: false },
      ],
      "2026-09-04",
    );
    expect(alert).toBeNull();
  });

  it("n'alerte plus sur une douleur ancienne et résolue", () => {
    const alert = jointPainAlert(
      [
        { date: "2026-09-01", area: "coude", intensity: 3, isJoint: true },
        { date: "2026-09-04", area: "coude", intensity: 3, isJoint: true },
      ],
      "2026-09-20",
    );
    expect(alert).toBeNull();
  });

  it("conseille de retirer l'exercice, pas la séance", () => {
    const alert = jointPainAlert(
      [
        { date: "2026-09-01", area: "coude", intensity: 3, isJoint: true },
        { date: "2026-09-03", area: "coude", intensity: 3, isJoint: true },
      ],
      "2026-09-03",
    );
    expect(alert?.action).toMatch(/exercice/i);
  });
});

describe("performanceDropAlert", () => {
  it("alerte sur deux baisses consécutives", () => {
    const alert = performanceDropAlert([
      { date: "2026-09-01", estimatedOneRepMax: 42 },
      { date: "2026-09-08", estimatedOneRepMax: 40 },
      { date: "2026-09-15", estimatedOneRepMax: 38 },
    ]);
    expect(alert?.kind).toBe("baisse_performance");
  });

  it("n'alerte pas sur une seule baisse", () => {
    const alert = performanceDropAlert([
      { date: "2026-09-01", estimatedOneRepMax: 40 },
      { date: "2026-09-08", estimatedOneRepMax: 42 },
      { date: "2026-09-15", estimatedOneRepMax: 41 },
    ]);
    expect(alert).toBeNull();
  });

  it("reprend la consigne du document : couper le volume, jamais le sommeil", () => {
    const alert = performanceDropAlert([
      { date: "2026-09-01", estimatedOneRepMax: 42 },
      { date: "2026-09-08", estimatedOneRepMax: 40 },
      { date: "2026-09-15", estimatedOneRepMax: 38 },
    ]);
    expect(alert?.action).toMatch(/jamais une nuit/i);
  });

  it("ne conclut pas sur un historique trop court", () => {
    expect(performanceDropAlert([{ date: "2026-09-01", estimatedOneRepMax: 40 }])).toBeNull();
  });
});

describe("sleepAlert", () => {
  const night = (date: string, hours: number): SleepEntry => ({
    date,
    durationMinutes: hours * 60,
    quality: 3,
    restingHr: 55,
  });

  it("alerte sous 6h30 de moyenne sur trois nuits", () => {
    const alert = sleepAlert([night("2026-09-01", 6), night("2026-09-02", 6), night("2026-09-03", 6)]);
    expect(alert?.kind).toBe("sommeil_degrade");
  });

  it("n'alerte pas quand le sommeil suffit", () => {
    const alert = sleepAlert([night("2026-09-01", 7), night("2026-09-02", 8), night("2026-09-03", 7)]);
    expect(alert).toBeNull();
  });

  it("rappelle que le sommeil est le facteur limitant", () => {
    const alert = sleepAlert([night("2026-09-01", 5), night("2026-09-02", 5), night("2026-09-03", 5)]);
    expect(alert?.action).toMatch(/facteur limitant/i);
  });
});

describe("restingHrAlert", () => {
  const baseline = Array.from({ length: 10 }, (_, i) => ({
    date: `2026-09-${String(i + 1).padStart(2, "0")}`,
    durationMinutes: 420,
    quality: 3,
    restingHr: 55,
  }));

  it("compare à la ligne de base personnelle, pas à une norme", () => {
    const alert = restingHrAlert([...baseline, { ...baseline[0], date: "2026-09-11", restingHr: 68 }]);
    expect(alert?.kind).toBe("fc_repos_haute");
  });

  it("tolère une variation normale", () => {
    const alert = restingHrAlert([...baseline, { ...baseline[0], date: "2026-09-11", restingHr: 58 }]);
    expect(alert).toBeNull();
  });

  it("attend d'avoir une base suffisante", () => {
    expect(restingHrAlert(baseline.slice(0, 3))).toBeNull();
  });
});

describe("evaluateAlerts", () => {
  it("classe les alertes les plus graves en premier", () => {
    const alerts = evaluateAlerts({
      today: "2026-09-03",
      pains: [
        { date: "2026-09-01", area: "coude", intensity: 3, isJoint: true },
        { date: "2026-09-03", area: "coude", intensity: 3, isJoint: true },
      ],
      sleep: [
        { date: "2026-09-01", durationMinutes: 300, quality: 2, restingHr: 55 },
        { date: "2026-09-02", durationMinutes: 300, quality: 2, restingHr: 55 },
        { date: "2026-09-03", durationMinutes: 300, quality: 2, restingHr: 55 },
      ],
      performance: [],
    });
    expect(alerts[0].severity).toBe("danger");
    expect(alerts.length).toBeGreaterThan(1);
  });

  it("ne renvoie rien quand tout va bien", () => {
    const alerts = evaluateAlerts({
      today: "2026-09-03",
      pains: [],
      sleep: [
        { date: "2026-09-01", durationMinutes: 450, quality: 4, restingHr: 55 },
        { date: "2026-09-02", durationMinutes: 450, quality: 4, restingHr: 55 },
        { date: "2026-09-03", durationMinutes: 450, quality: 4, restingHr: 55 },
      ],
      performance: [],
    });
    expect(alerts).toEqual([]);
  });
});
