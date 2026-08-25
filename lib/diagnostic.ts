/**
 * Backward diagnostic search over the prerequisite DAG.
 * Pure logic — no React, no network, no LLM. Every decision is inspectable via `steps`.
 *
 * The search is a binary search over a partial order. Each probe is chosen to split the
 * unresolved set as evenly as possible, so a handful of questions settles a graph that
 * would take 30+ to walk exhaustively.
 */
import type { Mastery, NodeId } from "./types.js";
import { ancestors, descendants, type DagIndex } from "./dag.js";

export const isKnown = (m: Mastery) => m === "likely_known" || m === "confirmed_known";
export const isGap = (m: Mastery) => m === "likely_gap" || m === "confirmed_gap";
export const isResolved = (m: Mastery) => m !== "unknown";

export type CandidateScore = {
  nodeId: NodeId;
  /** Unresolved nodes that a correct answer would settle (the node + its ancestors). */
  passSettled: number;
  /** Unresolved nodes that a wrong answer would settle (the node + its dependents). */
  failSettled: number;
  priorGap: number;
  /**
   * Guaranteed progress: how many unresolved nodes this probe settles in its *weaker*
   * branch. Higher is a better question.
   */
  gain: number;
};

export type ProbeStep = {
  index: number;
  chosen: NodeId;
  candidates: CandidateScore[];
  correct: boolean;
  misconception?: string;
  propagated: Array<{ nodeId: NodeId; from: Mastery; to: Mastery }>;
  rootGaps: NodeId[];
};

export type DiagnosticState = {
  mastery: Map<NodeId, Mastery>;
  /** Nodes the course assumes you already know. */
  frontier: NodeId[];
  /** Frontier plus every transitive prerequisite — the only nodes worth probing. */
  scope: Set<NodeId>;
  steps: ProbeStep[];
};

export type DiagnosticOptions = {
  budget: number;
  maxRootGaps: number;
  /**
   * Once every observed failure has been traced to a root, further probes are speculative
   * — hunting for an independent second gap that may not exist. Stop after this many
   * consecutive correct answers rather than spending the whole budget on a student who
   * only had one problem.
   */
  stopAfterCleanStreak: number;
};

export const DEFAULT_OPTIONS: DiagnosticOptions = { budget: 10, maxRootGaps: 3, stopAfterCleanStreak: 2 };

export function createState(idx: DagIndex, frontier: NodeId[]): DiagnosticState {
  const scope = new Set<NodeId>();
  for (const f of frontier) {
    scope.add(f);
    for (const a of ancestors(idx, f)) scope.add(a);
  }
  const mastery = new Map<NodeId, Mastery>();
  for (const id of scope) mastery.set(id, "unknown");
  return { mastery, frontier, scope, steps: [] };
}

const at = (s: DiagnosticState, id: NodeId): Mastery => s.mastery.get(id) ?? "unknown";

/**
 * Prior probability that a node is a gap. Deeper material is both more recent and more
 * dependent, so it fails more often. Kept mild — the split metric should dominate.
 */
export function priorGap(idx: DagIndex, id: NodeId): number {
  const depth = idx.byId.get(id)?.depth ?? 0;
  const maxDepth = 12;
  return 0.35 + 0.3 * Math.min(1, depth / maxDepth);
}

/**
 * A gap whose prerequisites are all known: the student failed here, but everything this
 * rests on is intact. This is "here's when you started being wrong".
 */
export function isRootGap(state: DiagnosticState, idx: DagIndex, id: NodeId): boolean {
  if (!isGap(at(state, id))) return false;
  const prereqs = idx.prereqs.get(id) ?? [];
  return prereqs.every((p) => isKnown(at(state, p)));
}

export function rootGaps(state: DiagnosticState, idx: DagIndex): NodeId[] {
  return [...state.scope].filter((id) => isRootGap(state, idx, id)).sort();
}

/**
 * Failures we have not yet traced to a root — what the search descends into.
 *
 * Only *directly observed* failures count. Failing a node also marks its dependents
 * `likely_gap` by inference, but those inferred gaps are already explained by the
 * observed one; treating them as separate leads to chase would union their ancestor sets
 * back out to nearly the whole graph and defeat the narrowing entirely.
 */
function openGaps(state: DiagnosticState, idx: DagIndex): NodeId[] {
  const observed = state.steps.filter((s) => !s.correct).map((s) => s.chosen);
  return [...new Set(observed)].filter((id) => !isRootGap(state, idx, id));
}

/**
 * Which nodes are worth probing right now. Once something has failed, the search narrows
 * to that failure's prerequisites — that is what makes this a *backward* search rather
 * than a sweep of the whole graph.
 */
export function candidates(state: DiagnosticState, idx: DagIndex): NodeId[] {
  const unresolved = (id: NodeId) => !isResolved(at(state, id));
  const open = openGaps(state, idx);
  if (open.length > 0) {
    const region = new Set<NodeId>();
    for (const g of open) for (const a of ancestors(idx, g)) if (state.scope.has(a)) region.add(a);
    const narrowed = [...region].filter(unresolved);
    if (narrowed.length > 0) return narrowed.sort();
  }
  return [...state.scope].filter(unresolved).sort();
}

export function scoreCandidate(state: DiagnosticState, idx: DagIndex, id: NodeId): CandidateScore {
  const unresolvedIn = (ids: Iterable<NodeId>) => {
    let n = 0;
    for (const x of ids) if (state.scope.has(x) && !isResolved(at(state, x))) n++;
    return n;
  };
  // Pass settles this node and everything upstream of it; fail settles it and everything
  // downstream (you cannot do the dependents without it).
  const passSettled = 1 + unresolvedIn(ancestors(idx, id));
  const failSettled = 1 + unresolvedIn(descendants(idx, id));
  const p = priorGap(idx, id);
  // Minimax: the worst case for a probe is whichever branch settles less, so maximise
  // that weaker branch. This rewards an even split AND a large one.
  //
  // Scoring purely on |passSettled - failSettled| looks equivalent but is not: it treats
  // a perfectly balanced 2-vs-2 probe as better than a 5-vs-5 one, because it measures
  // only the *shape* of the split and never its size. That wastes questions on nodes
  // whose answer barely moves the search. With p = 0.5 this reduces to
  // 0.5 * min(passSettled, failSettled), preserving the plain even-split intuition.
  const gain = Math.min((1 - p) * passSettled, p * failSettled);
  return { nodeId: id, passSettled, failSettled, priorGap: Number(p.toFixed(3)), gain: Number(gain.toFixed(3)) };
}

/** The probe that most evenly splits what is still unresolved. Deterministic. */
export function selectProbe(state: DiagnosticState, idx: DagIndex): { chosen: NodeId | null; scored: CandidateScore[] } {
  const scored = candidates(state, idx)
    .map((id) => scoreCandidate(state, idx, id))
    .sort(
      (a, b) =>
        b.gain - a.gain ||
        b.passSettled + b.failSettled - (a.passSettled + a.failSettled) ||
        a.nodeId.localeCompare(b.nodeId)
    );
  return { chosen: scored[0]?.nodeId ?? null, scored };
}

/** Applies one answer and propagates. Returns the recorded step. */
export function applyAnswer(
  state: DiagnosticState,
  idx: DagIndex,
  nodeId: NodeId,
  correct: boolean,
  misconception?: string,
  candidatesScored: CandidateScore[] = []
): ProbeStep {
  const propagated: ProbeStep["propagated"] = [];
  const set = (id: NodeId, to: Mastery) => {
    const from = at(state, id);
    if (from === to) return;
    // Directly observed results outrank inferred ones.
    if (from === "confirmed_known" || from === "confirmed_gap") return;
    state.mastery.set(id, to);
    propagated.push({ nodeId: id, from, to });
  };

  if (correct) {
    state.mastery.set(nodeId, "confirmed_known");
    propagated.push({ nodeId, from: at(state, nodeId), to: "confirmed_known" });
    // You cannot answer correctly here without everything upstream being intact.
    for (const a of ancestors(idx, nodeId)) if (state.scope.has(a)) set(a, "likely_known");
  } else {
    set(nodeId, "likely_gap");
    // Everything downstream rests on this, so it is compromised too — but only where we
    // have no direct evidence to the contrary.
    for (const d of descendants(idx, nodeId)) {
      if (state.scope.has(d) && at(state, d) === "unknown") set(d, "likely_gap");
    }
  }

  // Promote any gap whose prerequisites have all come back clean.
  for (const id of state.scope) {
    if (at(state, id) === "likely_gap" && isRootGap(state, idx, id)) {
      const from = at(state, id);
      state.mastery.set(id, "confirmed_gap");
      propagated.push({ nodeId: id, from, to: "confirmed_gap" });
    }
  }

  const step: ProbeStep = {
    index: state.steps.length,
    chosen: nodeId,
    candidates: candidatesScored,
    correct,
    misconception,
    propagated,
    rootGaps: rootGaps(state, idx),
  };
  state.steps.push(step);
  return step;
}

/** True when the search should stop: enough roots found, budget gone, or nothing left to ask. */
export function isComplete(state: DiagnosticState, idx: DagIndex, opts: DiagnosticOptions): boolean {
  if (rootGaps(state, idx).length >= opts.maxRootGaps) return true;
  if (state.steps.length >= opts.budget) return true;
  if (candidates(state, idx).length === 0) return true;

  // Nothing left to trace and the student keeps answering correctly — stop guessing.
  if (rootGaps(state, idx).length >= 1 && openGaps(state, idx).length === 0) {
    let streak = 0;
    for (let i = state.steps.length - 1; i >= 0 && state.steps[i].correct; i--) streak++;
    if (streak >= opts.stopAfterCleanStreak) return true;
  }
  return false;
}
