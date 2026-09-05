import { NextRequest, NextResponse } from "next/server";
import { db, players, playerSeasonTeams } from "@/lib/db";
import { asc, eq } from "drizzle-orm";

export const runtime = "nodejs";

function authorized(req: NextRequest) {
  const secret = process.env.SCRAPE_SECRET;
  if (!secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

// GET /api/admin/players?season=24718
// Returns the season's rostered players for the adjustment-form picker.
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
    .select({ id: players.id, name: players.name, teamName: playerSeasonTeams.teamName })
    .from(playerSeasonTeams)
    .innerJoin(players, eq(players.id, playerSeasonTeams.playerId))
    .where(eq(playerSeasonTeams.seasonId, seasonId))
    .orderBy(asc(players.name));
  return NextResponse.json(rows);
}
