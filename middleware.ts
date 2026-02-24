import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const adminPassword = process.env.ADMIN_PASSWORD;

  // If ADMIN_PASSWORD is not configured (e.g. local dev without it set), allow through.
  if (!adminPassword) return NextResponse.next();

  const auth = req.headers.get("authorization") ?? "";
  const [scheme, b64] = auth.split(" ");

  if (scheme === "Basic" && b64) {
    const decoded = atob(b64);
    const colonIdx = decoded.indexOf(":");
    const pass = colonIdx >= 0 ? decoded.slice(colonIdx + 1) : "";
    if (pass === adminPassword) return NextResponse.next();
  }

  return new NextResponse("Unauthorized", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Admin"' },
  });
}

export const config = {
  matcher: ["/admin/:path*"],
};
