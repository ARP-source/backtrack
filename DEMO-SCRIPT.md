# Backtrack — 2:00 demo

Narration ~260 words (~105s spoken at 150 wpm), leaving ~15s of breathing room.
Every number below is what actually renders in `?demo=1` — nothing here is aspirational.

## Before you hit record

1. `npm run dev`, then load `http://localhost:3000/?demo=1` **once** and discard it.
   The first request compiles for ~23s. Every later one is ~0.3s.
2. Clear the class list so the spine starts clean:
   `localStorage.removeItem('backtrack.classes.v1')` in the console.
3. Record at 1440×900 or wider. Below 1180px the two-column layouts collapse to one.
4. Dark theme. The light theme is good but the graph glow reads better on dark.
5. Do the reopen on **Function composition** — it has a 3Blue1Brown clip held in
   reserve. `Slope and lines` has none and shows the honest "nothing else" message.

## The 9 scripted answers

Follow exactly. Off-script lands on different gaps, and only these two are frozen.

| # | Probe | Click |
|---|---|---|
| 1 | Linear transformations | **B** |
| 2 | What 'linear' actually means | **B** |
| 3 | Slope and lines | **B** |
| 4 | Solving linear equations | **A** |
| 5 | The coordinate plane | **A** |
| 6 | Function composition | **B** |
| 7 | Function notation | **A** |
| 8 | Span | **A** |
| 9 | Basis | **A** |

---

## 0:00 – 0:15 · The claim

**Screen.** Cold open on screen 1, the Bodoni headline filling frame:
*"Paste the syllabus. We work backwards."* Hold still. Do not scroll.

> A student who fails linear algebra in week five doesn't have an eigenvector
> problem. They have a function-composition problem from two years ago.
> Most tools tell you what you got wrong. Backtrack finds **when you started
> being wrong**.

---

## 0:15 – 0:27 · Syllabus in

**Screen.** Click *Use sample* — the syllabus fills the panel. Click
**Build the graph**. The forming overlay assembles the graph layer by layer.
Let it finish; it is 2.3s and it is the prettiest moment in the app.

> You give it the syllabus for a course you haven't taken yet. It maps that
> course onto a prerequisite graph — twenty-nine concepts this syllabus
> quietly assumes you already know.

---

## 0:27 – 1:00 · The diagnostic

**Screen.** Answers 1–3 at natural pace so the propagation is legible. On
answer 1 (wrong), the graph fans **purple downward**. On answer 4 (correct),
it fans **teal upward** — that is the shot. Then **speed-ramp 4× through
answers 5–9**; nobody needs to read them.

At ~0:50, expand **How we got here** and let one frame land on the
`pass / fail / gain` numbers.

> Then it binary-searches that graph. Answer correctly and mastery propagates
> upward — one answer settles a whole subtree. Answer wrong and it descends
> into the prerequisites, one level at a time. Nine questions.
> And it shows its working: every candidate it weighed, and why it chose this one.

---

## 1:00 – 1:18 · Findings

**Screen.** The findings screen animates in row by row. Rest on gap 01, then
gap 02. The right-hand `Wk 1` / `Wk 2` in Bodoni is the beat.

> Two gaps. Not topics you failed — the places the trouble *starts*. Each one
> names the misconception, the week of the course where it starts to hurt, and
> the line of your own syllabus that assumes it.

---

## 1:18 – 1:42 · The crash course

**Screen.** Click **Assemble the crash course**. Rest on the mono line:
`12 considered · 4 teach it`. Play ~3s of the first Khan clip so it is
obviously real video. Then scroll to the third segment card and let the
`why_this_clip` sentence sit on screen.

> Then it builds the crash course. Twelve candidate segments per gap — and a
> model reads every one to drop anything that merely *mentions* the concept.
> Four teach it. Two make the cut. Three minutes of video, timestamped to the
> second.
> And notice this one is from a video about **matrix multiplication**, chosen
> for a **function-composition** gap — because that is where the ordering is
> explained.

---

## 1:42 – 2:00 · The loop closes

**Screen.** In the guided-notes panel, type a wrong answer into two blanks
(`determinant` works). Click **Check my answers**. The **REOPENED** banner
animates in, the player jumps to the 3Blue1Brown clip, and — if you cut back
to stage 02 for one frame — the node has gone purple again.

> Fill in the notes while you watch. Miss enough of them and the node reopens
> — and it hands you a different teacher, held back in reserve for exactly
> this moment.
> Diagnose. Remediate. Verify. Re-diagnose. That's the loop.

**Final frame.** Cut to the graph with both root gaps ringed. Hold 1s.

---

## If you have 10 spare seconds

Trim the 0:15–0:27 syllabus beat to 8s and spend the difference on the
reopen — it is the only thing in the demo no other submission will have.

## Lines to avoid

- Don't say "AI-powered". The interesting claim is the opposite: the model
  never writes an explanation, it only diagnoses and retrieves.
- Don't call the questions a "quiz". They are probes chosen by a search.
- Don't promise it generalizes beyond linear algebra on camera. The graph is
  hand-authored for one course; say "the graph generalizes" only if asked.
