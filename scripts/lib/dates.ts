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
};

/**
 * « 31 août » -> « 2026-08-31 ».
 * Renvoie null si la chaîne n'est pas une date française reconnaissable.
 */
export function parseFrenchDate(raw: string, year: number): string | null {
  const match = raw
    .toLowerCase()
    .trim()
    .match(/(\d{1,2})\s+([a-zûéèô]+)/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = MONTHS[match[2]];
  if (!month || day < 1 || day > 31) return null;

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Jour de la semaine en français pour une date ISO, en UTC pour éviter les décalages. */
export function weekdayOf(isoDate: string): string {
  const names = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
  return names[new Date(`${isoDate}T00:00:00Z`).getUTCDay()];
}
