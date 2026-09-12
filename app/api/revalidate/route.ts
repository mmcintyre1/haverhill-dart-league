import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { PUBLIC_DATA_TAG } from "@/lib/cache";

export const runtime = "nodejs";

// Called by the scrape background function after a successful scrape to bust
// the ISR cache so users see fresh data immediately.
export async function POST(req: NextRequest) {
  const secret = process.env.SCRAPE_SECRET;
  const authHeader = req.headers.get("authorization");
  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  revalidatePath("/", "layout"); // busts all pages that share the root layout
  revalidateTag(PUBLIC_DATA_TAG, "max"); // busts the data-cache entries pages read via unstable_cache

  return NextResponse.json({ ok: true, revalidated: true });
}
