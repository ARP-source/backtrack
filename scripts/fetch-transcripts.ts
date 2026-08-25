/**
 * Build-time only. Fetches English transcripts once and commits them to data/transcripts/.
 * The app NEVER calls this at request time — transcript endpoints IP-block datacenter ranges,
 * so anything fetching at runtime works locally and dies in production.
 *
 * Run: npm run fetch:transcripts        (add --force to refetch cached videos)
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { YoutubeTranscript } from "youtube-transcript";

type Cue = { text: string; start: number; end: number };
type RawVideo = { videoId: string; title: string; channel: string; covers: string[] };

const { videos } = JSON.parse(readFileSync("data/videos.json", "utf8")) as { videos: RawVideo[] };
const force = process.argv.includes("--force");

/** youtube-transcript returns entities double-escaped, e.g. "&amp;#39;" for an apostrophe. */
function decodeEntities(s: string): string {
  let out = s;
  for (let i = 0; i < 2; i++) {
    out = out
      .replace(/&amp;/g, "&")
      .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
  }
  return out.replace(/\s+/g, " ").trim();
}

const failures: string[] = [];

for (const v of videos) {
  const path = `data/transcripts/${v.videoId}.json`;
  if (existsSync(path) && !force) {
    console.log(`skip   ${v.videoId}  (cached)`);
    continue;
  }
  try {
    // lang:"en" is NOT optional. Without it the library returns whichever caption
    // track YouTube lists first — Arabic for 3Blue1Brown, Azerbaijani for Khan Academy.
    // It does not error; you just silently get a foreign-language corpus.
    const raw = await YoutubeTranscript.fetchTranscript(v.videoId, { lang: "en" });

    // offset/duration are MILLISECONDS despite the field names suggesting otherwise.
    const cues: Cue[] = raw
      .map((c: any) => ({
        text: decodeEntities(c.text),
        start: c.offset / 1000,
        end: (c.offset + c.duration) / 1000,
      }))
      .filter((c: Cue) => c.text.length > 0 && !/^\[.*\]$/.test(c.text));

    if (cues.length < 10) throw new Error(`only ${cues.length} usable cues`);

    const joined = cues.map((c) => c.text).join(" ");
    const marks = (joined.match(/[.?!]/g) ?? []).length;
    const words = joined.split(/\s+/).length;
    // Human captions run ~1 sentence mark per 25 words. Auto-generated captions have
    // essentially none, which breaks sentence-boundary chunking — flagged for the chunker.
    const punctuated = marks / words > 0.01;

    writeFileSync(
      path,
      JSON.stringify({ ...v, punctuated, durationSec: Math.round(cues.at(-1)!.end), cues }, null, 2)
    );
    console.log(
      `ok     ${v.videoId}  ${String(cues.length).padStart(4)} cues  ` +
        `${String(Math.round(cues.at(-1)!.end / 60)).padStart(2)}min  ` +
        `${punctuated ? "punctuated" : "AUTO-CAPTIONS (fixed-window chunking)"}`
    );
  } catch (e) {
    failures.push(v.videoId);
    console.log(`FAIL   ${v.videoId}  ${String((e as Error).message).slice(0, 90)}`);
  }
}

console.log(`\n${videos.length - failures.length}/${videos.length} transcripts available.`);
if (failures.length) {
  console.log(`failed: ${failures.join(", ")}`);
  console.log(`Remove these from data/videos.json or retry — do NOT ship a corpus with holes.`);
  process.exit(1);
}
