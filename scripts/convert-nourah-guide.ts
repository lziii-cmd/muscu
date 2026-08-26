/**
 * Convertit le guide d'exécution de Nourah en tableau Markdown.
 *
 *   npm run nourah:guide
 *
 * Le document mélange deux formes : les cinq exercices « qui décident du
 * résultat » sont décrits en prose (Installation / Exécution / Les erreurs /
 * Le repère), les autres sont dans des tableaux. Les deux se ramènent aux mêmes
 * quatre champs, c'est ce que produit ce script.
 *
 * Le résultat est ajouté à `PROGRAMME-NOURAH.md`, qui reste le seul document
 * relu avant import.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { readWrappedTable, tidy } from "./lib/pdf-table";

const SOURCE = "data/extraits/nourah-guide-exercices.txt";
const TARGET = "PROGRAMME-NOURAH.md";

interface Sheet {
  name: string;
  position: string;
  execution: string;
  mistake: string;
  note: string;
}

/** Un titre de section numérotée ferme ce qui précède. */
const SECTION = /^\d+\.\s+\S/;

/**
 * Les cinq exercices décrits en prose.
 *
 * Chaque bloc commence par une ligne « Installation : » ; son titre est la
 * dernière ligne non vide au-dessus, et il se termine juste avant le titre du
 * bloc suivant. Se fier à l'indentation ne marchait pas : elle varie d'un bloc
 * à l'autre dans le PDF.
 */
function readProse(lines: string[]): Sheet[] {
  const starts: number[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (tidy(lines[i]).startsWith("Installation :")) starts.push(i);
  }

  const sheets: Sheet[] = [];

  for (const [index, from] of starts.entries()) {
    let title = "";
    let titleLine = -1;
    for (let j = from - 1; j >= 0; j -= 1) {
      if (tidy(lines[j]) === "") continue;
      title = tidy(lines[j]);
      titleLine = j;
      break;
    }
    if (title === "" || SECTION.test(title)) continue;

    // Le bloc s'arrête au titre du suivant, ou au prochain titre de section.
    let to = lines.length;
    const next = starts[index + 1];
    if (next !== undefined) {
      for (let j = next - 1; j > from; j -= 1) {
        if (tidy(lines[j]) !== "") {
          to = j;
          break;
        }
      }
    }
    for (let j = from + 1; j < to; j += 1) {
      if (SECTION.test(tidy(lines[j]))) {
        to = j;
        break;
      }
    }

    const fields: Record<string, string[]> = { position: [], execution: [], mistake: [], note: [] };
    let field = "position";

    for (let j = from; j < to; j += 1) {
      const text = tidy(lines[j]);
      if (text === "" || j === titleLine) continue;

      const labelled = text.match(
        /^(Installation|Exécution|Les \d+ erreurs|Les erreurs|Le repère|Astuce)\s*:\s*(.*)$/,
      );
      if (labelled) {
        const label = labelled[1];
        field =
          label === "Installation"
            ? "position"
            : label === "Exécution"
              ? "execution"
              : label.startsWith("Les")
                ? "mistake"
                : "note";
        if (labelled[2] !== "") fields[field].push(labelled[2]);
        continue;
      }
      fields[field].push(text);
    }

    sheets.push({
      name: title.replace(/\s*—.*$/, "").trim(),
      position: capitalise(fields.position.join(" ")),
      execution: capitalise(fields.execution.join(" ")),
      mistake: cleanList(fields.mistake.join(" ")),
      note: capitalise(fields.note.join(" ")),
    });
  }

  return sheets;
}

/** Les champs du PDF commencent en minuscule après « Installation : ». */
function capitalise(text: string): string {
  const clean = tidy(text);
  return clean === "" ? "" : clean[0].toUpperCase() + clean.slice(1);
}

/** « - a → b - c » : les listes du PDF reviennent en puces séparées par « · ». */
function cleanList(text: string): string {
  return tidy(
    text
      .replace(/\s+-\s+/g, " · ")
      .replace(/^-\s*/, "")
      .replace(/·\s*·/g, "·"),
  );
}

function readTables(lines: string[]): Sheet[] {
  const sheets: Sheet[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const header = lines[i];
    if (!header.includes("Exercice")) continue;

    if (header.includes("Position de départ")) {
      const table = readWrappedTable(
        lines,
        i,
        ["Exercice", "Position de départ", "Exécution", "Erreur à éviter"],
        (line) => SECTION.test(line) || line.startsWith("Rappel important"),
      );
      if (!table) continue;
      for (const row of table.rows) {
        sheets.push({ name: row[0], position: row[1], execution: row[2], mistake: row[3], note: "" });
      }
      i = table.endLine;
      continue;
    }

    if (header.includes("Comment faire")) {
      const table = readWrappedTable(
        lines,
        i,
        ["Exercice", "Comment faire", "Ce que tu dois sentir"],
        (line) => SECTION.test(line) || line.startsWith("Règles de la souplesse"),
      );
      if (!table) continue;
      for (const row of table.rows) {
        // Un étirement n'a pas d'« erreur à éviter » ; il a une sensation
        // attendue, qui est le vrai repère de réussite.
        sheets.push({ name: row[0], position: row[1], execution: "", mistake: "", note: `À sentir : ${row[2]}` });
      }
      i = table.endLine;
    }
  }

  return sheets;
}

function escape(text: string): string {
  return text.replace(/\|/g, "\\|").trim();
}

function main() {
  const lines = readFileSync(SOURCE, "utf8").replace(/\f/g, "\n").split("\n");
  const sheets = [...readProse(lines), ...readTables(lines)];

  const seen = new Set<string>();
  const unique = sheets.filter((sheet) => {
    const key = sheet.name.toLowerCase();
    if (sheet.name === "" || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const out: string[] = [];
  out.push("");
  out.push("---");
  out.push("");
  out.push("## Partie 4 — Comment faire chaque exercice");
  out.push("");
  out.push(
    "Repris du guide d'exécution. Les cinq exercices décisifs y sont décrits en détail, les autres",
    "en une ligne par champ.",
  );
  out.push("");
  out.push("| Exercice | Position | Exécution | Erreur à éviter | Repère |");
  out.push("|---|---|---|---|---|");
  for (const sheet of unique) {
    out.push(
      `| ${escape(sheet.name)} | ${escape(sheet.position)} | ${escape(sheet.execution)} | ${escape(sheet.mistake)} | ${escape(sheet.note)} |`,
    );
  }
  out.push("");

  // Le document est régénéré à chaque conversion : on remplace la partie 4 au
  // lieu de l'empiler.
  const existing = readFileSync(TARGET, "utf8");
  const cut = existing.indexOf("\n---\n\n## Partie 4 —");
  const base = cut === -1 ? existing.replace(/\s+$/, "") : existing.slice(0, cut);

  writeFileSync(TARGET, `${base}\n${out.join("\n")}`, "utf8");

  console.log(`✓ ${unique.length} fiches ajoutées à ${TARGET}.`);
  const thin = unique.filter((sheet) => sheet.position === "" && sheet.execution === "");
  if (thin.length > 0) {
    console.log(`  ⚠ ${thin.length} fiche(s) sans contenu : ${thin.map((s) => s.name).join(", ")}`);
  }
}

main();
