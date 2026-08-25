/**
 * Layered layout for the prerequisite graph. Pure — no React, no DOM.
 *
 * Depth runs left to right, so foundations sit on the left and course material on the
 * right. The diagnostic then reads as literal leftward movement: a failure at the right
 * edge walks back toward the roots.
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

const COL = 108;
const ROW = 52;
const PAD_X = 40;
const PAD_Y = 34;

export function layoutDag(all: DagNode[], scope?: Set<NodeId>): Layout {
  const nodes = scope ? all.filter((n) => scope.has(n.id)) : all;
  const present = new Set(nodes.map((n) => n.id));

  // Re-derive depth within the visible subgraph so a filtered view has no empty columns.
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
  // One pass left-to-right removes most crossings and keeps the result deterministic.
  const yIndex = new Map<NodeId, number>();
  layers[0]?.sort((a, b) => a.localeCompare(b));
  layers[0]?.forEach((id, i) => yIndex.set(id, i));

  for (let d = 1; d <= maxDepth; d++) {
    const bary = (id: NodeId) => {
      const ps = (byId.get(id)?.prereqs ?? []).filter((p) => yIndex.has(p));
      if (ps.length === 0) return Number.MAX_SAFE_INTEGER;
      return ps.reduce((a, p) => a + yIndex.get(p)!, 0) / ps.length;
    };
    layers[d].sort((a, b) => bary(a) - bary(b) || a.localeCompare(b));
    layers[d].forEach((id, i) => yIndex.set(id, i));
  }

  const tallest = Math.max(1, ...layers.map((l) => l.length));
  const height = PAD_Y * 2 + (tallest - 1) * ROW;
  const width = PAD_X * 2 + maxDepth * COL;

  const out: LaidOutNode[] = [];
  layers.forEach((layer, d) => {
    // Centre each column vertically so the graph reads as a shape, not a ragged grid.
    const offset = (tallest - layer.length) / 2;
    layer.forEach((id, i) => {
      out.push({
        id,
        depth: d,
        x: PAD_X + d * COL,
        y: PAD_Y + (i + offset) * ROW,
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
      if (a && b) edges.push({ from: p, to: n.id, x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    }
  }

  return { nodes: out, edges, width, height, byId: pos };
}

/** Smooth left-to-right connector between two laid-out nodes. */
export function edgePath(e: LaidOutEdge): string {
  const dx = Math.max(28, (e.x2 - e.x1) * 0.55);
  return `M ${e.x1} ${e.y1} C ${e.x1 + dx} ${e.y1}, ${e.x2 - dx} ${e.y2}, ${e.x2} ${e.y2}`;
}
