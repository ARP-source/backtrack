/**
 * Layered layout for the prerequisite graph. Pure — no React, no DOM.
 *
 * Depth runs top to bottom, matching the design: foundations sit at the top and course
 * material hangs below them, so a failure descends visually toward its roots.
 */
import type { DagNode, NodeId } from "./types";

export type LaidOutNode = { id: NodeId; x: number; y: number; depth: number; label: string };
export type LaidOutEdge = { from: NodeId; to: NodeId; x1: number; y1: number; x2: number; y2: number };

export type Layout = {
  nodes: LaidOutNode[];
  edges: LaidOutEdge[];
  width: number;
  height: number;
  byId: Map<NodeId, LaidOutNode>;
};

/** Node box, sized so a full concept label fits without truncation. */
export const NODE_W = 154;
export const NODE_H = 34;
const COL = 174;
const ROW = 74;
const PAD_X = 22;
const PAD_Y = 26;

export function layoutDag(all: DagNode[], scope?: Set<NodeId>): Layout {
  const nodes = scope ? all.filter((n) => scope.has(n.id)) : all;
  const present = new Set(nodes.map((n) => n.id));

  // Re-derive depth within the visible subgraph so a filtered view has no empty rows.
  const localDepth = new Map<NodeId, number>();
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const depthOf = (id: NodeId, seen = new Set<NodeId>()): number => {
    if (localDepth.has(id)) return localDepth.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    const ps = (byId.get(id)?.prereqs ?? []).filter((p) => present.has(p));
    const d = ps.length === 0 ? 0 : 1 + Math.max(...ps.map((p) => depthOf(p, seen)));
    localDepth.set(id, d);
    return d;
  };
  for (const n of nodes) depthOf(n.id);

  const maxDepth = Math.max(0, ...localDepth.values());
  const layers: NodeId[][] = Array.from({ length: maxDepth + 1 }, () => []);
  for (const n of nodes) layers[localDepth.get(n.id)!].push(n.id);

  // Barycentre ordering: place each node near the average position of its prerequisites.
  // One pass top-to-bottom removes most crossings and keeps the result deterministic.
  const slot = new Map<NodeId, number>();
  layers[0]?.sort((a, b) => a.localeCompare(b));
  layers[0]?.forEach((id, i) => slot.set(id, i));

  for (let d = 1; d <= maxDepth; d++) {
    const bary = (id: NodeId) => {
      const ps = (byId.get(id)?.prereqs ?? []).filter((p) => slot.has(p));
      if (ps.length === 0) return Number.MAX_SAFE_INTEGER;
      return ps.reduce((a, p) => a + slot.get(p)!, 0) / ps.length;
    };
    layers[d].sort((a, b) => bary(a) - bary(b) || a.localeCompare(b));
    layers[d].forEach((id, i) => slot.set(id, i));
  }

  const widest = Math.max(1, ...layers.map((l) => l.length));
  const width = PAD_X * 2 + (widest - 1) * COL + NODE_W;
  const height = PAD_Y * 2 + maxDepth * ROW + NODE_H;

  const out: LaidOutNode[] = [];
  layers.forEach((layer, d) => {
    // Centre each row horizontally so the graph reads as a shape, not a ragged grid.
    const offset = (widest - layer.length) / 2;
    layer.forEach((id, i) => {
      out.push({
        id,
        depth: d,
        x: PAD_X + NODE_W / 2 + (i + offset) * COL,
        y: PAD_Y + NODE_H / 2 + d * ROW,
        label: byId.get(id)?.label ?? id,
      });
    });
  });

  const pos = new Map(out.map((n) => [n.id, n]));
  const edges: LaidOutEdge[] = [];
  for (const n of nodes) {
    for (const p of n.prereqs) {
      const a = pos.get(p);
      const b = pos.get(n.id);
      // Prerequisite sits above its dependent: leave the parent's bottom edge, enter the
      // child's top edge. Nodes paint over edges, so the overlap is hidden.
      if (a && b) edges.push({ from: p, to: n.id, x1: a.x, y1: a.y + NODE_H / 2, x2: b.x, y2: b.y - NODE_H / 2 });
    }
  }

  return { nodes: out, edges, width, height, byId: pos };
}

/** Smooth vertical connector between two laid-out nodes. */
export function edgePath(e: LaidOutEdge): string {
  const dy = Math.max(18, (e.y2 - e.y1) * 0.5);
  return `M ${e.x1} ${e.y1} C ${e.x1} ${e.y1 + dy}, ${e.x2} ${e.y2 - dy}, ${e.x2} ${e.y2}`;
}
