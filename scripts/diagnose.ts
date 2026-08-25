/**
 * Headless diagnostic trace. Shows every decision the search makes — this is the same
 * data the UI's "how we got here" panel will render.
 *
 *   npm run diagnose -- --missing function_composition
 *   npm run diagnose -- --missing span,dot_product --frontier change_of_basis,projection
 */
import { readFileSync } from "node:fs";
import { indexDag, ancestors } from "../lib/dag.js";
import { runDiagnostic, syntheticStudent } from "../lib/simulate.js";
import { rootGaps, isGap, isKnown } from "../lib/diagnostic.js";
import type { Dag } from "../lib/types.js";

const dag = JSON.parse(readFileSync("data/dag.json", "utf8")) as Dag;
const idx = indexDag(dag);

const argv = process.argv.slice(2);
const flag = (n: string) => {
  const i = argv.indexOf(n);
  return i === -1 ? undefined : argv[i + 1];
};
const list = (n: string, d: string[]) => (flag(n) ? flag(n)!.split(",") : d);

const missing = list("--missing", ["function_composition"]);
const frontier = list("--frontier", ["change_of_basis", "eigenvectors", "gaussian_elimination"]);

for (const id of [...missing, ...frontier]) {
  if (!idx.byId.has(id)) throw new Error(`no such node "${id}"`);
}

/**
 * --bench plants each in-scope node in turn as the sole gap and reports how fast the
 * search isolates it. One good trace proves nothing; this is the real measure.
 */
if (argv.includes("--bench")) {
  const scope = new Set<string>();
  for (const f of frontier) {
    scope.add(f);
    for (const a of ancestors(idx, f)) scope.add(a);
  }
  const ordered = [...scope].sort((a, b) => idx.byId.get(a)!.depth - idx.byId.get(b)!.depth);

  console.log(`frontier: ${frontier.join(", ")}   scope: ${scope.size} nodes\n`);
  console.log(`${"planted gap".padEnd(26)} depth  converged  total  found`);
  const convs: number[] = [];
  const totals: number[] = [];
  let misses = 0;

  for (const g of ordered) {
    const s = runDiagnostic(idx, frontier, syntheticStudent(idx, [g]));
    const conv = s.steps.findIndex((x) => x.rootGaps.includes(g)) + 1;
    const found = rootGaps(s, idx).includes(g);
    if (!found) misses++;
    convs.push(conv || 99);
    totals.push(s.steps.length);
    console.log(
      `${g.padEnd(26)} ${String(idx.byId.get(g)!.depth).padStart(5)}  ${String(conv || "--").padStart(9)}  ${String(s.steps.length).padStart(5)}  ${found ? "yes" : "NO"}`
    );
  }

  const avg = (a: number[]) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
  console.log(`\n${ordered.length} single-gap students`);
  console.log(`  converged: avg ${avg(convs)} probes, worst ${Math.max(...convs)}`);
  console.log(`  total:     avg ${avg(totals)} probes, worst ${Math.max(...totals)}`);
  console.log(`  missed:    ${misses}`);
  process.exit(misses === 0 ? 0 : 1);
}

const state = runDiagnostic(idx, frontier, syntheticStudent(idx, missing));

console.log(`frontier: ${frontier.join(", ")}`);
console.log(`scope:    ${state.scope.size} of ${dag.nodes.length} nodes`);
console.log(`student is missing: ${missing.join(", ")}\n`);

for (const step of state.steps) {
  const top = step.candidates.slice(0, 4);
  console.log(`── probe ${step.index + 1} ${"─".repeat(58)}`);
  console.log(`   considered (higher gain = settles more in its weaker branch):`);
  for (const c of top) {
    const mark = c.nodeId === step.chosen ? "->" : "  ";
    console.log(
      `   ${mark} ${c.nodeId.padEnd(26)} pass settles ${String(c.passSettled).padStart(2)}  ` +
        `fail settles ${String(c.failSettled).padStart(2)}  prior ${c.priorGap.toFixed(2)}  gain ${c.gain.toFixed(2)}`
    );
  }
  if (step.candidates.length > top.length) console.log(`      ... ${step.candidates.length - top.length} more`);
  console.log(`   asked "${idx.byId.get(step.chosen)!.label}"  ->  ${step.correct ? "CORRECT" : "WRONG"}`);
  if (step.misconception) console.log(`   misconception: ${step.misconception}`);
  const inferred = step.propagated.filter((p) => p.nodeId !== step.chosen);
  if (inferred.length) {
    console.log(`   propagated to ${inferred.length}: ${inferred.map((p) => `${p.nodeId}=${p.to}`).slice(0, 6).join(", ")}${inferred.length > 6 ? ", ..." : ""}`);
  }
  if (step.rootGaps.length) console.log(`   root gaps so far: ${step.rootGaps.join(", ")}`);
  console.log();
}

const roots = rootGaps(state, idx);
const known = [...state.scope].filter((id) => isKnown(state.mastery.get(id)!)).length;
const gaps = [...state.scope].filter((id) => isGap(state.mastery.get(id)!)).length;
const unresolved = [...state.scope].filter((id) => state.mastery.get(id) === "unknown").length;

console.log(`${"=".repeat(70)}`);
console.log(`${state.steps.length} probes  ->  ${known} known, ${gaps} gaps, ${unresolved} unresolved`);
console.log(`ROOT GAPS: ${roots.length ? roots.join(", ") : "none"}`);
const found = missing.filter((m) => roots.includes(m));
const missed = missing.filter((m) => !roots.includes(m));
console.log(`found ${found.length}/${missing.length} of the planted gaps${missed.length ? `; MISSED: ${missed.join(", ")}` : ""}`);
