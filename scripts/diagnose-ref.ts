import { readFileSync } from "node:fs";
import { parseLadders, parseTargets, parseTestMetrics } from "./lib/cali-reference";

const raw = readFileSync("data/raw/calisthenie.txt", "utf8");

const { ladders, errors } = parseLadders(raw);
console.log("=== ECHELLES ===", ladders.length);
for (const l of ladders) {
  console.log(
    `  ${l.slug.padEnd(20)} ${String(l.levels.length).padStart(2)} niveaux : ${l.levels
      .map((n) => n.movement)
      .join(" > ")
      .slice(0, 88)}`,
  );
}
errors.forEach((e) => console.log("  ERR", e));

const metrics = parseTestMetrics(raw);
console.log("\n=== METRIQUES DE TEST ===", metrics.length);
metrics.forEach((m) => console.log(`  ${m.slug.padEnd(24)} ${m.unit.padEnd(8)} ${m.label}`));

const { targets, errors: targetErrors } = parseTargets(raw);
console.log("\n=== OBJECTIFS ===", targets.length);
targets.forEach((t) =>
  console.log(
    `  ${t.movement.padEnd(22)} depart=${t.start.padEnd(3)} ${t.unit.padEnd(8)} ${Object.values(t.byDate)
      .map((v) => String(v ?? "--").padStart(4))
      .join(" ")}`,
  ),
);
targetErrors.forEach((e) => console.log("  ERR", e));
