import { column, readTable, type MarkdownTable } from "./markdown";
import { parseKg, parseRest, parseVolume, type Volume } from "./volume";
import { parseFrenchDate } from "./dates";

/**
 * Parseur de `PROGRAMME-COMPLET.md`.
 *
 * Ce document se déclare source de vérité et remplace l'extraction depuis les
 * PDF. Le gain n'est pas cosmétique : les cellules y sont délimitées, donc les
 * trois classes de bugs de l'extraction PDF disparaissent — colonnes qui
 * dérivent, fourchettes écrasées sur leur borne haute, consignes tronquées.
 */

export interface ExerciseLine {
  order: string;
  name: string;
  volume: Volume;
  loadRaw: string;
  loadKg: number | null;
  dumbbellRaw: string;
  dumbbellKg: number | null;
  restSeconds: number | null;
  restRaw: string;
  supersetGroup: string | null;
  homeAlternative: string;
  cue: string;
}

export interface DaySession {
  slot: "salle" | "matin" | "soir";
  heading: string;
  exercises: ExerciseLine[];
}

export interface ProgramDay {
  weekNumber: number;
  date: string;
  weekday: string;
  label: string;
  isRestDay: boolean;
  isTestDay: boolean;
  sessions: DaySession[];
}

export interface ProgramWeek {
  weekNumber: number;
  blockName: string;
  startDate: string | null;
  endDate: string | null;
  instruction: string;
}

export interface Ladder {
  slug: string;
  name: string;
  startLevel: number;
  levels: { level: number; movement: string; criterion: string }[];
}

export interface Target {
  slug: string;
  movement: string;
  startLabel: string;
  unit: "reps" | "seconds";
  byDate: Record<string, number | null>;
}

export interface TestMetric {
  slug: string;
  label: string;
  unit: "reps" | "seconds";
}

export interface ParsedProgram {
  ppl: { weeks: ProgramWeek[]; days: ProgramDay[] };
  calisthenie: { weeks: ProgramWeek[]; days: ProgramDay[] };
  ladders: Ladder[];
  targets: Target[];
  testMetrics: TestMetric[];
  startingMax: Record<string, number>;
  errors: string[];
  warnings: string[];
}

export const CHECKPOINT_DATES = ["2026-09-19", "2026-10-17", "2026-11-14", "2026-12-19"];

const WEEKDAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

const DAY_HEADING = new RegExp(
  `^###\\s+(${WEEKDAYS.join("|")})\\s+(\\d{1,2})\\s+([a-zûéèôîà]+)\\s*(?:[—-]+\\s*(.*))?$`,
);
const WEEK_HEADING = /^##\s+Semaine\s+(\d{1,2})\s*·\s*(.+?)\s*—\s*(.+)$/;
const WEEK_ONE_HEADING = /^##\s+\d+\.\s*Semaine 1\s*—\s*(.+)$/;
const SLOT_HEADING = /^\*\*(MATIN|SOIR)\s*—\s*(.*?)\*\*/;

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

/** Bornes d'une partie du document. */
function partBounds(lines: string[], title: RegExp): { start: number; end: number } {
  const start = lines.findIndex((line) => title.test(line));
  if (start === -1) return { start: -1, end: -1 };
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#\s+PARTIE\s/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return { start, end };
}

/** Lit les lignes d'exercice d'un tableau de séance. */
function readExerciseLines(table: MarkdownTable, errors: string[], context: string): ExerciseLine[] {
  const lines: ExerciseLine[] = [];

  for (const [index, row] of table.rows.entries()) {
    const order = column(table, row, "#") || String(index + 1);
    const name = column(table, row, "Exercice");
    if (name === "") continue;

    const volumeRaw = column(table, row, "Séries");
    const volume = parseVolume(volumeRaw, name);

    if (volume.sets === null && volumeRaw !== "") {
      errors.push(`${context} : volume illisible « ${volumeRaw} » sur « ${name} »`);
    }

    const loadRaw = column(table, row, "Charge");
    const dumbbellRaw = column(table, row, "Haltères");
    const restRaw = column(table, row, "Repos");
    const supersetMatch = order.match(/^(\d+)[ab]$/);

    lines.push({
      order,
      name,
      volume,
      loadRaw,
      loadKg: parseKg(loadRaw),
      dumbbellRaw,
      dumbbellKg: parseKg(dumbbellRaw),
      restSeconds: parseRest(restRaw),
      restRaw,
      supersetGroup: supersetMatch ? supersetMatch[1] : null,
      homeAlternative: column(table, row, "Alternative maison"),
      // En calisthénie la colonne « Charge / repère » porte une indication,
      // pas une charge chiffrée.
      cue: loadRaw !== "" && parseKg(loadRaw) === null ? loadRaw : "",
    });
  }

  return lines;
}

/** Consigne de semaine, sur une ou plusieurs lignes. */
function readInstruction(lines: string[], from: number, until: number): string {
  for (let i = from; i < until; i++) {
    const match = lines[i].match(/^\*\*Consigne(?: de la semaine)?\s*:\*\*\s*(.*)$/);
    if (!match) continue;

    // La consigne peut déborder sur les lignes suivantes jusqu'à une ligne vide.
    const parts = [match[1]];
    for (let j = i + 1; j < until; j++) {
      if (lines[j].trim() === "" || /^#{1,6}\s|^\|/.test(lines[j])) break;
      parts.push(lines[j].trim());
    }
    return parts
      .join(" ")
      .replace(/\*\*/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  // La semaine 1 de salle énonce sa consigne sans le préfixe « Consigne : ».
  // On se rabat sur la première ligne de prose qui suit le titre.
  for (let i = from + 1; i < until; i++) {
    const line = lines[i].trim();
    if (line === "") continue;
    if (/^#{1,6}\s|^\||^>/.test(line)) break;
    return line.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
  }

  return "";
}

/** Analyse une partie « programme, jour par jour ». */
function parseProgramPart(
  lines: string[],
  bounds: { start: number; end: number },
  year: number,
  kind: "ppl" | "calisthenie",
  errors: string[],
): { weeks: ProgramWeek[]; days: ProgramDay[] } {
  const weeks: ProgramWeek[] = [];
  const days: ProgramDay[] = [];

  // Repères de découpe : titres de semaine et de jour.
  const weekStarts: number[] = [];
  const dayStarts: number[] = [];
  for (let i = bounds.start; i < bounds.end; i++) {
    if (WEEK_HEADING.test(lines[i]) || WEEK_ONE_HEADING.test(lines[i])) weekStarts.push(i);
    if (DAY_HEADING.test(lines[i])) dayStarts.push(i);
  }

  let currentWeek: ProgramWeek | null = null;

  for (let i = bounds.start; i < bounds.end; i++) {
    const line = lines[i];

    const weekOne = line.match(WEEK_ONE_HEADING);
    if (weekOne) {
      const nextWeek = weekStarts.find((index) => index > i) ?? bounds.end;
      currentWeek = {
        weekNumber: 1,
        blockName: weekOne[1].replace(/\(.*\)/, "").trim(),
        startDate: `${year}-08-24`,
        endDate: `${year}-08-30`,
        instruction: readInstruction(lines, i, nextWeek),
      };
      weeks.push(currentWeek);
      continue;
    }

    const weekMatch = line.match(WEEK_HEADING);
    if (weekMatch) {
      const [, numberRaw, dateRange, blockName] = weekMatch;
      const [startRaw, endRaw] = dateRange.split(/[–-]/).map((part) => part.trim());
      const nextWeek = weekStarts.find((index) => index > i) ?? bounds.end;
      currentWeek = {
        weekNumber: Number(numberRaw),
        blockName: blockName.replace(/—/g, "-").trim(),
        startDate: parseFrenchDate(startRaw, year),
        endDate: parseFrenchDate(endRaw, year),
        instruction: readInstruction(lines, i, nextWeek),
      };
      weeks.push(currentWeek);
      continue;
    }

    const dayMatch = line.match(DAY_HEADING);
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

    const label = (tail ?? "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
    const dayEnd = Math.min(
      dayStarts.find((index) => index > i) ?? bounds.end,
      weekStarts.find((index) => index > i) ?? bounds.end,
    );

    const isRestDay = /^repos/i.test(label);
    const isTestDay = /test/i.test(label);
    const context = `${kind} S${currentWeek.weekNumber} ${weekday} ${date}`;

    const sessions: DaySession[] = [];

    if (!isRestDay) {
      if (kind === "ppl") {
        const table = readTable(lines, i + 1, dayEnd);
        if (table) {
          sessions.push({ slot: "salle", heading: label, exercises: readExerciseLines(table, errors, context) });
        } else if (!isTestDay) {
          errors.push(`${context} : aucun tableau trouvé`);
        }
      } else {
        // Calisthénie : deux blocs, chacun annoncé par un intertitre en gras.
        for (let j = i + 1; j < dayEnd; j++) {
          const slotMatch = lines[j].match(SLOT_HEADING);
          if (!slotMatch) continue;

          const slot = slotMatch[1] === "MATIN" ? "matin" : "soir";
          const table = readTable(lines, j + 1, dayEnd);
          if (!table) {
            errors.push(`${context} ${slotMatch[1]} : aucun tableau trouvé`);
            continue;
          }
          sessions.push({
            slot,
            heading: `${slotMatch[1]} — ${slotMatch[2].replace(/\*\*/g, "").trim()}`,
            exercises: readExerciseLines(table, errors, `${context} ${slotMatch[1]}`),
          });
          j = table.endLine;
        }
        if (sessions.length === 0 && !isTestDay) {
          errors.push(`${context} : aucun bloc MATIN/SOIR`);
        }
      }
    }

    days.push({
      weekNumber: currentWeek.weekNumber,
      date,
      weekday,
      label: label || "Repos",
      isRestDay,
      isTestDay,
      sessions,
    });

    i = dayEnd - 1;
  }

  return { weeks, days };
}

/** Échelles de progression, avec le niveau de départ marqué en gras. */
function parseLadders(lines: string[], bounds: { start: number; end: number }): Ladder[] {
  const start = lines.findIndex(
    (line, index) => index >= bounds.start && index < bounds.end && /^##\s+\d+\.\s*Les échelles/.test(line),
  );
  if (start === -1) return [];

  let end = bounds.end;
  for (let i = start + 1; i < bounds.end; i++) {
    if (/^##\s+\d+\./.test(lines[i])) {
      end = i;
      break;
    }
  }

  const ladders: Ladder[] = [];
  for (let i = start + 1; i < end; i++) {
    const heading = lines[i].match(/^###\s+(.+)$/);
    if (!heading) continue;

    const table = readTable(lines, i + 1, end);
    if (!table) continue;

    const name = heading[1].replace(/\*\*/g, "").trim();
    let startLevel = 1;

    const levels = table.rows
      .map((row) => {
        const level = Number(column(table, row, "Niv."));
        if (row.emphasised) startLevel = level;
        return {
          level,
          movement: column(table, row, "Mouvement"),
          criterion: column(table, row, "Critère"),
        };
      })
      .filter((level) => Number.isFinite(level.level));

    if (levels.length > 0) {
      ladders.push({ slug: slugify(name), name, startLevel, levels });
    }
    i = table.endLine;
  }

  return ladders;
}

/** Objectifs jalonnés : une ligne par mouvement, une colonne par date. */
function parseTargets(lines: string[], bounds: { start: number; end: number }): Target[] {
  const start = lines.findIndex(
    (line, index) => index >= bounds.start && index < bounds.end && /^##\s+\d+\.\s*Objectifs/.test(line),
  );
  if (start === -1) return [];

  const table = readTable(lines, start + 1, bounds.end);
  if (!table) return [];

  const value = (cell: string): number | null => {
    const match = cell.match(/(\d+)/);
    return match ? Number(match[1]) : null;
  };

  return table.rows
    .filter((row) => column(table, row, "Mouvement") !== "")
    .map((row) => {
      const movement = column(table, row, "Mouvement");
      const cells = ["19 sept", "17 oct", "14 nov", "19 déc"].map((header) =>
        column(table, row, header),
      );
      const unit: "reps" | "seconds" = cells.some((cell) => /\bs\b/.test(cell)) ? "seconds" : "reps";

      return {
        slug: slugify(movement),
        movement,
        startLabel: column(table, row, "Aujourd'hui"),
        unit,
        byDate: Object.fromEntries(
          CHECKPOINT_DATES.map((date, index) => [date, value(cells[index] ?? "")]),
        ),
      };
    });
}

/** Métriques relevées lors des 4 tests. */
function parseTestMetrics(lines: string[], bounds: { start: number; end: number }): TestMetric[] {
  const start = lines.findIndex(
    (line, index) => index >= bounds.start && index < bounds.end && /^##\s+\d+\.\s*Les 4 tests/.test(line),
  );
  if (start === -1) return [];

  const table = readTable(lines, start + 1, bounds.end);
  if (!table) return [];

  return table.rows
    .map((row) => row.cells[0] ?? "")
    .filter((label) => label !== "")
    .map((label) => ({
      slug: slugify(label.replace(/\s*\((max|secondes)\)\s*$/i, "")),
      label,
      unit: /seconde/i.test(label) ? ("seconds" as const) : ("reps" as const),
    }));
}

/** Maxima de départ, depuis « Ton point de départ, chiffré ». */
function parseStartingMax(lines: string[], bounds: { start: number; end: number }): Record<string, number> {
  const start = lines.findIndex(
    (line, index) =>
      index >= bounds.start && index < bounds.end && /^##\s+\d+\.\s*Ton point de départ/.test(line),
  );
  if (start === -1) return {};

  const table = readTable(lines, start + 1, bounds.end);
  if (!table) return {};

  const result: Record<string, number> = {};
  for (const row of table.rows) {
    const movement = column(table, row, "Mouvement");
    const reading = column(table, row, "Lecture");
    // « Ton max de travail = 3 »
    const explicit = reading.match(/max de travail\s*=\s*(\d+)/i);
    if (movement !== "" && explicit) result[slugify(movement)] = Number(explicit[1]);
  }
  return result;
}

export function parseProgramme(raw: string, year: number): ParsedProgram {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const errors: string[] = [];
  const warnings: string[] = [];

  const pplBounds = partBounds(lines, /^#\s+PARTIE 1\s/);
  const caliBounds = partBounds(lines, /^#\s+PARTIE 2\s/);

  if (pplBounds.start === -1) errors.push("Partie 1 (musculation) introuvable.");
  if (caliBounds.start === -1) errors.push("Partie 2 (calisthénie) introuvable.");
  if (errors.length > 0) {
    return {
      ppl: { weeks: [], days: [] },
      calisthenie: { weeks: [], days: [] },
      ladders: [],
      targets: [],
      testMetrics: [],
      startingMax: {},
      errors,
      warnings,
    };
  }

  const ppl = parseProgramPart(lines, pplBounds, year, "ppl", errors);
  const calisthenie = parseProgramPart(lines, caliBounds, year, "calisthenie", errors);

  return {
    ppl,
    calisthenie,
    ladders: parseLadders(lines, caliBounds),
    targets: parseTargets(lines, caliBounds),
    testMetrics: parseTestMetrics(lines, caliBounds),
    startingMax: parseStartingMax(lines, caliBounds),
    errors,
    warnings,
  };
}
