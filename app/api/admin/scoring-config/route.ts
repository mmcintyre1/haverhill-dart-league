import { NextRequest, NextResponse } from "next/server";
import { db, scoringConfig } from "@/lib/db";
import { and, eq, inArray, isNull } from "drizzle-orm";

export const runtime = "nodejs";

function authorized(req: NextRequest) {
  const secret = process.env.SCRAPE_SECRET;
  if (!secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

// GET /api/admin/scoring-config?scope=global&scope=21010
// Returns all rows for the requested scope(s) as an array.
export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const scopes = url.searchParams.getAll("scope");
  if (scopes.length === 0) {
    return NextResponse.json({ error: "scope query param required" }, { status: 400 });
  }
  const rows = await db
    .select()
    .from(scoringConfig)
    .where(inArray(scoringConfig.scope, scopes));
  return NextResponse.json(rows);
}

// POST /api/admin/scoring-config
// Body: { scope: string, division: string | null, key: string, value: string }
// Upserts one config row. Uses delete+insert to safely handle nullable division column.
export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { scope?: string; division?: string | null; key?: string; value?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { scope, key, value } = body;
  const division = body.division ?? null;
  if (!scope || !key || value === undefined) {
    return NextResponse.json({ error: "scope, key, and value are required" }, { status: 400 });
  }

  // Delete existing row matching scope+division+key, then insert fresh.
  // This avoids NULL equality issues in onConflictDoUpdate.
  const divisionFilter = division === null
    ? isNull(scoringConfig.division)
    : eq(scoringConfig.division, division);

  await db
    .delete(scoringConfig)
    .where(and(eq(scoringConfig.scope, scope), divisionFilter, eq(scoringConfig.key, key)));

  await db
    .insert(scoringConfig)
    .values({ scope, division, key, value, updatedAt: new Date() });

  return NextResponse.json({ ok: true });
}
