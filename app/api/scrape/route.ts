import { NextRequest, NextResponse } from "next/server";
import { db, scrapeLog } from "@/lib/db";
import { runScrape, type ScrapePayload } from "@/lib/scrape-runner";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const secret = process.env.SCRAPE_SECRET;
  const authHeader = req.headers.get("authorization");
  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const triggeredBy = req.headers.get("x-triggered-by") ?? "manual";
  const body = await req.json().catch(() => ({})) as ScrapePayload;

  // On Netlify, delegate to background function so we don't hit the timeout.
  if (process.env.NETLIFY) {
    const bgUrl = `${process.env.URL}/.netlify/functions/scrape-background`;
    // Fire and forget — background function runs for up to 15 minutes
    fetch(bgUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.SCRAPE_SECRET ?? ""}`,
      },
      body: JSON.stringify({ ...body, triggeredBy }),
    }).catch(() => {}); // intentionally not awaited

    return NextResponse.json({ status: "running" });
  }

  // Local / non-Netlify: run synchronously and return result
  try {
    const result = await runScrape(body, triggeredBy);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.insert(scrapeLog).values({
      triggeredBy,
      status: "error",
      errorMessage: message,
    }).catch(() => {});
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
