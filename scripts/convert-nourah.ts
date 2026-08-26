/**
 * Convertit les PDF du programme de Nourah en un document Markdown unique.
 *
 *   npm run nourah:convert
 *
 * Pourquoi passer par le Markdown plutôt que de parser le PDF directement :
 * dans un tableau Markdown les cellules sont délimitées. L'extraction d'un PDF,
 * elle, ne rend que des colonnes d'espaces — et c'est exactement là que sont
 * nées les erreurs silencieuses du premier programme (colonnes qui dérivent,
 * fourchettes écrasées sur leur borne haute). La conversion est faite une fois,
 * relue une fois, et tout le reste de la chaîne travaille sur du texte
 * structuré.
 *
 * Prérequis : le texte extrait par
 *   pdftotext -table -enc UTF-8 <source>.pdf data/extraits/nourah-<nom>.txt
 */
import { readFileSync, writeFileSync } from "node:fs";

const SOURCE = "data/extraits/nourah-musculation.txt";
const DIET = "data/extraits/nourah-diete.txt";
const GOALS = "data/extraits/nourah-objectifs.txt";
const OUTPUT = "PROGRAMME-NOURAH.md";

const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

/** Espaces multiples et espaces insécables ramenés à un espace simple. */
function tidy(text: string): string {
  return text.replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Découpe une ligne selon les bornes de colonnes de son en-tête.
 *
 * Les bornes sont calculées table par table : d'un tableau à l'autre, le PDF
 * ne place pas les colonnes aux mêmes abscisses. S'y fier globalement
 * décalerait des valeurs d'une colonne à l'autre sans rien signaler.
 */
function columnBounds(header: string): number[] {
  const bounds: number[] = [];
  for (const label of ["Exercice", "Séries", "Charge", "Repos"]) {
    const index = header.indexOf(label);
    if (index === -1) throw new Error(`Colonne « ${label} » absente de l'en-tête : ${header}`);
    bounds.push(index);
  }
  return bounds;
}

function slice(line: string, bounds: number[]): string[] {
  const starts = [0, ...bounds.slice(0, 1), ...bounds.slice(1)];
  const cells: string[] = [];
  for (let i = 0; i < starts.length; i += 1) {
    const from = starts[i];
    const to = i + 1 < starts.length ? starts[i + 1] : line.length;
    cells.push(tidy(line.slice(from, to)));
  }
  return cells;
}

interface Exercise {
  index: string;
  name: string;
  volume: string;
  load: string;
  rest: string;
}

interface Day {
  weekday: string;
  date: string;
  type: string;
  detail: string;
  ritual: boolean;
  note: string;
  exercises: Exercise[];
}

interface Week {
  number: number;
  heading: string;
  instruction: string;
  days: Day[];
}

const HEADING_DAY = new RegExp(`^(${DAYS.join("|")})\\s+(\\d{1,2})\\s+([A-Za-zéûà]+)\\s*[—–-]\\s*(.*)$`);
const HEADING_WEEK = /^Semaine\s+(\d{1,2})\s*[·•]\s*(.*)$/;

function parseWeeks(lines: string[]): Week[] {
  const weeks: Week[] = [];
  let week: Week | null = null;
  let day: Day | null = null;
  let bounds: number[] | null = null;
  let collecting: "instruction" | "note" | null = null;

  const pushDay = () => {
    if (week && day) week.days.push(day);
    day = null;
    bounds = null;
  };

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i].replace(/\s+$/, "");
    const line = tidy(raw);
    if (line === "") continue;

    const weekMatch = line.match(HEADING_WEEK);
    if (weekMatch) {
      pushDay();
      if (week) weeks.push(week);
      /*
       * Le PDF coupe les titres longs : « … — Bloc 2 — » suivi, deux lignes
       * plus bas, de « Développement ». La suite est reprise tant que la ligne
       * rencontrée n'ouvre pas elle-même une structure connue — sinon le titre
       * avalerait la consigne.
       */
      let heading = weekMatch[2];
      for (let j = i + 1; j < lines.length; j += 1) {
        const next = tidy(lines[j]);
        if (next === "") continue;
        const structural =
          next.startsWith("Consigne :") ||
          HEADING_DAY.test(next) ||
          HEADING_WEEK.test(next) ||
          next.startsWith("#");
        if (!structural) {
          heading = `${heading} ${next}`;
          i = j;
        }
        break;
      }

      week = { number: Number(weekMatch[1]), heading: tidy(heading), instruction: "", days: [] };
      collecting = null;
      continue;
    }

    if (!week) continue;

    if (line.startsWith("Consigne :")) {
      week.instruction = tidy(line.slice("Consigne :".length));
      collecting = "instruction";
      continue;
    }

    const dayMatch = line.match(HEADING_DAY);
    if (dayMatch) {
      pushDay();
      const rest = tidy(dayMatch[4]);
      // « MUSCULATION A », « MOBILITÉ — hanches, fessiers » : le type est le
      // premier mot en capitales, le reste est un complément.
      const typeMatch = rest.match(/^([A-ZÉÈÊÀÂÎÔÛ]+(?:\s+[A-C])?)\s*[—–-]?\s*(.*)$/);
      day = {
        weekday: dayMatch[1],
        date: `${dayMatch[2]} ${dayMatch[3]}`,
        type: tidy(typeMatch?.[1] ?? rest),
        detail: tidy(typeMatch?.[2] ?? ""),
        ritual: false,
        note: "",
        exercises: [],
      };
      collecting = null;
      continue;
    }

    if (!day) {
      // Prose de consigne qui court sur plusieurs lignes.
      if (collecting === "instruction") week.instruction = tidy(`${week.instruction} ${line}`);
      continue;
    }

    if (line.startsWith("Rituel quotidien")) {
      day.ritual = true;
      continue;
    }

    if (raw.trimStart().startsWith("#") && raw.includes("Exercice")) {
      bounds = columnBounds(raw);
      continue;
    }

    if (bounds) {
      const cells = slice(raw, bounds);
      // Une ligne d'exercice commence par son numéro d'ordre. Tout le reste est
      // de la prose : on la garde en note plutôt que de la perdre.
      if (/^\d+$/.test(cells[0])) {
        day.exercises.push({
          index: cells[0],
          name: cells[1],
          volume: cells[2],
          load: cells[3],
          rest: cells[4] ?? "",
        });
        continue;
      }
      bounds = null;
    }

    day.note = day.note === "" ? line : `${day.note} ${line}`;
    collecting = "note";
  }

  pushDay();
  if (week) weeks.push(week);
  return weeks;
}

/** Reprend une section de prose telle quelle, en paragraphes. */
function prose(lines: string[]): string {
  const out: string[] = [];
  let buffer: string[] = [];

  const flush = () => {
    if (buffer.length > 0) out.push(tidy(buffer.join(" ")));
    buffer = [];
  };

  for (const line of lines) {
    const text = tidy(line);
    if (text === "") {
      flush();
      continue;
    }
    // Un titre numéroté ferme le paragraphe en cours.
    const titled = text.match(/^(\d+)\.\s+(.+)$/);
    if (titled && titled[2].length > 12 && !/^\d+\./.test(buffer.join(" "))) {
      flush();
      out.push(`### ${titled[2]}`);
      continue;
    }
    buffer.push(text);
  }
  flush();
  return out.join("\n\n");
}

function main() {
  const source = readFileSync(SOURCE, "utf8").replace(/\f/g, "\n");
  const lines = source.split("\n");

  // Le sommaire répète les titres : on ancre sur la DERNIÈRE occurrence.
  const bodyStart = lines.findLastIndex((line) => tidy(line) === "Le programme, jour par jour");
  if (bodyStart === -1) throw new Error("Section « Le programme, jour par jour » introuvable.");

  const weeks = parseWeeks(lines.slice(bodyStart + 1));

  const out: string[] = [];
  out.push("# Programme de Nourah — Musculation, mobilité et diète");
  out.push("");
  out.push(
    "> Document produit par `npm run nourah:convert` à partir des trois PDF sources.",
    "> Il est la référence de l'import : c'est lui qu'on relit, pas les PDF.",
  );
  out.push("");
  out.push(
    "Maison, 6 séances par semaine à 22h. Musculation A/B/C les lundi, mercredi et vendredi ;",
    "mobilité les mardi et jeudi ; souplesse le samedi ; repos le dimanche. Un rituel quotidien",
    "de 12 minutes précède chaque séance, et tient lieu de séance le dimanche.",
    "",
    "**Pas de calisthénie dans ce programme.**",
  );
  out.push("");
  out.push("---");
  out.push("");
  out.push("## Partie 1 — Le programme, jour par jour");

  for (const week of weeks) {
    out.push("");
    out.push(`### Semaine ${week.number} · ${week.heading}`);
    if (week.instruction !== "") {
      out.push("");
      out.push(`**Consigne :** ${week.instruction}`);
    }

    for (const day of week.days) {
      out.push("");
      out.push(`#### ${day.weekday} ${day.date} — ${day.type}${day.detail ? ` — ${day.detail}` : ""}`);
      if (day.ritual) {
        out.push("");
        out.push("Rituel quotidien puis :");
      }
      if (day.exercises.length > 0) {
        out.push("");
        out.push("| # | Exercice | Séries × Reps | Charge | Repos |");
        out.push("|---|---|---|---|---|");
        for (const exercise of day.exercises) {
          out.push(
            `| ${exercise.index} | ${exercise.name} | ${exercise.volume} | ${exercise.load} | ${exercise.rest} |`,
          );
        }
      }
      if (day.note !== "") {
        out.push("");
        out.push(day.note);
      }
    }
  }

  out.push("");
  out.push("---");
  out.push("");
  out.push("## Partie 2 — Diète");
  out.push("");
  out.push(prose(readFileSync(DIET, "utf8").replace(/\f/g, "\n").split("\n")));

  out.push("");
  out.push("---");
  out.push("");
  out.push("## Partie 3 — Objectifs");
  out.push("");
  out.push(prose(readFileSync(GOALS, "utf8").replace(/\f/g, "\n").split("\n")));
  out.push("");

  writeFileSync(OUTPUT, out.join("\n"), "utf8");

  const days = weeks.reduce((total, week) => total + week.days.length, 0);
  const exercises = weeks.reduce(
    (total, week) => total + week.days.reduce((sum, day) => sum + day.exercises.length, 0),
    0,
  );
  console.log(`✓ ${OUTPUT} écrit.`);
  console.log(`  ${weeks.length} semaines, ${days} jours, ${exercises} lignes d'exercice`);

  const withoutInstruction = weeks.filter((week) => week.instruction === "");
  if (withoutInstruction.length > 0) {
    console.log(`  ⚠ consigne absente : semaines ${withoutInstruction.map((w) => w.number).join(", ")}`);
  }
}

main();
