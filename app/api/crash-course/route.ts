import { NextResponse } from "next/server";
import { getIndex, getChunks, embed } from "@/lib/server-data";
import { buildCrashCourse } from "@/lib/crash-course";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const raw: Array<{ nodeId: string; misconception?: string }> = Array.isArray(body?.gaps) ? body.gaps : [];
  if (raw.length === 0) return NextResponse.json({ plans: [] });

  const idx = getIndex();
  const { meta, chunks } = getChunks();

  const gaps = raw
    .filter((g) => idx.byId.has(g.nodeId))
    .slice(0, 4)
    .map((g) => ({ node: idx.byId.get(g.nodeId)!, misconception: g.misconception }));

  try {
    const plans = await buildCrashCourse(gaps, chunks, meta, embed);
    return NextResponse.json({ plans });
  } catch (e) {
    // buildCrashCourse already falls back per gap; this catches an embedder failure,
    // which would otherwise take out the whole screen.
    return NextResponse.json(
      { plans: [], error: String((e as Error).message).slice(0, 200) },
      { status: 200 }
    );
  }
}
