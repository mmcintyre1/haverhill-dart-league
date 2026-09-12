import { db, seasons, playerStats, players, playerSeasonTeams, scoringConfig, playerWeekStats } from "@/lib/db";
import { divisions } from "@/lib/db/schema";
import { eq, and, desc, asc, or, isNull, isNotNull } from "drizzle-orm";
import { type LeaderboardRow } from "@/components/LeaderboardTable";
import { cached } from "@/lib/cache";

// This section reads `searchParams` (division/phase selectors) on its
// explicit [seasonId] route, which forces Next.js to render that route
// fully dynamically — `revalidate` never actually applies there. These
// fetch functions are wrapped in Next's data cache instead, so repeat
// requests for the same season/phase/division skip the DB entirely until a
// scrape busts the "public-data" tag (see /api/revalidate). The bare
// basePath page never reads searchParams at all and gets real static/ISR
// caching on top of this.
export const getSeasons = cached(async () => {
  return db.select().from(seasons).where(eq(seasons.visible, true)).orderBy(desc(seasons.startDate));
}, ["leaderboard:getSeasons"]);

export const getDivisionsForSeason = cached(async (seasonId: number): Promise<string[]> => {
  const rows = await db
    .selectDistinct({ name: divisions.name })
    .from(divisions)
    .where(eq(divisions.seasonId, seasonId))
    .orderBy(asc(divisions.name));
  return rows.map((r) => r.name).filter(Boolean) as string[];
}, ["leaderboard:getDivisionsForSeason"]);

export const hasPostseason = cached(async (seasonId: number): Promise<boolean> => {
  const [row] = await db
    .select({ id: playerStats.id })
    .from(playerStats)
    .where(and(eq(playerStats.seasonId, seasonId), eq(playerStats.phase, "POST")))
    .limit(1);
  return !!row;
}, ["leaderboard:hasPostseason"]);

export const getLeaderboard = cached(async (
  seasonId: number,
  divisionFilter: string | null,
  phase: string
): Promise<LeaderboardRow[]> => {
  const query = db
    .select({
      id: playerStats.playerId,
      pos: playerStats.pos,
      playerName: players.name,
      teamName: playerSeasonTeams.teamName,
      divisionName: playerSeasonTeams.divisionName,
      wp: playerStats.wp,
      crkt: playerStats.crkt,
      col601: playerStats.col601,
      col501: playerStats.col501,
      sos: playerStats.sos,
      hundredPlus: playerStats.hundredPlus,
      rnds: playerStats.rnds,
      oneEighty: playerStats.oneEighty,
      roHh: playerStats.roHh,
      zeroOneHh: playerStats.zeroOneHh,
      ro9: playerStats.ro9,
      hOut: playerStats.hOut,
      ldg: playerStats.ldg,
      ro6b: playerStats.ro6b,
      mpr: playerStats.mpr,
      ppr: playerStats.ppr,
      avg: playerStats.avg,
      pts: playerStats.pts,
    })
    .from(playerStats)
    .innerJoin(players, eq(playerStats.playerId, players.id))
    .leftJoin(
      playerSeasonTeams,
      and(
        eq(playerStats.playerId, playerSeasonTeams.playerId),
        eq(playerStats.seasonId, playerSeasonTeams.seasonId)
      )
    )
    .where(
      divisionFilter
        ? and(eq(playerStats.seasonId, seasonId), eq(playerStats.phase, phase), eq(playerSeasonTeams.divisionName, divisionFilter), or(isNotNull(playerStats.mpr), isNotNull(playerStats.ppr)))
        : and(eq(playerStats.seasonId, seasonId), eq(playerStats.phase, phase), or(isNotNull(playerStats.mpr), isNotNull(playerStats.ppr)))
    )
    .orderBy(asc(playerStats.pos));

  return query as unknown as Promise<LeaderboardRow[]>;
}, ["leaderboard:getLeaderboard"]);

export type ScoringPts = { cricket: number; "601": number; "501": number };

export const getScoringPts = cached(async (seasonId: number): Promise<ScoringPts> => {
  const rows = await db
    .select()
    .from(scoringConfig)
    .where(
      and(
        or(eq(scoringConfig.scope, "global"), eq(scoringConfig.scope, String(seasonId))),
        isNull(scoringConfig.division)
      )
    );
  // Resolution: global first, then season-specific overrides
  const pts: ScoringPts = { cricket: 1, "601": 1, "501": 1 };
  const globalRows = rows.filter(r => r.scope === "global");
  const seasonRows = rows.filter(r => r.scope !== "global");
  for (const r of [...globalRows, ...seasonRows]) {
    if (r.key === "cricket.win_pts") pts.cricket = Number(r.value);
    if (r.key === "601.win_pts")     pts["601"]   = Number(r.value);
    if (r.key === "501.win_pts")     pts["501"]   = Number(r.value);
  }
  return pts;
}, ["leaderboard:getScoringPts"]);

// Default hot hand thresholds per division (01 HH ton points, RO HH cricket marks)
export const DEFAULT_HH: Record<string, { hh: number; roHh: number }> = {
  A: { hh: 475, roHh: 20 },
  B: { hh: 450, roHh: 17 },
  C: { hh: 425, roHh: 14 },
  D: { hh: 400, roHh: 12 },
};

export const getHhThresholds = cached(async (
  seasonId: number
): Promise<Record<string, { hh: number; roHh: number }>> => {
  const rows = await db
    .select()
    .from(scoringConfig)
    .where(
      and(
        or(eq(scoringConfig.scope, "global"), eq(scoringConfig.scope, String(seasonId))),
        or(eq(scoringConfig.key, "01_hh.threshold"), eq(scoringConfig.key, "ro_hh.threshold"))
      )
    );

  // Build per-division map; season rows override global rows
  const result: Record<string, { hh: number; roHh: number }> = {};
  const globalRows = rows.filter((r) => r.scope === "global");
  const seasonRows = rows.filter((r) => r.scope !== "global");

  for (const r of [...globalRows, ...seasonRows]) {
    const div = r.division ?? "";
    if (!result[div]) result[div] = { ...DEFAULT_HH[div] ?? { hh: 475, roHh: 20 } };
    if (r.key === "01_hh.threshold") result[div].hh = Number(r.value);
    if (r.key === "ro_hh.threshold") result[div].roHh = Number(r.value);
  }

  return result;
}, ["leaderboard:getHhThresholds"]);

export const getG3Config = cached(async (seasonId: number): Promise<Record<string, string>> => {
  const rows = await db
    .select()
    .from(scoringConfig)
    .where(
      and(
        or(eq(scoringConfig.scope, "global"), eq(scoringConfig.scope, String(seasonId))),
        isNull(scoringConfig.division)
      )
    );
  const map: Record<string, string> = {};
  for (const r of rows.filter((r) => r.scope === "global")) map[r.key] = r.value;
  for (const r of rows.filter((r) => r.scope !== "global")) map[r.key] = r.value;
  return map;
}, ["leaderboard:getG3Config"]);

export const getWeeklyStats = cached(async (
  seasonId: number,
  phase: string
): Promise<{ playerId: number; hundredPlus: number; rnds: number }[]> => {
  const rows = await db
    .select({
      playerId: playerWeekStats.playerId,
      hundredPlus: playerWeekStats.hundredPlus,
      rnds: playerWeekStats.rnds,
    })
    .from(playerWeekStats)
    .where(
      and(eq(playerWeekStats.seasonId, seasonId), eq(playerWeekStats.phase, phase))
    );
  return rows;
}, ["leaderboard:getWeeklyStats"]);

// unstable_cache requires JSON-serializable return values — a raw Date
// silently round-trips as a string on a cache hit, so return an ISO string
// and let the caller construct a Date from it.
export const getLastScraped = cached(async (seasonId: number): Promise<string | null> => {
  const [row] = await db
    .select({ lastScrapedAt: seasons.lastScrapedAt })
    .from(seasons)
    .where(eq(seasons.id, seasonId))
    .limit(1);
  return row?.lastScrapedAt ? row.lastScrapedAt.toISOString() : null;
}, ["leaderboard:getLastScraped"]);
