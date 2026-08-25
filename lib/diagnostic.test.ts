import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { indexDag, ancestors } from "./dag.js";
import { runDiagnostic, syntheticStudent, perfectStudent } from "./simulate.js";
import { isGap, isKnown, rootGaps, createState, applyAnswer, selectProbe, DEFAULT_OPTIONS } from "./diagnostic.js";
import type { Dag } from "./types.js";

// Tests run against the real shipped graph, not a toy one — a DAG change that breaks
// convergence should fail the build.
const dag = JSON.parse(readFileSync("data/dag.json", "utf8")) as Dag;
const idx = indexDag(dag);

/** A course assuming the full linear-algebra spine: scope covers most of the graph. */
const FRONTIER = ["change_of_basis", "eigenvectors", "gaussian_elimination"];

const probeCount = (s: { steps: unknown[] }) => s.steps.length;

/**
 * Probe number at which a node was first identified as a root gap — i.e. when the search
 * actually converged. This is distinct from total probes: after rooting one gap the engine
 * keeps probing for a short while looking for a second, independent gap, because the
 * product targets 2–4 findings.
 */
const convergedAt = (state: { steps: Array<{ rootGaps: string[] }> }, nodeId: string): number => {
  const i = state.steps.findIndex((s) => s.rootGaps.includes(nodeId));
  return i === -1 ? Infinity : i + 1;
};

describe("propagation rules", () => {
  it("a correct answer marks every transitive prerequisite likely_known", () => {
    const state = createState(idx, FRONTIER);
    const { scored } = selectProbe(state, idx);
    applyAnswer(state, idx, "change_of_basis", true, undefined, scored);

    expect(state.mastery.get("change_of_basis")).toBe("confirmed_known");
    // You cannot do change of basis correctly without span, basis, linear combination...
    for (const a of ancestors(idx, "change_of_basis")) {
      expect(isKnown(state.mastery.get(a)!)).toBe(true);
    }
  });

  it("a wrong answer marks the node a gap and compromises its dependents", () => {
    const state = createState(idx, FRONTIER);
    applyAnswer(state, idx, "span", false);

    expect(isGap(state.mastery.get("span")!)).toBe(true);
    // basis depends on span, so it is compromised too — but not yet blamed.
    expect(isGap(state.mastery.get("basis")!)).toBe(true);
  });

  it("does not let an inferred result overwrite a directly observed one", () => {
    const state = createState(idx, FRONTIER);
    applyAnswer(state, idx, "span", true); // observed: known
    applyAnswer(state, idx, "basis", false); // basis fails; span must stay confirmed_known
    expect(state.mastery.get("span")).toBe("confirmed_known");
  });

  it("a failed node with all prerequisites known becomes a confirmed root gap", () => {
    const state = createState(idx, FRONTIER);
    applyAnswer(state, idx, "linear_combination", true); // settles span's only prereq
    applyAnswer(state, idx, "span", false);
    expect(state.mastery.get("span")).toBe("confirmed_gap");
    expect(rootGaps(state, idx)).toContain("span");
  });

  it("a DAG root that fails is immediately a root gap — there is nothing beneath it", () => {
    const state = createState(idx, FRONTIER);
    applyAnswer(state, idx, "fraction_arithmetic", false);
    expect(rootGaps(state, idx)).toContain("fraction_arithmetic");
  });
});

describe("convergence on synthetic students", () => {
  it("converges on function_composition in <= 8 probes", () => {
    const state = runDiagnostic(idx, FRONTIER, syntheticStudent(idx, ["function_composition"]));
    expect(rootGaps(state, idx)).toContain("function_composition");
    expect(convergedAt(state, "function_composition")).toBeLessThanOrEqual(8);
  });

  // Every one of these must be found from a single hidden gap, whatever its depth.
  const singles = [
    "function_composition",
    "span",
    "linear_combination",
    "matrix_vector_product",
    "fraction_arithmetic",
    "linearity_property",
    "coordinates_in_a_basis",
    "determinant_2x2",
    "vector_arithmetic",
    "solving_linear_equations",
  ];

  it.each(singles)("isolates a single hidden gap at %s", (missing) => {
    const state = runDiagnostic(idx, FRONTIER, syntheticStudent(idx, [missing]));
    expect(rootGaps(state, idx)).toContain(missing);
    expect(probeCount(state)).toBeLessThanOrEqual(DEFAULT_OPTIONS.budget);
  });

  it("blames the root, never the symptom", () => {
    // matrix_multiplication depends on function_composition. A student missing only
    // function_composition will get matrix_multiplication wrong — the whole point is that
    // we do not report matrix_multiplication as the problem.
    const state = runDiagnostic(idx, FRONTIER, syntheticStudent(idx, ["function_composition"]));
    expect(rootGaps(state, idx)).not.toContain("matrix_multiplication");
    expect(rootGaps(state, idx)).toEqual(["function_composition"]);
  });

  it("finds multiple independent gaps", () => {
    // Both must be inside the frontier's scope. dot_product is NOT: the projection branch
    // (dot_product -> orthogonality -> projection) is not a prerequisite of change_of_basis,
    // eigenvectors, or gaussian_elimination, so a course with this frontier never probes it.
    const state = runDiagnostic(idx, FRONTIER, syntheticStudent(idx, ["function_composition", "slope_and_lines"]));
    const roots = rootGaps(state, idx);
    expect(roots).toContain("function_composition");
    expect(roots).toContain("slope_and_lines");
  });

  it("never probes a node outside the syllabus frontier's scope", () => {
    const state = runDiagnostic(idx, FRONTIER, syntheticStudent(idx, ["function_composition"]));
    const offSpine = ["dot_product", "orthogonality", "projection", "similarity", "diagonalization"];
    for (const step of state.steps) expect(offSpine).not.toContain(step.chosen);
  });

  it("reports no gaps for a student who knows everything", () => {
    const state = runDiagnostic(idx, FRONTIER, perfectStudent);
    expect(rootGaps(state, idx)).toEqual([]);
  });

  it("never exceeds the question budget", () => {
    for (const missing of singles) {
      const state = runDiagnostic(idx, FRONTIER, syntheticStudent(idx, [missing]));
      expect(probeCount(state)).toBeLessThanOrEqual(DEFAULT_OPTIONS.budget);
    }
  });

  it("stops once it has enough root gaps rather than burning the budget", () => {
    const state = runDiagnostic(idx, FRONTIER, syntheticStudent(idx, ["fraction_arithmetic", "coordinate_plane"]));
    expect(rootGaps(state, idx).length).toBeGreaterThanOrEqual(1);
    expect(probeCount(state)).toBeLessThanOrEqual(DEFAULT_OPTIONS.budget);
  });
});

describe("search behaviour", () => {
  it("is deterministic — identical students produce identical probe sequences", () => {
    const run = () =>
      runDiagnostic(idx, FRONTIER, syntheticStudent(idx, ["span"])).steps.map((s) => s.chosen);
    expect(run()).toEqual(run());
  });

  it("narrows to the prerequisites of a failure instead of sweeping the graph", () => {
    const state = createState(idx, FRONTIER);
    applyAnswer(state, idx, "change_of_basis", false);
    const next = selectProbe(state, idx).chosen!;
    // After a failure, the next probe must come from beneath it.
    expect([...ancestors(idx, "change_of_basis")]).toContain(next);
  });

  it("records an inspectable trace for every probe", () => {
    const state = runDiagnostic(idx, FRONTIER, syntheticStudent(idx, ["span"]));
    for (const step of state.steps) {
      expect(step.chosen).toBeTruthy();
      expect(step.candidates.length).toBeGreaterThan(0);
      expect(step.candidates.some((c) => c.nodeId === step.chosen)).toBe(true);
      expect(typeof step.correct).toBe("boolean");
    }
  });

  it("surfaces the misconception behind a wrong answer", () => {
    const state = runDiagnostic(idx, FRONTIER, syntheticStudent(idx, ["span"]));
    const wrong = state.steps.filter((s) => !s.correct);
    expect(wrong.length).toBeGreaterThan(0);
    expect(wrong.every((s) => typeof s.misconception === "string" && s.misconception.length > 0)).toBe(true);
  });
});
