"use client";

import { useState } from "react";
import type { Probe } from "@/lib/probes";

type Props = {
  probe: Probe;
  index: number;
  budget: number;
  onAnswer: (correct: boolean, misconception?: string) => void;
};

export default function ProbeCard({ probe, index, budget, onAnswer }: Props) {
  const [picked, setPicked] = useState<number | null>(null);

  function choose(i: number) {
    if (picked !== null) return;
    setPicked(i);
    const opt = probe.options[i];
    // Brief pause so the propagation animation is legible rather than instantaneous.
    setTimeout(() => {
      setPicked(null);
      onAnswer(opt.correct, opt.misconception ?? undefined);
    }, 620);
  }

  return (
    <div key={probe.nodeId} className="fade-up">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
          Question {index + 1}
        </span>
        <span className="text-[11px] tabular-nums text-muted">
          {index + 1} / {budget} max
        </span>
      </div>

      <h2 className="mt-3 text-pretty text-[19px] font-medium leading-snug text-bright">
        {probe.question}
      </h2>

      <div className="mt-5 flex flex-col gap-2">
        {probe.options.map((o, i) => {
          const isPicked = picked === i;
          const state =
            picked === null
              ? "idle"
              : isPicked
                ? o.correct
                  ? "right"
                  : "wrong"
                : "dim";
          return (
            <button
              key={i}
              onClick={() => choose(i)}
              disabled={picked !== null}
              className={[
                "rounded-lg border px-4 py-3 text-left text-[13.5px] leading-relaxed transition",
                state === "idle" && "border-line bg-panel text-body hover:border-accent/45 hover:text-bright",
                state === "right" && "border-known bg-known/10 text-bright",
                state === "wrong" && "border-gap bg-gap/10 text-bright",
                state === "dim" && "border-line/60 bg-panel/40 text-muted",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {o.text}
            </button>
          );
        })}
      </div>

      <p className="mt-4 text-[11px] text-muted">
        Answer honestly — guessing right hides the gap this is built to find.
      </p>
    </div>
  );
}
