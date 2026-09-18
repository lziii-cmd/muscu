/**
 * Décale toutes les dates d'un programme Markdown, d'un nombre de jours donné.
 *
 *   npx tsx scripts/shift-programme.ts --days 7
 *   npx tsx scripts/shift-programme.ts --days 7 --essai       (n'écrit rien)
 *
 * Sert quand un programme est décalé dans le temps — démarrage repoussé,
 * semaine perdue pour cause de blessure ou de voyage. Le document restant la
 * source de vérité, c'est lui qu'on décale : décaler à l'import ferait diverger
 * ce qui est écrit et ce que l'application affiche, et le document cesserait
 * d'être relisible.
 *
 * Le décalage porte sur toutes les dates françaises du document — titres de
 * semaine, titres de jour, en-tête, et les dates de contrôle énoncées dans les
 * consignes. Le jour de la semaine est **recalculé**, jamais recopié : un
 * décalage qui n'est pas un multiple de 7 change les jours, et un libellé faux
 * serait invisible à la relecture.
 */
import { readFileSync, writeFileSync } from "node:fs";

const MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];
const WEEKDAYS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

const MONTH_NUMBER = new Map<string, number>();
MONTHS.forEach((name, index) => {
  MONTH_NUMBER.set(name, index + 1);
  // Le document écrit « aout » aussi bien que « août ».
  MONTH_NUMBER.set(name.normalize("NFD").replace(/[̀-ͯ]/g, ""), index + 1);
});

const argv = process.argv.slice(2);
const read = (flag: string) => {
  const i = argv.indexOf(flag);
  return i === -1 ? undefined : argv[i + 1];
};
const days = Number(read("--days"));
const source = read("--source") ?? "PROGRAMME-COMPLET.md";
const dryRun = argv.includes("--essai");

if (!Number.isInteger(days) || days === 0) {
  console.error("Usage : npx tsx scripts/shift-programme.ts --days <entier non nul> [--source f] [--essai]");
  process.exit(1);
}

const raw = readFileSync(source, "utf8").replace(/\r\n/g, "\n");
const lines = raw.split("\n");

/*
 * Mois d'origine du programme, lu sur le premier jour daté : c'est lui qui dit
 * à quelle année appartient « 3 janvier » dans un document qui ne porte que le
 * jour et le mois. Même raisonnement que `makeCalendar` côté parseur.
 */
const DAY_HEADING = new RegExp(`^###\\s+(?:${WEEKDAYS.join("|")})\\s+(\\d{1,2})\\s+([a-zûéèôîà]+)`);
const firstDay = lines.find((line) => DAY_HEADING.test(line));
if (!firstDay) {
  console.error(`Aucun jour daté dans ${source}.`);
  process.exit(1);
}
const startMonth = MONTH_NUMBER.get(firstDay.match(DAY_HEADING)![2].toLowerCase());
if (!startMonth) {
  console.error(`Premier jour illisible : ${firstDay.trim()}`);
  process.exit(1);
}

// L'année de départ vient de l'en-tête quand il la porte, sinon on la demande.
const headerYear = raw.match(/(\d{4})\s*→/);
const startYear = headerYear ? Number(headerYear[1]) : new Date().getUTCFullYear();

/*
 * Abréviations des en-têtes de tableau (« 3 oct », « 17 jan »). Elles sont
 * réécrites abrégées, pour que le tableau garde sa forme. « mars », « mai »,
 * « juin » et « août » sont déjà complets.
 */
const ABBREVIATIONS: Record<string, number> = {
  jan: 1,
  janv: 1,
  fév: 2,
  févr: 2,
  avr: 4,
  juil: 7,
  sept: 9,
  oct: 10,
  nov: 11,
  déc: 12,
};
const SHORT = ["jan", "fév", "mars", "avr", "mai", "juin", "juil", "août", "sept", "oct", "nov", "déc"];
for (const [abbreviation, month] of Object.entries(ABBREVIATIONS)) MONTH_NUMBER.set(abbreviation, month);

/**
 * Une date française, avec son jour de semaine et son année éventuels. Les mois
 * sont essayés du plus long au plus court, et doivent finir le mot : sans cela
 * « sept » mordrait dans « septembre ».
 */
const monthAlternatives = [...MONTH_NUMBER.keys()].sort((a, b) => b.length - a.length).join("|");
const DATE = new RegExp(
  `(?:(${WEEKDAYS.join("|")})\\s+)?(\\d{1,2})\\s+(${monthAlternatives})(?![a-zûéèôîà])(\\s+(\\d{4}))?`,
  "g",
);

let shifted = 0;
const samples: string[] = [];

const out = lines.map((line, index) =>
  line.replace(DATE, (match, weekday, dayRaw, monthRaw, yearGroup, yearRaw) => {
    const month = MONTH_NUMBER.get(String(monthRaw).toLowerCase());
    if (!month) return match;

    // Année explicite si le document la donne, déduite sinon.
    const year = yearRaw ? Number(yearRaw) : month >= startMonth ? startYear : startYear + 1;

    const date = new Date(Date.UTC(year, month - 1, Number(dayRaw)));
    if (Number.isNaN(date.getTime())) return match;
    date.setUTCDate(date.getUTCDate() + days);

    const rebuilt =
      (weekday ? `${WEEKDAYS[date.getUTCDay()]} ` : "") +
      `${date.getUTCDate()} ${
        String(monthRaw).toLowerCase() in ABBREVIATIONS ? SHORT[date.getUTCMonth()] : MONTHS[date.getUTCMonth()]
      }` +
      (yearRaw ? ` ${date.getUTCFullYear()}` : "");

    shifted += 1;
    if (samples.length < 6) samples.push(`  ligne ${index + 1} : « ${match} » → « ${rebuilt} »`);
    return rebuilt;
  }),
);

console.log(`Source  : ${source}`);
console.log(`Décalage: ${days > 0 ? "+" : ""}${days} jours`);
console.log(`Dates   : ${shifted} réécrites`);
samples.forEach((s) => console.log(s));

if (dryRun) {
  console.log("\n(essai — rien n'a été écrit)");
} else {
  writeFileSync(source, out.join("\n"), "utf8");
  console.log(`\n✓ ${source} réécrit. Relance npm run seed:build.`);
}
