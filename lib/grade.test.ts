import { describe, it, expect } from "vitest";
import { gradeBlank, normalize, similarity, outcomeByNode, type GradedBlank } from "./grade";
import { sanitizeNote } from "./notes";
import type { DagNode } from "./types";

const blank = { id: "b1", answer: "columns", acceptable: ["column vectors", "the columns"] };

describe("normalize", () => {
  it("ignores case, punctuation and surrounding space", () => {
    expect(normalize("  The Columns, ")).toBe(normalize("columns"));
  });

  it("drops a leading article, which carries no meaning in a short answer", () => {
    expect(normalize("the origin")).toBe("origin");
    expect(normalize("an eigenvector")).toBe("eigenvector");
  });

  it("does not strip an article mid-answer", () => {
    expect(normalize("where the basis vectors land")).toContain("the");
  });
});

describe("gradeBlank", () => {
  it("accepts an exact answer", () => {
    expect(gradeBlank("columns", blank).verdict).toBe("correct");
  });

  it("accepts a listed alternative phrasing", () => {
    expect(gradeBlank("column vectors", blank).verdict).toBe("correct");
  });

  it("forgives a typo — this is a comprehension check, not a spelling test", () => {
    expect(gradeBlank("colums", blank).verdict).toBe("correct");
    expect(gradeBlank("Columnns", blank).verdict).toBe("correct");
  });

  it("accepts the right idea wrapped in extra words", () => {
    expect(gradeBlank("the columns of the matrix", blank).verdict).toBe("correct");
  });

  it("rejects a different concept outright", () => {
    expect(gradeBlank("determinant", blank).verdict).toBe("wrong");
    expect(gradeBlank("eigenvalue", blank).verdict).toBe("wrong");
  });

  it("marks an empty answer empty, not wrong", () => {
    expect(gradeBlank("   ", blank).verdict).toBe("empty");
  });

  it("escalates a genuine near-miss rather than guessing", () => {
    // Close enough that string distance should not be the one deciding.
    const g = gradeBlank("colunn", { id: "b1", answer: "column", acceptable: [] });
    expect(["correct", "near"]).toContain(g.verdict);
  });

  it("never reports a score outside 0..1", () => {
    for (const input of ["columns", "x", "", "totally unrelated words here"]) {
      const g = gradeBlank(input, blank);
      expect(g.score).toBeGreaterThanOrEqual(0);
      expect(g.score).toBeLessThanOrEqual(1);
    }
  });
});

describe("similarity", () => {
  it("is symmetric", () => {
    expect(similarity("span", "spans")).toBeCloseTo(similarity("spans", "span"), 5);
  });
  it("is 1 for identical strings", () => {
    expect(similarity("basis", "basis")).toBe(1);
  });
});

describe("outcomeByNode — the write-back decision", () => {
  const blanks = [
    { id: "b1", nodeId: "span" },
    { id: "b2", nodeId: "span" },
    { id: "b3", nodeId: "span" },
    { id: "b4", nodeId: "span" },
  ];
  const g = (id: string, verdict: GradedBlank["verdict"]): GradedBlank => ({
    blankId: id,
    input: "",
    verdict,
    score: 0,
  });

  it("does not reopen a node on a single slip", () => {
    const [o] = outcomeByNode(
      [g("b1", "correct"), g("b2", "correct"), g("b3", "correct"), g("b4", "wrong")],
      blanks
    );
    expect(o.reopen).toBe(false);
    expect(o.missed).toBe(1);
  });

  it("reopens when half or more came back wrong", () => {
    const [o] = outcomeByNode(
      [g("b1", "correct"), g("b2", "correct"), g("b3", "wrong"), g("b4", "wrong")],
      blanks
    );
    expect(o.reopen).toBe(true);
  });

  it("counts a skipped blank as missed — not answering is not passing", () => {
    const [o] = outcomeByNode(
      [g("b1", "correct"), g("b2", "correct"), g("b3", "empty"), g("b4", "empty")],
      blanks
    );
    expect(o.reopen).toBe(true);
  });

  it("never reopens a node the student got entirely right", () => {
    const [o] = outcomeByNode(blanks.map((b) => g(b.id, "correct")), blanks);
    expect(o.reopen).toBe(false);
    expect(o.correct).toBe(4);
  });

  it("keeps nodes separate", () => {
    const mixed = [
      { id: "b1", nodeId: "span" },
      { id: "b2", nodeId: "basis" },
    ];
    const out = outcomeByNode([g("b1", "wrong"), g("b2", "correct")], mixed);
    expect(out.find((o) => o.nodeId === "span")!.reopen).toBe(true);
    expect(out.find((o) => o.nodeId === "basis")!.reopen).toBe(false);
  });
});

describe("sanitizeNote", () => {
  const node = { id: "span", label: "Span", blurb: "b", depth: 3, prereqs: [], misconceptions: ["x", "y"] } as DagNode;

  it("drops a blank that no line references", () => {
    const out = sanitizeNote(
      {
        lines: ["reachable points form the {{b1}}"],
        blanks: [
          { id: "b1", timestamp: 10, answer: "span", acceptable: [], nodeId: "span" },
          { id: "b2", timestamp: 10, answer: "orphan", acceptable: [], nodeId: "span" },
        ],
      },
      node,
      0,
      100
    );
    expect(out.blanks.map((b) => b.id)).toEqual(["b1"]);
  });

  it("never leaves a raw placeholder with no matching blank", () => {
    const out = sanitizeNote(
      { lines: ["a {{b1}} and a {{bZ}}"], blanks: [{ id: "b1", timestamp: 5, answer: "x", acceptable: [], nodeId: "span" }] },
      node,
      0,
      100
    );
    expect(out.lines.join(" ")).not.toContain("{{bZ}}");
    expect(out.lines.join(" ")).toContain("{{b1}}");
  });

  it("clamps a timestamp into the clip's own range", () => {
    const out = sanitizeNote(
      { lines: ["{{b1}}"], blanks: [{ id: "b1", timestamp: 9999, answer: "x", acceptable: [], nodeId: "span" }] },
      node,
      120,
      200
    );
    expect(out.blanks[0].timestamp).toBe(200);
  });

  it("forces every blank onto the node being remediated", () => {
    const out = sanitizeNote(
      { lines: ["{{b1}}"], blanks: [{ id: "b1", timestamp: 5, answer: "x", acceptable: [], nodeId: "wrong_node" }] },
      node,
      0,
      100
    );
    expect(out.blanks[0].nodeId).toBe("span");
  });
});
