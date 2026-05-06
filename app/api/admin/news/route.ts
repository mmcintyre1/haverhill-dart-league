import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db, newsPosts } from "@/lib/db";
import { eq } from "drizzle-orm";
import { desc } from "drizzle-orm";

export const runtime = "nodejs";

function authorized(req: NextRequest): boolean {
  const secret = process.env.SCRAPE_SECRET;
  return !secret || req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const posts = await db.select().from(newsPosts).orderBy(desc(newsPosts.publishedAt));
  return NextResponse.json(posts);
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { title?: string; body?: string; author?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { title, body: postBody, author } = body;
  if (!title || !postBody) {
    return NextResponse.json({ error: "title and body are required" }, { status: 400 });
  }

  const [post] = await db
    .insert(newsPosts)
    .values({ title, body: postBody, author: author ?? null })
    .returning({ id: newsPosts.id, publishedAt: newsPosts.publishedAt });

  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true, id: post.id, publishedAt: post.publishedAt });
}

export async function PATCH(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { id?: number; hidden?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { id, hidden } = body;
  if (!id || hidden === undefined) {
    return NextResponse.json({ error: "id and hidden are required" }, { status: 400 });
  }

  await db.update(newsPosts).set({ hidden }).where(eq(newsPosts.id, id));
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  await db.delete(newsPosts).where(eq(newsPosts.id, id));
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true });
}
