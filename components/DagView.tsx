"use client";

import { useEffect, useRef, useState } from "react";
import { edgePath, type Layout } from "@/lib/layout";
import type { Mastery, NodeId } from "@/lib/types";

const FILL: Record<Mastery, string> = {
  unknown: "#232838",
  likely_known: "#1e4b63",
  confirmed_known: "#38bdf8",
  likely_gap: "#7a2f3e",
  confirmed_gap: "#fb7185",
};

const STROKE: Record<Mastery, string> = {
  unknown: "#2c3346",
  likely_known: "#38bdf8",
  confirmed_known: "#7dd3fc",
  likely_gap: "#fb7185",
  confirmed_gap: "#fecdd3",
};

type Props = {
  layout: Layout;
  mastery: Map<NodeId, Mastery>;
  /** The node being asked about right now. */
  current?: NodeId | null;
  /** Confirmed root gaps — the answer, once found. */
  roots?: NodeId[];
  height?: number;
};

export default function DagView({ layout, mastery, current, roots = [], height = 340 }: Props) {
  const [settling, setSettling] = useState<Set<NodeId>>(new Set());
  const prev = useRef<Map<NodeId, Mastery>>(new Map());

  // Flash whichever nodes just changed, so propagation is something you watch happen
  // rather than something you infer from a re-render.
  useEffect(() => {
    const changed = new Set<NodeId>();
    for (const [id, m] of mastery) {
      if (prev.current.get(id) !== m && prev.current.size > 0) changed.add(id);
    }
    prev.current = new Map(mastery);
    if (changed.size === 0) return;
    setSettling(changed);
    const t = setTimeout(() => setSettling(new Set()), 560);
    return () => clearTimeout(t);
  }, [mastery]);

  const rootSet = new Set(roots);

  return (
    <svg
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      style={{ height }}
      className="w-full select-none"
      role="img"
      aria-label="Prerequisite graph showing what you know and where the gaps are"
    >
      <defs>
        <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3.4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {layout.edges.map((e) => {
        const from = mastery.get(e.from) ?? "unknown";
        const to = mastery.get(e.to) ?? "unknown";
        // An edge lights up only when both ends are settled the same way, so the eye
        // follows chains of established knowledge rather than a uniform mesh.
        const lit = from !== "unknown" && to !== "unknown";
        const gap = from.endsWith("gap") && to.endsWith("gap");
        return (
          <path
            key={`${e.from}->${e.to}`}
            d={edgePath(e)}
            fill="none"
            stroke={gap ? "#7a2f3e" : lit ? "#2a4a5e" : "#181d2b"}
            strokeWidth={lit ? 1.3 : 1}
            opacity={lit ? 0.85 : 0.45}
            style={{ transition: "stroke 420ms ease, opacity 420ms ease" }}
          />
        );
      })}

      {layout.nodes.map((n) => {
        const m = mastery.get(n.id) ?? "unknown";
        const isCurrent = current === n.id;
        const isRoot = rootSet.has(n.id);
        const r = isRoot ? 8.5 : isCurrent ? 8 : 6;
        return (
          <g key={n.id} className={settling.has(n.id) ? "node-settling" : undefined}>
            {isCurrent && (
              <circle cx={n.x} cy={n.y} r={15} fill="none" stroke="#5eead4" strokeWidth={1.2} opacity={0.55}>
                <animate attributeName="r" values="11;18;11" dur="1.9s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.55;0.06;0.55" dur="1.9s" repeatCount="indefinite" />
              </circle>
            )}
            {isRoot && <circle cx={n.x} cy={n.y} r={14} fill="none" stroke="#fb7185" strokeWidth={1.4} opacity={0.7} />}
            <circle
              cx={n.x}
              cy={n.y}
              r={r}
              fill={FILL[m]}
              stroke={isCurrent ? "#5eead4" : STROKE[m]}
              strokeWidth={isCurrent || isRoot ? 2 : 1.2}
              filter={isRoot || m === "confirmed_known" ? "url(#glow)" : undefined}
              style={{ transition: "fill 420ms ease, stroke 420ms ease, r 260ms ease" }}
            />
            {(isCurrent || isRoot) && (
              <text
                x={n.x}
                y={n.y - 19}
                textAnchor="middle"
                className="fill-bright text-[10px] font-medium"
                style={{ fontSize: 10 }}
              >
                {n.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function MasteryLegend() {
  const items: Array<[Mastery, string]> = [
    ["unknown", "not yet asked"],
    ["likely_known", "inferred solid"],
    ["confirmed_known", "you answered this"],
    ["likely_gap", "compromised"],
    ["confirmed_gap", "root gap"],
  ];
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-[11px] text-muted">
      {items.map(([m, label]) => (
        <span key={m} className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ background: FILL[m], boxShadow: `0 0 0 1px ${STROKE[m]}` }}
          />
          {label}
        </span>
      ))}
    </div>
  );
}
