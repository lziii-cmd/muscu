import {
  clean,
  normalizeText,
  readRows,
  resolveColumnBounds,
  VOLUME_PATTERN,
  type ColumnSpec,
} from "./table-parser";
import { parseFrenchDate } from "./dates";

export interface PplExercise {
  order: string; // "1", "2", "4a", "4b"
  name: string;
  sets: number | null;
  repsLow: number | null;
  repsHigh: number | null;
  repsRaw: string;
  perSide: boolean;
  loadRaw: string;
  dumbbellRaw: string;
  restSeconds: number | null;
  restRaw: string;
  supersetGroup: string | null; // "4" pour 4a et 4b
  /**
   * Équivalent réalisable à la maison, fourni par le programme pour chaque
   * exercice. Il permet de déplacer une séance plutôt que de la rater.
   */
  homeAlternative: string;
}

export interface PplDay {
  weekNumber: number;
  date: string; // ISO
  weekday: string;
  sessionType: string; // "PUSH A", "LEGS B", ...
  isRestDay: boolean;
  exercises: PplExercise[];
}

export interface PplWeek {
  weekNumber: number;
  label: string;
  blockName: string;
  startDate: string | null;
  endDate: string | null;
  instruction: string;
}

export interface PplProgram {
  weeks: PplWeek[];
  days: PplDay[];
  errors: string[];
  warnings: string[];
}

const WEEKDAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

/**
 * La colonne « # » est absente des tableaux de la semaine 1, et la colonne
 * « Alternative maison » des tableaux qui n'en proposent pas : les deux sont
 * donc optionnelles.
 */
const COLUMNS: ColumnSpec[] = [
  { key: "order", header: "#", optional: true },
  { key: "name", header: "Exercice" },
  { key: "reps", header: "Séries" },
  { key: "load", header: "Charge" },
  { key: "dumbbell", header: "Haltères", optional: true },
  { key: "rest", header: "Repos" },
  { key: "home", header: "Alternative maison", optional: true },
];

const DAY_HEADER = new RegExp(
  `^\\s*(${WEEKDAYS.join("|")})\\s+(\\d{1,2})\\s+([a-zûéèôîà]+)\\s*(?:--\\s*(.*))?$`,
);

const WEEK_HEADER = /^\s*Semaine\s+(\d{1,2})\s*·?\s*(.+?)\s*--\s*(.+)$/;

/**
 * Lignes qui ferment un tableau : titre de jour, de semaine, de section
 * numérotée, ou intertitre du document. Sans cette borne, la dernière ligne
 * d'un tableau absorberait le titre suivant comme un débordement.
 */
const BLOCK_BOUNDARY = [
  DAY_HEADER,
  WEEK_HEADER,
  /^\s*\d+\.\s+\S/,
  /^\s*Le programme, jour par jour\s*$/,
  /^\s*Références\s*$/,
];

function isBlockBoundary(line: string): boolean {
  return BLOCK_BOUNDARY.some((pattern) => pattern.test(line));
}

/** "2 min 30" / "90 s" / "enchaîner" -> secondes. */
export function parseRest(raw: string): number | null {
  const text = raw.toLowerCase().trim();
  if (text === "" || text === "--") return null;
  if (text.includes("enchaîner") || text.includes("enchainer")) return 0;

  const minutes = text.match(/(\d+)\s*min(?:\s*(\d+))?/);
  if (minutes) {
    const m = Number(minutes[1]);
    const s = minutes[2] ? Number(minutes[2]) : 0;
    return m * 60 + s;
  }
  const seconds = text.match(/(\d+)\s*s/);
  if (seconds) return Number(seconds[1]);
  return null;
}

/** "4 × 6-8" / "3 × 10 / jambe" / "3 × 15" -> structure. */
export function parseSetsAndReps(raw: string): {
  sets: number | null;
  repsLow: number | null;
  repsHigh: number | null;
  perSide: boolean;
} {
  const text = raw.replace(/\s+/g, " ").trim();
  const perSide = /\/\s*(jambe|bras|côté|cote)/i.test(text);

  const match = text.match(/(\d+)\s*[×x]\s*(\d+)(?:\s*-\s*(\d+))?/);
  if (!match) return { sets: null, repsLow: null, repsHigh: null, perSide };

  return {
    sets: Number(match[1]),
    repsLow: Number(match[2]),
    repsHigh: match[3] ? Number(match[3]) : Number(match[2]),
    perSide,
  };
}

function isTableHeader(line: string): boolean {
  return line.includes("Séries") && line.includes("Charge") && line.includes("Repos");
}

/**
 * Parse les séances du programme de salle.
 *
 * Le mode `-table` rend les 17 semaines lisibles de la même façon, y compris la
 * semaine 1 dont les tableaux résistaient au mode `-layout` : il n'y a plus de
 * transcription manuelle à maintenir.
 */
export function parsePpl(rawInput: string, year: number): PplProgram {
  const text = normalizeText(rawInput);
  const lines = text.split("\n");

  const errors: string[] = [];
  const warnings: string[] = [];
  const weeks: PplWeek[] = [];
  const days: PplDay[] = [];

  // Le sommaire répète les titres du document. En mode `-table` tout est
  // indenté, on ne peut donc pas distinguer sommaire et corps par l'indentation :
  // on retient la DERNIÈRE occurrence de chaque repère, qui est celle du corps.
  const lastIndexOf = (predicate: (line: string) => boolean, from = 0): number => {
    for (let i = lines.length - 1; i >= from; i--) {
      if (predicate(lines[i])) return i;
    }
    return -1;
  };

  // La semaine 1 vit dans une section numérotée, avant « Le programme, jour par
  // jour » : on démarre à son titre pour la prendre elle aussi.
  let startIndex = lastIndexOf((line) => /^\s*\d+\.\s*Semaine 1\s*--/.test(line));
  if (startIndex === -1) {
    startIndex = lastIndexOf((line) => line.trim() === "Le programme, jour par jour");
  }
  if (startIndex === -1) {
    return { weeks, days, errors: ["Début du programme introuvable dans le document."], warnings };
  }

  const referencesIndex = lastIndexOf((line) => line.trim() === "Références", startIndex);
  const endIndex = referencesIndex === -1 ? lines.length : referencesIndex;

  // La semaine 1 n'a pas d'en-tête « Semaine N · dates -- bloc » dans le corps.
  let currentWeek: PplWeek = {
    weekNumber: 1,
    label: "Semaine 1 -- Réadaptation",
    blockName: "Réadaptation",
    startDate: `${year}-08-24`,
    endDate: `${year}-08-30`,
    instruction: "3 séries maximum par exercice, 3 s de descente, RIR 4-5.",
  };
  weeks.push(currentWeek);

  const boundaries: number[] = [];
  for (let i = startIndex; i < endIndex; i++) {
    if (isBlockBoundary(lines[i])) boundaries.push(i);
  }

  for (let i = startIndex; i < endIndex; i++) {
    const line = lines[i];

    const weekMatch = line.match(WEEK_HEADER);
    if (weekMatch) {
      const [, numberRaw, dateRange, blockName] = weekMatch;
      const [startRaw, endRaw] = dateRange.split("-").map((part) => part.trim());
      currentWeek = {
        weekNumber: Number(numberRaw),
        label: line.trim(),
        blockName: blockName.trim(),
        startDate: parseFrenchDate(startRaw, year),
        endDate: parseFrenchDate(endRaw, year),
        instruction: "",
      };
      weeks.push(currentWeek);
      continue;
    }

    if (line.trim().startsWith("Consigne de la semaine")) {
      currentWeek.instruction = line
        .trim()
        .replace(/^Consigne de la semaine\s*:\s*/, "")
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

    // `-table` insère des espaces à l'intérieur des titres (« LEGS   A ») :
    // on normalise au lieu de découper, sinon « LEGS A » devient « LEGS ».
    const sessionType = (tail ?? "").replace(/\s+/g, " ").trim();

    if (/repos/i.test(sessionType)) {
      days.push({
        weekNumber: currentWeek.weekNumber,
        date,
        weekday,
        sessionType: "Repos",
        isRestDay: true,
        exercises: [],
      });
      continue;
    }

    const blockEnd = boundaries.find((index) => index > i) ?? endIndex;

    const blockLines = lines.slice(i, blockEnd);
    const headerIndex = blockLines.findIndex(isTableHeader);
    const context = `S${currentWeek.weekNumber} ${weekday} ${dayNumber} ${monthName} (${sessionType})`;

    if (headerIndex === -1) {
      errors.push(`${context} : aucun en-tête de tableau trouvé`);
      i = blockEnd - 1;
      continue;
    }

    const bodyLines = blockLines.slice(headerIndex + 1);
    const resolved = resolveColumnBounds(blockLines[headerIndex], bodyLines, COLUMNS);
    if ("error" in resolved) {
      errors.push(`${context} : ${resolved.error}`);
      i = blockEnd - 1;
      continue;
    }

    const hasOrder = !resolved.missing.includes("order");

    // Une ligne ouvre un exercice quand son numéro d'ordre est renseigné ;
    // à défaut de colonne « # », quand la cellule de volume l'est. Les lignes de
    // débordement remplissent le nom mais jamais le volume.
    const rows = readRows(bodyLines, resolved.bounds, (cells) =>
      hasOrder ? cells.order !== "" : VOLUME_PATTERN.test(cells.reps ?? ""),
    );

    if (rows.length === 0) {
      errors.push(`${context} : aucun exercice extrait`);
      i = blockEnd - 1;
      continue;
    }

    const exercises: PplExercise[] = rows.map((row, index) => {
      const order = clean(row.order) || String(index + 1);
      const { sets, repsLow, repsHigh, perSide } = parseSetsAndReps(row.reps ?? "");
      const supersetMatch = order.match(/^(\d+)[ab]$/);
      return {
        order,
        name: clean(row.name),
        sets,
        repsLow,
        repsHigh,
        repsRaw: clean(row.reps),
        perSide,
        loadRaw: clean(row.load),
        dumbbellRaw: clean(row.dumbbell),
        restSeconds: parseRest(row.rest ?? ""),
        restRaw: clean(row.rest),
        supersetGroup: supersetMatch ? supersetMatch[1] : null,
        homeAlternative: clean(row.home),
      };
    });

    days.push({
      weekNumber: currentWeek.weekNumber,
      date,
      weekday,
      sessionType,
      isRestDay: false,
      exercises,
    });

    i = blockEnd - 1;
  }

  return { weeks, days, errors, warnings };
}
