# Backtrack

**Give it your syllabus before the course starts. It finds the prerequisite you're actually missing — often from two years ago — and builds a crash course out of precisely-timestamped YouTube segments.**

A student who fails linear algebra in week 5 usually doesn't have an eigenvector problem. They have a change-of-basis problem, or a "what does matrix multiplication *mean*" problem, from long before this course started. Most tools tell you *that* you got something wrong. Backtrack tells you **when you started being wrong**, and hands you the 12 minutes that fix it.

## The design rule

**The AI diagnoses and retrieves. It does not generate course content.** Every explanation the student sees is an existing video from someone who teaches it well — 3Blue1Brown, MIT OCW, Khan Academy. The model's job is to find *which* 90 seconds, and to prove the student needs them.

## Pipeline

```
syllabus text
    │
    ├─► map onto prerequisite DAG ───────► target frontier (what the course assumes you know)
    │
    ▼
backward diagnostic search  ◄──────┐      6–10 probe questions, binary search over the DAG
    │                              │
    ▼                              │
confirmed root gaps (2–4)          │      a node that FAILED while all its prereqs PASSED
    │                              │
    ▼                              │
segment retrieval                  │      local embeddings → top-12 → LLM keep/drop verification
    │                              │
    ▼                              │
guided notes with cloze blanks     │      student fills them in while watching
    │                              │
    └──────────────────────────────┘      missed blanks reopen the node → different clip, different channel
```

That last arrow is what makes this a system rather than a feature list.

## Status

| Milestone | State |
|---|---|
| **M1 — Data** | ✅ complete |
| M2 — Diagnostic engine (headless) | not started |
| M3 — Retrieval + LLM verification | not started |
| M4 — UI | not started |
| M5 — Guided notes + write-back | not started |
| M6 — Demo hardening | not started |

## Architecture

Single Next.js deployable. No separate backend, no hosted database, no auth. Pure logic lives in `/lib` and imports no React, so it is unit-testable in isolation.

```
data/
  dag.json               33 hand-authored prerequisite nodes, depth 0–12
  videos.json            24 YouTube videos; every ID verified against YouTube oEmbed
  transcripts/*.json     committed English transcripts (fetched once, offline)
  chunks.json            356 embedded chunks, 384-dim — the retrieval index
lib/
  types.ts               shared domain types
  dag.ts                 graph queries: ancestors, descendants, depth derivation, validation
  chunk.ts               transcript windowing (pure, tested)
  retrieval.ts           cosine ranking, per-video diversity, span merging (pure)
scripts/
  validate-dag.ts        structural check — run before trusting the graph
  fetch-transcripts.ts   build-time only; never runs at request time
  build-index.ts         chunk + embed → chunks.json
  query.ts               retrieval verification harness
```

### The prerequisite DAG

33 nodes spanning `fraction_arithmetic` (depth 0) to `diagonalization` (depth 12), 59 edges. `depth` is **derived**, not hand-assigned — `1 + max(depth of prereqs)` — and `validate-dag.ts` fails the build if a declared depth disagrees with the structure, or if the graph contains a cycle.

Every node carries 2–3 **misconceptions**: specific wrong mental models, not topic labels.

```json
{
  "id": "matrix_multiplication",
  "misconceptions": [
    "believes it is elementwise, like addition",
    "executes the row-times-column algorithm but cannot say what the product represents",
    "assumes AB equals BA because multiplication of numbers commutes"
  ]
}
```

This field is load-bearing twice over. Probe distractors are generated from it, so a wrong answer identifies *which* misconception the student holds — and that misconception is then injected into the retrieval query, which is what separates "a video about matrices" from "the 90 seconds addressing your specific error."

### Propagation rules

Mastery per node is one of `unknown | likely_known | likely_gap | confirmed_gap | confirmed_known`.

- **Pass → every transitive ancestor becomes `likely_known`.** You cannot correctly perform change of basis without understanding span. One correct answer settles a whole subgraph.
- **Fail → the node becomes `likely_gap`, but the cause is unknown.** Descend into its prerequisites and keep probing.
- **Root gap** = a node that failed while *all* of its prerequisites passed. That is the "here's when you started being wrong" moment, and the thing worth remediating.

Probe selection is a binary search over the graph: at each step, choose the node that most evenly splits the still-unresolved set, minimising `|passSettled − failSettled|`. This converges in 6–10 questions instead of 30.

### Retrieval

Embeddings are local (`all-MiniLM-L6-v2` via `@huggingface/transformers`) — no API key, no second network dependency, and the corpus embeds offline. Cosine similarity over an in-memory array; at 356 chunks a vector database would be pure overhead.

Ranking caps chunks per video (default 3). Without the cap the corpus votes by volume — the three 47-minute MIT lectures are ~43% of all chunks and monopolise every top-K, burying shorter videos that explain the concept better. The cap also guarantees the candidate pool spans multiple channels, which is what makes "here's a different explanation" possible when a node reopens.

Embeddings are the **recall** stage. The LLM verification pass (M3) is the **precision** stage: it reads the top 12 and drops segments that merely *mention* the concept rather than teach it.

## Hard constraints

1. **No video or audio is ever downloaded, cut, or re-hosted.** A "clip" is an iframe embed with `start` and `end` parameters; the player enforces the bounds. Free, instant, and inside YouTube's terms.
2. **Transcripts are fetched once at build time and committed.** Transcript endpoints IP-block datacenter ranges — anything fetching at request time works locally and dies in production. The app reads only the local cache.
3. **Every LLM call has a deterministic fallback.** Missing key, thrown error, or rate limit all fall through to committed fixture data and keep rendering. The demo survives a dead network.
4. No speech-to-text, no voice, no TTS.

## Running it

```bash
npm install
npm run validate:dag      # structural check on the graph
npm test                  # pure-logic unit tests
npm run query -- --coverage
```

The corpus is committed, so `fetch:transcripts` and `build:index` only need re-running if you change the video list or retune chunking.

```bash
npm run query -- "what does matrix multiplication mean"
npm run query -- --node change_of_basis --mis 0 --k 12
```

### Environment

Copy `.env.example` to `.env.local` and add a free [Google AI Studio](https://aistudio.google.com) key as `GEMINI_API_KEY`. Embeddings are local and need no key; only diagnosis, verification, and notes generation call the API, and all of them fall back to fixtures without one.

## Build notes

- **Windows on ARM64:** use `@huggingface/transformers`, not `@xenova/transformers`. The latter pulls `sharp@0.32`, which ships no prebuilt win32-arm64 binary and fails node-gyp on Snapdragon machines.
- **Transcript language must be forced.** `YoutubeTranscript.fetchTranscript(id)` returns whichever caption track YouTube lists first — Arabic for 3Blue1Brown, Azerbaijani for Khan Academy. It does not error; you silently get a foreign-language corpus. Always pass `{ lang: "en" }`.
- **`offset` and `duration` are milliseconds**, despite the field names. Using them raw puts every timestamp 1000× off.
- **3 of 24 videos have auto-generated captions** with essentially no punctuation (MIT lectures 1 and 3, one Khan video). Sentence-boundary snapping is disabled per-video for those, detected automatically at fetch time via punctuation density.
