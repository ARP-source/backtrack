/**
 * Offline: chunk cached transcripts and embed them locally. Writes data/chunks.json.
 * No API key needed — all-MiniLM-L6-v2 runs on CPU via onnxruntime.
 * Separate from fetching so chunking can be re-tuned without re-hitting YouTube.
 *
 * Run: npm run build:index
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
// @huggingface/transformers, not @xenova — the latter pulls sharp@0.32, which has no
// prebuilt win32-arm64 binary and fails node-gyp on Snapdragon/Windows-on-ARM machines.
import { pipeline, env } from "@huggingface/transformers";
import { chunkCues, type Cue, type Chunk } from "../lib/chunk";

env.cacheDir = "./.cache";

type CachedTranscript = {
  videoId: string;
  title: string;
  channel: string;
  covers: string[];
  punctuated: boolean;
  cues: Cue[];
};

const files = readdirSync("data/transcripts").filter((f) => f.endsWith(".json"));
if (files.length === 0) {
  console.error("No transcripts. Run `npm run fetch:transcripts` first.");
  process.exit(1);
}

const all: Chunk[] = [];
const meta: Record<string, { title: string; channel: string }> = {};

for (const f of files) {
  const t = JSON.parse(readFileSync(`data/transcripts/${f}`, "utf8")) as CachedTranscript;
  const chunks = chunkCues(t.videoId, t.cues, t.punctuated);
  meta[t.videoId] = { title: t.title, channel: t.channel };
  all.push(...chunks);
  const avg = chunks.length ? (chunks.reduce((a, c) => a + (c.end - c.start), 0) / chunks.length).toFixed(0) : "0";
  console.log(`${t.videoId}  ${String(chunks.length).padStart(3)} chunks  avg ${avg}s  ${t.punctuated ? "" : "(fixed-window)"}`);
}

console.log(`\n${all.length} chunks total. Loading embedding model...`);

const extract = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");

const BATCH = 32;
const embeddings: number[][] = [];
for (let i = 0; i < all.length; i += BATCH) {
  const batch = all.slice(i, i + BATCH).map((c) => c.text);
  const out = await extract(batch, { pooling: "mean", normalize: true });
  const dim = out.dims[1];
  for (let j = 0; j < batch.length; j++) {
    embeddings.push(Array.from(out.data.slice(j * dim, (j + 1) * dim) as Float32Array));
  }
  process.stdout.write(`\rembedding ${Math.min(i + BATCH, all.length)}/${all.length}`);
}

const indexed = all.map((c, i) => ({ ...c, embedding: embeddings[i].map((n) => Math.round(n * 1e5) / 1e5) }));

writeFileSync("data/chunks.json", JSON.stringify({ meta, chunks: indexed }));
const mb = (JSON.stringify(indexed).length / 1e6).toFixed(1);
console.log(`\n\nwrote data/chunks.json — ${indexed.length} chunks, ${embeddings[0].length}-dim, ${mb} MB`);
