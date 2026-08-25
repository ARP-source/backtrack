"use client";

import { useEffect, useRef, useState } from "react";
import { edgePath, NODE_H, NODE_W, type Layout } from "@/lib/layout";
import { swatch, LEGEND_ORDER, type Theme } from "@/lib/palette";
import type { Mastery, NodeId } from "@/lib/types";

type Props = {
  layout: Layout;
  mastery: Map<NodeId, Mastery>;
  theme: Theme;
  /** The node being asked about right now. */
  current?: NodeId | null;
  /** Confirmed root gaps — the answer, once found. */
  roots?: NodeId[];
  /** Blurred, label-less version used behind the forming overlay. */
  backdrop?: boolean;
  /** Reveal only the first N nodes — drives the graph-forming animation. */
  reveal?: number;
};

export default function DagView({ layout, mastery, theme, current, roots = [], backdrop, reveal }: Props) {
  const [lit, setLit] = useState<Set<NodeId>>(new Set());
  const prev = useRef<Map<NodeId, Mastery>>(new Map());

  // Flash whichever nodes just changed, so propagation is something you watch happen
  // rather than something you infer from a re-render.
  useEffect(() => {
    if (backdrop) return;
    const changed = new Set<NodeId>();
    for (const [id, m] of mastery) {
      if (prev.current.size > 0 && prev.current.get(id) !== m) changed.add(id);
    }
    prev.current = new Map(mastery);
    if (changed.size === 0) return;
    setLit(changed);
    const t = setTimeout(() => setLit(new Set()), 900);
    return () => clearTimeout(t);
  }, [mastery, backdrop]);

  const rootSet = new Set(roots);
  const visible = reveal === undefined ? layout.nodes : layout.nodes.slice(0, reveal);
  const shown = new Set(visible.map((n) => n.id));

  return (
    <svg
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      preserveAspectRatio="xMidYMid meet"
      style={
        backdrop
          ? { width: "150%", height: "150%", opacity: 0.5, filter: "blur(22px)" }
          : { display: "block", width: "100%", minWidth: Math.min(layout.width, 660), height: "auto" }
      }
      aria-hidden={backdrop ? true : undefined}
      role={backdrop ? undefined : "img"}
      aria-label={backdrop ? undefined : "Prerequisite graph showing what you know and where the gaps are"}
    >
      {layout.edges.map((e) => {
        if (!shown.has(e.from) || !shown.has(e.to)) return null;
        const from = mastery.get(e.from) ?? "unknown";
        const to = mastery.get(e.to) ?? "unknown";
        const flashing = lit.has(e.from) || lit.has(e.to);
        const known = from.endsWith("known") || to.endsWith("known");
        const gap = from.endsWith("gap") || to.endsWith("gap");
        const base = backdrop
          ? "rgba(146,164,190,.5)"
          : theme === "light"
            ? "rgba(20,30,45,.16)"
            : "rgba(160,176,200,.17)";
        const col = flashing
          ? gap
            ? "#98A6FF"
            : "#5CC9B4"
          : known
            ? "rgba(92,201,180,.3)"
            : gap
              ? "rgba(152,166,255,.3)"
              : base;
        return (
          <path
            key={`${e.from}->${e.to}`}
            d={edgePath(e)}
            fill="none"
            stroke={col}
            strokeWidth={flashing ? 2 : 1}
            style={{
              transition: "stroke 420ms var(--ease), stroke-width 420ms var(--ease)",
              filter: flashing ? `drop-shadow(0 0 5px ${col})` : "none",
            }}
          />
        );
      })}

      {visible.map((n) => {
        const m = mastery.get(n.id) ?? "unknown";
        const p = swatch(m, theme);
        const isCurrent = current === n.id;
        const isRoot = rootSet.has(n.id);
        const x = n.x - NODE_W / 2;
        const y = n.y - NODE_H / 2;
        return (
          <g key={n.id}>
            {isCurrent && !backdrop && (
              <rect
                x={x - 5}
                y={y - 5}
                width={NODE_W + 10}
                height={NODE_H + 10}
                rx={12}
                fill="none"
                stroke="var(--teal)"
                strokeWidth={1.2}
                opacity={0.5}
              >
                <animate attributeName="opacity" values="0.55;0.08;0.55" dur="1.9s" repeatCount="indefinite" />
              </rect>
            )}
            <rect
              x={x}
              y={y}
              width={NODE_W}
              height={NODE_H}
              rx={8}
              fill={backdrop ? "rgba(120,144,178,.2)" : p.fill}
              stroke={backdrop ? "rgba(150,170,200,.45)" : isCurrent ? "var(--teal)" : p.ring}
              strokeWidth={isCurrent || isRoot ? 1.6 : 1}
              style={{
                transition: "fill 520ms var(--ease), stroke 520ms var(--ease), filter 520ms var(--ease)",
                filter: p.glow && !backdrop ? `drop-shadow(0 0 10px ${p.ring}55)` : "none",
              }}
            />
            {/* Top inner highlight — what makes the boxes read as physical surfaces. */}
            <line
              x1={x + 8}
              y1={y + 1}
              x2={x + NODE_W - 8}
              y2={y + 1}
              stroke={`rgba(255,255,255,${backdrop ? 0.18 : theme === "light" ? 0.95 : 0.26})`}
              strokeWidth={1}
            />
            {!backdrop && (
              <text
                x={n.x}
                y={n.y + 4.2}
                textAnchor="middle"
                fill={p.text}
                style={{
                  font: '400 12px var(--font-sans), sans-serif',
                  letterSpacing: ".004em",
                  transition: "fill 520ms var(--ease)",
                }}
              >
                {fit(n.label)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Keep a label inside its box; the DAG has a few long concept names. */
function fit(label: string): string {
  return label.length > 24 ? `${label.slice(0, 23)}…` : label;
}

export function MasteryLegend({ theme }: { theme: Theme }) {
  return (
    <div style={{ display: "flex", gap: 13, flexWrap: "wrap" }}>
      {LEGEND_ORDER.map((m) => {
        const s = swatch(m, theme);
        return (
          <span
            key={m}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontFamily: "var(--font-mono), monospace",
              fontSize: 9,
              letterSpacing: ".06em",
              color: "var(--faint)",
              textTransform: "uppercase",
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: 2, background: s.ring }} />
            {s.label}
          </span>
        );
      })}
    </div>
  );
}
