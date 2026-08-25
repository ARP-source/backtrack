"use client";

import { useEffect, useState } from "react";
import { timestamp as ts, type Segment } from "@/lib/segment";
import { BLUR1 } from "@/lib/palette";

type Blank = { id: string; timestamp: number; answer: string; acceptable: string[]; nodeId: string; tag?: string };
type Note = { lines: string[]; blanks: Blank[] };
type Graded = { blankId: string; verdict: "correct" | "wrong" | "near" | "empty"; input: string };
export type Outcome = { nodeId: string; total: number; correct: number; missed: number; reopen: boolean };

type Props = {
  segment: Segment;
  misconception?: string;
  onOutcome: (outcomes: Outcome[]) => void;
};

export default function GuidedNotes({ segment, misconception, onOutcome }: Props) {
  const [note, setNote] = useState<Note | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [graded, setGraded] = useState<Graded[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNote(null);
    setGraded(null);
    setAnswers({});
    fetch("/api/notes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nodeId: segment.nodeId, misconception, segment }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j?.note?.blanks?.length) setNote(j.note);
        else setFailed(true);
      })
      .catch(() => !cancelled && setFailed(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [segment, misconception]);

  async function check() {
    if (!note) return;
    setChecking(true);
    try {
      const res = await fetch("/api/grade", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ blanks: note.blanks, answers, lines: note.lines }),
      });
      const j = await res.json();
      setGraded(j.graded ?? []);
      onOutcome(j.outcomes ?? []);
    } catch {
      setFailed(true);
    } finally {
      setChecking(false);
    }
  }

  const verdictOf = (id: string) => graded?.find((g) => g.blankId === id)?.verdict;
  const done = graded !== null;
  const filled = note ? note.blanks.filter((b) => (answers[b.id] ?? "").trim().length > 0).length : 0;
  const correctCount = graded?.filter((g) => g.verdict === "correct").length ?? 0;

  return (
    <div className="glass1" style={{ ...BLUR1, padding: 24 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: "6px 14px", marginBottom: 22 }}>
        <span className="serif" style={{ fontSize: 20, letterSpacing: "-.02em", whiteSpace: "nowrap" }}>
          Guided notes
        </span>
        <span
          className="mono"
          style={{ fontSize: 9.5, letterSpacing: ".12em", color: "var(--faint)", textTransform: "uppercase", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}
        >
          {loading ? "writing…" : done ? `${correctCount} of ${note?.blanks.length} right` : `${filled} of ${note?.blanks.length ?? 0} filled`}
        </span>
      </div>

      {loading && <p style={{ margin: 0, fontSize: 13, color: "var(--mute)" }}>Reading the clip and writing your notes…</p>}
      {!loading && (failed || !note) && <p style={{ margin: 0, fontSize: 13, color: "var(--mute)" }}>Notes unavailable for this clip.</p>}

      {note && (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 21 }}>
            {note.blanks.map((b) => {
              const v = verdictOf(b.id);
              const line = note.lines.find((l) => l.includes(`{{${b.id}}}`)) ?? "";
              const prompt = line.replace(/\{\{\w+\}\}/g, "__________").trim();
              const border = v === "correct" ? "rgba(92,201,180,.55)" : v ? "rgba(152,166,255,.55)" : "var(--line)";
              return (
                <div key={b.id}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 9, flexWrap: "wrap" }}>
                    <span
                      className="mono"
                      style={{
                        padding: "3px 7px",
                        background: "var(--g3)",
                        border: "1px solid var(--g3l)",
                        borderRadius: 5,
                        fontSize: 10,
                        color: "var(--teal)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {ts(b.timestamp)}
                    </span>
                    <span className="mono" style={{ fontSize: 9, letterSpacing: ".12em", color: "var(--faint)", textTransform: "uppercase" }}>
                      {b.tag ?? "note"}
                    </span>
                  </div>
                  <p style={{ fontSize: 14, lineHeight: 1.6, margin: "0 0 10px", textWrap: "pretty" }}>{prompt}</p>
                  <input
                    type="text"
                    value={answers[b.id] ?? ""}
                    onChange={(e) => setAnswers((a) => ({ ...a, [b.id]: e.target.value }))}
                    disabled={done}
                    spellCheck={false}
                    placeholder={done ? "" : "your answer"}
                    className="field"
                    style={{ width: "100%", padding: "11px 13px", fontFamily: "var(--font-sans), sans-serif", fontSize: 13.5, borderColor: border }}
                  />
                  {done && v !== "correct" && (
                    <p className="mono" style={{ margin: "7px 0 0", fontSize: 10.5, color: "var(--faint)" }}>
                      expected <span style={{ color: "var(--peri)" }}>{b.answer}</span>
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {!done && (
            <button
              type="button"
              onClick={check}
              disabled={checking}
              className="btn-teal"
              style={{ marginTop: 22, width: "100%", padding: 13, fontSize: 13.5, fontWeight: 500 }}
            >
              {checking ? "Checking…" : "Check my answers"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
