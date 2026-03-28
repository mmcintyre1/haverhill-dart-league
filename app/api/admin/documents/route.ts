import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db, documents } from "@/lib/db";
import { eq, asc } from "drizzle-orm";

export const runtime = "nodejs";

function auth(req: NextRequest): boolean {
  const secret = process.env.SCRAPE_SECRET;
  return !secret || req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await db.select().from(documents).orderBy(asc(documents.sortOrder), asc(documents.title));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { title?: string; url?: string; category?: string; description?: string; sortOrder?: number };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { title, url, category, description, sortOrder } = body;
  if (!title || !url) return NextResponse.json({ error: "title and url are required" }, { status: 400 });
  const [doc] = await db
    .insert(documents)
    .values({ title, url, category: category || "General", description: description ?? null, sortOrder: sortOrder ?? 0 })
    .returning();
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true, doc });
}

export async function DELETE(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = parseInt(searchParams.get("id") ?? "");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.delete(documents).where(eq(documents.id, id));
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true });
}
