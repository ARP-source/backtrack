/**
 * Driving the diagnostic loop, and synthetic students to drive it with.
 * Pure logic. Used by the unit tests and by seeded demo mode.
 */
import type { NodeId } from "./types";
import { ancestors, type DagIndex } from "./dag";
import {
  applyAnswer,
  createState,
  isComplete,
  selectProbe,
  DEFAULT_OPTIONS,
  type DiagnosticOptions,
  type DiagnosticState,
} from "./diagnostic";

export type Oracle = (nodeId: NodeId) => { correct: boolean; misconception?: string };

/**
 * A student missing a specific set of foundations.
 *
 * The realistic part: they get a node wrong if the node *or anything it rests on* is
 * missing. Someone who never understood function composition does not merely fail
 * function-composition questions — they fail matrix multiplication too, which is exactly
 * why "you got matrix multiplication wrong" is such useless feedback. The engine's job is
 * to find the root, not the symptom.
 */
export function syntheticStudent(idx: DagIndex, missing: NodeId[]): Oracle {
  const missingSet = new Set(missing);
  return (nodeId: NodeId) => {
    if (missingSet.has(nodeId)) {
      const node = idx.byId.get(nodeId);
      return { correct: false, misconception: node?.misconceptions[0] };
    }
    for (const a of ancestors(idx, nodeId)) {
      if (missingSet.has(a)) {
        // They fail here, but the misconception on display belongs to the broken foundation.
        return { correct: false, misconception: idx.byId.get(a)?.misconceptions[0] };
      }
    }
    return { correct: true };
  };
}

/** A student who knows everything — the engine should confirm and stop, not invent gaps. */
export const perfectStudent: Oracle = () => ({ correct: true });

export function runDiagnostic(
  idx: DagIndex,
  frontier: NodeId[],
  oracle: Oracle,
  opts: DiagnosticOptions = DEFAULT_OPTIONS
): DiagnosticState {
  const state = createState(idx, frontier);
  while (!isComplete(state, idx, opts)) {
    const { chosen, scored } = selectProbe(state, idx);
    if (!chosen) break;
    const { correct, misconception } = oracle(chosen);
    applyAnswer(state, idx, chosen, correct, misconception, scored);
  }
  return state;
}
