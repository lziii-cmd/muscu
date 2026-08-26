/**
 * Parseur de tableaux issus de `pdftotext -table`.
 *
 * Le mode `-table` (Xpdf) préserve l'alignement des lignes, contrairement à
 * `-layout` qui laissait dériver les colonnes de droite d'une ligne vers le
 * haut. Cela supprime le besoin d'heuristiques d'appariement : une ligne du
 * tableau est une ligne du fichier.
 *
 * Reste un seul cas à traiter : une valeur trop longue passe à la ligne
 * (« Soulevé de terre » / « roumain »). Ces lignes de débordement sont recollées
 * à la ligne précédente, colonne par colonne.
 */

/** Caractères parasites laissés par l'extraction PDF. */
export function normalizeText(input: string): string {
  return input
    .replace(/\r\n/g, "\n")
    .replace(/\f/g, "") // sauts de page, parfois collés en tête de titre
    .replace(/­/g, "-") // trait d'union conditionnel utilisé comme tiret de fourchette
    .replace(/[‐-―]/g, "-") // tirets typographiques
    .replace(/ /g, " ") // espace insécable
    .replace(/’/g, "'");
}

/** Motif d'une cellule de volume : « 4 × 6-8 », « 3×8 », « 3 × 10 / jambe », « 5 min ». */
export const VOLUME_PATTERN = /(\d+\s*[×x]\s*\d+|\d+\s*min\b|\d+\s*s[ée]ries?\b)/i;

export interface ColumnSpec {
  key: string;
  /** Libellé tel qu'il apparaît dans la ligne d'en-tête. */
  header: string;
  /** Une colonne optionnelle absente de l'en-tête n'est pas une erreur. */
  optional?: boolean;
}

export interface ColumnBounds {
  key: string;
  start: number;
  end: number;
}

export interface ResolveResult {
  bounds: ColumnBounds[];
  missing: string[];
}

/** Positions blanches sur toutes les lignes fournies. */
function buildBlankMask(lines: string[], width: number): boolean[] {
  const mask = new Array<boolean>(width).fill(true);
  for (const line of lines) {
    if (line.trim() === "") continue;
    for (let p = 0; p < width && p < line.length; p++) {
      if (line[p] !== " ") mask[p] = false;
    }
  }
  return mask;
}

/**
 * Calcule les bornes de chaque colonne.
 *
 * Une valeur peut commencer légèrement à gauche du libellé de sa colonne. On
 * cherche donc, dans le CORPS du tableau, la dernière plage de blanc qui précède
 * le libellé, et on pose la borne à son début. L'en-tête est exclu du calcul :
 * ses libellés boucheraient les séparateurs.
 */
export function resolveColumnBounds(
  headerLine: string,
  bodyLines: string[],
  specs: ColumnSpec[],
): ResolveResult | { error: string } {
  const found: { key: string; start: number }[] = [];
  const missing: string[] = [];

  let searchFrom = 0;
  for (const spec of specs) {
    const index = headerLine.indexOf(spec.header, searchFrom);
    if (index === -1) {
      if (spec.optional) {
        missing.push(spec.key);
        continue;
      }
      return { error: `colonne « ${spec.header} » absente de l'en-tête` };
    }
    found.push({ key: spec.key, start: index });
    searchFrom = index + spec.header.length;
  }

  if (found.length === 0) return { error: "aucune colonne reconnue" };

  const width = Math.max(headerLine.length, ...bodyLines.map((l) => l.length), 1);
  const mask = buildBlankMask(bodyLines, width);

  const boundaries: number[] = [0];
  for (let i = 1; i < found.length; i++) {
    const labelStart = found[i].start;
    const floor = boundaries[i - 1] + 1;

    let boundary = -1;
    let p = Math.min(labelStart, width - 1);
    while (p >= floor && !mask[p]) p--; // saute le débordement à gauche du libellé
    while (p >= floor && mask[p]) {
      boundary = p;
      p--;
    }

    boundaries.push(boundary === -1 ? Math.max(labelStart, floor) : boundary);
  }

  return {
    bounds: found.map((column, i) => ({
      key: column.key,
      start: boundaries[i],
      end: i + 1 < boundaries.length ? boundaries[i + 1] : Number.MAX_SAFE_INTEGER,
    })),
    missing,
  };
}

export function sliceColumn(line: string, bound: ColumnBounds): string {
  if (bound.start >= line.length) return "";
  return line.slice(bound.start, Math.min(bound.end, line.length)).trim();
}

export type Row = Record<string, string>;

/**
 * Lit le corps d'un tableau en lignes logiques.
 *
 * `isRowStart` décide si une ligne ouvre un nouvel exercice. Les lignes
 * suivantes sont du débordement et sont recollées colonne par colonne — c'est
 * ainsi que « Soulevé de terre » + « roumain » redeviennent un seul nom, et
 * « Barre à vide (20 » + « kg) » une seule charge.
 */
export function readRows(
  bodyLines: string[],
  bounds: ColumnBounds[],
  isRowStart: (cells: Row) => boolean,
): Row[] {
  const rows: Row[] = [];

  for (const line of bodyLines) {
    if (line.trim() === "") continue;

    const cells: Row = {};
    for (const bound of bounds) cells[bound.key] = sliceColumn(line, bound);

    if (isRowStart(cells)) {
      rows.push(cells);
      continue;
    }

    const previous = rows[rows.length - 1];
    // Une ligne de débordement avant toute ligne logique n'appartient à rien :
    // c'est la suite du libellé d'en-tête (« Reps » sous « Séries × »).
    if (!previous) continue;

    for (const bound of bounds) {
      const value = cells[bound.key];
      if (value === "") continue;
      previous[bound.key] = previous[bound.key] ? `${previous[bound.key]} ${value}` : value;
    }
  }

  return rows;
}

/** Nettoie une cellule : espaces multiples, tirets vides. */
export function clean(value: string | undefined): string {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  return text === "--" || text === "-" ? "" : text;
}
