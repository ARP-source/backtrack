import { NextResponse } from "next/server";
import { getIndex, getChunks, getDemo } from "@/lib/server-data";
import { generateNote, fallbackNote } from "@/lib/notes";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Rebuild the spoken text for a span from the cached transcript chunks. */
function textForSpan(videoId: string, start: number, end: number): string {
  const { chunks } = getChunks();
  const overlapping = chunks
    .filter((c) => c.videoId === videoId && c.end > start && c.start < end)
    .sort((a, b) => a.start - b.start);

  // Chunks overlap by ~25s by construction, so naive concatenation repeats sentences.
  // Keep each chunk's text only from where the previous one ended.
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const c of overlapping) {
    for (const sentence of c.text.split(/(?<=[.?!])\s+/)) {
      const key = sentence.trim().toLowerCase();
      if (key.length < 4 || seen.has(key)) continue;
      seen.add(key);
      parts.push(sentence.trim());
    }
  }
  return parts.join(" ").slice(0, 4000);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const seg = body?.segment;
  const idx = getIndex();
  const node = idx.byId.get(String(body?.nodeId ?? seg?.nodeId ?? ""));

  if (!node || !seg?.videoId) {
    return NextResponse.json({ error: "unknown node or segment" }, { status: 400 });
  }

  const start = Number(seg.start) || 0;
  const end = Number(seg.end) || start + 90;

  // Demo mode: every clip the rehearsed run can reach — including the write-back's
  // replacement — already has its note frozen.
  if (body?.demo === true) {
    const frozen = getDemo();
    const hit = frozen?.notes?.[`${seg.videoId}:${Math.round(start)}`];
    if (hit) return NextResponse.json({ note: hit, source: "fixture" });
  }
  const text = textForSpan(seg.videoId, start, end);

  // No transcript for the span means nothing to build blanks from — fall back rather than
  // ask the model to invent content it cannot ground.
  if (text.length < 80) {
    return NextResponse.json({ note: fallbackNote(node), source: "fixture", note_reason: "no transcript for span" });
  }

  const res = await generateNote(node, body?.misconception, {
    videoId: seg.videoId,
    title: String(seg.title ?? ""),
    channel: String(seg.channel ?? ""),
    start,
    end,
    text,
  });

  return NextResponse.json({ note: res.value, source: res.source, note_reason: res.note });
}
