/**
 * End-to-end, headless: synthetic student -> diagnostic -> root gaps -> verified clips.
 *
 *   npm run crash-course -- --missing function_composition
 *   npm run crash-course -- --missing span,slope_and_lines
 *   npm run crash-course -- --missing span --no-llm     (force the fixture path)
 */
import { readFileSync } from "node:fs";
import { pipeline, env } from "@huggingface/transformers";
import { indexDag } from "../lib/dag.js";
import { runDiagnostic, syntheticStudent } from "../lib/simulate.js";
import { rootGaps } from "../lib/diagnostic.js";
import { buildCrashCourse, embedUrl, type VideoMetaMap } from "../lib/crash-course.js";
import { MODEL, hasApiKey } from "../lib/llm.js";
import type { Dag, TranscriptChunk } from "../lib/types.js";

env.cacheDir = "./.cache";

const argv = process.argv.slice(2);
const flag = (n: string) => {
  const i = argv.indexOf(n);
  return i === -1 ? undefined : argv[i + 1];
};
if (argv.includes("--no-llm")) delete process.env.GEMINI_API_KEY;
// --cold simulates a dead network on a machine with no warm cache: the true fixture path.
if (argv.includes("--cold")) {
  delete process.env.GEMINI_API_KEY;
  process.env.BACKTRACK_NO_CACHE = "1";
}

const dag = JSON.parse(readFileSync("data/dag.json", "utf8")) as Dag;
const { meta, chunks } = JSON.parse(readFileSync("data/chunks.json", "utf8")) as {
  meta: VideoMetaMap;
  chunks: TranscriptChunk[];
};
const idx = indexDag(dag);

const missing = (flag("--missing") ?? "function_composition").split(",");
const frontier = (flag("--frontier") ?? "change_of_basis,eigenvectors,gaussian_elimination").split(",");
for (const id of [...missing, ...frontier]) if (!idx.byId.has(id)) throw new Error(`no such node "${id}"`);

// ---- diagnose -------------------------------------------------------------
const state = runDiagnostic(idx, frontier, syntheticStudent(idx, missing));
const roots = rootGaps(state, idx);
console.log(`${state.steps.length} probes -> root gaps: ${roots.join(", ") || "none"}`);
if (roots.length === 0) {
  console.log("no gaps found; nothing to remediate.");
  process.exit(0);
}

// The misconception a wrong answer revealed is what sharpens the retrieval query.
const misconceptionFor = (nodeId: string) =>
  state.steps.find((s) => s.chosen === nodeId && !s.correct)?.misconception;

const gaps = roots.map((id) => ({ node: idx.byId.get(id)!, misconception: misconceptionFor(id) }));

// ---- retrieve + verify ----------------------------------------------------
console.log(`model: ${MODEL}   api key: ${hasApiKey() ? "present" : "ABSENT (fixture path)"}\n`);

const extract = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
const embed = async (text: string) => {
  const out = await extract([text], { pooling: "mean", normalize: true });
  return Array.from(out.data as Float32Array);
};

const t0 = Date.now();
const plans = await buildCrashCourse(gaps, chunks, meta, embed);
const ts = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

for (const plan of plans) {
  console.log("=".repeat(76));
  console.log(`GAP: ${plan.label}`);
  if (plan.misconception) console.log(`     you think: ${plan.misconception}`);
  console.log(
    `     ${plan.considered} candidates -> ${plan.considered - plan.rejected} teach it -> ` +
      `${plan.segments.length} clips, ${ts(plan.totalSec)} total   [${plan.source}]`
  );
  if (plan.note) console.log(`     note: ${plan.note}`);
  console.log();
  for (const s of plan.segments) {
    console.log(`  ${ts(s.start)}–${ts(s.end)}  ${s.channel} — ${s.title}`);
    console.log(`     why: ${s.why_this_clip}`);
    console.log(`     ${embedUrl(s)}`);
    console.log();
  }
  if (plan.segments.length === 0) console.log("  (nothing survived verification)\n");
}

const totalMin = plans.reduce((a, p) => a + p.totalSec, 0) / 60;
console.log("=".repeat(76));
console.log(
  `${plans.length} gaps, ${plans.reduce((a, p) => a + p.segments.length, 0)} clips, ` +
    `${totalMin.toFixed(1)} min of video, built in ${((Date.now() - t0) / 1000).toFixed(1)}s`
);
