import { readFileSync } from "node:fs";
import { parseCalisthenie } from "./lib/cali-parser";
import { weekdayOf } from "./lib/dates";
const p = parseCalisthenie(readFileSync("data/raw/calisthenie.txt", "utf8"), 2026);
console.log("SEMAINES:", p.weeks.length, "| JOURS:", p.days.length);
const active = p.days.filter((d) => !d.isRestDay);
console.log("jours actifs:", active.length, "| repos:", p.days.length - active.length);
let mism = 0; for (const d of p.days) if (weekdayOf(d.date) !== d.weekday) mism++;
console.log("incoherences de date:", mism);
const blockCount = new Map<number, number>();
for (const d of active) blockCount.set(d.blocks.length, (blockCount.get(d.blocks.length) ?? 0) + 1);
console.log("blocs par jour:", [...blockCount.entries()].sort().map(([k,v])=>`${k}->${v}j`).join(" "));
let ex = 0, noVol = 0, noRest = 0;
for (const d of active) for (const b of d.blocks) for (const e of b.exercises) {
  ex++; if (e.sets === null) noVol++; if (e.restSeconds === null) noRest++;
}
console.log(`exercices: ${ex} | sans volume: ${noVol} | sans repos: ${noRest}`);
console.log("\nERREURS:", p.errors.length); p.errors.slice(0,10).forEach(e=>console.log("  ERR",e));
console.log("AVERTISSEMENTS:", p.warnings.length);
const kinds = new Map<string, number>();
for (const w of p.warnings) { const k = w.replace(/^S\d+ \w+ \d+ \w+ /, "").replace(/\d+ valeur\(s\) pour \d+/, "N valeur(s) pour M"); kinds.set(k, (kinds.get(k)??0)+1); }
[...kinds.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8).forEach(([k,v])=>console.log(`  ${String(v).padStart(3)} x ${k}`));
console.log("\n--- ECHANTILLON ---");
const d0 = active[0];
console.log(`${d0.date} ${d0.weekday} -- ${d0.theme}`);
for (const b of d0.blocks) { console.log(`  [${b.slot}] ${b.heading.slice(0,60)}`);
  for (const e of b.exercises) console.log(`     - ${e.name.padEnd(44)} ${e.repsRaw.padEnd(14)} cue=${e.cueRaw.padEnd(16)} repos=${e.restSeconds}`); }
