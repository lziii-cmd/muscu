import { clean, normalizeText, readRows, resolveColumnBounds } from "./table-parser";

/**
 * Référentiel de la calisthénie extrait du document : échelles de progression,
 * métriques de test, objectifs jalonnés.
 *
 * Ces tableaux étaient auparavant transcrits à la main. Ils changent à chaque
 * révision du programme — les parser évite de les laisser silencieusement
 * périmés, ce qui est exactement ce qui vient d'arriver.
 */

export interface LadderSeed {
  slug: string;
  name: string;
  description: string;
  levels: { level: number; movement: string; criterion: string }[];
}

export interface TestMetricSeed {
  slug: string;
  label: string;
  unit: "reps" | "seconds";
}

export interface TargetSeed {
  movement: string;
  slug: string;
  /** Valeur de départ déclarée dans le document (« 2 », « 0 », « ? »). */
  start: string;
  /** Objectif par date de jalon ; null quand le document met « -- ». */
  byDate: Record<string, number | null>;
  unit: "reps" | "seconds";
}

export const CHECKPOINT_DATES = ["2026-09-19", "2026-10-17", "2026-11-14", "2026-12-19"];

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function sectionLines(lines: string[], startPattern: RegExp, endPattern: RegExp): string[] {
  let start = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (startPattern.test(lines[i])) {
      start = i;
      break;
    }
  }
  if (start === -1) return [];

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (endPattern.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end);
}

/**
 * Échelles de progression.
 *
 * Structure du document : un titre d'échelle, puis une ligne « Niv. Mouvement
 * Critère », puis un niveau par ligne. Le titre est donc la ligne non vide qui
 * précède immédiatement un en-tête « Niv. ».
 */
export function parseLadders(rawInput: string): { ladders: LadderSeed[]; errors: string[] } {
  const lines = normalizeText(rawInput).split("\n");
  const errors: string[] = [];

  const body = sectionLines(
    lines,
    /^\s*\d+\.\s*Les échelles de progression/,
    /^\s*\d+\.\s*Les 4 tests/,
  );
  if (body.length === 0) {
    return { ladders: [], errors: ["Section « Les échelles de progression » introuvable."] };
  }

  const ladders: LadderSeed[] = [];
  const isHeader = (line: string) => /^\s*Niv\./.test(line);
  const isLevel = (line: string) => /^\s*\d+\s+\S/.test(line);

  for (let i = 0; i < body.length; i++) {
    if (!isHeader(body[i])) continue;

    // Titre : dernière ligne non vide avant l'en-tête, hors ligne de niveau.
    let title = "";
    for (let j = i - 1; j >= 0; j--) {
      const candidate = body[j].replace(/\s+/g, " ").trim();
      if (candidate === "") continue;
      if (isLevel(body[j])) break;
      title = candidate;
      break;
    }
    if (title === "") {
      errors.push(`Échelle sans titre à la ligne ${i} de la section.`);
      continue;
    }

    const levelLines: string[] = [];
    for (let j = i + 1; j < body.length; j++) {
      if (isHeader(body[j])) break;
      if (body[j].trim() === "") continue;
      if (!isLevel(body[j])) {
        // Ligne de commentaire ou titre suivant : fin du tableau.
        if (levelLines.length > 0) break;
        continue;
      }
      levelLines.push(body[j]);
    }

    const resolved = resolveColumnBounds(
      body[i],
      levelLines,
      [
        { key: "level", header: "Niv." },
        { key: "movement", header: "Mouvement" },
        { key: "criterion", header: "Critère" },
      ],
    );
    if ("error" in resolved) {
      errors.push(`Échelle « ${title} » : ${resolved.error}`);
      continue;
    }

    const rows = readRows(levelLines, resolved.bounds, (cells) => /^\d+$/.test(cells.level ?? ""));
    if (rows.length === 0) {
      errors.push(`Échelle « ${title} » : aucun niveau extrait.`);
      continue;
    }

    ladders.push({
      slug: slugify(title),
      name: title,
      description: "",
      levels: rows.map((row) => ({
        level: Number(clean(row.level)),
        movement: clean(row.movement),
        criterion: clean(row.criterion),
      })),
    });

    i += levelLines.length;
  }

  return { ladders, errors };
}

/** Unité déduite du libellé : « (secondes) » ou « (max) ». */
function unitOf(label: string): "reps" | "seconds" {
  return /seconde|\bs\b/i.test(label) ? "seconds" : "reps";
}

/** Métriques relevées lors des 4 tests. */
export function parseTestMetrics(rawInput: string): TestMetricSeed[] {
  const lines = normalizeText(rawInput).split("\n");
  const body = sectionLines(lines, /^\s*\d+\.\s*Les 4 tests/, /^\s*\d+\.\s*Les erreurs/);

  const metrics: TestMetricSeed[] = [];
  for (const line of body) {
    const text = line.replace(/\s+/g, " ").trim();
    // Les lignes utiles sont des libellés suivis de colonnes vides.
    if (!/\((max|secondes)\)\s*$/i.test(text)) continue;
    metrics.push({ slug: slugify(text.replace(/\s*\((max|secondes)\)\s*$/i, "")), label: text, unit: unitOf(text) });
  }
  return metrics;
}

/** Objectifs jalonnés, un mouvement par ligne et une colonne par date. */
export function parseTargets(rawInput: string): { targets: TargetSeed[]; errors: string[] } {
  const lines = normalizeText(rawInput).split("\n");
  const errors: string[] = [];
  const body = sectionLines(lines, /^\s*\d+\.\s*Objectifs réalistes/, /^\s*\d+\.\s*Ton point de départ/);

  const headerIndex = body.findIndex((line) => /Mouvement/.test(line) && /Aujourd'hui/.test(line));
  if (headerIndex === -1) return { targets: [], errors: ["Tableau des objectifs introuvable."] };

  const rowLines = body
    .slice(headerIndex + 1)
    .filter((line) => line.trim() !== "" && !/^\s*Atteindre/.test(line));

  const resolved = resolveColumnBounds(
    body[headerIndex],
    rowLines,
    [
      { key: "movement", header: "Mouvement" },
      { key: "start", header: "Aujourd'hui" },
      { key: "d1", header: "19 sept" },
      { key: "d2", header: "17 oct" },
      { key: "d3", header: "14 nov" },
      { key: "d4", header: "19" },
    ],
  );
  if ("error" in resolved) return { targets: [], errors: [`Objectifs : ${resolved.error}`] };

  const rows = readRows(rowLines, resolved.bounds, (cells) => (cells.movement ?? "") !== "");

  /** « 30 s » -> 30 ; « 10 » -> 10 ; « -- » -> null. */
  const value = (raw: string): number | null => {
    const text = clean(raw);
    if (text === "") return null;
    const match = text.match(/(\d+)/);
    return match ? Number(match[1]) : null;
  };

  const targets: TargetSeed[] = rows.map((row) => {
    const movement = clean(row.movement);
    const cells = [row.d1, row.d2, row.d3, row.d4].map((cell) => clean(cell));
    const isSeconds = cells.some((cell) => /s$/.test(cell));

    return {
      movement,
      slug: slugify(movement),
      start: clean(row.start),
      unit: isSeconds ? "seconds" : "reps",
      byDate: Object.fromEntries(
        CHECKPOINT_DATES.map((date, index) => [date, value(cells[index] ?? "")]),
      ),
    };
  });

  if (targets.length === 0) errors.push("Aucun objectif extrait.");
  return { targets, errors };
}
