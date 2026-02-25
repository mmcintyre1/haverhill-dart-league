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

  // Delegate to background function when SCRAPE_BG_ENABLED=true (set this in Netlify env vars).
  // Falls back to checking NETLIFY/NETLIFY_SITE_ID as a secondary signal.
  const useBg = process.env.SCRAPE_BG_ENABLED === "true"
    || process.env.NETLIFY === "true"
    || !!process.env.NETLIFY_SITE_ID;
  if (useBg) {
    const siteUrl = (process.env.URL ?? "").replace(/\/$/, "");
    const bgUrl = `${siteUrl}/.netlify/functions/scrape-background`;
    // Fire and forget — background function runs for up to 15 minutes
    try {
      fetch(bgUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.SCRAPE_SECRET ?? ""}`,
        },
        body: JSON.stringify({ ...body, triggeredBy }),
      }).catch(() => {}); // intentionally not awaited
    } catch { /* invalid URL or sync throw — still return running */ }

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
