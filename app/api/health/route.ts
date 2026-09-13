import { NextResponse } from "next/server";
import { db, seasons } from "@/lib/db";
import { logInvocation } from "@/lib/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  logInvocation("/api/health");
  const start = Date.now();
  try {
    await db.select({ id: seasons.id }).from(seasons).limit(1);
    return NextResponse.json({
      ok: true,
      db: "ok",
      latencyMs: Date.now() - start,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        db: "error",
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
