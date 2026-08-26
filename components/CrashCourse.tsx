"use client";

import { useState } from "react";
import { embedUrl, timestamp as ts, type GapPlan, type Segment } from "@/lib/segment";
import GuidedNotes, { type Outcome } from "./GuidedNotes";
import { BLUR2 } from "@/lib/palette";

type Props = {
  plans: GapPlan[];
  demo?: boolean;
  onRestart: () => void;
  /** Fires when notes show a node was not actually fixed — the DAG reopens it. */
  onReopen: (nodeId: string) => void;
};

export default function CrashCourse({ plans, demo, onRestart, onReopen }: Props) {
  const [gapIdx, setGapIdx] = useState(0);
  const [segIdx, setSegIdx] = useState(0);
  const [extra, setExtra] = useState<Record<string, Segment[]>>({});
  const [reopened, setReopened] = useState<Record<string, Outcome>>({});
  const [exhausted, setExhausted] = useState<Record<string, boolean>>({});

  if (plans.length === 0) return null;
  const plan = plans[Math.min(gapIdx, plans.length - 1)];
  const segments = [...plan.segments, ...(extra[plan.nodeId] ?? [])];
  const seg = segments[Math.min(segIdx, segments.length - 1)];

  function handleOutcome(outcomes: Outcome[]) {
    const mine = outcomes.find((o) => o.nodeId === plan.nodeId);
    if (!mine?.reopen) return;

    setReopened((r) => ({ ...r, [plan.nodeId]: mine }));
    onReopen(plan.nodeId);

    const shown = new Set(segments.map((s) => `${s.videoId}:${s.start}`));
    const next = (plan.alternates ?? []).find((a) => !shown.has(`${a.videoId}:${a.start}`));
    if (next) {
      setExtra((e) => ({ ...e, [plan.nodeId]: [...(e[plan.nodeId] ?? []), next] }));
      // Move the student straight onto the replacement explanation.
      setSegIdx(segments.length);
    } else {
      setExhausted((x) => ({ ...x, [plan.nodeId]: true }));
    }
  }

  const totalMin = plans.reduce((a, p) => a + p.totalSec, 0) / 60;
  const isReopened = Boolean(reopened[plan.nodeId]);

  return (
    <div style={{ position: "relative", zIndex: 1, padding: "32px 26px 48px" }}>
      <div style={{ maxWidth: 1460, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: "20px 14px", marginBottom: 26 }}>
          <div style={{ minWidth: 0, flex: "1 1 340px" }}>
            <div className="eyebrow" style={{ marginBottom: 12 }}>04 — Crash course</div>
            <h1
              className="serif bt-h1"
              style={{ fontWeight: 400, fontSize: 33, lineHeight: 1.14, letterSpacing: "-.025em", margin: 0, textWrap: "pretty" }}
            >
              Gap {String(gapIdx + 1).padStart(2, "0")} · {plan.misconception ?? plan.label}
            </h1>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {plans.map((p, i) => {
              const on = i === gapIdx;
              const bad = Boolean(reopened[p.nodeId]);
              return (
                <button
                  key={p.nodeId}
                  type="button"
                  onClick={() => {
                    setGapIdx(i);
                    setSegIdx(0);
                  }}
                  className="mono"
                  style={{
                    padding: "8px 13px",
                    background: on ? "var(--g1)" : "var(--g3)",
                    border: `1px solid ${bad ? "rgba(152,166,255,.5)" : on ? "var(--g1l)" : "var(--g3l)"}`,
                    borderRadius: 8,
                    fontSize: 10,
                    letterSpacing: ".08em",
                    color: bad ? "var(--peri)" : on ? "var(--paper)" : "var(--mute)",
                    textTransform: "uppercase",
                    cursor: "pointer",
                    transition: "all 300ms var(--ease)",
                  }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="bt-split" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.5fr) minmax(320px,1fr)", gap: 26, alignItems: "start" }}>
          <div>
            {/* Opaque surface for video — glass behind moving image reads as mud. */}
            <div style={{ background: "var(--bg2)", border: "1px solid var(--line)", borderRadius: 14, overflow: "hidden", boxShadow: "var(--s1)" }}>
              <Player seg={seg} />
              <div style={{ padding: "16px 18px", background: "var(--bg2)", borderTop: "1px solid var(--line)" }}>
                <div style={{ position: "relative", height: 4, borderRadius: 2, background: "rgba(128,140,160,.24)", marginBottom: 14 }}>
                  <div
                    style={{
                      position: "absolute",
                      inset: "0 auto 0 0",
                      width: `${((segIdx + 1) / segments.length) * 100}%`,
                      borderRadius: 2,
                      background: isReopened ? "var(--peri)" : "var(--teal)",
                      transition: "width 420ms var(--ease), background 420ms var(--ease)",
                    }}
                  />
                  {segments.map((s, i) => (
                    <div
                      key={`${s.videoId}-${s.start}`}
                      style={{
                        position: "absolute",
                        top: -3,
                        left: `${((i + 1) / segments.length) * 100}%`,
                        width: 2,
                        height: 10,
                        background: "var(--peri)",
                        opacity: 0.85,
                      }}
                    />
                  ))}
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px 16px" }}>
                  <div style={{ fontSize: 13, color: "var(--mute)", minWidth: 0 }}>
                    Segment {segIdx + 1} of {segments.length} · <span style={{ color: "var(--paper)" }}>{seg.channel}</span>
                  </div>
                  <div className="mono" style={{ fontSize: 10, letterSpacing: ".1em", color: "var(--faint)", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                    {plan.considered} considered · {plan.considered - plan.rejected} teach it
                  </div>
                </div>
              </div>
            </div>

            {reopened[plan.nodeId] && <ReopenBanner outcome={reopened[plan.nodeId]} label={plan.label} exhausted={Boolean(exhausted[plan.nodeId])} />}

            <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 10 }}>
              {segments.map((s, i) => {
                const on = i === segIdx;
                const isAlt = i >= plan.segments.length;
                return (
                  <button
                    key={`${s.videoId}-${s.start}`}
                    type="button"
                    onClick={() => setSegIdx(i)}
                    className="glass2"
                    style={{
                      ...BLUR2,
                      display: "grid",
                      gridTemplateColumns: "auto minmax(0,1fr) auto",
                      gap: 16,
                      alignItems: "center",
                      padding: "16px 18px",
                      textAlign: "left",
                      cursor: "pointer",
                      borderColor: on ? "var(--g1l)" : isAlt ? "rgba(152,166,255,.34)" : "var(--g2l)",
                      transition: "all 280ms var(--ease)",
                    }}
                  >
                    <span
                      className="mono"
                      style={{ fontSize: 11, color: on ? "var(--teal)" : isAlt ? "var(--peri)" : "var(--faint)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}
                    >
                      {ts(s.start)}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14.5, marginBottom: 5, color: "var(--paper)" }}>{s.title}</div>
                      <div style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--mute)", textWrap: "pretty" }}>{s.why_this_clip}</div>
                    </div>
                    <span className="mono" style={{ fontSize: 10, color: "var(--faint)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                      {Math.round(s.end - s.start)}s
                    </span>
                  </button>
                );
              })}
            </div>

            <div style={{ marginTop: 22, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={onRestart}
                className="mono"
                style={{
                  padding: "10px 16px",
                  background: "var(--g3)",
                  border: "1px solid var(--g3l)",
                  borderRadius: 9,
                  fontSize: 9.5,
                  letterSpacing: ".14em",
                  color: "var(--mute)",
                  textTransform: "uppercase",
                  cursor: "pointer",
                }}
              >
                Start over
              </button>
              <span className="mono" style={{ fontSize: 10, letterSpacing: ".1em", color: "var(--faint)", textTransform: "uppercase", fontVariantNumeric: "tabular-nums" }}>
                {totalMin.toFixed(0)} min across {plans.length} gap{plans.length === 1 ? "" : "s"}
              </span>
            </div>
          </div>

          <GuidedNotes
            key={`${seg.videoId}-${seg.start}`}
            segment={seg}
            misconception={plan.misconception}
            demo={demo}
            onOutcome={handleOutcome}
          />
        </div>
      </div>
    </div>
  );
}

function Player({ seg }: { seg: Segment }) {
  const [live, setLive] = useState(false);
  return (
    <div style={{ position: "relative", aspectRatio: "16/9", background: "#0C1117" }}>
      {live ? (
        <iframe
          src={`${embedUrl(seg)}&autoplay=1`}
          title={seg.title}
          allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          style={{ width: "100%", height: "100%", border: 0, display: "block" }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setLive(true)}
          aria-label={`Play ${seg.title}`}
          style={{ position: "absolute", inset: 0, width: "100%", padding: 0, border: "none", background: "none", cursor: "pointer" }}
        >
          {/* Static thumbnail until clicked, so several embeds never boot at once. */}
          <img
            src={`https://i.ytimg.com/vi/${seg.videoId}/hqdefault.jpg`}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.5 }}
          />
          <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span
              style={{
                display: "flex",
                width: 54,
                height: 54,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "50%",
                background: "rgba(92,201,180,.94)",
                color: "#08110F",
              }}
            >
              <svg viewBox="0 0 24 24" width={20} height={20} fill="currentColor" aria-hidden>
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </span>
        </button>
      )}
      <div
        className="mono"
        style={{
          position: "absolute",
          left: 16,
          bottom: 16,
          padding: "6px 10px",
          background: "rgba(8,12,18,.78)",
          borderRadius: 6,
          fontSize: 11,
          color: "#D9DEE6",
          fontVariantNumeric: "tabular-nums",
          pointerEvents: "none",
        }}
      >
        {ts(seg.start)} — {ts(seg.end)}
      </div>
    </div>
  );
}

/** The best ten seconds of the demo: the system noticing its own remediation did not take. */
function ReopenBanner({ outcome, label, exhausted }: { outcome: Outcome; label: string; exhausted: boolean }) {
  return (
    <div
      className="bt-in"
      style={{
        marginTop: 18,
        padding: "16px 18px",
        background: "rgba(152,166,255,.09)",
        border: "1px solid rgba(152,166,255,.45)",
        borderRadius: 12,
      }}
    >
      <div className="mono" style={{ fontSize: 9.5, letterSpacing: ".16em", color: "var(--peri)", textTransform: "uppercase" }}>
        Reopened
      </div>
      <p style={{ margin: "8px 0 0", fontSize: 14.5, lineHeight: 1.5, color: "var(--paper)" }}>
        You missed {outcome.missed} of {outcome.total} blanks on {label.toLowerCase()}, so it went back to being a gap.
      </p>
      <p style={{ margin: "5px 0 0", fontSize: 12.5, lineHeight: 1.55, color: "var(--mute)" }}>
        {exhausted
          ? "The corpus has no other verified explanation to offer — that is a gap in the library, not a verdict on you."
          : "Here is a different explanation — different teacher, different angle."}
      </p>
    </div>
  );
}
