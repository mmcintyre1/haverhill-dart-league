import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

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

  return NextResponse.json({ ok: true, revalidated: true });
}
