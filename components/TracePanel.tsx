"use client";

import { useState } from "react";
import type { ProbeStep } from "@/lib/diagnostic";
import { BLUR2 } from "@/lib/palette";

type Line = { t: string; text: string; col: string; mono?: boolean };

/**
 * "How we got here" — the search's own working, shown rather than claimed.
 * Prose for what happened, plus the raw candidate scores that produced each choice.
 */
export default function TracePanel({ steps, labelOf }: { steps: ProbeStep[]; labelOf: (id: string) => string }) {
  const [open, setOpen] = useState(true);

  const lines: Line[] = [];
  let clock = 12;
  const stamp = () => {
    clock += 7;
    return `0:${String(clock).padStart(2, "0")}`;
  };

  for (const s of steps) {
    const teal = "#5CC9B4";
    const peri = "#98A6FF";
    lines.push({
      t: stamp(),
      text: s.correct
        ? `passed ${labelOf(s.chosen)} — flowing mastery upward`
        : `failed ${labelOf(s.chosen)} — descending to prerequisites`,
      col: s.correct ? teal : peri,
    });

    const top = s.candidates.slice(0, 2);
    if (top.length) {
      lines.push({
        t: "",
        text: top
          .map((c) => `${c.nodeId === s.chosen ? "▸" : " "}${c.nodeId} pass ${c.passSettled} fail ${c.failSettled} gain ${c.gain.toFixed(2)}`)
          .join("   "),
        col: "var(--faint)",
        mono: true,
      });
    }

    const inferred = s.propagated.filter((p) => p.nodeId !== s.chosen);
    if (inferred.length) {
      lines.push({
        t: "",
        text: `inference settled · ${inferred.length} node${inferred.length === 1 ? "" : "s"} raised`,
        col: "#3F8E86",
      });
    }
    if (s.rootGaps.length) {
      lines.push({
        t: "",
        text: `descent hit a root · ${s.rootGaps.map(labelOf).join(", ")}`,
        col: peri,
      });
    }
  }

  return (
    <div className="glass2" style={{ ...BLUR2, padding: "19px 21px" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          padding: 0,
          background: "none",
          border: "none",
          cursor: "pointer",
          fontFamily: "var(--font-sans), sans-serif",
          fontSize: 13,
          color: "var(--paper)",
          borderRadius: 6,
        }}
      >
        <span>How we got here</span>
        <span className="mono" style={{ fontSize: 10, color: "var(--faint)", fontVariantNumeric: "tabular-nums" }}>
          {steps.length} probe{steps.length === 1 ? "" : "s"} · {open ? "hide" : "show"}
        </span>
      </button>

      {open && lines.length > 0 && (
        <div
          style={{
            marginTop: 15,
            paddingTop: 15,
            borderTop: "1px solid var(--line)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            maxHeight: 232,
            overflow: "auto",
          }}
        >
          {lines.map((l, i) => (
            <div
              key={i}
              className="mono bt-in"
              style={{
                display: "flex",
                gap: 12,
                fontSize: l.mono ? 9.5 : 10.5,
                lineHeight: 1.62,
                color: l.mono ? "var(--faint)" : "var(--mute)",
                whiteSpace: l.mono ? "pre" : "normal",
                overflowX: l.mono ? "auto" : "visible",
              }}
            >
              <span style={{ color: l.col, fontVariantNumeric: "tabular-nums", flex: "0 0 auto", minWidth: 26 }}>{l.t}</span>
              <span>{l.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
