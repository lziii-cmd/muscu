import { readFileSync } from "node:fs";
import { parseProgramme } from "./lib/program-parser";
import { weekdayOf } from "./lib/dates";

const p = parseProgramme(readFileSync("PROGRAMME-COMPLET.md", "utf8"), 2026);

const show = (title: string) => console.log(`\n=== ${title} ===`);

for (const [name, part] of [
  ["SALLE", p.ppl],
  ["CALISTHÉNIE", p.calisthenie],
] as const) {
  const active = part.days.filter((d) => !d.isRestDay);
  const sessions = active.flatMap((d) => d.sessions);
  const exercises = sessions.flatMap((s) => s.exercises);

  show(name);
  console.log(`  semaines ${part.weeks.length} | jours ${part.days.length} | actifs ${active.length}`);
  console.log(`  blocs ${sessions.length} | lignes ${exercises.length}`);
  console.log(`  dates incoherentes : ${part.days.filter((d) => weekdayOf(d.date) !== d.weekday).length}`);
  console.log(`  sans volume : ${exercises.filter((e) => e.volume.sets === null).length}`);
  console.log(`  fourchettes de tenue : ${exercises.filter((e) => e.volume.holdSecondsLow !== e.volume.holdSecondsHigh).length}`);
  console.log(`  reps deduites du max : ${exercises.filter((e) => e.volume.maxOffset !== null).length}`);
  console.log(`  alternatives maison : ${exercises.filter((e) => e.homeAlternative !== "").length}`);
  console.log(`  consignes vides : ${part.weeks.filter((w) => w.instruction === "").length}/${part.weeks.length}`);
}

show("DECALAGES SUR LE MAX");
const offsets = new Map<string, number>();
for (const d of p.calisthenie.days) {
  for (const s of d.sessions) {
    for (const e of s.exercises) {
      if (e.volume.maxOffset === null) continue;
      const key = `max - ${e.volume.maxOffset} (${d.weekday})`;
      offsets.set(key, (offsets.get(key) ?? 0) + 1);
    }
  }
}
[...offsets.entries()].sort().forEach(([k, v]) => console.log(`  ${v.toString().padStart(3)} x ${k}`));

show("FOURCHETTES DE TENUE PRESERVEES");
const held = new Set<string>();
for (const d of p.calisthenie.days) {
  for (const s of d.sessions) {
    for (const e of s.exercises) {
      if (e.volume.holdSecondsLow !== null && e.volume.holdSecondsLow !== e.volume.holdSecondsHigh) {
        held.add(`${e.name} : ${e.volume.sets} × ${e.volume.holdSecondsLow}-${e.volume.holdSecondsHigh} s`);
      }
    }
  }
}
[...held].slice(0, 6).forEach((v) => console.log(`  ${v}`));

show("ECHELLES");
p.ladders.forEach((l) =>
  console.log(`  ${l.slug.padEnd(20)} ${l.levels.length} niveaux, depart au niveau ${l.startLevel}`),
);

show("OBJECTIFS");
p.targets.forEach((t) =>
  console.log(
    `  ${t.movement.padEnd(20)} depart=${t.startLabel.padEnd(22)} ${Object.values(t.byDate).map((v) => String(v ?? "--").padStart(4)).join(" ")} ${t.unit}`,
  ),
);

show("METRIQUES DE TEST");
console.log(`  ${p.testMetrics.length} : ${p.testMetrics.map((m) => m.slug).join(", ")}`);

show("MAX DE DEPART");
console.log(" ", p.startingMax);

show("ECHANTILLONS");
const lundi = p.calisthenie.days.find((d) => d.date === "2026-09-07");
console.log(`  ${lundi?.date} ${lundi?.label}`);
lundi?.sessions.forEach((s) =>
  s.exercises.forEach((e) =>
    console.log(
      `    [${s.slot}] ${e.name.padEnd(46)} ${e.volume.raw.padEnd(12)} offset=${e.volume.maxOffset ?? "-"} repos=${e.restSeconds}`,
    ),
  ),
);
const jeudi = p.calisthenie.days.find((d) => d.date === "2026-09-10");
console.log(`  ${jeudi?.date} ${jeudi?.label}`);
jeudi?.sessions.forEach((s) =>
  s.exercises.forEach((e) =>
    console.log(
      `    [${s.slot}] ${e.name.padEnd(46)} ${e.volume.raw.padEnd(12)} offset=${e.volume.maxOffset ?? "-"} repos=${e.restSeconds}`,
    ),
  ),
);

show("ERREURS");
console.log(`  ${p.errors.length}`);
p.errors.slice(0, 12).forEach((e) => console.log("  ERR", e));
