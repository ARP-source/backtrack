/**
 * CLI: structural check on data/dag.json plus a shape report.
 * Run: npm run validate:dag
 */
import { readFileSync } from "node:fs";
import { indexDag, validateDag, computeDepths, ancestors } from "../lib/dag.js";
import type { Dag } from "../lib/types.js";

const dag = JSON.parse(readFileSync("data/dag.json", "utf8")) as Dag;
const problems = validateDag(dag);
const errors = problems.filter((p) => p.severity === "error");

for (const p of problems) {
  console.log(`${p.severity === "error" ? "ERROR" : " warn"}  ${p.message}`);
}

if (errors.length) {
  console.log(`\n${errors.length} error(s). Fix before building the corpus.`);
  process.exit(1);
}

const idx = indexDag(dag);
const depths = computeDepths(dag);
const roots = dag.nodes.filter((n) => n.prereqs.length === 0);
const leaves = dag.nodes.filter((n) => (idx.dependents.get(n.id) ?? []).length === 0);
const maxDepth = Math.max(...depths.values());
const edges = dag.nodes.reduce((a, n) => a + n.prereqs.length, 0);

console.log(`OK  ${dag.nodes.length} nodes, ${edges} edges, depth 0..${maxDepth}`);
console.log(`\nroots (no prereqs):  ${roots.map((n) => n.id).join(", ")}`);
console.log(`leaves (nothing depends on them):  ${leaves.map((n) => n.id).join(", ")}`);

console.log(`\nnodes per depth:`);
for (let d = 0; d <= maxDepth; d++) {
  const at = dag.nodes.filter((n) => depths.get(n.id) === d);
  if (at.length) console.log(`  ${String(d).padStart(2)}  ${at.map((n) => n.id).join(", ")}`);
}

// The deepest node's ancestor set is the longest possible diagnostic descent —
// this is the "here's when you started being wrong" path the demo walks.
const deepest = dag.nodes.find((n) => depths.get(n.id) === maxDepth)!;
const anc = ancestors(idx, deepest.id);
console.log(`\n"${deepest.id}" transitively depends on ${anc.size} of ${dag.nodes.length} nodes.`);
console.log(`search space when a student fails it: ${[...anc].sort().join(", ")}`);
