import {
  clean,
  normalizeText,
  readRows,
  resolveColumnBounds,
  VOLUME_PATTERN,
  type ColumnSpec,
} from "./table-parser";
import { parseFrenchDate } from "./dates";
import { parseRest } from "./ppl-parser";

export type CaliSlot = "matin" | "soir";

export interface CaliExercise {
  order: number;
  name: string;
  sets: number | null;
  repsLow: number | null;
  repsHigh: number | null;
  holdSeconds: number | null;
  /**
   * Vrai quand le document ne fixe pas les reps mais renvoie à la règle
   * « jamais plus de (max - 1) reps par série » : le nombre se calcule alors à
   * partir du max courant, il n'est pas lu dans le programme.
   */
  repsFromMaxRule: boolean;
  repsRaw: string;
  perSide: boolean;
  cueRaw: string;
  restSeconds: number | null;
}

export interface CaliBlock {
  slot: CaliSlot;
  heading: string;
  exercises: CaliExercise[];
}

export interface CaliDay {
  weekNumber: number;
  date: string;
  weekday: string;
  theme: string;
  isRestDay: boolean;
  blocks: CaliBlock[];
}

export interface CaliWeek {
  weekNumber: number;
  label: string;
  blockName: string;
  startDate: string | null;
  endDate: string | null;
  instruction: string;
}

export interface CaliProgram {
  weeks: CaliWeek[];
  days: CaliDay[];
  errors: string[];
  warnings: string[];
}

const WEEKDAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

const COLUMNS: ColumnSpec[] = [
  { key: "name", header: "Exercice" },
  { key: "reps", header: "Séries" },
  { key: "cue", header: "Charge", optional: true },
  { key: "rest", header: "Repos", optional: true },
];

const DAY_HEADER = new RegExp(
  `^\\s*(${WEEKDAYS.join("|")})\\s+(\\d{1,2})\\s+([a-zûéèôîà]+)\\s*(?:--\\s*(.*))?$`,
);
const WEEK_HEADER = /^\s*Semaine\s+(\d{1,2})\s*·?\s*(.+?)\s*--\s*(.+)$/;
const SLOT_HEADER = /^\s*(MATIN|SOIR)\b(.*)$/;

const BLOCK_BOUNDARY = [
  DAY_HEADER,
  WEEK_HEADER,
  SLOT_HEADER,
  /^\s*\d+\.\s+\S/,
  /^\s*Le programme, jour par jour\s*$/,
  /^\s*Références\s*$/,
];

function isBlockBoundary(line: string): boolean {
  return BLOCK_BOUNDARY.some((pattern) => pattern.test(line));
}

/**
 * « 4 × 8-10 » / « 3 × 30 s » / « 5×3 » / « 3 × 6 / jambe » / « 8 min » / « 6 séries ».
 * Les tenues isométriques sont exprimées en secondes et doivent être
 * distinguées des répétitions : ce sont deux unités différentes.
 */
export function parseCaliVolume(raw: string): {
  sets: number | null;
  repsLow: number | null;
  repsHigh: number | null;
  holdSeconds: number | null;
  repsFromMaxRule: boolean;
  perSide: boolean;
} {
  const text = raw.replace(/\s+/g, " ").trim();
  const perSide = /\/\s*(jambe|bras|côté|cote)/i.test(text);
  const empty = {
    sets: null,
    repsLow: null,
    repsHigh: null,
    holdSeconds: null,
    repsFromMaxRule: false,
    perSide,
  };
  if (text === "") return empty;

  // Tenue : « 3 × 30 s », « 5 × 20-30 s »
  const hold = text.match(/(\d+)\s*[×x]\s*(\d+)(?:\s*-\s*(\d+))?\s*s\b/i);
  if (hold) {
    return {
      ...empty,
      sets: Number(hold[1]),
      // On retient le haut de la fourchette comme objectif de tenue.
      holdSeconds: Number(hold[3] ?? hold[2]),
    };
  }

  // Répétitions : « 4 × 8-10 », « 5×3 »
  const reps = text.match(/(\d+)\s*[×x]\s*(\d+)(?:\s*-\s*(\d+))?/);
  if (reps) {
    return {
      ...empty,
      sets: Number(reps[1]),
      repsLow: Number(reps[2]),
      repsHigh: Number(reps[3] ?? reps[2]),
    };
  }

  // Durée seule : « 8 min », « 5 min » (mobilité, préparation des poignets)
  const duration = text.match(/(\d+)\s*min/i);
  if (duration) {
    return { ...empty, sets: 1, holdSeconds: Number(duration[1]) * 60 };
  }

  // « 6 séries » : le document renvoie à la règle du (max - 1).
  const seriesOnly = text.match(/^(\d+)\s*s[ée]ries?$/i);
  if (seriesOnly) {
    return { ...empty, sets: Number(seriesOnly[1]), repsFromMaxRule: true };
  }

  return empty;
}

function isTableHeader(line: string): boolean {
  return line.includes("Séries") && (line.includes("Repos") || line.includes("Charge"));
}

export function parseCalisthenie(rawInput: string, year: number): CaliProgram {
  const text = normalizeText(rawInput);
  const lines = text.split("\n");

  const errors: string[] = [];
  const warnings: string[] = [];
  const weeks: CaliWeek[] = [];
  const days: CaliDay[] = [];

  // Le sommaire répète les titres : on retient la dernière occurrence, celle
  // du corps du document.
  const lastIndexOf = (predicate: (line: string) => boolean, from = 0): number => {
    for (let i = lines.length - 1; i >= from; i--) {
      if (predicate(lines[i])) return i;
    }
    return -1;
  };

  const startIndex = lastIndexOf((line) => line.trim() === "Le programme, jour par jour");
  if (startIndex === -1) {
    return {
      weeks,
      days,
      errors: ["Section « Le programme, jour par jour » introuvable — format du document modifié."],
      warnings,
    };
  }

  const referencesIndex = lastIndexOf((line) => line.trim() === "Références", startIndex);
  const endIndex = referencesIndex === -1 ? lines.length : referencesIndex;

  const dayStarts: number[] = [];
  const weekStarts: number[] = [];
  const boundaries: number[] = [];
  for (let i = startIndex; i < endIndex; i++) {
    if (DAY_HEADER.test(lines[i])) dayStarts.push(i);
    if (WEEK_HEADER.test(lines[i])) weekStarts.push(i);
    if (isBlockBoundary(lines[i])) boundaries.push(i);
  }

  let currentWeek: CaliWeek | null = null;

  for (let i = startIndex; i < endIndex; i++) {
    const line = lines[i];

    const weekMatch = line.match(WEEK_HEADER);
    if (weekMatch) {
      const [, numberRaw, dateRange, blockName] = weekMatch;
      const [startRaw, endRaw] = dateRange.split("-").map((part) => part.trim());
      currentWeek = {
        weekNumber: Number(numberRaw),
        label: line.trim(),
        blockName: blockName.replace(/\s+/g, " ").trim(),
        startDate: parseFrenchDate(startRaw, year),
        endDate: parseFrenchDate(endRaw, year),
        instruction: "",
      };
      weeks.push(currentWeek);
      continue;
    }

    if (currentWeek && line.trim().startsWith("Consigne")) {
      currentWeek.instruction = line
        .trim()
        .replace(/^Consigne\s*:\s*/, "")
        .trim();
      continue;
    }

    const dayMatch = line.match(DAY_HEADER);
    if (!dayMatch) continue;

    const [, weekday, dayNumber, monthName, tail] = dayMatch;
    const date = parseFrenchDate(`${dayNumber} ${monthName}`, year);
    if (!date) {
      errors.push(`Date illisible : « ${line.trim()} »`);
      continue;
    }
    if (!currentWeek) {
      errors.push(`« ${line.trim()} » rencontré hors de toute semaine`);
      continue;
    }

    const theme = (tail ?? "").replace(/\s+/g, " ").trim();
    const nextDay = dayStarts.find((index) => index > i) ?? endIndex;
    const nextWeek = weekStarts.find((index) => index > i) ?? endIndex;
    const dayEnd = Math.min(nextDay, nextWeek);
    const dayLines = lines.slice(i, dayEnd);

    if (/^repos/i.test(theme)) {
      days.push({
        weekNumber: currentWeek.weekNumber,
        date,
        weekday,
        theme: theme || "Repos",
        isRestDay: true,
        blocks: [],
      });
      i = dayEnd - 1;
      continue;
    }

    const context = `S${currentWeek.weekNumber} ${weekday} ${dayNumber} ${monthName}`;

    const slotStarts: { index: number; slot: CaliSlot; heading: string }[] = [];
    dayLines.forEach((dayLine, offset) => {
      const slotMatch = dayLine.match(SLOT_HEADER);
      if (slotMatch) {
        slotStarts.push({
          index: offset,
          slot: slotMatch[1] === "MATIN" ? "matin" : "soir",
          heading: dayLine.replace(/\s+/g, " ").trim(),
        });
      }
    });

    if (slotStarts.length === 0) {
      // Les samedis de test remplacent la séance : pas de bloc matin/soir.
      if (!/test/i.test(theme)) {
        errors.push(`${context} : aucun bloc MATIN/SOIR trouvé (thème « ${theme} »)`);
      }
      days.push({
        weekNumber: currentWeek.weekNumber,
        date,
        weekday,
        theme,
        isRestDay: false,
        blocks: [],
      });
      i = dayEnd - 1;
      continue;
    }

    const blocks: CaliBlock[] = [];

    for (let s = 0; s < slotStarts.length; s++) {
      const from = slotStarts[s].index;
      const to = s + 1 < slotStarts.length ? slotStarts[s + 1].index : dayLines.length;
      const slotLines = dayLines.slice(from, to);

      const headerIndex = slotLines.findIndex(isTableHeader);
      const slotContext = `${context} ${slotStarts[s].slot.toUpperCase()}`;
      if (headerIndex === -1) {
        warnings.push(`${slotContext} : aucun en-tête de tableau`);
        continue;
      }

      // Le tableau s'arrête au premier titre rencontré, pour qu'une ligne de
      // débordement n'absorbe pas l'intertitre suivant.
      let bodyEnd = slotLines.length;
      for (let j = headerIndex + 1; j < slotLines.length; j++) {
        if (isBlockBoundary(slotLines[j])) {
          bodyEnd = j;
          break;
        }
      }

      const bodyLines = slotLines.slice(headerIndex + 1, bodyEnd);
      const resolved = resolveColumnBounds(slotLines[headerIndex], bodyLines, COLUMNS);
      if ("error" in resolved) {
        warnings.push(`${slotContext} : ${resolved.error}`);
        continue;
      }

      // Une ligne ouvre un exercice quand sa cellule de volume est renseignée ;
      // les lignes de débordement remplissent le nom mais jamais le volume.
      const rows = readRows(bodyLines, resolved.bounds, (cells) =>
        VOLUME_PATTERN.test(cells.reps ?? ""),
      );

      if (rows.length === 0) {
        warnings.push(`${slotContext} : aucun exercice extrait`);
        continue;
      }

      blocks.push({
        slot: slotStarts[s].slot,
        heading: slotStarts[s].heading,
        exercises: rows.map((row, index) => {
          const repsRaw = clean(row.reps);
          const volume = parseCaliVolume(repsRaw);
          return {
            order: index + 1,
            name: clean(row.name),
            sets: volume.sets,
            repsLow: volume.repsLow,
            repsHigh: volume.repsHigh,
            holdSeconds: volume.holdSeconds,
            repsFromMaxRule: volume.repsFromMaxRule,
            repsRaw,
            perSide: volume.perSide,
            cueRaw: clean(row.cue),
            restSeconds: parseRest(row.rest ?? ""),
          };
        }),
      });
    }

    days.push({
      weekNumber: currentWeek.weekNumber,
      date,
      weekday,
      theme,
      isRestDay: false,
      blocks,
    });

    i = dayEnd - 1;
  }

  return { weeks, days, errors, warnings };
}
