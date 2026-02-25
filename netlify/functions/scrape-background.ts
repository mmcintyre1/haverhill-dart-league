import { runScrape, type ScrapePayload } from "../../lib/scrape-runner";
import { db, scrapeLog } from "../../lib/db";

// Netlify Background Function — runs for up to 15 minutes.
// Named with the -background suffix so Netlify treats it as async.
// Invoked by /api/scrape when running on Netlify.

type Event = {
  body: string | null;
  headers: Record<string, string | undefined>;
};

export const handler = async (event: Event) => {
  const secret = process.env.SCRAPE_SECRET;
  const authHeader = event.headers["authorization"] ?? event.headers["Authorization"] ?? "";
  if (secret && authHeader !== `Bearer ${secret}`) {
    return { statusCode: 401, body: "Unauthorized" };
  }

  const body = JSON.parse(event.body ?? "{}") as ScrapePayload & { triggeredBy?: string };
  const { triggeredBy = "background", ...payload } = body;

  try {
    await runScrape(payload, triggeredBy);
    return { statusCode: 200, body: "ok" };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("Scrape background function failed:", message);
    await db.insert(scrapeLog).values({
      triggeredBy,
      status: "error",
      errorMessage: message,
    }).catch(() => {});
    return { statusCode: 500, body: message };
  }
};
