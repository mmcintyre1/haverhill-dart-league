import { db, seasons, matches, teams } from "@/lib/db";
import { divisions } from "@/lib/db/schema";
import { eq, asc, desc } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { cached } from "@/lib/cache";

// This section reads `searchParams` (division selector) on its explicit
// [seasonId] route, which forces Next.js to render that route fully
// dynamically — `revalidate` never actually applies there. These fetch
// functions are wrapped in Next's data cache instead, so repeat requests
// for the same season/division skip the DB entirely until a scrape busts
// the "public-data" tag (see /api/revalidate). The bare basePath page
// never reads searchParams at all and gets real static/ISR caching on top
// of this.
export const getSeasons = cached(async () => {
  return db.select().from(seasons).where(eq(seasons.visible, true)).orderBy(desc(seasons.startDate));
}, ["matches:getSeasons"]);

export const getDivisionsForSeason = cached(async (seasonId: number): Promise<string[]> => {
  const rows = await db
    .selectDistinct({ name: divisions.name })
    .from(divisions)
    .where(eq(divisions.seasonId, seasonId))
    .orderBy(asc(divisions.name));
  return rows.map((r) => r.name).filter(Boolean) as string[];
}, ["matches:getDivisionsForSeason"]);

export const getAllMatches = cached(async (seasonId: number) => {
  const homeTeams = alias(teams, "home_teams");
  return db
    .select({
      id: matches.id,
      seasonId: matches.seasonId,
      divisionName: matches.divisionName,
      roundSeq: matches.roundSeq,
      homeTeamId: matches.homeTeamId,
      awayTeamId: matches.awayTeamId,
      homeTeamName: matches.homeTeamName,
      awayTeamName: matches.awayTeamName,
      schedDate: matches.schedDate,
      schedTime: matches.schedTime,
      status: matches.status,
      homeScore: matches.homeScore,
      awayScore: matches.awayScore,
      prettyDate: matches.prettyDate,
      dcGuid: matches.dcGuid,
      seasonStatus: matches.seasonStatus,
      homeTeamVenueName: homeTeams.venueName,
      homeTeamVenueAddress: homeTeams.venueAddress,
      homeTeamVenuePhone: homeTeams.venuePhone,
    })
    .from(matches)
    .leftJoin(homeTeams, eq(matches.homeTeamId, homeTeams.id))
    .where(eq(matches.seasonId, seasonId))
    .orderBy(asc(matches.roundSeq), asc(matches.divisionName), asc(matches.schedDate), asc(matches.schedTime));
}, ["matches:getAllMatches"]);
