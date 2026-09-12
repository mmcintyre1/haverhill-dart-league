import { db, seasons, players, playerStats, playerWeekStats, playerSeasonTeams, scoringConfig, matches } from "@/lib/db";
import { eq, and, asc, desc, or, isNull, isNotNull } from "drizzle-orm";
import { cached } from "@/lib/cache";

// This section reads `searchParams` (phase selector) on its explicit
// [id]/[seasonId] route, which forces Next.js to render that route fully
// dynamically — `revalidate` never actually applies there. These fetch
// functions are wrapped in Next's data cache instead, so repeat requests
// for the same player/season/phase skip the DB entirely until a scrape
// busts the "public-data" tag (see /api/revalidate). The bare
// /players/[id] page never reads searchParams at all and gets real
// static/ISR caching (and a working generateStaticParams) on top of this.
// The league-wide active season — deliberately NOT scoped to a player, unlike
// getSeasons below. A player whose only stats are in a past season would
// otherwise have getSeasons' own (isActive ?? allSeasons[0]) fallback
// resolve to that past season, which could then get misread as "the active
// season" by anything comparing against it (e.g. deciding whether to link
// to the bare /leaderboard vs an explicit /leaderboard/[seasonId]).
export const getActiveSeasonId = cached(async (): Promise<number | undefined> => {
  const [row] = await db
    .select({ id: seasons.id })
    .from(seasons)
    .where(and(eq(seasons.visible, true), eq(seasons.isActive, true)))
    .limit(1);
  return row?.id;
}, ["players:getActiveSeasonId"]);

export const getSeasons = cached(async (playerId: number) => {
  return db
    .selectDistinct({
      id: seasons.id,
      leagueId: seasons.leagueId,
      name: seasons.name,
      startDate: seasons.startDate,
      isActive: seasons.isActive,
      visible: seasons.visible,
      lastScrapedAt: seasons.lastScrapedAt,
    })
    .from(seasons)
    .innerJoin(playerStats, eq(playerStats.seasonId, seasons.id))
    .where(and(eq(seasons.visible, true), eq(playerStats.playerId, playerId)))
    .orderBy(desc(seasons.startDate));
}, ["players:getSeasons"]);

export const getPlayerHeader = cached(async (playerId: number, seasonId: number, phase: string) => {
  const [player] = await db
    .select({ name: players.name })
    .from(players)
    .where(eq(players.id, playerId))
    .limit(1);

  const [stat] = await db
    .select({
      teamId: playerSeasonTeams.teamId,
      teamName: playerSeasonTeams.teamName,
      divisionName: playerSeasonTeams.divisionName,
      setWins: playerStats.pts,
      wp: playerStats.wp,
      crkt: playerStats.crkt,
      col601: playerStats.col601,
      col501: playerStats.col501,
      avg: playerStats.avg,
      hundredPlus: playerStats.hundredPlus,
      mpr: playerStats.mpr,
      ppr: playerStats.ppr,
    })
    .from(playerStats)
    .leftJoin(
      playerSeasonTeams,
      and(
        eq(playerStats.playerId, playerSeasonTeams.playerId),
        eq(playerStats.seasonId, playerSeasonTeams.seasonId)
      )
    )
    .where(and(eq(playerStats.playerId, playerId), eq(playerStats.seasonId, seasonId), eq(playerStats.phase, phase)))
    .limit(1);

  return { player, stat };
}, ["players:getPlayerHeader"]);

export const hasPlayerPostseason = cached(async (playerId: number, seasonId: number): Promise<boolean> => {
  const [row] = await db
    .select({ id: playerStats.id })
    .from(playerStats)
    .where(and(eq(playerStats.playerId, playerId), eq(playerStats.seasonId, seasonId), eq(playerStats.phase, "POST")))
    .limit(1);
  return !!row;
}, ["players:hasPlayerPostseason"]);

export const getWeeklyRows = cached(async (playerId: number, seasonId: number, phase: string) => {
  return db
    .select()
    .from(playerWeekStats)
    .where(and(eq(playerWeekStats.playerId, playerId), eq(playerWeekStats.seasonId, seasonId), eq(playerWeekStats.phase, phase)))
    .orderBy(asc(playerWeekStats.weekKey));
}, ["players:getWeeklyRows"]);

// Returns a plain object, not a Map — unstable_cache requires JSON-serializable
// return values, and a Map silently turns into a plain object on a cache hit
// anyway. Callers build a Map from this where needed.
export const getMatchGuidMap = cached(async (seasonId: number, teamId: number): Promise<Record<string, string>> => {
  const rows = await db
    .select({ prettyDate: matches.prettyDate, dcGuid: matches.dcGuid })
    .from(matches)
    .where(and(
      eq(matches.seasonId, seasonId),
      or(eq(matches.homeTeamId, teamId), eq(matches.awayTeamId, teamId)),
      isNotNull(matches.dcGuid),
      isNotNull(matches.prettyDate)
    ));
  const map: Record<string, string> = {};
  for (const r of rows) {
    if (r.prettyDate && r.dcGuid) map[r.prettyDate] = r.dcGuid;
  }
  return map;
}, ["players:getMatchGuidMap"]);

export const DEFAULT_HH: Record<string, { hh: number; roHh: number }> = {
  A: { hh: 475, roHh: 20 },
  B: { hh: 450, roHh: 17 },
  C: { hh: 425, roHh: 14 },
  D: { hh: 400, roHh: 12 },
};

export const getHhThresholds = cached(async (seasonId: number): Promise<Record<string, { hh: number; roHh: number }>> => {
  const rows = await db
    .select()
    .from(scoringConfig)
    .where(
      and(
        or(eq(scoringConfig.scope, "global"), eq(scoringConfig.scope, String(seasonId))),
        or(eq(scoringConfig.key, "01_hh.threshold"), eq(scoringConfig.key, "ro_hh.threshold"))
      )
    );
  const result: Record<string, { hh: number; roHh: number }> = {};
  const globalRows = rows.filter((r) => r.scope === "global");
  const seasonRows = rows.filter((r) => r.scope !== "global");
  for (const r of [...globalRows, ...seasonRows]) {
    const div = r.division ?? "";
    if (!result[div]) result[div] = { ...(DEFAULT_HH[div] ?? { hh: 475, roHh: 20 }) };
    if (r.key === "01_hh.threshold") result[div].hh = Number(r.value);
    if (r.key === "ro_hh.threshold") result[div].roHh = Number(r.value);
  }
  return result;
}, ["players:getHhThresholds"]);

export const getScoringPts = cached(async (seasonId: number): Promise<{ cricket: number; "601": number; "501": number }> => {
  const rows = await db
    .select()
    .from(scoringConfig)
    .where(
      and(
        or(eq(scoringConfig.scope, "global"), eq(scoringConfig.scope, String(seasonId))),
        isNull(scoringConfig.division)
      )
    );
  const pts = { cricket: 1, "601": 1, "501": 1 };
  const globalRows = rows.filter((r) => r.scope === "global");
  const seasonRows = rows.filter((r) => r.scope !== "global");
  for (const r of [...globalRows, ...seasonRows]) {
    if (r.key === "cricket.win_pts") pts.cricket = Number(r.value);
    if (r.key === "601.win_pts")     pts["601"]   = Number(r.value);
    if (r.key === "501.win_pts")     pts["501"]   = Number(r.value);
  }
  return pts;
}, ["players:getScoringPts"]);
