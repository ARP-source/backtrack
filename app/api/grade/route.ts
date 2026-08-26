import { NextResponse } from "next/server";
import { gradeBlank, outcomeByNode, type GradedBlank } from "@/lib/grade";
import { adjudicate, type NearMiss } from "@/lib/adjudicate";
import { getIndex } from "@/lib/server-data";

export const runtime = "nodejs";
export const maxDuration = 120;

type Blank = { id: string; answer: string; acceptable: string[]; nodeId: string };

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const blanks: Blank[] = Array.isArray(body?.blanks) ? body.blanks : [];
  const answers: Record<string, string> = body?.answers ?? {};
  const lines: string[] = Array.isArray(body?.lines) ? body.lines : [];
  if (blanks.length === 0) return NextResponse.json({ graded: [], outcomes: [] });

  const idx = getIndex();
  let graded: GradedBlank[] = blanks.map((b) => gradeBlank(answers[b.id] ?? "", b));

  // Only genuinely ambiguous answers reach the model — one batched call, never per blank.
  const nearMisses: NearMiss[] = graded
    .filter((g) => g.verdict === "near")
    .map((g) => {
      const b = blanks.find((x) => x.id === g.blankId)!;
      return {
        blankId: b.id,
        input: g.input,
        answer: b.answer,
        acceptable: b.acceptable ?? [],
        concept: idx.byId.get(b.nodeId)?.label ?? b.nodeId,
        line: lines.find((l) => l.includes(`{{${b.id}}}`)) ?? "",
      };
    });

  let source = "none";
  // Fuzzy matching is pure and offline; only adjudication would reach the network, so in
  // demo mode an unresolved near-miss simply does not pass.
  if (body?.demo === true && nearMisses.length > 0) {
    graded = graded.map((g) => (g.verdict === "near" ? { ...g, verdict: "wrong" } : g));
    source = "fixture";
  } else if (nearMisses.length > 0) {
    const res = await adjudicate(nearMisses);
    source = res.source;
    const byId = new Map(res.value.verdicts.map((v) => [v.blankId, v]));
    graded = graded.map((g) =>
      g.verdict === "near"
        ? { ...g, verdict: byId.get(g.blankId)?.correct ? "correct" : "wrong" }
        : g
    );
  }

  return NextResponse.json({
    graded,
    outcomes: outcomeByNode(graded, blanks),
    adjudicated: nearMisses.length,
    source,
  });
}
