"use client";

import type { DagNode } from "@/lib/types";

export type Finding = {
  node: DagNode;
  misconception?: string;
  /** The week of the course where not knowing this starts to hurt. */
  week: number | null;
  /** What that week covers — why the gap bites there. */
  topic?: string;
  /** Which probes established it, e.g. "q3 wrong · q5 wrong". */
  evidence: string;
};

type Props = {
  findings: Finding[];
  probeCount: number;
  onContinue: () => void;
  busy: boolean;
};

export default function Findings({ findings, probeCount, onContinue, busy }: Props) {
  const n = findings.length;
  const word = ["No", "One", "Two", "Three", "Four"][n] ?? String(n);

  return (
    <div style={{ position: "relative", zIndex: 1, padding: "74px 26px 90px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div className="eyebrow bt-in" style={{ marginBottom: 28 }}>03 — Findings</div>

        <h1
          className="serif bt-in"
          style={{
            fontWeight: 400,
            fontSize: "clamp(38px,4.8vw,66px)",
            lineHeight: 1.02,
            letterSpacing: "-.03em",
            margin: "0 0 20px",
            animationDelay: "60ms",
            textWrap: "pretty",
          }}
        >
          {n === 0
            ? "Nothing upstream is broken."
            : `${word} gap${n === 1 ? "" : "s"}, ${n === 1 ? "and it sits" : "and all of them sit"} upstream of this course.`}
        </h1>

        <p
          className="bt-in"
          style={{
            maxWidth: "52ch",
            fontSize: 15,
            lineHeight: 1.66,
            color: "var(--mute)",
            margin: "0 0 62px",
            animationDelay: "120ms",
            textWrap: "pretty",
          }}
        >
          {n === 0
            ? "Everything this course assumes came back solid. That is a real result — you can start without backfilling anything."
            : n === 1
              ? "It will not be taught again here. It was assumed before week one, and it surfaces on a date we can name."
              : "None of these will be taught again here. Each was assumed before week one, and each surfaces on a date we can name."}
        </p>

        <div style={{ display: "flex", flexDirection: "column" }}>
          {findings.map((f, i) => (
            <div
              key={f.node.id}
              className="bt-in"
              style={{
                padding: "32px 0",
                borderTop: "1px solid var(--line)",
                display: "grid",
                gridTemplateColumns: "46px minmax(0,1fr) auto",
                gap: "24px 30px",
                alignItems: "start",
                animationDelay: `${180 + i * 90}ms`,
              }}
            >
              <div
                className="mono"
                style={{ fontSize: 11, color: "var(--peri)", fontVariantNumeric: "tabular-nums", paddingTop: 6 }}
              >
                {String(i + 1).padStart(2, "0")}
              </div>

              <div>
                <p style={{ fontSize: 20.5, lineHeight: 1.44, margin: "0 0 14px", letterSpacing: "-.01em", textWrap: "pretty" }}>
                  {f.misconception ? (
                    <>
                      The error sits here: {f.misconception} — so everything built on{" "}
                      {f.node.label.toLowerCase()} inherits it.
                    </>
                  ) : (
                    <>
                      {f.node.label} came back broken while everything underneath it came back fine.
                    </>
                  )}
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <Chip>node · {f.node.label.toLowerCase()}</Chip>
                  <Chip>{f.evidence}</Chip>
                </div>
              </div>

              <div style={{ textAlign: "right" }}>
                <div
                  className="serif"
                  style={{ fontSize: 33, letterSpacing: "-.02em", lineHeight: 1, color: "var(--peri)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}
                >
                  {f.week !== null ? `Wk ${f.week}` : "—"}
                </div>
                {f.topic && (
                  <div
                    className="mono"
                    style={{ fontSize: 9, letterSpacing: ".14em", color: "var(--faint)", textTransform: "uppercase", marginTop: 7, maxWidth: 140 }}
                  >
                    {f.topic}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {n > 0 && (
          <div style={{ marginTop: 52, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={onContinue}
              disabled={busy}
              className="btn-teal"
              style={{ padding: "15px 26px", fontSize: 14, fontWeight: 500 }}
            >
              {busy ? "Finding the clips that fix this…" : "Assemble the crash course"}
            </button>
            <span
              className="mono"
              style={{ fontSize: 10, letterSpacing: ".1em", color: "var(--faint)", textTransform: "uppercase", fontVariantNumeric: "tabular-nums" }}
            >
              {probeCount} questions · {n} root gap{n === 1 ? "" : "s"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="mono"
      style={{
        padding: "5px 10px",
        background: "var(--g3)",
        border: "1px solid var(--g3l)",
        borderRadius: 6,
        fontSize: 9.5,
        letterSpacing: ".1em",
        color: "var(--mute)",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}
