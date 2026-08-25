/**
 * Transcript chunking. Pure logic — no I/O, no network, unit-testable.
 *
 * Overlap is the point: a concept explained across a naive cut boundary is
 * unretrievable from either side of it. Sliding the window by less than its
 * width guarantees every span of ~WINDOW seconds appears intact in some chunk.
 */

export type Cue = { text: string; start: number; end: number };

export type Chunk = {
  videoId: string;
  start: number;
  end: number;
  text: string;
};

export const CHUNK_MIN_SEC = 60;
export const CHUNK_TARGET_SEC = 75;
export const CHUNK_MAX_SEC = 90;
export const CHUNK_STEP_SEC = 50; // 75 - 25 overlap

const ENDS_SENTENCE = /[.?!]["')\]]?$/;

/**
 * @param punctuated When false (auto-generated captions), sentence snapping is
 *   skipped entirely — there are no sentence marks to snap to, and pretending
 *   otherwise produces one chunk swallowing the whole video.
 */
export function chunkCues(videoId: string, cues: Cue[], punctuated: boolean): Chunk[] {
  if (cues.length === 0) return [];
  const chunks: Chunk[] = [];
  let cursor = 0;

  while (cursor < cues.length) {
    const startTime = cues[cursor].start;
    let i = cursor;
    let lastSentenceEnd = -1;

    // Grow the window to at least CHUNK_MIN, then keep going to CHUNK_MAX while
    // remembering the most recent clean sentence boundary.
    while (i < cues.length && cues[i].end - startTime < CHUNK_MAX_SEC) {
      if (punctuated && cues[i].end - startTime >= CHUNK_MIN_SEC && ENDS_SENTENCE.test(cues[i].text)) {
        lastSentenceEnd = i;
        // Past target: a boundary here is good enough, stop hunting for a better one.
        if (cues[i].end - startTime >= CHUNK_TARGET_SEC) break;
      }
      i++;
    }

    const endIdx = lastSentenceEnd >= 0 ? lastSentenceEnd : Math.min(i, cues.length - 1);
    const slice = cues.slice(cursor, endIdx + 1);
    const text = slice.map((c) => c.text).join(" ").replace(/\s+/g, " ").trim();

    if (text.length > 0) {
      chunks.push({ videoId, start: round(slice[0].start), end: round(slice.at(-1)!.end), text });
    }

    // Advance by STEP seconds of wall-clock, not by chunk length — this is what
    // creates the overlap. Guard against zero-advance on pathological cue data.
    const nextTime = startTime + CHUNK_STEP_SEC;
    let next = cues.findIndex((c, idx) => idx > cursor && c.start >= nextTime);
    if (next === -1) break;
    if (next <= cursor) next = cursor + 1;
    cursor = next;
  }

  // The final window often has only a few cues left, producing a runt chunk — e.g. a
  // 5-second outro ("next video, I'll cover X"). Those score deceptively well against
  // topical queries while teaching nothing. Fold any runt back into its predecessor.
  const RUNT_SEC = 30;
  const merged: Chunk[] = [];
  for (const c of chunks) {
    const prev = merged.at(-1);
    if (c.end - c.start < RUNT_SEC && prev) {
      prev.end = Math.max(prev.end, c.end);
      if (!prev.text.endsWith(c.text)) prev.text = `${prev.text} ${c.text}`.replace(/\s+/g, " ").trim();
    } else {
      merged.push({ ...c });
    }
  }
  return merged;
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Both vectors must already be L2-normalised (the embedder does this). */
export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}
