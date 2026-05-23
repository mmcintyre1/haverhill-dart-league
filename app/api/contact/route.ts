import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { db, siteContent } from "@/lib/db";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  let body: { name?: string; email?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, email, message } = body;
  if (!name || !email || !message) {
    return NextResponse.json({ error: "name, email, and message are required" }, { status: 400 });
  }

  const row = await db.select().from(siteContent).where(eq(siteContent.key, "contact.email")).limit(1);
  const to = row[0]?.value ?? process.env.CONTACT_EMAIL;
  const from = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";

  if (!to) {
    return NextResponse.json({ error: "Contact email not configured" }, { status: 500 });
  }

  try {
    await resend.emails.send({
      from,
      to,
      replyTo: email,
      subject: `Contact form message from ${name}`,
      text: `Name: ${name}\nEmail: ${email}\n\n${message}`,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Resend error:", err);
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }
}
