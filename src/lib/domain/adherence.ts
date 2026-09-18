/**
 * Assiduité, séances manquées et fiabilité de la saisie.
 *
 * Une séance manquée n'est pas un trou : c'est une donnée. Ces fonctions
 * produisent les lectures qui permettent d'agir — quel jour saute, pour quel
 * motif, et si la saisie elle-même est en train de décrocher.
 */

export type SessionStatus = "planned" | "in_progress" | "done" | "partial" | "missed" | "moved";

export type MissedReason =
  | "fatigue"
  | "sommeil"
  | "travail"
  | "blessure"
  | "maladie"
  | "voyage"
  | "salle_indisponible"
  | "motivation"
  | "repos_volontaire"
  | "autre";

export const MISSED_REASON_LABELS: Record<MissedReason, string> = {
  fatigue: "Fatigue",
  sommeil: "Manque de sommeil",
  travail: "Travail / imprévu",
  blessure: "Blessure ou douleur",
  maladie: "Maladie",
  voyage: "Voyage / déplacement",
  salle_indisponible: "Salle fermée ou inaccessible",
  motivation: "Manque de motivation",
  repos_volontaire: "Repos volontaire (décision assumée)",
  autre: "Autre",
};

export interface SessionRecord {
  date: string;
  slot: "salle" | "matin" | "soir";
  status: SessionStatus;
  missedReason?: MissedReason | null;
  /** Horodatage de la saisie, pour mesurer le retard. */
  loggedAt?: string | null;
}

// ---------------------------------------------------------------------------
// Retard de saisie
// ---------------------------------------------------------------------------

export interface LateLogging {
  isLate: boolean;
  daysLate: number;
  label: string;
}

/**
 * Compare la date de séance à la date de saisie.
 *
 * Une saisie après coup n'est pas une saisie douteuse : les charges et les
 * répétitions notées comptent comme les autres. Seules la durée et les pauses,
 * qui n'ont pas été chronométrées, sont écartées des analyses de temps.
 */
export function lateLogging(sessionDate: string, loggedAt: string | null | undefined): LateLogging {
  if (!loggedAt) return { isLate: false, daysLate: 0, label: "" };

  const sessionDay = new Date(`${sessionDate}T00:00:00Z`).getTime();
  const loggedDay = new Date(loggedAt);
  const loggedDayUtc = Date.UTC(
    loggedDay.getUTCFullYear(),
    loggedDay.getUTCMonth(),
    loggedDay.getUTCDate(),
  );

  const daysLate = Math.round((loggedDayUtc - sessionDay) / 86_400_000);
  if (daysLate <= 0) return { isLate: false, daysLate: 0, label: "" };

  return {
    isLate: true,
    daysLate,
    label: daysLate === 1 ? "Enregistré le lendemain" : `Enregistré avec ${daysLate} jours de retard`,
  };
}

/** Une saisie tardive ne permet pas de juger la durée ni les temps de repos. */
export function isReliableForTiming(record: SessionRecord): boolean {
  return !lateLogging(record.date, record.loggedAt).isLate;
}

// ---------------------------------------------------------------------------
// Taux d'assiduité
// ---------------------------------------------------------------------------

export interface AdherenceStats {
  planned: number;
  done: number;
  partial: number;
  missed: number;
  moved: number;
  /** Séances faites ou partielles rapportées aux séances attendues, en %. */
  rate: number;
}

/**
 * Une séance déplacée n'est pas un échec : elle sort du dénominateur.
 * Sauter le bloc du soir pour préserver celui du matin, c'est appliquer le
 * programme, pas y échouer.
 */
export function adherence(records: SessionRecord[]): AdherenceStats {
  const done = records.filter((r) => r.status === "done").length;
  const partial = records.filter((r) => r.status === "partial").length;
  const missed = records.filter((r) => r.status === "missed").length;
  const moved = records.filter((r) => r.status === "moved").length;

  const expected = done + partial + missed;
  const rate = expected === 0 ? 0 : Math.round(((done + partial) / expected) * 100);

  return { planned: records.length, done, partial, missed, moved, rate };
}

/** Assiduité ventilée par créneau : la salle, le matin et le soir ne se valent pas. */
export function adherenceBySlot(records: SessionRecord[]): Record<string, AdherenceStats> {
  const slots = ["salle", "matin", "soir"] as const;
  const result: Record<string, AdherenceStats> = {};
  for (const slot of slots) {
    result[slot] = adherence(records.filter((r) => r.slot === slot));
  }
  return result;
}

// ---------------------------------------------------------------------------
// Schémas d'absence
// ---------------------------------------------------------------------------

const WEEKDAY_NAMES = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

export interface MissPattern {
  reasonCounts: { reason: MissedReason; count: number; label: string }[];
  weekdayCounts: { weekday: string; count: number }[];
  slotCounts: { slot: string; count: number }[];
  /** Formulation lisible du schéma dominant, ou null si rien ne ressort. */
  insight: string | null;
}

/**
 * Cherche ce qui se répète dans les absences.
 *
 * Le but n'est pas de compter, c'est de nommer : « quatre des cinq dernières
 * séances manquées sont des blocs du matin » est actionnable, « 5 séances
 * manquées » ne l'est pas.
 */
export function missPatterns(records: SessionRecord[]): MissPattern {
  const missed = records.filter((r) => r.status === "missed");

  const reasonMap = new Map<MissedReason, number>();
  const weekdayMap = new Map<string, number>();
  const slotMap = new Map<string, number>();

  for (const record of missed) {
    const reason = record.missedReason ?? "autre";
    reasonMap.set(reason, (reasonMap.get(reason) ?? 0) + 1);

    const weekday = WEEKDAY_NAMES[new Date(`${record.date}T00:00:00Z`).getUTCDay()];
    weekdayMap.set(weekday, (weekdayMap.get(weekday) ?? 0) + 1);

    slotMap.set(record.slot, (slotMap.get(record.slot) ?? 0) + 1);
  }

  const reasonCounts = [...reasonMap.entries()]
    .map(([reason, count]) => ({ reason, count, label: MISSED_REASON_LABELS[reason] }))
    .sort((a, b) => b.count - a.count);

  const weekdayCounts = [...weekdayMap.entries()]
    .map(([weekday, count]) => ({ weekday, count }))
    .sort((a, b) => b.count - a.count);

  const slotCounts = [...slotMap.entries()]
    .map(([slot, count]) => ({ slot, count }))
    .sort((a, b) => b.count - a.count);

  let insight: string | null = null;

  if (missed.length >= 3) {
    const topSlot = slotCounts[0];
    const topReason = reasonCounts[0];
    const topWeekday = weekdayCounts[0];

    if (topSlot && topSlot.count / missed.length >= 0.6) {
      const label =
        topSlot.slot === "salle" ? "la salle" : `le bloc du ${topSlot.slot}`;
      insight = `${topSlot.count} de tes ${missed.length} séances manquées concernent ${label}.`;
    } else if (topReason && topReason.count / missed.length >= 0.5) {
      insight = `« ${topReason.label} » explique ${topReason.count} de tes ${missed.length} absences.`;
    } else if (topWeekday && topWeekday.count >= 3) {
      insight = `Le ${topWeekday.weekday.toLowerCase()} est ton jour le plus sauté (${topWeekday.count} fois).`;
    }
  }

  return { reasonCounts, weekdayCounts, slotCounts, insight };
}

// ---------------------------------------------------------------------------
// Séries de jours
// ---------------------------------------------------------------------------

export interface StreakStats {
  current: number;
  best: number;
}

/** Jours consécutifs avec au moins une séance faite ou partielle. */
export function streaks(records: SessionRecord[], today: string): StreakStats {
  const activeDays = new Set(
    records.filter((r) => r.status === "done" || r.status === "partial").map((r) => r.date),
  );
  if (activeDays.size === 0) return { current: 0, best: 0 };

  const sorted = [...activeDays].sort();

  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const gap =
      (new Date(`${sorted[i]}T00:00:00Z`).getTime() -
        new Date(`${sorted[i - 1]}T00:00:00Z`).getTime()) /
      86_400_000;
    run = gap === 1 ? run + 1 : 1;
    if (run > best) best = run;
  }

  // La série courante se compte à rebours depuis aujourd'hui, en tolérant
  // que la séance du jour ne soit pas encore faite.
  let current = 0;
  const todayTime = new Date(`${today}T00:00:00Z`).getTime();
  const startOffset = activeDays.has(today) ? 0 : 1;
  for (let offset = startOffset; ; offset++) {
    const day = new Date(todayTime - offset * 86_400_000).toISOString().slice(0, 10);
    if (!activeDays.has(day)) break;
    current++;
  }

  return { current, best };
}

// ---------------------------------------------------------------------------
// Fiabilité de la saisie
// ---------------------------------------------------------------------------

export interface LoggingQuality {
  liveCount: number;
  lateCount: number;
  latePercent: number;
  drifting: boolean;
  message: string;
}

/**
 * Mesure la part de séances saisies après coup.
 *
 * Une saisie qui dérive est souvent le premier signe d'un décrochage : elle
 * mérite d'être signalée avant que les séances elles-mêmes ne sautent.
 */
export function loggingQuality(records: SessionRecord[]): LoggingQuality {
  const logged = records.filter(
    (r) => (r.status === "done" || r.status === "partial") && r.loggedAt,
  );
  if (logged.length === 0) {
    return {
      liveCount: 0,
      lateCount: 0,
      latePercent: 0,
      drifting: false,
      message: "Aucune séance enregistrée.",
    };
  }

  const lateCount = logged.filter((r) => lateLogging(r.date, r.loggedAt).isLate).length;
  const liveCount = logged.length - lateCount;
  const latePercent = Math.round((lateCount / logged.length) * 100);
  const drifting = latePercent >= 50 && logged.length >= 4;

  return {
    liveCount,
    lateCount,
    latePercent,
    drifting,
    message: drifting
      ? `${latePercent} % de tes séances sont saisies après coup : pense à lancer le chrono pendant la séance pour que la durée et les repos soient mesurés.`
      : `${latePercent} % de séances saisies après coup.`,
  };
}
