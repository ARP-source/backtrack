"use client";

import { useState } from "react";
import type { ProbeStep } from "@/lib/diagnostic";
import type { DagIndex } from "@/lib/dag";

/**
 * "How we got here" — the algorithm's own working, shown rather than claimed.
 * Every candidate it weighed, the score, and what each answer settled.
 */
export default function TracePanel({ steps, labelOf }: { steps: ProbeStep[]; labelOf: (id: string) => string }) {
  const [open, setOpen] = useState(false);
  if (steps.length === 0) return null;

  return (
    <div className="rounded-xl border border-line bg-panel/60">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left text-[12px] text-muted transition hover:text-body"
      >
        <span>How we got here — {steps.length} {steps.length === 1 ? "probe" : "probes"}</span>
        <span className="text-[10px]">{open ? "hide" : "show"}</span>
      </button>

      {open && (
        <div className="max-h-72 overflow-y-auto border-t border-line px-4 py-3">
          {steps.map((s) => {
            const inferred = s.propagated.filter((p) => p.nodeId !== s.chosen);
            return (
              <div key={s.index} className="mb-4 last:mb-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-[10px] tabular-nums text-muted">#{s.index + 1}</span>
                  <span className="text-[12.5px] font-medium text-bright">{labelOf(s.chosen)}</span>
                  <span className={s.correct ? "text-[11px] text-known" : "text-[11px] text-gap"}>
                    {s.correct ? "correct" : "wrong"}
                  </span>
                </div>

                <div className="mt-1.5 font-mono text-[10.5px] leading-relaxed text-muted">
                  {s.candidates.slice(0, 3).map((c) => (
                    <div key={c.nodeId} className={c.nodeId === s.chosen ? "text-accent" : undefined}>
                      {c.nodeId === s.chosen ? "▸ " : "  "}
                      {c.nodeId.padEnd(24).slice(0, 24)} pass {String(c.passSettled).padStart(2)} · fail{" "}
                      {String(c.failSettled).padStart(2)} · gain {c.gain.toFixed(2)}
                    </div>
                  ))}
                  {s.candidates.length > 3 && <div>  … {s.candidates.length - 3} more considered</div>}
                </div>

                {inferred.length > 0 && (
                  <p className="mt-1.5 text-[11px] leading-relaxed text-body/80">
                    propagated to {inferred.length}:{" "}
                    <span className="text-muted">
                      {inferred.slice(0, 5).map((p) => labelOf(p.nodeId)).join(", ")}
                      {inferred.length > 5 ? ", …" : ""}
                    </span>
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
