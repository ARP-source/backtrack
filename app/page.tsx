"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { BLUR1, type Theme } from "@/lib/palette";
import type { DagNode, Mastery, NodeId } from "@/lib/types";
import type { Probe } from "@/lib/probes";
import type { GapPlan } from "@/lib/segment";
import type { FrontierEntry } from "@/lib/syllabus";
import Backdrop from "@/components/Backdrop";
import Spine from "@/components/Spine";
import SyllabusInput from "@/components/SyllabusInput";
import DagView, { MasteryLegend } from "@/components/DagView";
import ProbeCard from "@/components/ProbeCard";
import TracePanel from "@/components/TracePanel";
import Findings, { type Finding } from "@/components/Findings";
import CrashCourse from "@/components/CrashCourse";
import FormingOverlay from "@/components/FormingOverlay";

type FrontierResponse = {
  courseTitle: string;
  frontier: FrontierEntry[];
  nodes: DagNode[];
  probes: Record<NodeId, Probe>;
  source: string;
};

type StoredClass = { id: string; code: string; name: string; syllabus: string; gaps: number; done: number };

const STORE = "backtrack.classes.v1";

/** Trim a syllabus quote to a whole number of words so a chip never cuts mid-word. */
function clip(s?: string, max = 42): string | undefined {
  const t = s?.trim();
  if (!t) return undefined;
  if (t.length <= max) return t;
  return `${t.slice(0, max).replace(/\s+\S*$/, "")}…`;
}

/** First syllabus line becomes the class identity, per the design. */
function parseClass(text: string): { code: string; name: string } {
  const first = (text.trim().split("\n")[0] ?? "").trim() || "Untitled class";
  const m = first.match(/^([A-Za-z]{2,6}\s?\d{2,4})\s*[—–:\-·]*\s*(.*)$/);
  const code = m ? m[1].toUpperCase().replace(/\s+/g, " ") : "CLASS";
  let name = m && m[2] ? m[2] : m ? "" : first;
  name = name.replace(/\s+/g, " ").trim();
  if (name) name = name.toLowerCase().replace(/(^|[\s(])([a-z])/g, (_a, b, c) => b + c.toUpperCase());
  return { code, name: name || "Untitled class" };
}

export default function Page() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [phase, setPhase] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<FrontierResponse | null>(null);
  const [plans, setPlans] = useState<GapPlan[]>([]);
  const [sample, setSample] = useState("");
  const [forming, setForming] = useState(false);
  const [classes, setClasses] = useState<StoredClass[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const stateRef = useRef<DiagnosticState | null>(null);
  const [version, setVersion] = useState(0);

  const idx = useMemo(() => (data ? indexDag({ version: 1, domain: "", nodes: data.nodes }) : null), [data]);
  const layout = useMemo(() => (data ? layoutDag(data.nodes) : null), [data]);

  // A fresh Map each version so DagView can diff against the previous render.
  const mastery = useMemo<Map<NodeId, Mastery>>(
    () => (stateRef.current ? new Map(stateRef.current.mastery) : new Map()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version]
  );

  const labelOf = useCallback((id: string) => idx?.byId.get(id)?.label ?? id, [idx]);

  useEffect(() => {
    fetch("/api/sample").then((r) => r.text()).then(setSample).catch(() => {});
    try {
      const raw = localStorage.getItem(STORE);
      const d = raw && JSON.parse(raw);
      if (d?.theme) setTheme(d.theme);
      if (Array.isArray(d?.classes)) setClasses(d.classes);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify({ theme, classes }));
    } catch {}
  }, [theme, classes]);

  // The theme attribute has to live on <html>: custom properties cascade downward, so
  // setting it on an inner div leaves <body> — the element painting the page background —
  // still reading the dark values from :root.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  async function start(syllabus: string, demo: boolean, existingId?: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/frontier", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ syllabus, demo }),
      });
      if (!res.ok) throw new Error(`Could not read that syllabus (${res.status})`);
      const json: FrontierResponse = await res.json();
      if (!json.nodes?.length) throw new Error("No prerequisites could be mapped from that syllabus");

      const localIdx = indexDag({ version: 1, domain: "", nodes: json.nodes });
      stateRef.current = createState(localIdx, json.frontier.map((f) => f.nodeId));
      setData(json);
      setPlans([]);
      setVersion((v) => v + 1);

      let id = existingId ?? null;
      if (!id) {
        const meta = parseClass(syllabus);
        id = `c${Date.now().toString(36)}`;
        setClasses((cs) => [...cs, { id: id!, code: meta.code, name: meta.name, syllabus, gaps: 0, done: 0 }]);
      }
      setActiveId(id);
      setPhase(2);
      setForming(true);
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  const current = useMemo(() => {
    if (!idx || !stateRef.current || phase !== 2) return null;
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
      const gaps = rootGaps(state, idx).length;
      const asked = state.steps.length;
      setClasses((cs) => cs.map((c) => (c.id === activeId ? { ...c, gaps, done: asked } : c)));
      // Let the last propagation land before switching screens.
      setTimeout(() => setPhase(3), 1000);
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
      let week: number | null = null;
      let topic: string | undefined;
      for (const d of [id, ...descendants(idx, id)]) {
        const f = frontierByNode.get(d);
        if (f && (week === null || f.week < week)) {
          week = f.week;
          topic = f.neededFor ? labelOf(f.neededFor) : clip(f.quote);
        }
      }
      const wrong = state.steps.map((s, i) => ({ s, i })).filter(({ s }) => !s.correct);
      const mine = wrong.find(({ s }) => s.chosen === id);
      const evidence = mine ? `q${mine.i + 1} wrong` : "inferred";
      return { node, misconception: mine?.s.misconception, week, topic, evidence };
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
        body: JSON.stringify({ gaps: findings.map((f) => ({ nodeId: f.node.id, misconception: f.misconception })) }),
      });
      const json = await res.json();
      setPlans(json.plans ?? []);
      setPhase(4);
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  /**
   * The write-back. Missed blanks are a second, independent measurement of a node we just
   * remediated — a failure here returns it to a gap in the live mastery state, and the
   * graph updates with it.
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
    setActiveId(null);
    setPhase(1);
    setVersion(0);
  }

  function goStage(n: number) {
    if (n === 1) return setPhase(1);
    if (!data) return;
    if (n === 4 && plans.length === 0) return;
    if (n === 3 && findings.length === 0 && phase < 3) return;
    setPhase(n);
  }

  const state = stateRef.current;
  const roots = state && idx ? rootGaps(state, idx) : [];
  const probe = current && data ? data.probes[current] : null;

  return (
    <div
      className="bt-root"
      style={{ minHeight: "100vh", position: "relative", paddingLeft: 78, overflowX: "hidden", backgroundColor: "var(--bg)", color: "var(--paper)" }}
    >
      <Backdrop />

      <Spine
        stage={phase}
        onGo={goStage}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
        courses={classes.map((c) => ({ id: c.id, code: c.code, name: c.name, gaps: c.gaps, done: c.done }))}
        activeId={activeId}
        onOpenCourse={(id) => {
          const c = classes.find((x) => x.id === id);
          if (c) start(c.syllabus, true, c.id);
        }}
      />

      {forming && layout && <FormingOverlay layout={layout} theme={theme} onDone={() => setForming(false)} />}

      {phase === 1 && (
        <SyllabusInput
          onStart={(s, demo) => start(s, demo)}
          busy={busy}
          sample={sample}
          classes={classes}
          activeId={activeId}
          onOpenClass={(id) => {
            const c = classes.find((x) => x.id === id);
            if (c) start(c.syllabus, true, c.id);
          }}
        />
      )}

      {phase === 2 && state && layout && idx && (
        <div style={{ position: "relative", zIndex: 1, padding: "32px 26px 40px" }}>
          <div
            className="bt-split"
            style={{ maxWidth: 1460, margin: "0 auto", display: "grid", gridTemplateColumns: "minmax(340px,1fr) minmax(0,760px)", gap: 28, alignItems: "start" }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                <div className="eyebrow">02 — Diagnostic</div>
                <div className="mono" style={{ fontSize: 11, color: "var(--mute)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                  {state.steps.length} asked · {roots.length} gap{roots.length === 1 ? "" : "s"}
                </div>
              </div>

              {probe && current ? (
                <ProbeCard
                  probe={probe}
                  label={labelOf(current)}
                  index={state.steps.length}
                  budget={DEFAULT_OPTIONS.budget}
                  onAnswer={answer}
                />
              ) : (
                <div className="glass1" style={{ ...BLUR1, padding: 30 }}>
                  <p className="serif" style={{ fontSize: 24, margin: 0 }}>Diagnostic complete.</p>
                  <button type="button" onClick={() => setPhase(3)} className="btn-peri" style={{ marginTop: 20, width: "100%", padding: 15, fontSize: 14, fontWeight: 500 }}>
                    See what we found
                  </button>
                </div>
              )}

              <TracePanel steps={state.steps} labelOf={labelOf} />
            </div>

            <div className="glass1" style={{ ...BLUR1, padding: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
                <span className="mono" style={{ fontSize: 9.5, letterSpacing: ".14em", color: "var(--faint)", textTransform: "uppercase" }}>
                  Prerequisite graph · {state.scope.size} nodes
                </span>
                <MasteryLegend theme={theme} />
              </div>
              <div style={{ overflowX: "auto", overflowY: "hidden", margin: "0 -4px", padding: "0 4px" }}>
                <DagView layout={layout} mastery={mastery} theme={theme} current={current} roots={roots} />
              </div>
            </div>
          </div>
        </div>
      )}

      {phase === 3 && state && (
        <Findings findings={findings} probeCount={state.steps.length} onContinue={buildCourse} busy={busy} />
      )}

      {phase === 4 && <CrashCourse plans={plans} onRestart={restart} onReopen={reopen} />}

      {error && (
        <div
          style={{
            position: "fixed",
            insetInline: 0,
            bottom: 0,
            zIndex: 30,
            padding: "12px 26px",
            textAlign: "center",
            background: "rgba(152,166,255,.12)",
            borderTop: "1px solid rgba(152,166,255,.4)",
            fontSize: 13,
            color: "var(--paper)",
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
