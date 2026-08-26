import { NextResponse } from "next/server";
import { getIndex, getChunks, embed, getDemo } from "@/lib/server-data";
import { buildCrashCourse } from "@/lib/crash-course";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const raw: Array<{ nodeId: string; misconception?: string }> = Array.isArray(body?.gaps) ? body.gaps : [];
  if (raw.length === 0) return NextResponse.json({ plans: [] });

  // Demo mode: serve the frozen plans for whichever rehearsed gaps were asked for.
  // No embedding model load, no retrieval, no verification call.
  if (body?.demo === true) {
    const frozen = getDemo();
    if (frozen) {
      const byId = new Map((frozen.plans as Array<{ nodeId: string }>).map((p) => [p.nodeId, p]));
      const idx2 = getIndex();
      // Answering off-script can surface a gap the frozen run does not cover. Say so,
      // rather than silently dropping it and showing fewer gaps than the findings listed.
      const plans = raw.map((g) => {
        const hit = byId.get(g.nodeId);
        if (hit) return hit;
        const node = idx2.byId.get(g.nodeId);
        return {
          nodeId: g.nodeId,
          label: node?.label ?? g.nodeId,
          blurb: node?.blurb ?? "",
          misconception: g.misconception,
          segments: [],
          alternates: [],
          totalSec: 0,
          source: "fixture" as const,
          note: "Outside the rehearsed demo run — run without ?demo=1 to retrieve clips for this gap.",
          considered: 0,
          rejected: 0,
        };
      });
      return NextResponse.json({ plans, source: "fixture" });
    }
  }

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
