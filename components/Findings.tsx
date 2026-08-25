"use client";

import type { DagNode } from "@/lib/types";

export type Finding = {
  node: DagNode;
  misconception?: string;
  /** The week of the course where not knowing this starts to hurt. */
  week: number | null;
  /** What that week covers — why the gap bites there. */
  bitesAt?: string;
};

type Props = {
  findings: Finding[];
  probeCount: number;
  onContinue: () => void;
  busy: boolean;
};

export default function Findings({ findings, probeCount, onContinue, busy }: Props) {
  const n = findings.length;

  return (
    <div className="fade-up">
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-accent">
        {probeCount} questions later
      </p>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight text-bright">
        {n === 0
          ? "No prerequisite gaps found."
          : `You're missing ${n} thing${n === 1 ? "" : "s"}.`}
      </h2>

      {n === 0 ? (
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-body">
          Everything this course assumes came back solid. That is a real result — you can
          start the course without backfilling anything.
        </p>
      ) : (
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-body">
          Not the topics you got wrong — the place the trouble <em className="text-bright not-italic">starts</em>.
          Each of these came back broken while everything underneath it came back fine.
        </p>
      )}

      <div className="mt-8 flex flex-col gap-3">
        {findings.map((f, i) => (
          <div
            key={f.node.id}
            className="fade-up rounded-xl border border-gap/30 bg-gap/[0.055] p-5"
            style={{ animationDelay: `${i * 90}ms` }}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-[17px] font-medium text-bright">{f.node.label}</h3>
              {f.week !== null && (
                <span className="rounded-full border border-line px-2.5 py-0.5 text-[11px] text-body">
                  bites in week {f.week}
                </span>
              )}
            </div>

            {f.misconception && (
              <p className="mt-3 text-[14px] leading-relaxed text-body">
                <span className="text-muted">You think </span>
                {f.misconception}.
              </p>
            )}

            <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
              Mastery here means: {f.node.blurb.charAt(0).toLowerCase() + f.node.blurb.slice(1)}
            </p>

            {f.bitesAt && (
              <p className="mt-3 border-t border-line/70 pt-3 text-[12.5px] leading-relaxed text-muted">
                <span className="text-body">Why it matters: </span>
                {f.bitesAt}
              </p>
            )}
          </div>
        ))}
      </div>

      {n > 0 && (
        <button
          onClick={onContinue}
          disabled={busy}
          className="mt-8 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-ink transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-line disabled:text-muted"
        >
          {busy ? "Finding the clips that fix this…" : "Build my crash course"}
        </button>
      )}
    </div>
  );
}
