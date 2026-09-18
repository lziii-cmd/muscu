import { column, readTable, type MarkdownTable } from "./markdown";
import { parseKg, parseRest, parseVolume, type Volume } from "./volume";
import { makeCalendar, parseFrenchDayMonth } from "./dates";

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
  /**
   * Ligne du bloc COMPLÉMENT : à faire « les bons jours », jamais obligatoire.
   * Le document est explicite — « sauter le complément n'est jamais un échec ».
   * D'où un drapeau sur la ligne plutôt qu'une seconde séance prescrite : une
   * séance en compterait une de plus à l'assiduité, et la sauter se lirait comme
   * une séance manquée.
   */
  optional: boolean;
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
  /**
   * Dates de contrôle annoncées dans les consignes de semaine (« Samedi 10
   * octobre : Contrôle n°1 »). Vide quand le document n'en énonce aucune ; le
   * seed se rabat alors sur `CHECKPOINT_DATES`.
   */
  checkpoints: string[];
  errors: string[];
  warnings: string[];
}

export const CHECKPOINT_DATES = ["2026-09-19", "2026-10-17", "2026-11-14", "2026-12-19"];

const WEEKDAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

const DAY_HEADING = new RegExp(
  `^###\\s+(${WEEKDAYS.join("|")})\\s+(\\d{1,2})\\s+([a-zûéèôîà]+)\\s*(?:[—-]+\\s*(.*))?$`,
);
/** « ## Semaine 2 · 31 août – 6 septembre — Bloc 1 — Hypertrophie » */
const WEEK_HEADING = /^##\s+Semaine\s+(\d{1,2})\s*·\s*(.+?)\s*—\s*(.+)$/;
/**
 * « ## Semaine S16 — DELOAD · 21 décembre – 27 décembre »
 * « ## Semaine S1 (partielle) · 10 septembre – 13 septembre »
 *
 * Le nom de bloc passe ici *avant* le séparateur, et le numéro porte un « S ».
 */
const WEEK_HEADING_V3 =
  /^##\s+Semaine\s+S(\d{1,2})\s*(?:\(([^)]*)\))?\s*(?:—\s*([^·]+?))?\s*·\s*(.+)$/;
const WEEK_ONE_HEADING = /^##\s+\d+\.\s*Semaine 1\s*—\s*(.+)$/;
const SLOT_HEADING = /^\*\*(MATIN|SOIR)\s*—\s*(.*?)\*\*/;
/** « **NOYAU — obligatoire (~57 min)** » / « **COMPLÉMENT — si tu as le temps…** » */
const TIER_HEADING = /^\*\*(NOYAU|COMPL[EÉ]MENT)\b/i;

function isWeekHeading(line: string): boolean {
  return WEEK_HEADING.test(line) || WEEK_HEADING_V3.test(line) || WEEK_ONE_HEADING.test(line);
}

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
function readExerciseLines(
  table: MarkdownTable,
  errors: string[],
  context: string,
  optional = false,
): ExerciseLine[] {
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
      optional,
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
  toDate: (raw: string) => string | null,
  kind: "ppl" | "calisthenie",
  errors: string[],
): { weeks: ProgramWeek[]; days: ProgramDay[] } {
  const weeks: ProgramWeek[] = [];
  const days: ProgramDay[] = [];

  // Repères de découpe : titres de semaine et de jour.
  const weekStarts: number[] = [];
  const dayStarts: number[] = [];
  for (let i = bounds.start; i < bounds.end; i++) {
    if (isWeekHeading(lines[i])) weekStarts.push(i);
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
        startDate: toDate("24 août"),
        endDate: toDate("30 août"),
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
        startDate: toDate(startRaw),
        endDate: toDate(endRaw),
        instruction: readInstruction(lines, i, nextWeek),
      };
      weeks.push(currentWeek);
      continue;
    }

    const weekV3 = line.match(WEEK_HEADING_V3);
    if (weekV3) {
      const [, numberRaw, parenthetical, blockName, dateRange] = weekV3;
      const [startRaw, endRaw] = dateRange.split(/[–-]/).map((part) => part.trim());
      const nextWeek = weekStarts.find((index) => index > i) ?? bounds.end;
      currentWeek = {
        weekNumber: Number(numberRaw),
        // La plupart des semaines n'annoncent pas de bloc ; DELOAD et TEST si.
        blockName: (blockName ?? parenthetical ?? "").replace(/—/g, "-").trim(),
        startDate: toDate(startRaw),
        endDate: toDate(endRaw),
        instruction: readInstruction(lines, i, nextWeek),
      };
      weeks.push(currentWeek);
      continue;
    }

    const dayMatch = line.match(DAY_HEADING);
    if (!dayMatch) continue;

    const [, weekday, dayNumber, monthName, tail] = dayMatch;
    const date = toDate(`${dayNumber} ${monthName}`);
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
      // Un jour découpé en NOYAU / COMPLÉMENT, en salle comme en calisthénie
      // (version 2 du programme de calisthénie : « plus de découpage
      // matin/soir, tout se fait en une seule séance »).
      let hasTiers = false;
      for (let j = i + 1; j < dayEnd; j++) {
        if (TIER_HEADING.test(lines[j])) {
          hasTiers = true;
          break;
        }
      }

      if (kind === "ppl" || hasTiers) {
        // Deux formats coexistent : un seul tableau par jour (v2), ou un bloc
        // NOYAU suivi d'un bloc COMPLÉMENT (v3). Les deux produisent une seule
        // séance prescrite — le complément n'est qu'un ensemble de lignes
        // marquées optionnelles.
        const exercises: ExerciseLine[] = [];
        let tiers = 0;

        for (let j = i + 1; j < dayEnd; j++) {
          const tier = lines[j].match(TIER_HEADING);
          if (!tier) continue;

          const optional = /COMPL/i.test(tier[1]);
          const table = readTable(lines, j + 1, dayEnd);
          if (!table) {
            errors.push(`${context} ${tier[1]} : aucun tableau trouvé`);
            continue;
          }
          exercises.push(...readExerciseLines(table, errors, `${context} ${tier[1]}`, optional));
          tiers += 1;
          j = table.endLine;
        }

        if (tiers === 0) {
          const table = readTable(lines, i + 1, dayEnd);
          if (table) exercises.push(...readExerciseLines(table, errors, context));
          else if (!isTestDay) errors.push(`${context} : aucun tableau trouvé`);
        }

        if (exercises.length > 0) {
          // La calisthénie en séance unique garde le créneau du matin : c'est
          // là que le programme la place, avant la journée.
          sessions.push({ slot: kind === "ppl" ? "salle" : "matin", heading: label, exercises });
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

  const empty = { weeks: [], days: [] };
  const nothing: ParsedProgram = {
    ppl: empty,
    calisthenie: empty,
    ladders: [],
    targets: [],
    testMetrics: [],
    startingMax: {},
    checkpoints: [],
    errors,
    warnings,
  };

  /**
   * Le mois du premier jour daté sert d'origine au calendrier : c'est lui qui
   * décide à quelle année appartient « 3 janvier ». Le lire depuis le document
   * évite de le réintroduire en constante — ce que ce projet paie cher à chaque
   * fois qu'un second programme arrive.
   */
  const firstDay = lines.find((line) => DAY_HEADING.test(line));
  if (!firstDay) {
    errors.push("Aucun jour daté dans le document.");
    return nothing;
  }
  const opening = firstDay.match(DAY_HEADING)!;
  const startMonth = parseFrenchDayMonth(`${opening[2]} ${opening[3]}`)?.month;
  if (!startMonth) {
    errors.push(`Premier jour illisible : « ${firstDay.trim()} »`);
    return nothing;
  }
  const toDate = makeCalendar(startMonth, year);

  const pplBounds = partBounds(lines, /^#\s+PARTIE 1\s/);
  const caliBounds = partBounds(lines, /^#\s+PARTIE 2\s/);

  // Un document en deux parties (musculation + calisthénie) ou un document qui
  // n'est *que* de la musculation. Le second n'a pas d'échelles : l'onglet
  // Calisthénie disparaît alors de lui-même, ce qui est le comportement voulu.
  if (pplBounds.start === -1 && caliBounds.start === -1) {
    const whole = { start: 0, end: lines.length };
    const ppl = parseProgramPart(lines, whole, toDate, "ppl", errors);
    if (ppl.weeks.length === 0) errors.push("Aucune semaine reconnue dans le document.");
    return { ...nothing, ppl, checkpoints: readCheckpoints(ppl.weeks, toDate), errors, warnings };
  }

  if (pplBounds.start === -1) errors.push("Partie 1 (musculation) introuvable.");
  if (caliBounds.start === -1) errors.push("Partie 2 (calisthénie) introuvable.");
  if (errors.length > 0) return nothing;

  const ppl = parseProgramPart(lines, pplBounds, toDate, "ppl", errors);
  const calisthenie = parseProgramPart(lines, caliBounds, toDate, "calisthenie", errors);

  return {
    ppl,
    calisthenie,
    ladders: parseLadders(lines, caliBounds),
    targets: parseTargets(lines, caliBounds),
    testMetrics: parseTestMetrics(lines, caliBounds),
    startingMax: parseStartingMax(lines, caliBounds),
    checkpoints: readCheckpoints(ppl.weeks, toDate),
    errors,
    warnings,
  };
}

/**
 * Document de calisthénie autonome (`PROGRAMME-CALISTHENIE.md`, version 2).
 *
 * Il n'est plus la « partie 2 » du document de salle : il a ses propres
 * semaines, ses objectifs aux jalons, son point de départ, et des jours de test
 * dont le tableau « Mesure | Résultat » liste les métriques relevées. Il n'a
 * plus d'échelles de progression.
 */
export function parseCalisthenicsDocument(
  raw: string,
  year: number,
): Pick<ParsedProgram, "calisthenie" | "targets" | "testMetrics" | "startingMax" | "checkpoints" | "errors"> {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const errors: string[] = [];
  const empty = { weeks: [], days: [] };

  const firstDay = lines.find((line) => DAY_HEADING.test(line));
  const opening = firstDay?.match(DAY_HEADING);
  const startMonth = opening ? parseFrenchDayMonth(`${opening[2]} ${opening[3]}`)?.month : undefined;
  if (!startMonth) {
    errors.push("Calisthénie : aucun jour daté lisible.");
    return { calisthenie: empty, targets: [], testMetrics: [], startingMax: {}, checkpoints: [], errors };
  }
  const toDate = makeCalendar(startMonth, year);

  const calisthenie = parseProgramPart(lines, { start: 0, end: lines.length }, toDate, "calisthenie", errors);
  if (calisthenie.weeks.length === 0) errors.push("Calisthénie : aucune semaine reconnue.");

  const testDays = calisthenie.days.filter((day) => day.isTestDay).map((day) => day.date);
  const checkpoints = [...new Set([...testDays, ...readCheckpoints(calisthenie.weeks, toDate)])].sort();

  return {
    calisthenie,
    targets: readDatedTargets(lines, toDate),
    testMetrics: readTestDayMetrics(lines),
    startingMax: readStartingLevel(lines),
    checkpoints,
    errors,
  };
}

/**
 * Nom canonique d'une mesure. Les objectifs écrivent « Traction pronation », le
 * tableau de test « Tractions pronation (max) » : sans ce rapprochement,
 * l'objectif et la mesure du même mouvement ne se retrouveraient jamais.
 */
export function metricSlug(label: string): string {
  return slugify(label.replace(/\s*\((max|secondes)\)\s*$/i, "")).replace(/^traction-/, "tractions-");
}

/** Objectifs aux jalons : une colonne par date, lue dans l'en-tête (« 10 oct »). */
function readDatedTargets(lines: string[], toDate: (raw: string) => string | null): Target[] {
  const start = lines.findIndex((line) => /^##\s+(\d+\.\s*)?Objectifs/.test(line));
  if (start === -1) return [];
  const table = readTable(lines, start + 1);
  if (!table) return [];

  const dated = table.headers
    .map((header, index) => ({ index, date: toDate(header) }))
    .filter((column): column is { index: number; date: string } => column.date !== null);

  return table.rows
    .filter((row) => column(table, row, "Mouvement") !== "")
    .map((row) => {
      const movement = column(table, row, "Mouvement");
      const cells = dated.map(({ index }) => row.cells[index] ?? "");
      const start = column(table, row, "Aujourd'hui");
      const unit: "reps" | "seconds" = [start, ...cells].some((cell) => /\d\s*s\b/.test(cell)) ? "seconds" : "reps";
      return {
        slug: metricSlug(movement),
        movement,
        startLabel: start,
        unit,
        byDate: Object.fromEntries(
          dated.map(({ date }, i) => {
            const match = cells[i].match(/(\d+)/);
            return [date, match ? Number(match[1]) : null];
          }),
        ),
      };
    });
}

/** Métriques relevées aux tests : le tableau « Mesure | Résultat » du premier jour de test. */
function readTestDayMetrics(lines: string[]): TestMetric[] {
  for (let i = 0; i < lines.length; i++) {
    if (!/^\|\s*Mesure\s*\|/.test(lines[i])) continue;
    const table = readTable(lines, i);
    if (!table) continue;
    return table.rows
      .map((row) => column(table, row, "Mesure"))
      .filter((label) => label !== "")
      .map((label) => ({
        slug: metricSlug(label),
        label,
        unit: /seconde/i.test(label) ? ("seconds" as const) : ("reps" as const),
      }));
  }
  return [];
}

/** Point de départ : « Traction pronation | **2** propres » → { "tractions-pronation": 2 }. */
function readStartingLevel(lines: string[]): Record<string, number> {
  const start = lines.findIndex((line) => /^##\s+(\d+\.\s*)?Ton point de départ/.test(line));
  if (start === -1) return {};
  const table = readTable(lines, start + 1);
  if (!table) return {};
  const result: Record<string, number> = {};
  for (const row of table.rows) {
    const movement = column(table, row, "Mouvement");
    const level = (column(table, row, "Niveau") || column(table, row, "Lecture")).match(/(\d+)/);
    if (movement !== "" && level) result[metricSlug(movement)] = Number(level[1]);
  }
  return result;
}

/**
 * Contrôles énoncés en prose dans les consignes : « Samedi 10 octobre :
 * Contrôle n°1 », « Dimanche 24 janvier : tests + mesures + photos finales ».
 * Les lire ici évite de les recopier en constante — la précédente,
 * `CHECKPOINT_DATES`, datait les contrôles du premier programme et les aurait
 * imposés au suivant.
 */
function readCheckpoints(weeks: ProgramWeek[], toDate: (raw: string) => string | null): string[] {
  const found = new Set<string>();
  const pattern = /(\d{1,2}\s+[a-zûéèôîà]+)\s*:\s*(?:contr[ôo]le|tests?\b)/gi;
  for (const week of weeks) {
    for (const match of week.instruction.matchAll(pattern)) {
      const date = toDate(match[1]);
      if (date) found.add(date);
    }
  }
  return [...found].sort();
}
