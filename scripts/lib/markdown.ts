/**
 * Lecture de tableaux Markdown.
 *
 * Le programme est désormais fourni en Markdown (`PROGRAMME-COMPLET.md`), qui se
 * déclare source de vérité et remplace toute extraction depuis les PDF. Les
 * cellules y sont délimitées par des barres : plus de colonnes à deviner, plus
 * de valeurs qui dérivent d'une ligne, plus d'heuristiques.
 */

export interface MarkdownRow {
  cells: string[];
  /** Vrai si la ligne était entièrement en gras — le document s'en sert pour
   *  marquer le niveau de départ dans les échelles de progression. */
  emphasised: boolean;
}

export interface MarkdownTable {
  headers: string[];
  rows: MarkdownRow[];
  /** Index de la ligne d'en-tête dans le tableau de lignes fourni. */
  startLine: number;
  endLine: number;
}

/** Retire le gras et normalise les tirets et espaces d'une cellule. */
export function cleanCell(value: string): string {
  const text = value
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
  // « — » seul signifie « rien » dans ce document.
  return text === "—" || text === "–" || text === "-" ? "" : text;
}

function isTableLine(line: string): boolean {
  return line.trimStart().startsWith("|");
}

function isSeparatorLine(line: string): boolean {
  return /^\s*\|[\s:|-]+\|\s*$/.test(line);
}

function splitCells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

/**
 * Lit le premier tableau rencontré à partir de `from`.
 * Renvoie null si aucune ligne de tableau ne suit.
 */
export function readTable(lines: string[], from: number, until = lines.length): MarkdownTable | null {
  let start = -1;
  for (let i = from; i < until; i++) {
    if (isTableLine(lines[i])) {
      start = i;
      break;
    }
    // Un titre coupe la recherche : le tableau appartiendrait à une autre section.
    if (/^#{1,6}\s/.test(lines[i])) return null;
  }
  if (start === -1) return null;
  if (start + 1 >= until || !isSeparatorLine(lines[start + 1])) return null;

  const headers = splitCells(lines[start]).map(cleanCell);
  const rows: MarkdownRow[] = [];

  let end = start + 2;
  for (let i = start + 2; i < until; i++) {
    if (!isTableLine(lines[i])) break;
    const raw = splitCells(lines[i]);
    rows.push({
      cells: raw.map(cleanCell),
      // Le document met la ligne entière en gras pour signaler le niveau courant.
      emphasised: raw.filter((cell) => cell !== "").every((cell) => cell.includes("**")),
    });
    end = i + 1;
  }

  return { headers, rows, startLine: start, endLine: end };
}

/** Valeur d'une colonne par son libellé, insensible à la casse et aux accents. */
export function column(table: MarkdownTable, row: MarkdownRow, header: string): string {
  const normalise = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase();

  const index = table.headers.findIndex((candidate) =>
    normalise(candidate).startsWith(normalise(header)),
  );
  return index === -1 ? "" : (row.cells[index] ?? "");
}
