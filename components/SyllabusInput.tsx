"use client";

import { useState } from "react";

type Props = {
  onStart: (syllabus: string, demo: boolean) => void;
  busy: boolean;
  sample: string;
};

export default function SyllabusInput({ onStart, busy, sample }: Props) {
  const [text, setText] = useState("");

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
      <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.22em] text-accent">Backtrack</p>
      <h1 className="text-balance text-4xl font-semibold leading-[1.1] tracking-tight text-bright sm:text-5xl">
        Find the prerequisite you&rsquo;re actually missing.
      </h1>
      <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-body">
        Paste the syllabus for a course you haven&rsquo;t taken yet. Backtrack works out what it
        quietly assumes you already know, finds where that assumption breaks, and builds a
        crash course out of precisely-timestamped video.
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste your syllabus here…"
        spellCheck={false}
        className="mt-8 h-56 w-full resize-none rounded-xl border border-line bg-panel px-4 py-3.5 font-mono text-[12.5px] leading-relaxed text-body outline-none transition placeholder:text-muted/70 focus:border-accent/45"
      />

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={() => onStart(text, false)}
          disabled={busy || text.trim().length < 40}
          className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-ink transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-line disabled:text-muted"
        >
          {busy ? "Reading syllabus…" : "Find my gaps"}
        </button>
        <button
          onClick={() => setText(sample)}
          disabled={busy}
          className="rounded-lg border border-line px-4 py-2.5 text-sm text-body transition hover:border-accent/40 hover:text-bright disabled:opacity-50"
        >
          Use the sample syllabus
        </button>
        <button
          onClick={() => onStart(sample, true)}
          disabled={busy}
          className="text-xs text-muted underline underline-offset-4 transition hover:text-body disabled:opacity-50"
          title="Runs entirely from committed fixtures — no network calls"
        >
          demo mode
        </button>
      </div>

      <p className="mt-6 text-xs leading-relaxed text-muted">
        Nothing is downloaded or re-hosted. Every clip is a bounded YouTube embed.
      </p>
    </div>
  );
}
