import { NextRequest, NextResponse } from "next/server";
import { db, playerStatAdjustments, players } from "@/lib/db";
import { and, desc, eq } from "drizzle-orm";

export const runtime = "nodejs";

function authorized(req: NextRequest) {
  const secret = process.env.SCRAPE_SECRET;
  if (!secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

const GAME_TYPES = new Set(["crkt", "601", "501"]);
const PHASES = new Set(["REG", "POST"]);

// GET /api/admin/player-adjustments?season=24718
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
    .select({
      id: playerStatAdjustments.id,
      playerId: playerStatAdjustments.playerId,
      playerName: players.name,
      phase: playerStatAdjustments.phase,
      gameType: playerStatAdjustments.gameType,
      winsDelta: playerStatAdjustments.winsDelta,
      lossesDelta: playerStatAdjustments.lossesDelta,
      weekKey: playerStatAdjustments.weekKey,
      note: playerStatAdjustments.note,
      createdAt: playerStatAdjustments.createdAt,
    })
    .from(playerStatAdjustments)
    .innerJoin(players, eq(players.id, playerStatAdjustments.playerId))
    .where(eq(playerStatAdjustments.seasonId, seasonId))
    .orderBy(desc(playerStatAdjustments.createdAt));
  return NextResponse.json(rows);
}

// POST /api/admin/player-adjustments
// Body: { seasonId, playerId, phase, gameType, winsDelta, lossesDelta, weekKey?, note? }
export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: {
    seasonId?: number; playerId?: number; phase?: string; gameType?: string;
    winsDelta?: number; lossesDelta?: number; weekKey?: string | null; note?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { seasonId, playerId, phase, gameType } = body;
  const winsDelta = body.winsDelta ?? 0;
  const lossesDelta = body.lossesDelta ?? 0;
  if (!seasonId || !playerId || !phase || !gameType) {
    return NextResponse.json({ error: "seasonId, playerId, phase, and gameType are required" }, { status: 400 });
  }
  if (!PHASES.has(phase)) {
    return NextResponse.json({ error: "phase must be REG or POST" }, { status: 400 });
  }
  if (!GAME_TYPES.has(gameType)) {
    return NextResponse.json({ error: "gameType must be crkt, 601, or 501" }, { status: 400 });
  }
  if (winsDelta === 0 && lossesDelta === 0) {
    return NextResponse.json({ error: "winsDelta or lossesDelta must be non-zero" }, { status: 400 });
  }

  const [row] = await db
    .insert(playerStatAdjustments)
    .values({
      seasonId, playerId, phase, gameType, winsDelta, lossesDelta,
      weekKey: body.weekKey || null,
      note: body.note || null,
    })
    .returning();
  return NextResponse.json(row);
}

// DELETE /api/admin/player-adjustments?id=5
export async function DELETE(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const idParam = url.searchParams.get("id");
  if (!idParam) {
    return NextResponse.json({ error: "id query param required" }, { status: 400 });
  }
  await db.delete(playerStatAdjustments).where(eq(playerStatAdjustments.id, parseInt(idParam)));
  return NextResponse.json({ ok: true });
}
