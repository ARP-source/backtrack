import { getSampleSyllabus } from "@/lib/server-data";

export const runtime = "nodejs";

export async function GET() {
  return new Response(getSampleSyllabus(), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
