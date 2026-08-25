import { NextResponse } from "next/server";
import { getDag, getIndex, getProbes, getSampleSyllabus } from "@/lib/server-data";
import { mapSyllabus, computeFrontier, fallbackMapping } from "@/lib/syllabus";
import { probeFor } from "@/lib/probes";
import { createState } from "@/lib/diagnostic";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const demo = body?.demo === true;
  const syllabus = String(body?.syllabus ?? "").trim() || getSampleSyllabus();

  const dag = getDag();
  const idx = getIndex();

  // Demo mode never touches the network — the committed mapping, every time.
  const result = demo
    ? { value: fallbackMapping(), source: "fixture" as const, ms: 0, note: "demo mode" }
    : await mapSyllabus(syllabus, dag);

  const frontier = computeFrontier(result.value, idx).filter((f) => idx.byId.has(f.nodeId));

  // Scope is what the diagnostic can actually ask about: the frontier plus everything
  // underneath it. Ship the probes for exactly that set so the client can run the whole
  // diagnostic with no further round trips.
  const state = createState(idx, frontier.map((f) => f.nodeId));
  const probeBook = getProbes();
  const probes = Object.fromEntries(
    [...state.scope].map((id) => [id, probeFor(probeBook, idx.byId.get(id)!)])
  );

  // Scope is closed under prerequisites, so the subgraph is self-contained: the client can
  // run the entire diagnostic locally with no further round trips and no bundled dataset.
  const nodes = [...state.scope].map((id) => idx.byId.get(id)!);

  return NextResponse.json({
    courseTitle: result.value.courseTitle,
    mapping: result.value,
    frontier,
    scope: [...state.scope],
    nodes,
    probes,
    source: result.source,
    note: result.note,
    ms: result.ms,
  });
}
