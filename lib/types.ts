/**
 * Shared domain types. Pure data — no React, no I/O, no framework imports.
 */

export type NodeId = string;

export type DagNode = {
  id: NodeId;
  label: string;
  /** One sentence describing what mastery looks like. */
  blurb: string;
  /** Derived: 1 + max(depth of prereqs). Roots are 0. Validated, not trusted. */
  depth: number;
  prereqs: NodeId[];
  /** Specific wrong mental models. Load-bearing: drives probe distractors and retrieval queries. */
  misconceptions: string[];
};

export type Dag = {
  version: number;
  domain: string;
  nodes: DagNode[];
};

export type TranscriptChunk = {
  videoId: string;
  /** Seconds from video start. */
  start: number;
  end: number;
  text: string;
  embedding: number[];
};

export type VideoMeta = {
  videoId: string;
  title: string;
  channel: string;
  /** DAG nodes this video is expected to cover. Authoring hint only — retrieval is embedding-driven. */
  covers: NodeId[];
};

export type Mastery =
  | "unknown"
  | "likely_known"
  | "likely_gap"
  | "confirmed_gap"
  | "confirmed_known";
