import type { MetadataRoute } from "next";

// Confirmed via production Function logs: Netlify invokes the origin
// Function (___netlify-server-handler) for every single request, even
// fully static/pre-rendered ones — the CDN does not bypass it the way ISR
// is normally supposed to allow. A ~150-request crawler burst in a single
// 90-second window produced zero cache-layer activity (proof the pages
// really are static and DB-free) but still cost ~150 real invocations.
// So static/ISR status only ever cut DB/query cost per request here — it
// does nothing for the invocation count crawlers drive up, and
// /players/[id] alone is ~317 pages, the single biggest multiplier.
// Blocking it (and the other section pages) from crawlers is the only
// lever that actually reduces invocation count on this host.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: ["/leaderboard/", "/matches/", "/standings/", "/players/", "/admin", "/api/"],
    },
  };
}
