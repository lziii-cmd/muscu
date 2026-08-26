import { readFileSync } from "node:fs";
import { parsePpl } from "./lib/ppl-parser";
import { weekdayOf } from "./lib/dates";

const p = parsePpl(readFileSync("data/raw/ppl.txt", "utf8"), 2026);
const sessions = p.days.filter((d) => !d.isRestDay);

console.log("SEMAINES:", p.weeks.length, "| JOURS:", p.days.length, "| seances:", sessions.length);
console.log("dates incoherentes:", p.days.filter((d) => weekdayOf(d.date) !== d.weekday).length);

const counts = new Map<number, number>();
for (const d of sessions) counts.set(d.exercises.length, (counts.get(d.exercises.length) ?? 0) + 1);
console.log("exercices par seance:", [...counts.entries()].sort().map(([n, c]) => `${n}->${c}`).join(" "));

const total = sessions.reduce((s, d) => s + d.exercises.length, 0);
let noSets = 0, noRest = 0, noHome = 0, noLoad = 0;
for (const d of sessions) for (const e of d.exercises) {
  if (e.sets === null) noSets++;
  if (e.restSeconds === null) noRest++;
  if (e.homeAlternative === "") noHome++;
  if (e.loadRaw === "" && e.dumbbellRaw === "") noLoad++;
}
console.log(`lignes: ${total} | sans series: ${noSets} | sans repos: ${noRest} | sans charge: ${noLoad} | sans alternative maison: ${noHome}`);

console.log("\nERREURS:", p.errors.length);
p.errors.slice(0, 10).forEach((e) => console.log("  ERR", e));

console.log("\n--- S1 Mardi 25 (semaine 1, sans colonne #) ---");
const w1 = p.days.find((d) => d.date === "2026-08-25");
w1?.exercises.forEach((e) => console.log(`  ${e.order} ${e.name.padEnd(30)} ${e.sets}x${e.repsLow}${e.repsHigh !== e.repsLow ? "-" + e.repsHigh : ""} | ${(e.loadRaw || "-").padEnd(22)} | halt ${(e.dumbbellRaw || "-").padEnd(6)} | ${e.restSeconds}s | maison: ${e.homeAlternative || "-"}`));

console.log("\n--- S2 Lundi 31 (avec alternative maison) ---");
const w2 = p.days.find((d) => d.date === "2026-08-31");
w2?.exercises.forEach((e) => console.log(`  ${e.order.padEnd(3)} ${e.name.padEnd(32)} ${e.sets}x${e.repsLow}-${e.repsHigh} | ${(e.loadRaw || "-").padEnd(8)} | halt ${(e.dumbbellRaw || "-").padEnd(6)} | ${e.restSeconds}s | maison: ${e.homeAlternative}`));

console.log("\n--- S1 Samedi 29 (noms et charges qui debordent) ---");
const w1s = p.days.find((d) => d.date === "2026-08-29");
w1s?.exercises.forEach((e) => console.log(`  ${e.name.padEnd(26)} | ${e.loadRaw || "-"}`));
