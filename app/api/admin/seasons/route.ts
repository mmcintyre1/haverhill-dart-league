import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db, seasons } from "@/lib/db";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

function authorized(req: NextRequest): boolean {
  const secret = process.env.SCRAPE_SECRET;
  return !secret || req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function PATCH(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { id?: number; visible?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { id, visible } = body;
  if (!id || visible === undefined) {
    return NextResponse.json({ error: "id and visible are required" }, { status: 400 });
  }

  await db.update(seasons).set({ visible }).where(eq(seasons.id, id));
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true });
}
