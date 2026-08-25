"use client";

import { useState } from "react";
import { embedUrl, timestamp as ts, type GapPlan, type Segment } from "@/lib/segment";
import GuidedNotes, { type Outcome } from "./GuidedNotes";

type Props = {
  plans: GapPlan[];
  onRestart: () => void;
  /** Fires when notes show a node was not actually fixed — the DAG reopens it. */
  onReopen: (nodeId: string) => void;
};

export default function CrashCourse({ plans, onRestart, onReopen }: Props) {
  const totalMin = plans.reduce((a, p) => a + p.totalSec, 0) / 60;
  const clips = plans.reduce((a, p) => a + p.segments.length, 0);

  return (
    <div className="fade-up">
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-accent">Your crash course</p>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight text-bright">
        {totalMin < 1 ? "Under a minute" : `${totalMin.toFixed(0)} minutes`} of video.
      </h2>
      <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-body">
        {clips} clip{clips === 1 ? "" : "s"} across {plans.length} gap{plans.length === 1 ? "" : "s"}.
        Nothing was written for you — these are the exact spans where someone already
        explains the thing you&rsquo;re missing. Fill in the notes as you watch; they check
        whether it actually landed.
      </p>

      <div className="mt-9 flex flex-col gap-12">
        {plans.map((plan) => (
          <GapSection key={plan.nodeId} plan={plan} onReopen={onReopen} />
        ))}
      </div>

      <button
        onClick={onRestart}
        className="mt-12 rounded-lg border border-line px-4 py-2.5 text-sm text-body transition hover:border-accent/40 hover:text-bright"
      >
        Start over
      </button>
    </div>
  );
}

function GapSection({ plan, onReopen }: { plan: GapPlan; onReopen: (nodeId: string) => void }) {
  const [extra, setExtra] = useState<Segment[]>([]);
  const [reopened, setReopened] = useState<Outcome | null>(null);
  const [exhausted, setExhausted] = useState(false);

  function handleOutcome(outcomes: Outcome[]) {
    const mine = outcomes.find((o) => o.nodeId === plan.nodeId);
    if (!mine?.reopen) return;

    setReopened(mine);
    onReopen(plan.nodeId);

    // Offer a different explanation — a different channel first, since re-watching the
    // same teacher say the same thing is exactly what already failed.
    const shown = new Set([...plan.segments, ...extra].map((s) => `${s.videoId}:${s.start}`));
    const next = (plan.alternates ?? []).find((a) => !shown.has(`${a.videoId}:${a.start}`));
    if (next) setExtra((e) => [...e, next]);
    else setExhausted(true);
  }

  const all = [...plan.segments, ...extra];

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-3">
        <h3 className="text-[19px] font-medium text-bright">{plan.label}</h3>
        <span className="font-mono text-[11px] text-muted">
          {plan.considered} candidates → {plan.considered - plan.rejected} teach it →{" "}
          {plan.segments.length} kept · {ts(plan.totalSec)}
        </span>
      </div>

      {plan.misconception && (
        <p className="mt-3 text-[13.5px] leading-relaxed text-body">
          <span className="text-muted">Targeting: </span>
          {plan.misconception}
        </p>
      )}

      {plan.note && (
        <p className="mt-2 rounded-md border border-line bg-panel px-3 py-2 text-[11.5px] text-muted">{plan.note}</p>
      )}

      {plan.segments.length === 0 ? (
        <p className="mt-5 rounded-lg border border-line bg-panel px-4 py-3 text-[13px] text-muted">
          Nothing in the corpus survived verification for this gap. Better to say so than to
          hand you a video that only mentions it.
        </p>
      ) : (
        <div className="mt-5 flex flex-col gap-8">
          {all.map((s, i) => (
            <div key={`${s.videoId}-${s.start}`}>
              {i === plan.segments.length && reopened && (
                <ReopenBanner outcome={reopened} label={plan.label} />
              )}
              <ClipCard seg={s} index={i} misconception={plan.misconception} onOutcome={handleOutcome} />
            </div>
          ))}
          {exhausted && reopened && (
            <p className="rounded-lg border border-gap/40 bg-gap/[0.06] px-4 py-3 text-[13px] leading-relaxed text-body">
              <span className="text-bright">{plan.label} is still open.</span> The corpus has no
              other verified explanation of this to offer — that is a gap in the library, not a
              verdict on you.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/** The best ten seconds of the demo: the system noticing its own remediation did not take. */
function ReopenBanner({ outcome, label }: { outcome: Outcome; label: string }) {
  return (
    <div className="fade-up mb-6 rounded-xl border border-gap/45 bg-gap/[0.08] px-4 py-3.5">
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-gap">Reopened</p>
      <p className="mt-1.5 text-[14px] leading-relaxed text-bright">
        You missed {outcome.missed} of {outcome.total} blanks on {label.toLowerCase()}, so it went
        back to being a gap.
      </p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
        Here is a different explanation — different teacher, different angle.
      </p>
    </div>
  );
}

function ClipCard({
  seg,
  index,
  misconception,
  onOutcome,
}: {
  seg: Segment;
  index: number;
  misconception?: string;
  onOutcome: (o: Outcome[]) => void;
}) {
  const [live, setLive] = useState(false);

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <div>
        <div className="overflow-hidden rounded-xl border border-line bg-black">
          {live ? (
            <iframe
              src={`${embedUrl(seg)}&autoplay=1`}
              title={seg.title}
              allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
              className="aspect-video w-full"
            />
          ) : (
            <button
              onClick={() => setLive(true)}
              className="group relative block aspect-video w-full"
              aria-label={`Play clip ${index + 1}: ${seg.title}`}
            >
              {/* Static thumbnail until clicked, so N embeds do not all boot at once. */}
              <img
                src={`https://i.ytimg.com/vi/${seg.videoId}/hqdefault.jpg`}
                alt=""
                className="h-full w-full object-cover opacity-55 transition group-hover:opacity-75"
              />
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/95 text-ink transition group-hover:scale-105">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden>
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </span>
              </span>
              <span className="absolute bottom-2 right-2 rounded bg-ink/85 px-1.5 py-0.5 font-mono text-[10.5px] text-body">
                {ts(seg.start)}–{ts(seg.end)}
              </span>
            </button>
          )}
        </div>

        <p className="mt-2.5 text-[11px] uppercase tracking-[0.16em] text-muted">
          {seg.channel} · {Math.round(seg.end - seg.start)}s
        </p>
        <p className="mt-1 text-[14.5px] font-medium leading-relaxed text-bright">{seg.why_this_clip}</p>
        <a
          href={`https://youtu.be/${seg.videoId}?t=${seg.start}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-[11.5px] text-muted underline underline-offset-4 transition hover:text-body"
        >
          open on YouTube
        </a>
      </div>

      <GuidedNotes segment={seg} misconception={misconception} onOutcome={onOutcome} />
    </div>
  );
}
