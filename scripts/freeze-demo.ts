/**
 * Records the rehearsed demo run to data/demo.json.
 *
 * Demo mode must make ZERO network calls — no model provider, no embedding model load, no
 * retrieval. It replays this file. The recording itself may call the API (or read the
 * warm cache); the demo never does.
 *
 * Run: npm run freeze:demo
 */
import { readFileSync, writeFileSync } from "node:fs";
import { pipeline, env } from "@huggingface/transformers";
import { indexDag } from "../lib/dag";
import { createState, rootGaps } from "../lib/diagnostic";
import { runDiagnostic, syntheticStudent } from "../lib/simulate";
import { probeFor } from "../lib/probes";
import { computeFrontier, fallbackMapping } from "../lib/syllabus";
import { buildCrashCourse, type VideoMetaMap } from "../lib/crash-course";
import { generateNote } from "../lib/notes";
import { MODEL, hasApiKey } from "../lib/llm";
import type { Dag, TranscriptChunk } from "../lib/types";
import type { ProbeBook } from "../lib/probes";

env.cacheDir = "./.cache";

/**
 * The rehearsed student: missing function composition and slope. Both are stated
 * prerequisites of the sample syllabus, they sit in independent branches, and the search
 * roots both inside the question budget.
 */
const REHEARSED = ["function_composition", "slope_and_lines"];

const dag = JSON.parse(readFileSync("data/dag.json", "utf8")) as Dag;
const probeBook = JSON.parse(readFileSync("data/probes.json", "utf8")) as ProbeBook;
const { meta, chunks } = JSON.parse(readFileSync("data/chunks.json", "utf8")) as {
  meta: VideoMetaMap;
  chunks: TranscriptChunk[];
};
const idx = indexDag(dag);

if (!hasApiKey()) {
  console.error("No GEMINI_API_KEY. Freeze the demo with a key so the committed fixtures are");
  console.error("the real verified output, not the similarity-only fallback.");
  process.exit(1);
}

// ---- frontier (already deterministic and offline) --------------------------
const mapping = fallbackMapping();
const frontier = computeFrontier(mapping, idx).filter((f) => idx.byId.has(f.nodeId));
const state = createState(idx, frontier.map((f) => f.nodeId));
const nodes = [...state.scope].map((id) => idx.byId.get(id)!);
const probes = Object.fromEntries([...state.scope].map((id) => [id, probeFor(probeBook, idx.byId.get(id)!)]));

console.log(`${MODEL} — freezing ${REHEARSED.length} rehearsed gaps over a ${state.scope.size}-node scope`);

// ---- the scripted answer set ----------------------------------------------
// Answering inconsistently lands on different gaps — the propagation is doing its job, but
// the fixtures only cover the rehearsed ones. Record the exact click sequence so whoever
// records the video cannot drift off it.
const run = runDiagnostic(idx, frontier.map((f) => f.nodeId), syntheticStudent(idx, REHEARSED));
const LETTERS = "ABCD";
const script = run.steps.map((step, i) => {
  const probe = probes[step.chosen];
  let pick = probe.options.findIndex((o) => o.correct);
  if (!step.correct) {
    const byMis = probe.options.findIndex((o) => !o.correct && o.misconception === step.misconception);
    pick = byMis >= 0 ? byMis : probe.options.findIndex((o) => !o.correct);
  }
  return {
    n: i + 1,
    nodeId: step.chosen,
    label: idx.byId.get(step.chosen)!.label,
    answer: step.correct ? "correct" : "wrong",
    pick: LETTERS[pick] ?? "A",
    option: probe.options[pick]?.text ?? "",
  };
});
console.log(`
scripted answers (${run.steps.length} probes -> ${rootGaps(run, idx).join(", ")}):`);
for (const a of script) console.log(`  ${String(a.n).padStart(2)}. ${a.label.padEnd(30)} ${a.pick}  (${a.answer})`);
console.log();

// ---- retrieval + verification ---------------------------------------------
const extract = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
const embed = async (text: string) => {
  const out = await extract([text], { pooling: "mean", normalize: true });
  return Array.from(out.data as Float32Array);
};

const gaps = REHEARSED.map((id) => {
  const node = idx.byId.get(id);
  if (!node) throw new Error(`no such node "${id}"`);
  return { node, misconception: node.misconceptions[0] };
});

const plans = await buildCrashCourse(gaps, chunks, meta, embed);
for (const p of plans) {
  console.log(`  ${p.nodeId}: ${p.segments.length} shown + ${p.alternates.length} reserve  [${p.source}]`);
}

// ---- guided notes for every clip the demo can reach ------------------------
const notes: Record<string, unknown> = {};
for (const plan of plans) {
  const node = idx.byId.get(plan.nodeId)!;
  // Alternates included: the write-back swaps one in, and it must not need the network.
  for (const seg of [...plan.segments, ...plan.alternates]) {
    const key = `${seg.videoId}:${Math.round(seg.start)}`;
    if (notes[key]) continue;
    const text = spanText(seg.videoId, seg.start, seg.end);
    if (text.length < 80) continue;
    const res = await generateNote(node, plan.misconception, { ...seg, text });
    notes[key] = res.value;
    console.log(`  note ${key}  ${res.value.blanks.length} blanks  [${res.source}]`);
  }
}

function spanText(videoId: string, start: number, end: number): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const c of chunks.filter((c) => c.videoId === videoId && c.end > start && c.start < end).sort((a, b) => a.start - b.start)) {
    for (const sentence of c.text.split(/(?<=[.?!])\s+/)) {
      const k = sentence.trim().toLowerCase();
      if (k.length < 4 || seen.has(k)) continue;
      seen.add(k);
      parts.push(sentence.trim());
    }
  }
  return parts.join(" ").slice(0, 4000);
}

writeFileSync(
  "data/demo.json",
  JSON.stringify(
    {
      recordedWith: MODEL,
      rehearsed: REHEARSED,
      script,
      frontier: { courseTitle: mapping.courseTitle, mapping, frontier, scope: [...state.scope], nodes, probes },
      plans,
      notes,
    },
    null,
    2
  )
);

const size = (readFileSync("data/demo.json").length / 1024).toFixed(0);
console.log(`\nwrote data/demo.json — ${plans.length} gaps, ${Object.keys(notes).length} notes, ${size} KB`);
console.log("Demo mode now runs with zero network calls.");
