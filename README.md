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
| **M2 — Diagnostic engine (headless)** | ✅ complete |
| **M3 — Retrieval + LLM verification** | ✅ complete |
| **M4 — UI** | ✅ complete |
| **M5 — Guided notes + write-back** | ✅ complete |
| **M6 — Demo hardening** | ✅ complete |

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
  diagnostic.ts          probe selection, propagation, root-gap detection (pure, tested)
  simulate.ts            synthetic students + the diagnostic loop driver
  llm.ts                 the only provider access: validate, retry, cache, fixture fallback
  segment.ts             client-safe clip shapes + embed URL (no node: imports)
  syllabus.ts            syllabus -> frontier mapping, with verbatim quotes
  probes.ts              probe schema + derived fallback questions
  layout.ts              layered graph layout (pure)
  notes.ts               guided-note generation + sanitisation
  grade.ts               fuzzy cloze grading + the reopen decision (pure, tested)
  adjudicate.ts          batched near-miss adjudication
  server-data.ts         memoised disk reads + shared embedding pipeline
  verify.ts              segment verification prompt + schemas
  crash-course.ts        gaps -> candidates -> verified -> merged -> capped clips
scripts/
  validate-dag.ts        structural check — run before trusting the graph
  fetch-transcripts.ts   build-time only; never runs at request time
  build-index.ts         chunk + embed → chunks.json
  query.ts               retrieval verification harness
  diagnose.ts            diagnostic trace + convergence benchmark
  crash-course.ts        end-to-end: student -> diagnostic -> verified clips
  build-probes.ts        generate + commit one probe question per node
app/
  page.tsx               phase orchestration; the diagnostic runs client-side
  api/frontier           syllabus -> frontier + scoped subgraph + probes
  api/crash-course       gaps -> verified, timestamped clips
components/
  DagView.tsx            the animated prerequisite graph
  ProbeCard.tsx  SyllabusInput.tsx  Findings.tsx  CrashCourse.tsx  TracePanel.tsx
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

### Probe selection

A binary search over a partial order. Each candidate node is scored by what it would settle:

- **pass** settles the node *and everything upstream of it* (you can't do change of basis without span)
- **fail** settles the node *and everything downstream* (its dependents are compromised too)

The probe chosen maximises **`min((1−p)·passSettled, p·failSettled)`** — the weaker of its two branches, where `p` is the node's prior probability of being a gap. Maximising the weaker branch is a minimax objective: it rewards a split that is both *even* and *large*.

Scoring on `|passSettled − failSettled|` instead looks equivalent and is not. It measures only the *shape* of a split, never its size, so it rates a perfectly balanced 2-vs-2 probe above a 5-vs-5 one and spends questions on nodes whose answer barely moves the search. With `p = 0.5` the minimax form reduces to `0.5 · min(passSettled, failSettled)`, preserving the even-split intuition while staying sensitive to magnitude.

**The descent follows observed failures only.** Failing a node also marks its dependents `likely_gap` by inference — but those are already explained by the observed failure. Treating them as independent leads to chase unions their ancestor sets back out to nearly the whole graph and silently defeats the narrowing, turning the backward search into a sweep.

### Measured convergence

`npm run diagnose -- --bench` plants every in-scope node in turn as the sole hidden gap:

```
28 single-gap students, 28-node scope
  converged: avg 5.2 probes, worst 7
  total:     avg 7.6 probes, worst 10
  missed:    0
```

Whatever the student is missing — depth 0 or depth 10 — the search names the root, not the symptom. A test asserts this for every node in scope, so a DAG edit that breaks convergence fails the build.

**The descent goes one level at a time, into direct prerequisites only.** Widening it to all transitive ancestors is the intuitive move and is markedly worse: blame lives adjacent to a failure, and since a correct answer clears only a node plus its own ancestors, searching a wide shallow ancestor set degenerates into a linear scan. One level down turns "which of 10?" into "which of 3?". The search also finishes tracing one failure before starting another — unioning the prereqs of every open failure lets an unrelated branch outrank the last probe needed to root the current one, and the search wanders off one question short of the answer.

"Converged" is the probe at which the root gap is identified. "Total" is higher because after rooting one gap the engine keeps probing briefly, looking for a second independent gap — the product targets 2–4 findings. That speculation is capped (`stopAfterCleanStreak`) so a student with a single problem isn't asked ten questions to confirm it.

Scope matters: the search only probes the frontier and its transitive prerequisites. With a frontier of `change_of_basis, eigenvectors, gaussian_elimination`, the projection branch (`dot_product → orthogonality → projection`) is unreachable and correctly never probed.

### Retrieval

Embeddings are local (`all-MiniLM-L6-v2` via `@huggingface/transformers`) — no API key, no second network dependency, and the corpus embeds offline. Cosine similarity over an in-memory array; at 356 chunks a vector database would be pure overhead.

Ranking caps chunks per video (default 3). Without the cap the corpus votes by volume — the three 47-minute MIT lectures are ~43% of all chunks and monopolise every top-K, burying shorter videos that explain the concept better. The cap also guarantees the candidate pool spans multiple channels, which is what makes "here's a different explanation" possible when a node reopens.

Embeddings are the **recall** stage. LLM verification is the **precision** stage.

### Verification

For each root gap, all 12 candidates go to the model in **one** call, which classifies each as `teaches` / `mentions` / `unrelated`, writes a one-sentence `why_this_clip` addressed to the student, and may tighten the bounds. Batching is not only a rate-limit concession — the model sees the candidates side by side and ranks them against each other instead of judging each in a vacuum.

Kept segments are merged where they overlap, capped at 4 per gap and 15 minutes total. Refined timestamps are clamped inside the original chunk, so a hallucinated bound cannot escape the span.

A real result, for a student whose wrong answer revealed *"reads f(g(x)) left to right"*:

```
GAP: Function composition
     12 candidates -> 4 teach it -> 3 clips, 4:44 total

  2:53–5:04  3Blue1Brown — Matrix multiplication as composition | Chapter 4
     why: This clip directly addresses reading f(g(x)) right-to-left by explaining
          that functions act on inputs placed to their right.
```

That third clip is from a video about *matrix multiplication*, selected for a *function composition* gap, because that is where the ordering is explained. Similarity alone would never justify it; the misconception in the query is what earns it.

### Every model call

One module (`lib/llm.ts`) owns all provider access. Each call gets zod validation, one retry, a disk cache keyed by input hash, and a deterministic fixture fallback. Missing key, thrown error, 429, or output that fails validation twice all resolve to the fixture and keep rendering — no call site needs a `try`/`catch`, and none knows which provider this is.

Rate limits are treated as terminal rather than retried, since they will not clear on an immediate second attempt. The model is pinned (`gemini-3.6-flash`), not a floating alias: `gemini-flash-latest` returned `503 high demand` during testing, which is exactly the failure a demo cannot absorb.

`--cold` forces the true fallback path — no key *and* no cache — because a warm cache otherwise masks it and "survives a dead network" stays an untested claim:

```bash
npm run crash-course -- --missing function_composition --cold
```

## The interface

Implemented from the Claude Design project **"Diagnostic Graph UI Mockups"** (`Backtrack.dc.html`), imported via the design MCP. The mockup's five mastery palettes (`unk`/`lk`/`ck`/`lg`/`cg`) map one-to-one onto the engine's five `Mastery` values, so the visual language needed no translation layer.

Bodoni Moda for display, Instrument Sans for body, IBM Plex Mono for every label and counter. Dark and light themes off one token block. Glass panels over a slow breathing luminance wash. A fixed 78px spine carries saved classes, the four stage notches, and the theme toggle.

Four screens, one continuous state. The prerequisite graph stays on screen throughout, so the diagnostic reads as one object being progressively resolved rather than a sequence of unrelated pages.

1. **Input** — paste a syllabus, or prefill the sample. A `demo mode` link runs the whole flow from committed fixtures with zero network calls.
2. **Diagnostic** — one probe at a time beside the live graph. Nodes change colour as mastery propagates, and every changed node flashes, so a single correct answer visibly settles an entire subgraph. The current probe pulses; confirmed root gaps get a ring.
3. **Findings** — *"You're missing 1 thing"*, each stated as the misconception itself (**"You think** reads f(g(x)) left to right and applies f first"), the week it starts to bite, and the verbatim syllabus line that makes it load-bearing.
4. **Crash course** — clips as bounded YouTube embeds with their `why_this_clip`, plus the retrieval arithmetic (`12 candidates → 4 teach it → 3 kept · 4:44`).

A **"how we got here"** panel on every screen exposes the search's own working: each probe's candidate list, `pass`/`fail`/`gain` scores, and what each answer propagated to. Judges scoring technical execution should not have to take the algorithm on faith.

**The diagnostic runs entirely client-side.** `/api/frontier` returns the frontier, the scoped subgraph, and every probe for that scope in one response; scope is closed under prerequisites, so the subgraph is self-contained and the browser can run the whole search with no further round trips. Answering a question costs zero network.

Probe questions are a **build artifact** (`npm run build:probes` → `data/probes.json`), generated once and committed. The running app never generates a question, so the diagnostic has no latency and asks identical questions every run.

### Notes from implementing the design

- **`backdrop-filter` cannot live in the stylesheet.** Lightning CSS (Tailwind v4's compiler) strips it from the built CSS — as a literal, through a `var()`, and regardless of browserslist targets. Every other declaration in the same rule survives. The glass blur is the design's entire surface treatment, so it is applied as an inline style (`BLUR1`/`BLUR2` in `lib/palette.ts`).
- **The theme attribute belongs on `<html>`.** Custom properties cascade downward, so setting `data-theme` on an inner wrapper leaves `<body>` — the element painting the page background — still reading `:root`.
- **No CSS transition on a themed colour.** A colour whose value comes from a custom property does not reliably re-trigger a transition in Chromium: the variable updates, the transition never fires, and the element keeps painting the previous theme. Panels and graph nodes still animate, because they transition properties set directly rather than through a swapped token.
- **The graph runs top-to-bottom**, foundations at the top, matching the mockup's flow. Nodes are 154×34 labelled boxes rather than dots, so every concept is readable without hovering.

### Client/server split

`lib/segment.ts` exists because a single value import of `embedUrl` from a client component pulled `lib/crash-course` → `lib/verify` → `lib/llm` → `node:fs` into the browser bundle, which Turbopack fails on. Client-safe shapes and helpers live there; anything touching the model or the filesystem stays out of reach of `"use client"`.

## Guided notes and the write-back

Each clip carries a short note with 2–4 cloze blanks, generated from that clip's own transcript. Blanks go where the answer **is** the idea — for a student who reads `f(g(x))` left to right, the blanks land on *which function takes the input first*, not on an arbitrary noun.

Every blank is tagged with the DAG node it tests. That is what closes the loop: filling them in is a second, independent measurement of the same node the diagnostic flagged.

### Grading

Fuzzy match first, model second. `similarity()` normalises case, punctuation and leading articles, then scores by edit distance with a containment allowance:

| student typed | expected | verdict |
|---|---|---|
| `colums` | `columns` | correct — a typo is not a misconception |
| `the columns of the matrix` | `columns` | correct — right idea, extra words |
| `column vectors` | `columns` | correct — listed alternative |
| `determinant` | `columns` | wrong |

Only answers landing between the thresholds are escalated, in **one batched call** per submission. A typo never costs an API call, and the adjudicator is told to mark incorrect when genuinely torn — this feeds a decision about re-teaching, and wrongly waving someone through leaves the real gap in place.

### The reopen

A node reopens when **half or more** of its blanks come back wrong. One slip on a four-blank note is not evidence of a persistent gap; half of them is. Skipped blanks count as missed — not answering is not passing.

When it fires, the node returns to `likely_gap` in the same mastery state the diagnostic built, the graph above updates live, and the student is offered a different explanation:

```
REOPENED
You missed 3 of 3 blanks on function composition, so it went back to being a gap.
Here is a different explanation — different teacher, different angle.

  2:53–5:04   3BLUE1BROWN · 131s
```

**A reserve is held back deliberately.** Whatever survives verification but misses the cut becomes the alternate pool — and if everything fit, one segment is withheld anyway, preferring a channel not yet used. Replaying the same teacher saying the same thing is precisely what already failed, and a crash course that spends its whole corpus up front has nothing to say when it turns out to be wrong. In the run above, two Khan Academy clips are shown and the 3Blue1Brown one is held in reserve.

When the reserve is genuinely empty, the app says so rather than repeating itself: *"that is a gap in the library, not a verdict on you."*

## Demo mode

`?demo=1` replays a frozen run with **zero network calls** — no model provider, no embedding-model load, no retrieval. It is what gets recorded.

```bash
npm run freeze:demo     # records the rehearsed run to data/demo.json (needs a key)
npm run demo:check      # 10 full passes; fails on any variation or slowness
```

`data/demo.json` (67 KB, committed) holds the frontier and scoped subgraph, every probe for that scope, the verified plans for both rehearsed gaps, and a real generated note for **every clip the run can reach — including the write-back's replacement clip**, so the reopen moment never needs the network either.

The rehearsed student is missing **function composition** and **slope**. Both are stated prerequisites of the sample syllabus, they sit in independent branches, and the search roots both in 9 probes.

### The scripted answers

Answering inconsistently lands on *different* gaps — the propagation is doing its job, but the frozen fixtures only cover the rehearsed ones. Follow this exactly:

| # | Probe | Click | |
|---|---|---|---|
| 1 | Linear transformations | **B** | wrong |
| 2 | What 'linear' actually means | **B** | wrong |
| 3 | Slope and lines | **B** | wrong |
| 4 | Solving linear equations | **A** | correct |
| 5 | The coordinate plane | **A** | correct |
| 6 | Function composition | **B** | wrong |
| 7 | Function notation | **A** | correct |
| 8 | Span | **A** | correct |
| 9 | Basis | **A** | correct |

Nine probes, ending on `function_composition` and `slope_and_lines`. The script is regenerated by `freeze:demo` and stored in `data/demo.json`, so it can never drift from the fixtures.

Go off-script and the app stays honest rather than breaking: an uncovered gap renders with a note saying it is outside the rehearsed run.

### Verified cold

With the API key removed *and* the cache disabled — a cold machine with no credentials:

```
frontier   source=fixture  scope=29  probes=29
crash      source=fixture  plans=2  clips=3  reserve=1
note wUNWjd4bMmw:54   blanks=3  real
note wUNWjd4bMmw:270  blanks=2  real
note XkY2DOUCWMU:173  blanks=2  real
note MeU-KzdCBps:359  blanks=3  real
grade      reopen=true

real notes: 4, derived fallbacks: 0
total wall time: 0.40s
```

Every note is the real generated one, not the derived fallback. The whole pipeline runs in **0.4 seconds**.

### Ten passes

`demo:check` verifies two things that can drift for different reasons — the pure engine in-process, and the served path over HTTP:

```
engine — 10 runs of the rehearsed student
  probes: 9  roots: function_composition, slope_and_lines

served demo path — 10 runs
  frontier              1 distinct response   min 8ms   avg 18ms  max 65ms
  crash-course          1 distinct response   min 8ms   avg 13ms  max 31ms
  notes wUNWjd4bMmw:54  1 distinct response   min 7ms   avg 14ms  max 44ms
  notes wUNWjd4bMmw:270 1 distinct response   min 6ms   avg 11ms  max 17ms
  notes XkY2DOUCWMU:173 1 distinct response   min 8ms   avg 10ms  max 15ms
  notes MeU-KzdCBps:359 1 distinct response   min 7ms   avg 12ms  max 26ms
  grade                 1 distinct response   min 8ms   avg 12ms  max 24ms

OK — 10 runs, deterministic and inside budget.
```

It also asserts the write-back fires on a deliberately failed note, and fails the run if any reachable clip falls back to a derived note.

**Live mode stays available** to prove the thing is real — the same flow without `?demo=1` calls the model for syllabus mapping, verification, and notes. Cold, that path takes ~37s for the syllabus alone, which is why the video does not bet on it.

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

Trace the diagnostic against a synthetic student — this prints the same decision data the UI's "how we got here" panel will render:

```bash
npm run diagnose -- --missing function_composition
```

```bash
npm run diagnose -- --bench
```

Run the whole pipeline headless — diagnostic through to timestamped clips:

```bash
npm run crash-course -- --missing function_composition,slope_and_lines
```

### Environment

Copy `.env.example` to `.env.local` and add a free [Google AI Studio](https://aistudio.google.com) key as `GEMINI_API_KEY`. Embeddings are local and need no key; only diagnosis, verification, and notes generation call the API, and all of them fall back to fixtures without one.

## Build notes

- **Windows on ARM64:** use `@huggingface/transformers`, not `@xenova/transformers`. The latter pulls `sharp@0.32`, which ships no prebuilt win32-arm64 binary and fails node-gyp on Snapdragon machines.
- **Transcript language must be forced.** `YoutubeTranscript.fetchTranscript(id)` returns whichever caption track YouTube lists first — Arabic for 3Blue1Brown, Azerbaijani for Khan Academy. It does not error; you silently get a foreign-language corpus. Always pass `{ lang: "en" }`.
- **`offset` and `duration` are milliseconds**, despite the field names. Using them raw puts every timestamp 1000× off.
- **3 of 24 videos have auto-generated captions** with essentially no punctuation (MIT lectures 1 and 3, one Khan video). Sentence-boundary snapping is disabled per-video for those, detected automatically at fetch time via punctuation density.
