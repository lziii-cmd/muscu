const MONTHS: Record<string, number> = {
  janvier: 1,
  février: 2,
  fevrier: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  août: 8,
  aout: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  décembre: 12,
  decembre: 12,
  // Abréviations des en-têtes de tableau : « 3 oct », « 17 jan ».
  jan: 1,
  janv: 1,
  fév: 2,
  fev: 2,
  févr: 2,
  avr: 4,
  juil: 7,
  sept: 9,
  oct: 10,
  nov: 11,
  déc: 12,
  dec: 12,
};

/** « 31 août » -> { day: 31, month: 8 }. Null si ce n'est pas une date française. */
export function parseFrenchDayMonth(raw: string): { day: number; month: number } | null {
  const match = raw
    .toLowerCase()
    .trim()
    .match(/(\d{1,2})\s+([a-zûéèô]+)/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = MONTHS[match[2]];
  if (!month || day < 1 || day > 31) return null;

  return { day, month };
}

/**
 * « 31 août » -> « 2026-08-31 ».
 * Renvoie null si la chaîne n'est pas une date française reconnaissable.
 */
export function parseFrenchDate(raw: string, year: number): string | null {
  const parts = parseFrenchDayMonth(raw);
  if (!parts) return null;
  return toIso(parts.day, parts.month, year);
}

function toIso(day: number, month: number, year: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Calendrier d'un programme qui franchit le 31 décembre.
 *
 * Le document ne porte que le jour et le mois : « 3 janvier » n'y dit pas son
 * année. Un programme de moins de douze mois lève l'ambiguïté tout seul — tout
 * mois antérieur au mois de départ appartient à l'année suivante. Sans cela, la
 * semaine 17 daterait de janvier 2026, soit huit mois *avant* le début du
 * programme, et le décalage passerait inaperçu : les dates restent plausibles.
 */
export function makeCalendar(startMonth: number, startYear: number) {
  return (raw: string): string | null => {
    const parts = parseFrenchDayMonth(raw);
    if (!parts) return null;
    return toIso(parts.day, parts.month, parts.month >= startMonth ? startYear : startYear + 1);
  };
}

/** Jour de la semaine en français pour une date ISO, en UTC pour éviter les décalages. */
export function weekdayOf(isoDate: string): string {
  const names = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
  return names[new Date(`${isoDate}T00:00:00Z`).getUTCDay()];
}
