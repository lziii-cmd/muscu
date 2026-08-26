import { readFileSync } from "node:fs";
import { parsePpl } from "./lib/ppl-parser";

/**
 * Contrôles de cohérence sur le programme extrait.
 *
 * La semaine 1 est une semaine de réadaptation : pas de supersets, temps de
 * repos et nombre d'exercices propres. Elle est donc exclue des invariants qui
 * décrivent la structure des semaines 2 à 17.
 */
const p = parsePpl(readFileSync("data/raw/ppl.txt", "utf8"), 2026);
const sessions = p.days.filter((d) => !d.isRestDay);
const regular = sessions.filter((d) => d.weekNumber >= 2);

console.log(`Seances : ${sessions.length} (dont ${regular.length} en semaines 2-17)\n`);

// 1. Structure des 60 minutes : repos imposes par position.
const expected: Record<string, number> = { "1": 150, "2": 120, "3": 90, "4a": 0, "4b": 75 };
let restBad = 0;
for (const d of regular) for (const e of d.exercises) {
  if (expected[e.order] !== undefined && e.restSeconds !== expected[e.order]) {
    if (restBad < 5) console.log(`  ! repos ${d.date} #${e.order}: ${e.restSeconds}s au lieu de ${expected[e.order]}s`);
    restBad++;
  }
}
console.log(`Repos par position        -> ${restBad} ecart(s) / ${regular.length * 5}`);

// 2. Ordre des exercices.
let orderBad = 0;
for (const d of regular) {
  if (d.exercises.map((e) => e.order).join(",") !== "1,2,3,4a,4b") {
    if (orderBad < 5) console.log(`  ! ordre ${d.date} ${d.sessionType}: ${d.exercises.map((e) => e.order).join(",")}`);
    orderBad++;
  }
}
console.log(`Ordre 1,2,3,4a,4b         -> ${orderBad} ecart(s)`);

// 3. Composition stable par type de seance.
const byType = new Map<string, Set<string>>();
for (const d of regular) {
  if (!byType.has(d.sessionType)) byType.set(d.sessionType, new Set());
  byType.get(d.sessionType)!.add(d.exercises.map((e) => e.name).join(" | "));
}
let compBad = 0;
for (const [type, sigs] of byType) {
  if (sigs.size > 1) { compBad++; console.log(`  ! ${type} a ${sigs.size} compositions differentes`); }
}
console.log(`Composition par type      -> ${byType.size} types, ${compBad} instable(s)`);

// 4. Alternative maison presente sur toutes les seances des semaines 2-17.
let noHome = 0;
for (const d of regular) for (const e of d.exercises) if (e.homeAlternative === "") noHome++;
console.log(`Alternative maison        -> ${noHome} manquante(s) / ${regular.length * 5}`);

// 5. Charges plausibles.
let odd = 0;
for (const d of sessions) for (const e of d.exercises) {
  const m = e.loadRaw.match(/^([\d,]+)\s*kg$/);
  if (m) { const v = Number(m[1].replace(",", ".")); if (v < 2 || v > 200) { console.log(`  ! charge ${d.date} ${e.name}: ${e.loadRaw}`); odd++; } }
}
console.log(`Charges dans 2-200 kg     -> ${odd} hors plage`);

console.log("\nTypes de seance :", [...byType.keys()].sort().join(", "));
