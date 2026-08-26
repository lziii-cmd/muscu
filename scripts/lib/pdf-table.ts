/**
 * Lecture des tableaux d'un PDF extrait en mode `-table`.
 *
 * Ces tableaux n'ont pas de délimiteur : seules les colonnes d'espaces séparent
 * les cellules, et une cellule trop longue déborde sur les lignes suivantes.
 * Deux règles suffisent à les lire sans deviner :
 *
 *   - les bornes de colonnes sont celles de l'en-tête, calculées tableau par
 *     tableau (le PDF ne les place pas aux mêmes abscisses partout) ;
 *   - une nouvelle ligne de données commence quand la PREMIÈRE colonne est
 *     remplie ; sinon, c'est la suite de la précédente.
 */

/** Espaces multiples et insécables ramenés à un espace simple. */
export function tidy(text: string): string {
  return text.replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

export interface WrappedTable {
  headers: string[];
  rows: string[][];
  /** Index de la dernière ligne consommée, pour reprendre la lecture après. */
  endLine: number;
}

/**
 * Lit un tableau dont l'en-tête est à `headerIndex`.
 *
 * `stop` permet d'arrêter sur un titre de section : sans lui, la prose qui suit
 * le tableau serait avalée comme une continuation de sa dernière ligne.
 */
export function readWrappedTable(
  lines: string[],
  headerIndex: number,
  labels: string[],
  stop: (line: string) => boolean,
): WrappedTable | null {
  const header = lines[headerIndex];
  const bounds: number[] = [];
  for (const label of labels) {
    const index = header.indexOf(label);
    if (index === -1) return null;
    bounds.push(index);
  }

  const cut = (line: string): string[] =>
    bounds.map((from, i) => tidy(line.slice(from, i + 1 < bounds.length ? bounds[i + 1] : line.length)));

  const rows: string[][] = [];
  let current: string[] | null = null;
  let line = headerIndex + 1;

  for (; line < lines.length; line += 1) {
    const raw = lines[line].replace(/\s+$/, "");
    if (tidy(raw) === "") continue;
    if (stop(tidy(raw))) break;

    const cells = cut(raw);

    // Première colonne remplie : c'est une nouvelle ligne de données.
    if (cells[0] !== "") {
      if (current) rows.push(current);
      current = cells;
      continue;
    }

    if (!current) continue;
    for (let i = 1; i < cells.length; i += 1) {
      if (cells[i] === "") continue;
      current[i] = current[i] === "" ? cells[i] : `${current[i]} ${cells[i]}`;
    }
  }

  if (current) rows.push(current);
  return { headers: labels, rows, endLine: line };
}
