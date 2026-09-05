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

// PATCH /api/admin/alerts  Body: { id: number, resolved: boolean }
export async function PATCH(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { id?: number; resolved?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.id || typeof body.resolved !== "boolean") {
    return NextResponse.json({ error: "id and resolved are required" }, { status: 400 });
  }
  await db.update(adminAlerts).set({ resolved: body.resolved }).where(eq(adminAlerts.id, body.id));
  return NextResponse.json({ ok: true });
}
