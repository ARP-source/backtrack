/**
 * Server-only data access. Everything is read from disk once and memoised — there are no
 * network calls here, and never any call to YouTube at request time.
 */
import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { indexDag, type DagIndex } from "./dag";
import type { Dag, TranscriptChunk } from "./types";
import type { ProbeBook } from "./probes";
import type { VideoMetaMap } from "./crash-course";

// Statically scoped to data/ — an unscoped process.cwd() join makes the bundler trace the
// entire project into the server output.
const DATA = join(process.cwd(), "data");
const read = <T,>(name: string): T => JSON.parse(readFileSync(join(DATA, name), "utf8")) as T;

let _dag: Dag | null = null;
let _idx: DagIndex | null = null;
let _chunks: { meta: VideoMetaMap; chunks: TranscriptChunk[] } | null = null;
let _probes: ProbeBook | null = null;
let _syllabus: string | null = null;

export function getDag(): Dag {
  return (_dag ??= read<Dag>("dag.json"));
}

export function getIndex(): DagIndex {
  return (_idx ??= indexDag(getDag()));
}

export function getChunks() {
  return (_chunks ??= read<{ meta: VideoMetaMap; chunks: TranscriptChunk[] }>("chunks.json"));
}

export function getProbes(): ProbeBook {
  return (_probes ??= read<ProbeBook>("probes.json"));
}

export function getSampleSyllabus(): string {
  return (_syllabus ??= readFileSync(join(DATA, "syllabus-sample.txt"), "utf8"));
}

/** Lazily loaded embedding pipeline, shared across requests. ~90MB of weights, load once. */
let extractor: Promise<any> | null = null;

export async function embed(text: string): Promise<number[]> {
  if (!extractor) {
    extractor = (async () => {
      const { pipeline, env } = await import("@huggingface/transformers");
      env.cacheDir = "./.cache";
      return pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
    })();
  }
  const extract = await extractor;
  const out = await extract([text], { pooling: "mean", normalize: true });
  return Array.from(out.data as Float32Array);
}
