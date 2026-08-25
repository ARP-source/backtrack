"use client";

import { useEffect, useState } from "react";
import DagView from "./DagView";
import type { Layout } from "@/lib/layout";
import type { Theme } from "@/lib/palette";
import type { Mastery, NodeId } from "@/lib/types";

const LABELS = [
  "Reading the syllabus",
  "Placing the prerequisites",
  "Wiring the dependencies",
  "Graph assembled",
];

/**
 * The beat between pasting a syllabus and the first question: the prerequisite graph
 * assembling itself, a layer at a time. It covers real latency with something worth
 * watching rather than a spinner.
 */
export default function FormingOverlay({ layout, theme, onDone }: { layout: Layout; theme: Theme; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const total = layout.nodes.length;

  useEffect(() => {
    const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      onDone();
      return;
    }
    const timers = [1, 2, 3].map((n, i) => setTimeout(() => setStep(n), 380 + i * 480));
    timers.push(setTimeout(onDone, 2280));
    return () => timers.forEach(clearTimeout);
  }, [onDone]);

  const empty = new Map<NodeId, Mastery>();
  const reveal = Math.round((total * Math.min(step + 1, 4)) / 4);

  return (
    <div
      className="bt-pop"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 20,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        background: "var(--bg)",
      }}
    >
      <div style={{ width: "min(92vw,760px)", maxHeight: "72vh", overflow: "hidden" }}>
        <DagView layout={layout} mastery={empty} theme={theme} reveal={reveal} />
      </div>
      <div
        className="mono"
        style={{ fontSize: 10, letterSpacing: ".18em", color: "var(--mute)", textTransform: "uppercase", fontVariantNumeric: "tabular-nums" }}
      >
        {LABELS[Math.min(step, 3)]} · {reveal}/{total}
      </div>
    </div>
  );
}
