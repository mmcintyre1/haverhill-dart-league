import { NextResponse } from "next/server";
import { db, scrapeLog } from "@/lib/db";
import { desc } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [latest] = await db
    .select()
    .from(scrapeLog)
    .orderBy(desc(scrapeLog.id))
    .limit(1);

  return NextResponse.json(latest ?? null);
}
