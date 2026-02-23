import { NextRequest, NextResponse } from "next/server";
import { db, newsPosts } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const secret = process.env.SCRAPE_SECRET;
  const authHeader = req.headers.get("authorization");
  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  return NextResponse.json({ ok: true, id: post.id, publishedAt: post.publishedAt });
}
