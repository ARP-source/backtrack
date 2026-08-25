"use client";

import type { Theme } from "@/lib/palette";

export type CourseChip = { id: string; code: string; name: string; gaps: number; done: number };

const STAGES: Array<[string, number]> = [
  ["Syllabus", 1],
  ["Diagnostic", 2],
  ["Findings", 3],
  ["Crash course", 4],
];

type Props = {
  stage: number;
  onGo: (n: number) => void;
  theme: Theme;
  onToggleTheme: () => void;
  courses: CourseChip[];
  activeId: string | null;
  onOpenCourse: (id: string) => void;
};

/**
 * The fixed left rail: saved classes as vertical chips, the four stages as notches that
 * lengthen and light as you move through them, and the theme toggle pinned at the bottom.
 */
export default function Spine({ stage, onGo, theme, onToggleTheme, courses, activeId, onOpenCourse }: Props) {
  return (
    <div
      className="bt-spine"
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        bottom: 0,
        zIndex: 4,
        width: 78,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        padding: "26px 0 24px 22px",
        overflow: "hidden",
      }}
    >
      <div
        className="bt-spine-rule"
        style={{
          position: "absolute",
          left: 34,
          top: 0,
          bottom: 0,
          width: 1,
          background: "linear-gradient(180deg,rgba(160,176,200,.04),var(--spine),rgba(160,176,200,.04))",
          pointerEvents: "none",
        }}
      />

      <div
        className="bt-courses"
        style={{
          flex: "0 1 auto",
          minHeight: 0,
          overflowY: "auto",
          scrollbarWidth: "none",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 14,
          margin: "0 0 30px -1px",
        }}
      >
        {courses.map((c) => {
          const on = c.id === activeId;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onOpenCourse(c.id)}
              title={`${c.code} — ${c.name}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                padding: 0,
                background: "none",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
                writingMode: "vertical-rl",
                textOrientation: "mixed",
                fontFamily: "var(--font-mono), monospace",
                fontSize: 9,
                letterSpacing: "0.2em",
                color: on ? "var(--paper)" : "var(--faint)",
                textTransform: "uppercase",
                whiteSpace: "nowrap",
                transition: "color 300ms var(--ease)",
              }}
            >
              <span
                style={{
                  display: "block",
                  width: 1,
                  height: on ? 22 : 11,
                  background: c.gaps > 0 ? "var(--peri)" : on ? "var(--teal)" : "var(--spine)",
                  transition: "all 460ms var(--ease)",
                }}
              />
              {c.code}
            </button>
          );
        })}
      </div>

      <div
        className="bt-notches"
        style={{ flex: "0 0 auto", position: "relative", display: "flex", flexDirection: "column", gap: 28, marginTop: "auto" }}
      >
        {STAGES.map(([label, n]) => {
          const on = stage === n;
          const past = stage > n;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onGo(n)}
              title={label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 11,
                padding: "9px 8px 9px 0",
                background: "none",
                border: "none",
                borderRadius: 5,
                cursor: "pointer",
                transition: "all 300ms var(--ease)",
              }}
            >
              <span
                style={{
                  display: "block",
                  width: on ? 26 : past ? 13 : 9,
                  height: 1,
                  background: on ? "var(--teal)" : past ? "var(--mute)" : "var(--spine)",
                  boxShadow: on ? "0 0 10px 0 var(--teal)" : "none",
                  transition: "all 520ms var(--ease)",
                }}
              />
              <span
                style={{
                  fontFamily: "var(--font-mono), monospace",
                  fontSize: 9.5,
                  letterSpacing: "0.18em",
                  color: on ? "var(--paper)" : past ? "var(--mute)" : "var(--faint)",
                  textTransform: "uppercase",
                  fontVariantNumeric: "tabular-nums",
                  transition: "color 520ms var(--ease)",
                }}
              >
                0{n}
              </span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onToggleTheme}
        className="bt-toggle"
        title="Toggle theme"
        style={{
          flex: "0 0 auto",
          margin: "auto 0 0 -3px",
          padding: "4px 1px",
          background: "none",
          border: "none",
          borderRadius: 5,
          cursor: "pointer",
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          fontFamily: "var(--font-mono), monospace",
          fontSize: 9,
          letterSpacing: "0.2em",
          color: "var(--faint)",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
          transition: "color 300ms var(--ease)",
        }}
      >
        {theme === "light" ? "Dark" : "Light"}
      </button>
    </div>
  );
}
