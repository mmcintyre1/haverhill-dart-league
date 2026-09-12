import type { MetadataRoute } from "next";

// Bare /leaderboard, /matches, /standings, /teams, and every /players/[id]
// page are now static/ISR-cached (they never read searchParams — season
// selection moved to a route segment), so crawling them no longer costs a
// DB-querying serverless invocation. /teams/[seasonId] is static too (teams
// has no division/phase filter). /leaderboard/[seasonId], /matches/[seasonId],
// /standings/[seasonId], and /players/[id]/[seasonId] still read
// searchParams for division/phase filters and stay fully dynamic, so those
// are the only paths still worth keeping crawlers off of — that content
// isn't meant to rank in search separately from the bare pages anyway.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: ["/leaderboard/", "/matches/", "/standings/", "/players/*/", "/admin", "/api/"],
    },
  };
}
