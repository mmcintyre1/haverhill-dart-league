import { NextResponse, type NextRequest } from "next/server";

// Temporary diagnostic: Netlify's default Function log view shows duration
// and memory per invocation but not the request path, which has made it
// impossible to tell what's actually driving invocation spikes (organic
// traffic vs a crawler vs a caching gap that's still forcing cache misses
// on pages that should now be static). This proxy runs as a separate
// Netlify Edge Function — its own quota, doesn't touch the DB or the
// Function invocation count this is meant to help diagnose — so it's safe
// to leave on while investigating. Remove once the cause is confirmed.
function logRequest(req: NextRequest) {
  const ua = req.headers.get("user-agent") ?? "";
  console.log(`[REQ] ${req.method} ${req.nextUrl.pathname}${req.nextUrl.search} ua="${ua.slice(0, 80)}"`);
}

export function proxy(req: NextRequest) {
  logRequest(req);

  if (!req.nextUrl.pathname.startsWith("/admin")) return NextResponse.next();

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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest).*)"],
};
