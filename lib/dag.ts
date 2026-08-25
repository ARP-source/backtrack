/**
 * DAG loading and graph queries. Pure logic — unit-testable, no React, no network.
 */
import type { Dag, DagNode, NodeId } from "./types.js";

export type DagIndex = {
  dag: Dag;
  byId: Map<NodeId, DagNode>;
  /** node -> everything it directly depends on. */
  prereqs: Map<NodeId, NodeId[]>;
  /** node -> nodes that directly depend on it (reverse edges). */
  dependents: Map<NodeId, NodeId[]>;
};

export function indexDag(dag: Dag): DagIndex {
  const byId = new Map<NodeId, DagNode>();
  const prereqs = new Map<NodeId, NodeId[]>();
  const dependents = new Map<NodeId, NodeId[]>();

  for (const n of dag.nodes) {
    byId.set(n.id, n);
    prereqs.set(n.id, n.prereqs);
    if (!dependents.has(n.id)) dependents.set(n.id, []);
  }
  for (const n of dag.nodes) {
    for (const p of n.prereqs) {
      if (!dependents.has(p)) dependents.set(p, []);
      dependents.get(p)!.push(n.id);
    }
  }
  return { dag, byId, prereqs, dependents };
}

/** All transitive prerequisites of `id` (everything upstream). Excludes `id`. */
export function ancestors(idx: DagIndex, id: NodeId): Set<NodeId> {
  const out = new Set<NodeId>();
  const stack = [...(idx.prereqs.get(id) ?? [])];
  while (stack.length) {
    const cur = stack.pop()!;
    if (out.has(cur)) continue;
    out.add(cur);
    stack.push(...(idx.prereqs.get(cur) ?? []));
  }
  return out;
}

/** All transitive dependents of `id` (everything downstream). Excludes `id`. */
export function descendants(idx: DagIndex, id: NodeId): Set<NodeId> {
  const out = new Set<NodeId>();
  const stack = [...(idx.dependents.get(id) ?? [])];
  while (stack.length) {
    const cur = stack.pop()!;
    if (out.has(cur)) continue;
    out.add(cur);
    stack.push(...(idx.dependents.get(cur) ?? []));
  }
  return out;
}

/** Depth derived from structure: 1 + max(prereq depth). Roots are 0. */
export function computeDepths(dag: Dag): Map<NodeId, number> {
  const byId = new Map(dag.nodes.map((n) => [n.id, n]));
  const memo = new Map<NodeId, number>();
  const visiting = new Set<NodeId>();

  const depthOf = (id: NodeId): number => {
    if (memo.has(id)) return memo.get(id)!;
    if (visiting.has(id)) throw new Error(`cycle detected at "${id}"`);
    visiting.add(id);
    const node = byId.get(id);
    if (!node) throw new Error(`unknown node id "${id}"`);
    const d = node.prereqs.length === 0 ? 0 : 1 + Math.max(...node.prereqs.map(depthOf));
    visiting.delete(id);
    memo.set(id, d);
    return d;
  };

  for (const n of dag.nodes) depthOf(n.id);
  return memo;
}

export type DagProblem = { severity: "error" | "warn"; message: string };

/** Structural checks. Run in CI and before the corpus build — a bad DAG poisons everything downstream. */
export function validateDag(dag: Dag): DagProblem[] {
  const problems: DagProblem[] = [];
  const ids = dag.nodes.map((n) => n.id);
  const seen = new Set<NodeId>();

  for (const id of ids) {
    if (seen.has(id)) problems.push({ severity: "error", message: `duplicate node id "${id}"` });
    seen.add(id);
  }

  for (const n of dag.nodes) {
    for (const p of n.prereqs) {
      if (!seen.has(p)) {
        problems.push({ severity: "error", message: `"${n.id}" lists unknown prereq "${p}"` });
      }
    }
    if (n.prereqs.includes(n.id)) {
      problems.push({ severity: "error", message: `"${n.id}" lists itself as a prereq` });
    }
    if (new Set(n.prereqs).size !== n.prereqs.length) {
      problems.push({ severity: "error", message: `"${n.id}" has duplicate prereqs` });
    }
    if (n.misconceptions.length < 2) {
      problems.push({
        severity: "error",
        message: `"${n.id}" has ${n.misconceptions.length} misconception(s); need >= 2 for 4-option probes`,
      });
    }
    if (!n.blurb.trim()) problems.push({ severity: "warn", message: `"${n.id}" has an empty blurb` });
  }

  // Cycles + declared-vs-derived depth.
  let depths: Map<NodeId, number>;
  try {
    depths = computeDepths(dag);
  } catch (e) {
    problems.push({ severity: "error", message: (e as Error).message });
    return problems;
  }
  for (const n of dag.nodes) {
    const derived = depths.get(n.id)!;
    if (derived !== n.depth) {
      problems.push({
        severity: "error",
        message: `"${n.id}" declares depth ${n.depth} but structure gives ${derived}`,
      });
    }
  }

  return problems;
}
