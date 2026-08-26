import { findSheet, guideKey, indexSheets, readAliases, readSheets, type Sheet } from "./guides";

/**
 * Associe une fiche d'exécution à chaque exercice d'un programme.
 *
 * La fiche du document du compte l'emporte sur le fonds commun : elle connaît
 * le matériel réel de la personne. « Dos contre le canapé » n'aurait aucun sens
 * pour quelqu'un qui s'entraîne en salle, et l'inverse est vrai aussi.
 */

export interface ResolvedGuide {
  exercise: string;
  position: string;
  execution: string;
  mistake: string;
  note: string;
  /** Vrai quand la fiche vient du document du compte. */
  fromProgram: boolean;
}

export interface GuideSources {
  /** Document du compte : chemin et titre de la section des fiches. */
  own: { path: string; heading: string };
}

export function resolveGuides(
  exerciseNames: string[],
  sources: GuideSources,
): { guides: ResolvedGuide[]; missing: string[] } {
  const aliases = readAliases("data/guides/alias.md");
  const own = indexSheets(readSheets(sources.own.path, sources.own.heading));
  const commun = indexSheets(readSheets("data/guides/commun.md", "## Fiches"));

  const guides: ResolvedGuide[] = [];
  const missing: string[] = [];
  const seen = new Set<string>();

  for (const name of exerciseNames) {
    const key = guideKey(name);
    if (key === "" || seen.has(key)) continue;
    seen.add(key);

    const sheet = findSheet(name, aliases, [own, commun]);
    if (!sheet) {
      missing.push(name);
      continue;
    }

    guides.push({
      exercise: name,
      position: sheet.position,
      execution: sheet.execution,
      mistake: sheet.mistake,
      note: sheet.note,
      fromProgram: isFrom(own, sheet),
    });
  }

  return { guides, missing };
}

/** La fiche retenue vient-elle du document du compte ? */
function isFrom(source: Map<string, Sheet>, sheet: Sheet): boolean {
  for (const candidate of source.values()) if (candidate === sheet) return true;
  return false;
}
