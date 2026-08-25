"use client";

import { useState } from "react";
import { BLUR1 } from "@/lib/palette";

export type SavedClass = { id: string; code: string; name: string; gaps: number; done: number };

type Props = {
  onStart: (syllabus: string, demo: boolean) => void;
  busy: boolean;
  sample: string;
  classes: SavedClass[];
  activeId: string | null;
  onOpenClass: (id: string) => void;
};

export default function SyllabusInput({ onStart, busy, sample, classes, activeId, onOpenClass }: Props) {
  const [text, setText] = useState("");

  return (
    <div style={{ position: "relative", zIndex: 1, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "56px 30px" }}>
      <div
        className="bt-split"
        style={{
          width: "100%",
          maxWidth: 1180,
          display: "grid",
          gridTemplateColumns: "minmax(320px,1fr) minmax(0,540px)",
          gap: 56,
          alignItems: "center",
        }}
      >
        <div className="bt-in">
          <div className="eyebrow" style={{ marginBottom: 26 }}>01 — Syllabus</div>
          <h1
            className="serif"
            style={{
              fontWeight: 400,
              fontSize: "clamp(40px,5.2vw,74px)",
              lineHeight: 0.98,
              letterSpacing: "-.03em",
              margin: "0 0 22px",
            }}
          >
            Paste the syllabus.
            <br />
            We work backwards.
          </h1>
          <p style={{ maxWidth: "37ch", fontSize: 15.5, lineHeight: 1.62, color: "var(--mute)", margin: "0 0 32px", textWrap: "pretty" }}>
            Backtrack builds the prerequisite graph underneath your course, then asks a handful
            of questions to find where your foundation stopped holding — not what you got wrong,
            but when you started being wrong.
          </p>
          <div
            className="mono"
            style={{
              display: "flex",
              gap: 22,
              fontSize: 10,
              letterSpacing: ".1em",
              color: "var(--faint)",
              textTransform: "uppercase",
              fontVariantNumeric: "tabular-nums",
              flexWrap: "wrap",
            }}
          >
            <span>33 nodes</span>
            <span>≤10 questions</span>
            <span>~5 min</span>
          </div>

          {classes.length > 0 && (
            <div style={{ marginTop: 40, paddingTop: 26, borderTop: "1px solid var(--line)" }}>
              <div className="eyebrow" style={{ marginBottom: 16 }}>Your classes</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {classes.map((c) => {
                  const on = c.id === activeId;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => onOpenClass(c.id)}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "78px minmax(0,1fr) auto",
                        gap: 16,
                        alignItems: "center",
                        width: "100%",
                        padding: "13px 15px",
                        textAlign: "left",
                        background: on ? "var(--g1)" : "var(--g3)",
                        border: `1px solid ${on ? "var(--g1l)" : "var(--g3l)"}`,
                        borderRadius: 11,
                        cursor: "pointer",
                        boxShadow: on ? "var(--g1hi)" : "none",
                        transition: "all 300ms var(--ease)",
                      }}
                    >
                      <span
                        className="mono"
                        style={{ fontSize: 10, letterSpacing: ".12em", color: on ? "var(--teal)" : "var(--mute)", textTransform: "uppercase", whiteSpace: "nowrap" }}
                      >
                        {c.code}
                      </span>
                      <span style={{ fontSize: 14, color: "var(--paper)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.name}
                      </span>
                      <span
                        className="mono"
                        style={{
                          fontSize: 9.5,
                          letterSpacing: ".1em",
                          color: c.gaps ? "var(--peri)" : "var(--faint)",
                          textTransform: "uppercase",
                          whiteSpace: "nowrap",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {c.done ? `${c.done} asked${c.gaps ? ` · ${c.gaps} gap${c.gaps === 1 ? "" : "s"}` : ""}` : "not started"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="bt-in" style={{ animationDelay: "90ms" }}>
          <div className="glass1" style={{ ...BLUR1, padding: 20 }}>
            <div
              className="mono"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 14,
                fontSize: 9.5,
                letterSpacing: ".14em",
                color: "var(--faint)",
                textTransform: "uppercase",
              }}
            >
              <span style={{ whiteSpace: "nowrap" }}>New class</span>
              <span style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{text.length} chars</span>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste the syllabus — the first line becomes the class name."
              spellCheck={false}
              className="field mono"
              style={{ display: "block", width: "100%", height: 286, resize: "none", padding: 16, fontSize: 11.5, lineHeight: 1.8 }}
            />
            <button
              type="button"
              onClick={() => onStart(text, false)}
              disabled={busy || text.trim().length < 40}
              className="btn-teal"
              style={{ marginTop: 16, width: "100%", padding: 15, fontSize: 14, fontWeight: 500 }}
            >
              {busy ? "Reading the syllabus…" : "Build the graph"}
            </button>
            <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => setText(sample)}
                disabled={busy}
                className="mono"
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  fontSize: 9.5,
                  letterSpacing: ".14em",
                  color: "var(--faint)",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  borderRadius: 4,
                }}
              >
                Use sample
              </button>
              <button
                type="button"
                onClick={() => onStart(sample, true)}
                disabled={busy}
                title="Runs entirely from committed fixtures — no network calls"
                className="mono"
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  fontSize: 9.5,
                  letterSpacing: ".14em",
                  color: "var(--teal)",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  borderRadius: 4,
                }}
              >
                Demo mode
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
