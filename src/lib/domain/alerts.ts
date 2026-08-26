/**
 * Les quatre signaux d'alerte du programme.
 *
 * Le document les nomme explicitement et donne la conduite à tenir :
 * « si la semaine déborde : coupe une séance de volume (jeudi ou vendredi) --
 * jamais une nuit de sommeil ».
 *
 * Source : « Signaux d'alerte » du programme PPL.
 */

export type AlertKind =
  | "douleur_articulaire"
  | "baisse_performance"
  | "sommeil_degrade"
  | "fc_repos_haute";

export type AlertSeverity = "info" | "warning" | "danger";

export interface Alert {
  kind: AlertKind;
  severity: AlertSeverity;
  title: string;
  message: string;
  action: string;
}

export interface PainEntry {
  date: string;
  area: string;
  intensity: number;
  isJoint: boolean;
}

export interface SleepEntry {
  date: string;
  durationMinutes: number | null;
  quality: number | null;
  restingHr: number | null;
}

export interface PerformancePoint {
  date: string;
  estimatedOneRepMax: number | null;
}

/**
 * Douleur articulaire persistant au-delà de 48 h.
 * Le document distingue explicitement la douleur articulaire des courbatures.
 */
export function jointPainAlert(pains: PainEntry[], today: string): Alert | null {
  const joint = pains.filter((p) => p.isJoint);
  if (joint.length === 0) return null;

  const byArea = new Map<string, string[]>();
  for (const pain of joint) {
    if (!byArea.has(pain.area)) byArea.set(pain.area, []);
    byArea.get(pain.area)!.push(pain.date);
  }

  const todayTime = new Date(`${today}T00:00:00Z`).getTime();

  for (const [area, dates] of byArea) {
    const sorted = [...dates].sort();
    const first = new Date(`${sorted[0]}T00:00:00Z`).getTime();
    const last = new Date(`${sorted[sorted.length - 1]}T00:00:00Z`).getTime();

    const spanHours = (last - first) / 3_600_000;
    const staleHours = (todayTime - last) / 3_600_000;

    // Douleur signalée sur plus de 48 h, et toujours d'actualité.
    if (spanHours >= 48 && staleHours <= 48) {
      return {
        kind: "douleur_articulaire",
        severity: "danger",
        title: "Douleur articulaire au-delà de 48 h",
        message: `Douleur signalée à « ${area} » depuis plus de deux jours. Ce n'est pas une courbature.`,
        action: "Retire l'exercice en cause, pas la séance entière. Si ça persiste, fais-toi examiner.",
      };
    }
  }

  return null;
}

/** Baisse de performance sur deux séances consécutives. */
export function performanceDropAlert(points: PerformancePoint[]): Alert | null {
  const valid = points.filter((p) => p.estimatedOneRepMax !== null);
  if (valid.length < 3) return null;

  const [third, second, last] = valid.slice(-3);
  const dropping =
    last.estimatedOneRepMax! < second.estimatedOneRepMax! &&
    second.estimatedOneRepMax! < third.estimatedOneRepMax!;

  if (!dropping) return null;

  return {
    kind: "baisse_performance",
    severity: "warning",
    title: "Baisse de performance sur 2 séances consécutives",
    message: "Les charges reculent deux séances de suite — c'est un signal de récupération, pas de volonté.",
    action: "Coupe une séance de volume (jeudi ou vendredi). Jamais une nuit de sommeil.",
  };
}

/**
 * Sommeil dégradé.
 * Le document rappelle que le sommeil est le facteur limitant du programme,
 * pas le programme lui-même.
 */
export function sleepAlert(entries: SleepEntry[], minimumHours = 6.5): Alert | null {
  const recent = [...entries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
  const withDuration = recent.filter((e) => e.durationMinutes !== null);
  if (withDuration.length < 3) return null;

  const average =
    withDuration.reduce((sum, e) => sum + e.durationMinutes!, 0) / withDuration.length / 60;

  if (average >= minimumHours) return null;

  return {
    kind: "sommeil_degrade",
    severity: "warning",
    title: "Sommeil insuffisant",
    message: `${average.toFixed(1)} h de moyenne sur 3 nuits, sous le seuil de ${minimumHours} h.`,
    action:
      "Avec la calisthénie au réveil et la salle à 23h, le sommeil est ton facteur limitant. Coupe une séance de volume avant de couper une nuit.",
  };
}

/**
 * Fréquence cardiaque de repos anormalement haute au réveil.
 * Comparée à la ligne de base personnelle, pas à une norme générale.
 */
export function restingHrAlert(entries: SleepEntry[], marginBpm = 7): Alert | null {
  const withHr = entries
    .filter((e) => e.restingHr !== null)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (withHr.length < 8) return null;

  const latest = withHr[withHr.length - 1];
  const baselineEntries = withHr.slice(0, -1).slice(-14);
  const baseline =
    baselineEntries.reduce((sum, e) => sum + e.restingHr!, 0) / baselineEntries.length;

  if (latest.restingHr! <= baseline + marginBpm) return null;

  return {
    kind: "fc_repos_haute",
    severity: "warning",
    title: "Fréquence cardiaque de repos élevée",
    message: `${latest.restingHr} bpm ce matin, contre ${Math.round(baseline)} bpm de moyenne.`,
    action: "Signe de fatigue accumulée ou de début d'infection. Allège la journée.",
  };
}

export interface AlertInputs {
  today: string;
  pains: PainEntry[];
  sleep: SleepEntry[];
  performance: PerformancePoint[];
}

/** Passe les quatre signaux en revue, les plus graves d'abord. */
export function evaluateAlerts(inputs: AlertInputs): Alert[] {
  const alerts = [
    jointPainAlert(inputs.pains, inputs.today),
    performanceDropAlert(inputs.performance),
    sleepAlert(inputs.sleep),
    restingHrAlert(inputs.sleep),
  ].filter((alert): alert is Alert => alert !== null);

  const order: Record<AlertSeverity, number> = { danger: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => order[a.severity] - order[b.severity]);
}
