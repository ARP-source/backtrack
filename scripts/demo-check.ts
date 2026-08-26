/**
 * Demo hardening harness. Runs the complete flow N times and fails on any variation.
 *
 * Two independent things are checked, because they can drift for different reasons:
 *   1. the diagnostic engine (pure, in-process) — same student must give the same probes
 *   2. the served demo path (over HTTP) — same request must give byte-identical responses
 *
 * Run the dev server first, then: npm run demo:check
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { indexDag } from "../lib/dag";
import { runDiagnostic, syntheticStudent } from "../lib/simulate";
import { rootGaps } from "../lib/diagnostic";
import type { Dag } from "../lib/types";

const BASE = process.env.DEMO_BASE ?? "http://localhost:3000";
const RUNS = Number(process.env.DEMO_RUNS ?? 10);
const REHEARSED = ["function_composition", "slope_and_lines"];
/** Anything slower than this on the frozen path would be visible on camera. */
const BUDGET_MS = 1500;

const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 12);
const post = (path: string, body: unknown) =>
  fetch(BASE + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());

let failures = 0;
const fail = (msg: string) => {
  console.log(`  FAIL  ${msg}`);
  failures++;
};

// ---- 1. the engine --------------------------------------------------------
const dag = JSON.parse(readFileSync("data/dag.json", "utf8")) as Dag;
const idx = indexDag(dag);
const frontierIds = JSON.parse(readFileSync("data/demo.json", "utf8")).frontier.frontier.map((f: { nodeId: string }) => f.nodeId);

console.log(`engine — ${RUNS} runs of the rehearsed student`);
const engineSigs = new Set<string>();
const probeCounts = new Set<number>();
for (let i = 0; i < RUNS; i++) {
  const st = runDiagnostic(idx, frontierIds, syntheticStudent(idx, REHEARSED));
  engineSigs.add(hash({ probes: st.steps.map((s) => [s.chosen, s.correct]), roots: rootGaps(st, idx) }));
  probeCounts.add(st.steps.length);
}
const sample = runDiagnostic(idx, frontierIds, syntheticStudent(idx, REHEARSED));
const roots = rootGaps(sample, idx);
console.log(`  probes: ${sample.steps.length}  roots: ${roots.join(", ")}`);
if (engineSigs.size !== 1) fail(`${engineSigs.size} distinct probe sequences across ${RUNS} runs`);
if (probeCounts.size !== 1) fail(`probe count varied: ${[...probeCounts].join(", ")}`);
for (const r of REHEARSED) if (!roots.includes(r)) fail(`rehearsed gap "${r}" was not found`);

// ---- 2. the served demo path ---------------------------------------------
console.log(`\nserved demo path — ${RUNS} runs against ${BASE}`);
const stageSigs: Record<string, Set<string>> = {};
const stageMs: Record<string, number[]> = {};
const record = (stage: string, sig: string, ms: number) => {
  (stageSigs[stage] ??= new Set()).add(sig);
  (stageMs[stage] ??= []).push(ms);
};

for (let i = 0; i < RUNS; i++) {
  let t = Date.now();
  const f = await post("/api/frontier", { demo: true });
  record("frontier", hash(f), Date.now() - t);

  const gaps = REHEARSED.map((nodeId) => ({ nodeId, misconception: idx.byId.get(nodeId)!.misconceptions[0] }));
  t = Date.now();
  const c = await post("/api/crash-course", { demo: true, gaps });
  record("crash-course", hash(c), Date.now() - t);

  for (const plan of c.plans) {
    for (const seg of [...plan.segments, ...plan.alternates]) {
      t = Date.now();
      const n = await post("/api/notes", { demo: true, nodeId: plan.nodeId, misconception: plan.misconception, segment: seg });
      // Keyed per clip: different clips legitimately have different notes; what must
      // not vary is the note for a GIVEN clip.
      record(`notes ${seg.videoId}:${Math.round(seg.start)}`, hash(n), Date.now() - t);
      // A derived fallback here means the frozen note is missing for a reachable clip.
      if (n.note.lines.some((l: string) => l.includes("— in one line:"))) {
        fail(`clip ${seg.videoId}:${Math.round(seg.start)} fell back to a derived note`);
      }
    }
  }

  const plan = c.plans[0];
  const n0 = await post("/api/notes", { demo: true, nodeId: plan.nodeId, segment: plan.segments[0] });
  const answers = Object.fromEntries(n0.note.blanks.map((b: { id: string; answer: string }, j: number) => [b.id, j === 0 ? b.answer : "determinant"]));
  t = Date.now();
  const g = await post("/api/grade", { demo: true, blanks: n0.note.blanks, answers, lines: n0.note.lines });
  record("grade", hash(g), Date.now() - t);
  if (!g.outcomes?.[0]?.reopen) fail("the write-back did not fire on a deliberately failed note");
}

const stat = (a: number[]) => `min ${Math.min(...a)}ms  avg ${(a.reduce((x, y) => x + y, 0) / a.length).toFixed(0)}ms  max ${Math.max(...a)}ms`;
for (const [stage, sigs] of Object.entries(stageSigs)) {
  const ms = stageMs[stage];
  console.log(`  ${stage.padEnd(13)} ${String(sigs.size).padStart(2)} distinct response${sigs.size === 1 ? " " : "s"}  ${stat(ms)}`);
  if (sigs.size !== 1) fail(`${stage} returned ${sigs.size} different responses across ${RUNS} runs`);
  if (Math.max(...ms) > BUDGET_MS) fail(`${stage} peaked at ${Math.max(...ms)}ms (budget ${BUDGET_MS}ms)`);
}

console.log(failures === 0 ? `\nOK — ${RUNS} runs, deterministic and inside budget.` : `\n${failures} problem(s).`);
process.exit(failures === 0 ? 0 : 1);
