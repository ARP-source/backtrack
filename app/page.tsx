"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { indexDag, descendants } from "@/lib/dag";
import {
  createState,
  selectProbe,
  applyAnswer,
  isComplete,
  rootGaps,
  DEFAULT_OPTIONS,
  type DiagnosticState,
} from "@/lib/diagnostic";
import { layoutDag } from "@/lib/layout";
import type { DagNode, Mastery, NodeId } from "@/lib/types";
import type { Probe } from "@/lib/probes";
import type { GapPlan } from "@/lib/segment";
import type { FrontierEntry } from "@/lib/syllabus";
import SyllabusInput from "@/components/SyllabusInput";
import DagView, { MasteryLegend } from "@/components/DagView";
import ProbeCard from "@/components/ProbeCard";
import TracePanel from "@/components/TracePanel";
import Findings, { type Finding } from "@/components/Findings";
import CrashCourse from "@/components/CrashCourse";

type Phase = "input" | "diagnostic" | "findings" | "course";

type FrontierResponse = {
  courseTitle: string;
  frontier: FrontierEntry[];
  nodes: DagNode[];
  probes: Record<NodeId, Probe>;
  source: string;
  note?: string;
};

export default function Page() {
  const [phase, setPhase] = useState<Phase>("input");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<FrontierResponse | null>(null);
  const [plans, setPlans] = useState<GapPlan[]>([]);
  const [sample, setSample] = useState("");

  // The engine mutates a single state object; `version` is what makes React look again.
  const stateRef = useRef<DiagnosticState | null>(null);
  const [version, setVersion] = useState(0);

  const idx = useMemo(() => (data ? indexDag({ version: 1, domain: "", nodes: data.nodes }) : null), [data]);
  const layout = useMemo(() => (data ? layoutDag(data.nodes) : null), [data]);

  // A fresh Map each version so DagView's change-detection can diff against the previous.
  const mastery = useMemo<Map<NodeId, Mastery>>(
    () => (stateRef.current ? new Map(stateRef.current.mastery) : new Map()),
    [version]
  );

  const labelOf = useCallback((id: string) => idx?.byId.get(id)?.label ?? id, [idx]);

  useMemo(() => {
    // Preload the sample so the prefill button is instant.
    fetch("/api/sample")
      .then((r) => r.text())
      .then(setSample)
      .catch(() => {});
  }, []);

  async function start(syllabus: string, demo: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/frontier", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ syllabus, demo }),
      });
      if (!res.ok) throw new Error(`frontier failed (${res.status})`);
      const json: FrontierResponse = await res.json();
      if (!json.nodes?.length) throw new Error("no prerequisites could be mapped from that syllabus");

      const localIdx = indexDag({ version: 1, domain: "", nodes: json.nodes });
      stateRef.current = createState(localIdx, json.frontier.map((f) => f.nodeId));
      setData(json);
      setVersion((v) => v + 1);
      setPhase("diagnostic");
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  const current = useMemo(() => {
    if (!idx || !stateRef.current || phase !== "diagnostic") return null;
    if (isComplete(stateRef.current, idx, DEFAULT_OPTIONS)) return null;
    return selectProbe(stateRef.current, idx).chosen;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, phase, version]);

  function answer(correct: boolean, misconception?: string) {
    const state = stateRef.current;
    if (!state || !idx || !current) return;
    const { scored } = selectProbe(state, idx);
    applyAnswer(state, idx, current, correct, misconception, scored);
    setVersion((v) => v + 1);
    if (isComplete(state, idx, DEFAULT_OPTIONS)) {
      // Let the last propagation animation land before switching screens.
      setTimeout(() => setPhase("findings"), 900);
    }
  }

  const findings: Finding[] = useMemo(() => {
    const state = stateRef.current;
    if (!state || !idx || !data) return [];
    const frontierByNode = new Map(data.frontier.map((f) => [f.nodeId, f]));

    return rootGaps(state, idx).map((id) => {
      const node = idx.byId.get(id)!;
      // When this gap first bites: the earliest week among the frontier entries that
      // depend on it (or its own, if the syllabus named it directly).
      const dependents = [id, ...descendants(idx, id)];
      let week: number | null = null;
      let bitesAt: string | undefined;
      for (const d of dependents) {
        const f = frontierByNode.get(d);
        if (f && (week === null || f.week < week)) {
          week = f.week;
          bitesAt = f.neededFor
            ? `Week ${f.week} covers ${labelOf(f.neededFor).toLowerCase()}, which rests on this.`
            : f.quote
              ? `The syllabus expects it: “${f.quote.trim()}”`
              : undefined;
        }
      }
      const step = state.steps.find((s) => s.chosen === id && !s.correct);
      return { node, misconception: step?.misconception, week, bitesAt };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, data, version, phase, labelOf]);

  async function buildCourse() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/crash-course", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          gaps: findings.map((f) => ({ nodeId: f.node.id, misconception: f.misconception })),
        }),
      });
      const json = await res.json();
      setPlans(json.plans ?? []);
      setPhase("course");
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  /**
   * The write-back. Missed blanks are a second, independent measurement of a node we just
   * remediated — so a failure here returns it to a gap in the same mastery state the
   * diagnostic built, and the graph above updates live.
   */
  function reopen(nodeId: NodeId) {
    const state = stateRef.current;
    if (!state) return;
    state.mastery.set(nodeId, "likely_gap");
    setVersion((v) => v + 1);
  }

  function restart() {
    stateRef.current = null;
    setData(null);
    setPlans([]);
    setPhase("input");
    setVersion(0);
  }

  if (phase === "input") {
    return (
      <>
        <SyllabusInput onStart={start} busy={busy} sample={sample} />
        {error && <ErrorBar message={error} />}
      </>
    );
  }

  const state = stateRef.current!;
  const roots = idx ? rootGaps(state, idx) : [];
  const probe = current ? data!.probes[current] : null;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-7 flex items-baseline justify-between gap-4">
        <span className="text-[11px] font-medium uppercase tracking-[0.22em] text-accent">Backtrack</span>
        <span className="truncate text-[12px] text-muted">
          {data?.courseTitle}
          {data?.source === "fixture" && <span className="ml-2 text-accent/70">demo mode</span>}
        </span>
      </header>

      {/* The graph stays on screen across screens so it reads as one continuous state. */}
      {layout && (
        <div className="rounded-xl border border-line bg-panel/40 px-3 pb-3 pt-2">
          <DagView layout={layout} mastery={mastery} current={current} roots={roots} height={300} />
          <div className="mt-1 flex items-center justify-between px-1">
            <MasteryLegend />
            <span className="font-mono text-[10.5px] text-muted">
              {state.scope.size} prerequisites in scope
            </span>
          </div>
        </div>
      )}

      <div className="mt-8">
        {phase === "diagnostic" && probe && (
          <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
            <ProbeCard
              probe={probe}
              index={state.steps.length}
              budget={DEFAULT_OPTIONS.budget}
              onAnswer={answer}
            />
            <div className="md:pt-8">
              <TracePanel steps={state.steps} labelOf={labelOf} />
            </div>
          </div>
        )}

        {phase === "findings" && (
          <>
            <Findings
              findings={findings}
              probeCount={state.steps.length}
              onContinue={buildCourse}
              busy={busy}
            />
            <div className="mt-8">
              <TracePanel steps={state.steps} labelOf={labelOf} />
            </div>
          </>
        )}

        {phase === "course" && <CrashCourse plans={plans} onRestart={restart} onReopen={reopen} />}
      </div>

      {error && <ErrorBar message={error} />}
    </main>
  );
}

function ErrorBar({ message }: { message: string }) {
  return (
    <div className="fixed inset-x-0 bottom-0 border-t border-gap/40 bg-gap/10 px-6 py-3 text-center text-[13px] text-bright">
      {message}
    </div>
  );
}
