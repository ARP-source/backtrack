/**
 * Offline: generate one diagnostic question per DAG node and commit them.
 * The running app never generates probes — it reads data/probes.json, so the diagnostic
 * has zero latency and asks identical questions every run.
 *
 * Run: npm run build:probes           (add --force to regenerate existing probes)
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { callLLM, MODEL, hasApiKey } from "../lib/llm";
import { ProbeBatchSchema, PROBE_RESPONSE_SCHEMA, buildProbePrompt, fallbackProbe, type Probe } from "../lib/probes";
import type { Dag } from "../lib/types";

const dag = JSON.parse(readFileSync("data/dag.json", "utf8")) as Dag;
const force = process.argv.includes("--force");
const OUT = "data/probes.json";

if (!hasApiKey()) {
  console.error("No GEMINI_API_KEY. Probes are a build artifact — generate them with a key,");
  console.error("or the app will fall back to blunt derived questions at runtime.");
  process.exit(1);
}

const existing: Record<string, Probe> = existsSync(OUT) && !force ? JSON.parse(readFileSync(OUT, "utf8")) : {};
const todo = dag.nodes.filter((n) => !existing[n.id]);

console.log(`${MODEL} — ${todo.length} to generate, ${Object.keys(existing).length} cached`);

// Batched: one call per group keeps the response small enough to stay well-formed, and
// keeps total calls comfortably inside the free tier.
const BATCH = 6;
for (let i = 0; i < todo.length; i += BATCH) {
  const group = todo.slice(i, i + BATCH);
  const res = await callLLM({
    namespace: `probes-${group.map((n) => n.id).join("_").slice(0, 40)}`,
    prompt: buildProbePrompt(group),
    responseSchema: PROBE_RESPONSE_SCHEMA,
    schema: ProbeBatchSchema,
    fixture: { probes: group.map(fallbackProbe) },
  });

  for (const p of res.value.probes) {
    const node = dag.nodes.find((n) => n.id === p.nodeId);
    if (!node) {
      console.log(`  ! discarding probe for unknown node "${p.nodeId}"`);
      continue;
    }
    const correct = p.options.filter((o) => o.correct).length;
    if (correct !== 1) {
      console.log(`  ! ${p.nodeId}: ${correct} correct options — using derived fallback`);
      existing[p.nodeId] = fallbackProbe(node);
      continue;
    }
    existing[p.nodeId] = p;
  }
  console.log(`  [${res.source}] ${group.map((n) => n.id).join(", ")}`);
}

// Guarantee full coverage: any node the model skipped gets a derived probe.
for (const n of dag.nodes) if (!existing[n.id]) existing[n.id] = fallbackProbe(n);

writeFileSync(OUT, JSON.stringify(existing, null, 2));

const withMis = Object.values(existing).filter((p) =>
  p.options.some((o) => !o.correct && o.misconception)
).length;
console.log(`\nwrote ${OUT} — ${Object.keys(existing).length} probes, ${withMis} with misconception-tagged distractors`);
