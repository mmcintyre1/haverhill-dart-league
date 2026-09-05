import { NextRequest, NextResponse } from "next/server";
import { db, playerWeekStats } from "@/lib/db";
import { eq } from "drizzle-orm";
import { weekKeyToISODate } from "@/lib/format";

export const runtime = "nodejs";

function authorized(req: NextRequest) {
  const secret = process.env.SCRAPE_SECRET;
  if (!secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

// GET /api/admin/weeks?season=24718
// Returns distinct weekKeys already scraped for a season, sorted chronologically —
// used to populate the "Week" picker on the manual adjustment form.
export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const seasonParam = url.searchParams.get("season");
  if (!seasonParam) {
    return NextResponse.json({ error: "season query param required" }, { status: 400 });
  }
  const seasonId = parseInt(seasonParam);

  const rows = await db
    .selectDistinct({ weekKey: playerWeekStats.weekKey })
    .from(playerWeekStats)
    .where(eq(playerWeekStats.seasonId, seasonId));

  const weeks = rows
    .map((r) => ({ weekKey: r.weekKey, isoDate: weekKeyToISODate(r.weekKey) }))
    .sort((a, b) => (a.isoDate ?? "").localeCompare(b.isoDate ?? ""));

  return NextResponse.json(weeks);
}
