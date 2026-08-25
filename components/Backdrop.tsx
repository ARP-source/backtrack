"use client";

/**
 * The breathing luminance wash plus a fine grain overlay — the atmosphere the whole
 * design sits on. Fixed, non-interactive, behind everything.
 */
export default function Backdrop() {
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          inset: "-18%",
          filter: "blur(70px)",
          animation: "bt-breathe 34s cubic-bezier(.4,0,.2,1) infinite alternate",
          background:
            "radial-gradient(38% 34% at 24% 16%, var(--lum-a), transparent 72%), radial-gradient(34% 30% at 78% 80%, var(--lum-b), transparent 74%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.035,
          mixBlendMode: "overlay",
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.82' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
    </div>
  );
}
