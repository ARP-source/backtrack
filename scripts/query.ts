/**
 * M1 verification harness. Prints the top-ranked transcript chunks for a query.
 * If retrieval is bad here, nothing downstream can save it.
 *
 *   npm run query -- "what does matrix multiplication mean"
 *   npm run query -- --node change_of_basis          (uses label + blurb)
 *   npm run query -- --node change_of_basis --mis 0  (adds misconception #0)
 *   npm run query -- --coverage                      (best chunk for every DAG node)
 */
import { readFileSync } from "node:fs";
import { pipeline, env } from "@huggingface/transformers";
import { rankChunks, gapQueryText } from "../lib/retrieval.js";
import { indexDag } from "../lib/dag.js";
import type { Dag, TranscriptChunk } from "../lib/types.js";

env.cacheDir = "./.cache";

const { meta, chunks } = JSON.parse(readFileSync("data/chunks.json", "utf8")) as {
  meta: Record<string, { title: string; channel: string }>;
  chunks: TranscriptChunk[];
};
const dag = JSON.parse(readFileSync("data/dag.json", "utf8")) as Dag;
const idx = indexDag(dag);

const extract = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
const embed = async (text: string): Promise<number[]> => {
  const out = await extract([text], { pooling: "mean", normalize: true });
  return Array.from(out.data as Float32Array);
};

const argv = process.argv.slice(2);
const flag = (name: string) => {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
};

const ts = (s: number) => {
  const t = Math.round(s);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

if (argv.includes("--coverage")) {
  // Does every node in the DAG have *something* in the corpus that speaks to it?
  // A node whose best match is weak is a node the crash course cannot remediate.
  console.log("best chunk per node (score | video | timestamp)\n");
  const weak: string[] = [];
  for (const node of [...dag.nodes].sort((a, b) => a.depth - b.depth)) {
    const q = await embed(gapQueryText(node));
    const [top] = rankChunks(q, chunks, 1);
    const m = meta[top.videoId];
    if (top.score < 0.35) weak.push(node.id);
    console.log(
      `${top.score.toFixed(3)}  ${node.id.padEnd(26)} -> ${m.channel.padEnd(19)} ${ts(top.start)}  ${m.title.slice(0, 42)}`
    );
  }
  console.log(weak.length ? `\nWEAK COVERAGE (<0.35): ${weak.join(", ")}` : `\nAll ${dag.nodes.length} nodes have a match at >= 0.35.`);
} else {
  const nodeId = flag("--node");
  let query: string;
  if (nodeId) {
    const node = idx.byId.get(nodeId);
    if (!node) throw new Error(`no such node "${nodeId}"`);
    const misIdx = flag("--mis");
    const mis = misIdx !== undefined ? node.misconceptions[Number(misIdx)] : undefined;
    query = gapQueryText(node, mis);
  } else {
    query = argv.filter((a) => !a.startsWith("--")).join(" ");
  }
  if (!query) throw new Error("give a query string or --node <id>");

  console.log(`query: ${query}\n`);
  const k = Number(flag("--k") ?? 5);
  for (const [i, r] of rankChunks(await embed(query), chunks, k).entries()) {
    const m = meta[r.videoId];
    console.log(`${i + 1}. ${r.score.toFixed(3)}  ${m.channel} — ${m.title}`);
    console.log(`   ${ts(r.start)}–${ts(r.end)}  https://youtu.be/${r.videoId}?t=${Math.floor(r.start)}`);
    console.log(`   ${r.text.slice(0, 190)}...\n`);
  }
}
