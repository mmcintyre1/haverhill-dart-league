import type { MetadataRoute } from "next";

// /players/[id], /leaderboard, /matches, /standings, and /teams all read
// searchParams for their season/division/phase selectors, which forces
// Next.js to render them fully dynamically — every crawl of these pages is
// a full DB-querying serverless invocation, and /players/[id] alone is
// ~240 pages. Blocking crawlers from them keeps that traffic off the
// Netlify invocation budget; none of this content is meant to rank in
// search anyway. The homepage, /about, and /documents stay crawlable —
// they're already static/ISR-cached and cheap to serve.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/about", "/documents"],
      disallow: ["/players/", "/leaderboard", "/matches", "/standings", "/teams", "/admin", "/api/"],
    },
  };
}
