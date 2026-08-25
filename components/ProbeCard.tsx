"use client";

import { useState } from "react";
import type { Probe } from "@/lib/probes";
import { BLUR1 } from "@/lib/palette";

const KEYS = ["A", "B", "C", "D", "E"];

type Props = {
  probe: Probe;
  label: string;
  index: number;
  budget: number;
  onAnswer: (correct: boolean, misconception?: string) => void;
};

export default function ProbeCard({ probe, label, index, budget, onAnswer }: Props) {
  const [picked, setPicked] = useState<number | null>(null);

  function choose(i: number) {
    if (picked !== null) return;
    setPicked(i);
    const opt = probe.options[i];
    // Hold briefly so the propagation animation on the graph is legible.
    setTimeout(() => {
      setPicked(null);
      onAnswer(opt.correct, opt.misconception ?? undefined);
    }, 900);
  }

  return (
    <div className="glass1" style={{ ...BLUR1, padding: 30 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 20 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--teal)" }} />
        <span
          className="mono"
          style={{ fontSize: 9.5, letterSpacing: ".14em", color: "var(--mute)", textTransform: "uppercase" }}
        >
          Probing · {label}
        </span>
      </div>

      <h2
        key={probe.nodeId}
        className="serif bt-in"
        style={{ fontWeight: 400, fontSize: 29, lineHeight: 1.18, letterSpacing: "-.02em", margin: "0 0 26px", textWrap: "pretty" }}
      >
        {probe.question}
      </h2>

      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {probe.options.map((o, i) => {
          const isPicked = picked === i;
          const settled = picked !== null;
          const bg = isPicked
            ? o.correct
              ? "rgba(92,201,180,.16)"
              : "rgba(152,166,255,.18)"
            : settled
              ? "transparent"
              : "var(--g3)";
          const bd = isPicked
            ? o.correct
              ? "rgba(92,201,180,.5)"
              : "rgba(152,166,255,.55)"
            : settled
              ? "var(--line)"
              : "var(--g3l)";
          return (
            <button
              key={i}
              type="button"
              onClick={() => choose(i)}
              disabled={settled}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                width: "100%",
                padding: "15px 17px",
                textAlign: "left",
                background: bg,
                border: `1px solid ${bd}`,
                borderRadius: 11,
                cursor: settled ? "default" : "pointer",
                fontFamily: "var(--font-sans), sans-serif",
                fontSize: 14.5,
                lineHeight: 1.45,
                color: settled && !isPicked ? "var(--faint)" : "var(--paper)",
                boxShadow: isPicked ? "inset 0 1px 0 rgba(255,255,255,.18)" : "none",
                transition: "all 280ms var(--ease)",
              }}
            >
              <span className="mono" style={{ fontSize: 10, opacity: 0.6, width: 11, flex: "0 0 auto" }}>
                {KEYS[i]}
              </span>
              {o.text}
            </button>
          );
        })}
      </div>

      <p
        className="mono"
        style={{ marginTop: 18, marginBottom: 0, fontSize: 9, letterSpacing: ".12em", color: "var(--faint)", textTransform: "uppercase" }}
      >
        Answer honestly · guessing hides the gap · {index + 1} of {budget} max
      </p>
    </div>
  );
}
