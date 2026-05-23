import { NextRequest, NextResponse } from "next/server";
import { db, siteContent } from "@/lib/db";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

function authorized(req: NextRequest): boolean {
  const secret = process.env.SCRAPE_SECRET;
  return !secret || req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await db.select().from(siteContent);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { key?: string; value?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { key, value } = body;
  if (!key || value === undefined) {
    return NextResponse.json({ error: "key and value are required" }, { status: 400 });
  }

  await db
    .insert(siteContent)
    .values({ key, value })
    .onConflictDoUpdate({ target: siteContent.key, set: { value, updatedAt: new Date() } });

  return NextResponse.json({ ok: true });
}
