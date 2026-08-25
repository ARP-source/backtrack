/**
 * The only place that talks to a model provider.
 *
 * Every call gets: zod-validated output, one retry, disk cache keyed by input hash, and a
 * deterministic fixture fallback. A missing key, a thrown error, a rate limit, or output
 * that fails validation twice all resolve to the fixture and keep rendering. Nothing
 * downstream needs a try/catch, and nothing downstream knows which provider this is.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { z } from "zod";

/** Pinned, not an alias like `gemini-flash-latest`, so demo behaviour cannot drift. */
export const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.6-flash";

const CACHE_DIR = ".llm-cache";

export type LLMSource = "cache" | "live" | "fixture";

export type LLMResult<T> = {
  value: T;
  source: LLMSource;
  ms: number;
  /** Populated when the call fell back, so the UI can be honest about it. */
  note?: string;
};

export type LLMCall<T> = {
  /** Distinguishes cache entries for different call sites. */
  namespace: string;
  prompt: string;
  /** Gemini responseSchema (JSON Schema subset) — constrains generation. */
  responseSchema: Record<string, unknown>;
  /**
   * The trust boundary. The API's schema promise is not a guarantee.
   * Input type is left open so schemas using .default()/.transform() — where the parsed
   * output differs from the accepted input — still infer T from the OUTPUT side.
   */
  schema: z.ZodType<T, z.ZodTypeDef, any>;
  /** Used whenever a live call cannot produce valid output. */
  fixture: T;
};

export const hasApiKey = (): boolean => Boolean(process.env.GEMINI_API_KEY);

function cachePath(namespace: string, prompt: string): string {
  const hash = createHash("sha256").update(`${MODEL}\n${prompt}`).digest("hex").slice(0, 16);
  return join(CACHE_DIR, `${namespace}-${hash}.json`);
}

function readCache<T>(path: string, schema: z.ZodType<T, z.ZodTypeDef, any>): T | null {
  if (!existsSync(path)) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(readFileSync(path, "utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function writeCache(path: string, value: unknown): void {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(path, JSON.stringify(value, null, 2));
  } catch {
    // A cache write failure must never fail the request.
  }
}

async function generate(prompt: string, responseSchema: Record<string, unknown>): Promise<string> {
  // Imported lazily so the module graph stays loadable with no key and no SDK installed.
  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  const res = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: { responseMimeType: "application/json", responseSchema, temperature: 0 },
  });
  const text = res.text;
  if (!text) throw new Error("empty response");
  return text;
}

export async function callLLM<T>(call: LLMCall<T>): Promise<LLMResult<T>> {
  const started = Date.now();
  const path = cachePath(call.namespace, call.prompt);

  // BACKTRACK_NO_CACHE exists so the cold fixture path can actually be exercised. Without
  // it a cache hit masks the fallback and "it survives a dead network" stays unverified.
  if (process.env.BACKTRACK_NO_CACHE !== "1") {
    const cached = readCache(path, call.schema);
    if (cached !== null) return { value: cached, source: "cache", ms: Date.now() - started };
  }

  if (!hasApiKey()) {
    return {
      value: call.fixture,
      source: "fixture",
      ms: Date.now() - started,
      note: "no GEMINI_API_KEY — using committed fixture",
    };
  }

  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await generate(call.prompt, call.responseSchema);
      const parsed = call.schema.safeParse(JSON.parse(raw));
      if (parsed.success) {
        writeCache(path, parsed.data);
        return { value: parsed.data, source: "live", ms: Date.now() - started };
      }
      lastError = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    } catch (e) {
      lastError = String((e as Error).message ?? e).slice(0, 200);
      // A rate limit will not resolve on an immediate retry — fall back now.
      if (/\b429\b|RESOURCE_EXHAUSTED|quota/i.test(lastError)) break;
    }
  }

  return {
    value: call.fixture,
    source: "fixture",
    ms: Date.now() - started,
    note: `live call failed (${lastError.slice(0, 120)}) — using committed fixture`,
  };
}
