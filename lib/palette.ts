/**
 * Mastery palette from the design project. Client-safe — no node imports.
 *
 * The design's five states (unk/lk/ck/lg/cg) map exactly onto the engine's five Mastery
 * values, so nothing needs translating beyond the names.
 */
import type { Mastery } from "./types";

export type Theme = "dark" | "light";

export type Swatch = {
  ring: string;
  fill: string;
  text: string;
  /** 0 = flat, higher = brighter drop-shadow. Directly observed states glow; inferred ones do not. */
  glow: number;
  label: string;
};

export function swatch(state: Mastery, theme: Theme): Swatch {
  const light = theme === "light";
  switch (state) {
    case "likely_known":
      return { ring: "#3F8E86", fill: "rgba(63,142,134,.16)", text: light ? "#175F55" : "#A8DAD3", glow: 0.22, label: "likely known" };
    case "confirmed_known":
      return { ring: "#5CC9B4", fill: "rgba(92,201,180,.2)", text: light ? "#0F5E53" : "#D2F4EC", glow: 0.75, label: "known" };
    case "likely_gap":
      return { ring: "#6B78C4", fill: "rgba(107,120,196,.16)", text: light ? "#333FA0" : "#C2C8EF", glow: 0.22, label: "likely gap" };
    case "confirmed_gap":
      return { ring: "#98A6FF", fill: "rgba(152,166,255,.22)", text: light ? "#2B37A2" : "#E3E7FF", glow: 0.75, label: "gap" };
    default:
      return {
        ring: "#5A6675",
        fill: light ? "rgba(20,30,45,.05)" : "rgba(255,255,255,.03)",
        text: light ? "#4E5866" : "#939DAC",
        glow: 0,
        label: "unknown",
      };
  }
}

export const LEGEND_ORDER: Mastery[] = [
  "unknown",
  "likely_known",
  "confirmed_known",
  "likely_gap",
  "confirmed_gap",
];

/**
 * The glass blur, as inline style.
 *
 * It cannot live in the stylesheet: Lightning CSS (Tailwind v4's compiler) strips
 * `backdrop-filter` from the built CSS — literal or var(), and regardless of browserslist
 * targets. Inline styles bypass that pipeline, and the blur is the design's whole surface
 * treatment, so it is not optional.
 */
export const BLUR1 = {
  backdropFilter: "blur(16px) saturate(1.2)",
  WebkitBackdropFilter: "blur(16px) saturate(1.2)",
} as const;

export const BLUR2 = {
  backdropFilter: "blur(9px) saturate(1.1)",
  WebkitBackdropFilter: "blur(9px) saturate(1.1)",
} as const;
