"use client";

import { useEffect, useState } from "react";
import { timestamp as ts, type Segment } from "@/lib/segment";

type Blank = { id: string; timestamp: number; answer: string; acceptable: string[]; nodeId: string };
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

  if (loading) {
    return <Shell><p className="text-[12.5px] text-muted">Writing your notes for this clip…</p></Shell>;
  }
  if (failed || !note) {
    return <Shell><p className="text-[12.5px] text-muted">Notes unavailable for this clip.</p></Shell>;
  }

  const verdictOf = (id: string) => graded?.find((g) => g.blankId === id)?.verdict;
  const done = graded !== null;
  const correctCount = graded?.filter((g) => g.verdict === "correct").length ?? 0;

  return (
    <Shell>
      <div className="flex items-baseline justify-between">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-accent">Fill these in as you watch</p>
        {done && (
          <span className="text-[11px] tabular-nums text-muted">
            {correctCount}/{note.blanks.length}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-2.5">
        {note.lines.map((line, li) => (
          <p key={li} className="text-[13.5px] leading-[1.9] text-body">
            {renderLine(line, note.blanks, answers, setAnswers, verdictOf, done)}
          </p>
        ))}
      </div>

      {!done ? (
        <button
          onClick={check}
          disabled={checking}
          className="mt-4 rounded-lg border border-accent/50 px-3.5 py-2 text-[12.5px] font-medium text-accent transition hover:bg-accent/10 disabled:opacity-50"
        >
          {checking ? "Checking…" : "Check my answers"}
        </button>
      ) : (
        <div className="mt-4 flex flex-col gap-1.5">
          {note.blanks
            .filter((b) => verdictOf(b.id) !== "correct")
            .map((b) => (
              <p key={b.id} className="text-[12px] leading-relaxed text-muted">
                <span className="text-gap">✗</span> expected{" "}
                <span className="text-bright">{b.answer}</span>
                <span className="ml-1.5 font-mono text-[10.5px]">revealed at {ts(b.timestamp)}</span>
              </p>
            ))}
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-line bg-panel/70 p-4">{children}</div>;
}

function renderLine(
  line: string,
  blanks: Blank[],
  answers: Record<string, string>,
  setAnswers: (fn: (a: Record<string, string>) => Record<string, string>) => void,
  verdictOf: (id: string) => string | undefined,
  locked: boolean
) {
  const parts = line.split(/(\{\{\w+\}\})/g);
  return parts.map((part, i) => {
    const m = part.match(/^\{\{(\w+)\}\}$/);
    if (!m) return <span key={i}>{part}</span>;

    const blank = blanks.find((b) => b.id === m[1]);
    if (!blank) return <span key={i}>…</span>;

    const v = verdictOf(blank.id);
    const border =
      v === "correct" ? "border-known text-known" : v ? "border-gap text-gap" : "border-muted/60 text-bright";

    return (
      <input
        key={i}
        value={answers[blank.id] ?? ""}
        onChange={(e) => setAnswers((a) => ({ ...a, [blank.id]: e.target.value }))}
        disabled={locked}
        spellCheck={false}
        aria-label={`Blank, answer revealed at ${ts(blank.timestamp)}`}
        title={`revealed at ${ts(blank.timestamp)}`}
        className={`mx-1 w-32 border-b bg-transparent px-1 pb-0.5 text-center text-[13px] outline-none transition focus:border-accent ${border}`}
      />
    );
  });
}
