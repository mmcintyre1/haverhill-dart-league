import { NextRequest, NextResponse } from "next/server";
import { db, adminAlerts } from "@/lib/db";
import { and, desc, eq } from "drizzle-orm";

export const runtime = "nodejs";

function authorized(req: NextRequest) {
  const secret = process.env.SCRAPE_SECRET;
  if (!secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

// GET /api/admin/alerts?season=24718&resolved=false
export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const seasonParam = url.searchParams.get("season");
  const resolvedParam = url.searchParams.get("resolved");
  if (!seasonParam) {
    return NextResponse.json({ error: "season query param required" }, { status: 400 });
  }
  const seasonId = parseInt(seasonParam);
  const conditions = [eq(adminAlerts.seasonId, seasonId)];
  if (resolvedParam !== null) conditions.push(eq(adminAlerts.resolved, resolvedParam === "true"));

  const rows = await db
    .select()
    .from(adminAlerts)
    .where(and(...conditions))
    .orderBy(desc(adminAlerts.createdAt));
  return NextResponse.json(rows);
}

// PATCH /api/admin/alerts  Body: { id, ignored, reason? }
//
// An issue has three states and only one of them is a human decision:
// open, fixed (a rescrape confirmed it's gone — set by the scraper, never
// here), and ignored (this will never be actionable). Ignoring also resolves
// it so it leaves the open list; reopening clears both flags and any stale
// autoResolvedAt, so the next scrape decides the state honestly.
export async function PATCH(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { id?: number; ignored?: boolean; reason?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.id || typeof body.ignored !== "boolean") {
    return NextResponse.json({ error: "id and ignored are required" }, { status: 400 });
  }
  await db
    .update(adminAlerts)
    .set(
      body.ignored
        ? { ignored: true, ignoredAt: new Date(), ignoredReason: body.reason?.trim() || null, resolved: true, autoResolvedAt: null }
        : { ignored: false, ignoredAt: null, ignoredReason: null, resolved: false, autoResolvedAt: null }
    )
    .where(eq(adminAlerts.id, body.id));
  return NextResponse.json({ ok: true });
}
