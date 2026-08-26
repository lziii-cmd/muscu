import { readFileSync } from "node:fs";
import { column, readTable } from "./markdown";

/**
 * Fiches d'exécution.
 *
 * Trois sources, dans cet ordre de priorité :
 *
 *   1. le document du compte, quand il décrit l'exercice — il connaît le
 *      matériel réel de la personne (« dos contre le canapé », « bouteilles ») ;
 *   2. le fonds commun `data/guides/commun.md`, pour tout le reste ;
 *   3. rien, et l'exercice apparaît alors dans le rapport de couverture.
 *
 * Les fiches sont ensuite écrites par compte, pas sur le catalogue partagé :
 * deux personnes n'exécutent pas le même mouvement avec le même matériel.
 */

export interface Sheet {
  name: string;
  position: string;
  execution: string;
  mistake: string;
  note: string;
}

/** Normalise un nom d'exercice pour l'apparier malgré accents et ponctuation. */
export function guideKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Lit un tableau de fiches sous un titre donné.
 *
 * Les colonnes acceptées sont « Position », « Exécution », « Erreur à éviter »
 * et « Repère » ; les deux documents n'ont pas toutes les cinq.
 */
export function readSheets(path: string, heading: string): Sheet[] {
  const lines = readFileSync(path, "utf8").split("\n");

  const start = lines.findIndex((line) => line.trim().startsWith(heading));
  if (start === -1) return [];

  const end = lines.findIndex(
    (line, index) => index > start && /^#{1,3}\s/.test(line) && !line.trim().startsWith(heading),
  );

  const table = readTable(lines, start + 1, end === -1 ? lines.length : end);
  if (!table) return [];

  const sheets: Sheet[] = [];
  for (const row of table.rows) {
    const name = column(table, row, "Exercice");
    if (name === "") continue;
    sheets.push({
      name,
      position: column(table, row, "Position"),
      execution: column(table, row, "Exécution"),
      mistake: column(table, row, "Erreur"),
      note: column(table, row, "Repère"),
    });
  }
  return sheets;
}

/**
 * Table d'alias : nom rencontré dans un programme → nom de la fiche.
 *
 * Explicite plutôt que déduite. Un rapprochement par préfixe confondrait
 * « Traction » et « Traction australienne », qui sont deux mouvements
 * différents — l'un vertical, l'autre horizontal.
 */
export function readAliases(path: string): Map<string, string> {
  const lines = readFileSync(path, "utf8").split("\n");
  const aliases = new Map<string, string>();

  // On démarre sur la ligne d'en-tête : `readTable` s'arrête au premier titre
  // rencontré, et le fichier en porte avant son tableau.
  const start = lines.findIndex((line) => line.startsWith("| Nom"));
  if (start === -1) return aliases;

  const table = readTable(lines, start);
  if (!table) return aliases;

  for (const row of table.rows) {
    const from = column(table, row, "Nom");
    const to = column(table, row, "Fiche");
    if (from !== "" && to !== "") aliases.set(guideKey(from), to);
  }
  return aliases;
}

/**
 * Cherche la fiche d'un exercice : son nom, puis son alias, dans les sources
 * fournies par ordre de priorité.
 */
export function findSheet(
  name: string,
  aliases: Map<string, string>,
  sources: Map<string, Sheet>[],
): Sheet | null {
  const keys = [guideKey(name)];
  const alias = aliases.get(keys[0]);
  if (alias) keys.push(guideKey(alias));

  for (const key of keys) {
    for (const source of sources) {
      const sheet = source.get(key);
      if (sheet) return sheet;
    }
  }
  return null;
}

/**
 * Index par nom normalisé, la première fiche rencontrée gagnant.
 *
 * Un titre de fiche peut couvrir plusieurs mouvements — « Curl barre /
 * marteau », « Leg extension / Leg curl ». Chaque partie devient une entrée :
 * c'est ce que dit le document, et cela évite autant d'alias.
 */
export function indexSheets(sheets: Sheet[]): Map<string, Sheet> {
  const index = new Map<string, Sheet>();

  const add = (name: string, sheet: Sheet) => {
    const key = guideKey(name);
    if (key !== "" && !index.has(key)) index.set(key, sheet);
  };

  for (const sheet of sheets) {
    add(sheet.name, sheet);
    if (!sheet.name.includes("/")) continue;
    for (const part of sheet.name.split("/")) add(part, sheet);
  }
  return index;
}
