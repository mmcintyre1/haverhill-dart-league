import { db, seasons, teams, matches, playerStats, playerWeekStats } from "@/lib/db";
import { divisions } from "@/lib/db/schema";
import { eq, and, or, gt, lte, desc, asc, isNull } from "drizzle-orm";
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
}, ["standings:getSeasons"]);

export const getDivisionsForSeason = cached(async (seasonId: number): Promise<string[]> => {
  const rows = await db
    .selectDistinct({ name: divisions.name })
    .from(divisions)
    .where(eq(divisions.seasonId, seasonId))
    .orderBy(asc(divisions.name));
  return rows.map((r) => r.name).filter(Boolean) as string[];
}, ["standings:getDivisionsForSeason"]);

export type MatchRow = {
  roundSeq: number | null;
  schedDate: string | null;
  prettyDate: string | null;
  opponent: string;
  isBye: boolean;
  teamScore: number;
  opponentScore: number;
  dcGuid: string | null;
  weekMpr: number | null;
  weekPpr: number | null;
};

export const getStandings = cached(async (seasonId: number, divisionFilter: string | null) => {
  // A bye row exists in the schedule for its week regardless of whether
  // that week has happened yet, so matching on a null team ID alone (with
  // no score to gate it, since byes never get one) pulled in future
  // scheduled byes too — only show byes for weeks that have already been
  // played.
  const todayStr = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD" UTC
  const [allTeams, allMatches, allDivisions, allPlayerStats, allWeekStats] = await Promise.all([
    db.select().from(teams).where(eq(teams.seasonId, seasonId)),
    db
      .select()
      .from(matches)
      .where(
        and(
          eq(matches.seasonId, seasonId),
          or(
            eq(matches.status, "C"),
            gt(matches.homeScore!, 0),
            gt(matches.awayScore!, 0),
            and(
              or(isNull(matches.homeTeamId), isNull(matches.awayTeamId)),
              lte(matches.schedDate, todayStr)
            ),
          )
        )
      )
      .orderBy(asc(matches.schedDate)),
    db.select().from(divisions).where(eq(divisions.seasonId, seasonId)),
    db
      .select({ playerId: playerStats.playerId, teamId: playerStats.teamId, mpr: playerStats.mpr, ppr: playerStats.ppr, crkt: playerStats.crkt, col601: playerStats.col601, col501: playerStats.col501 })
      .from(playerStats)
      .where(and(eq(playerStats.seasonId, seasonId), eq(playerStats.phase, "REG"))),
    db
      .select({ playerId: playerWeekStats.playerId, weekKey: playerWeekStats.weekKey, mpr: playerWeekStats.mpr, ppr: playerWeekStats.ppr, crktWins: playerWeekStats.crktWins, crktLosses: playerWeekStats.crktLosses, col601Wins: playerWeekStats.col601Wins, col601Losses: playerWeekStats.col601Losses, col501Wins: playerWeekStats.col501Wins, col501Losses: playerWeekStats.col501Losses })
      .from(playerWeekStats)
      .where(and(eq(playerWeekStats.seasonId, seasonId), eq(playerWeekStats.phase, "REG"))),
  ]);

  const parseRecord = (r: string | null) => {
    if (!r) return 0;
    const [w, l] = r.split("-").map(Number);
    return (isNaN(w) ? 0 : w) + (isNaN(l) ? 0 : l);
  };

  // Weighted averages: weight each player's MPR by cricket games played, PPR by 01 games played
  const teamMprPpr = new Map<number, { mprWsum: number; mprWtotal: number; pprWsum: number; pprWtotal: number }>();
  for (const ps of allPlayerStats) {
    if (!ps.teamId) continue;
    const e = teamMprPpr.get(ps.teamId) ?? { mprWsum: 0, mprWtotal: 0, pprWsum: 0, pprWtotal: 0 };
    const mpr = ps.mpr ? parseFloat(String(ps.mpr)) : NaN;
    const ppr = ps.ppr ? parseFloat(String(ps.ppr)) : NaN;
    const crktGames = parseRecord(ps.crkt);
    const zeroOneGames = parseRecord(ps.col601) + parseRecord(ps.col501);
    if (!isNaN(mpr) && mpr > 0 && crktGames > 0) { e.mprWsum += mpr * crktGames; e.mprWtotal += crktGames; }
    if (!isNaN(ppr) && ppr > 0 && zeroOneGames > 0) { e.pprWsum += ppr * zeroOneGames; e.pprWtotal += zeroOneGames; }
    teamMprPpr.set(ps.teamId, e);
  }

  // Per-week team averages keyed by (teamId → weekKey)
  const playerTeamMap = new Map(allPlayerStats.filter(ps => ps.teamId).map(ps => [ps.playerId, ps.teamId!]));
  type WeekAccum = { mprWsum: number; mprWtotal: number; pprWsum: number; pprWtotal: number };
  const teamWeekMap = new Map<number, Map<string, WeekAccum>>();
  for (const ws of allWeekStats) {
    const teamId = playerTeamMap.get(ws.playerId);
    if (!teamId) continue;
    if (!teamWeekMap.has(teamId)) teamWeekMap.set(teamId, new Map());
    const weekMap = teamWeekMap.get(teamId)!;
    if (!weekMap.has(ws.weekKey)) weekMap.set(ws.weekKey, { mprWsum: 0, mprWtotal: 0, pprWsum: 0, pprWtotal: 0 });
    const e = weekMap.get(ws.weekKey)!;
    const mpr = ws.mpr ? parseFloat(String(ws.mpr)) : NaN;
    const ppr = ws.ppr ? parseFloat(String(ws.ppr)) : NaN;
    const crktGames = ws.crktWins + ws.crktLosses;
    const zeroOneGames = ws.col601Wins + ws.col601Losses + ws.col501Wins + ws.col501Losses;
    if (!isNaN(mpr) && mpr > 0 && crktGames > 0) { e.mprWsum += mpr * crktGames; e.mprWtotal += crktGames; }
    if (!isNaN(ppr) && ppr > 0 && zeroOneGames > 0) { e.pprWsum += ppr * zeroOneGames; e.pprWtotal += zeroOneGames; }
  }

  const divNameById = new Map(allDivisions.map((d) => [d.id, d.name]));

  const stats = new Map<
    number,
    {
      name: string;
      divisionName: string | null;
      wins: number;
      losses: number;
      pts: number;
      mpr: number | null;
      ppr: number | null;
      matchRows: MatchRow[];
    }
  >();

  for (const t of allTeams) {
    const tm = teamMprPpr.get(t.id);
    stats.set(t.id, {
      name: t.name,
      divisionName: null,
      wins: 0,
      losses: 0,
      pts: 0,
      mpr: tm && tm.mprWtotal > 0 ? tm.mprWsum / tm.mprWtotal : null,
      ppr: tm && tm.pprWtotal > 0 ? tm.pprWsum / tm.pprWtotal : null,
      matchRows: [],
    });
  }

  for (const m of allMatches) {
    const hs = m.homeScore ?? 0;
    const as_ = m.awayScore ?? 0;
    const isBye = !m.homeTeamId || !m.awayTeamId;
    if (!isBye && hs + as_ === 0) continue;

    const home = m.homeTeamId ? stats.get(m.homeTeamId) : null;
    const away = m.awayTeamId ? stats.get(m.awayTeamId) : null;

    if (home) home.divisionName = home.divisionName ?? m.divisionName;
    if (away) away.divisionName = away.divisionName ?? m.divisionName;

    const weekKey = m.prettyDate ?? "";
    const getWeekStats = (teamId: number) => {
      const e = weekKey ? teamWeekMap.get(teamId)?.get(weekKey) : undefined;
      return {
        weekMpr: e && e.mprWtotal > 0 ? e.mprWsum / e.mprWtotal : null,
        weekPpr: e && e.pprWtotal > 0 ? e.pprWsum / e.pprWtotal : null,
      };
    };

    if (home && m.homeTeamId) {
      home.matchRows.push({
        roundSeq: m.roundSeq ?? null,
        schedDate: m.schedDate ?? null,
        prettyDate: m.prettyDate ?? null,
        opponent: isBye ? "BYE" : (m.awayTeamName ?? "Unknown"),
        isBye,
        teamScore: hs,
        opponentScore: as_,
        dcGuid: m.dcGuid ?? null,
        ...getWeekStats(m.homeTeamId),
      });
      if (!isBye) {
        home.pts += hs;
        if (hs > as_) home.wins++;
        else home.losses++;
      }
    }
    if (away && m.awayTeamId) {
      away.matchRows.push({
        roundSeq: m.roundSeq ?? null,
        schedDate: m.schedDate ?? null,
        prettyDate: m.prettyDate ?? null,
        opponent: isBye ? "BYE" : (m.homeTeamName ?? "Unknown"),
        isBye,
        teamScore: as_,
        opponentScore: hs,
        dcGuid: m.dcGuid ?? null,
        ...getWeekStats(m.awayTeamId),
      });
      if (!isBye) {
        away.pts += as_;
        if (as_ > hs) away.wins++;
        else away.losses++;
      }
    }
  }

  // Fallback divisionName for teams that had no completed matches
  for (const t of allTeams) {
    const s = stats.get(t.id);
    if (s && !s.divisionName) {
      const match = allMatches.find(
        (m) => m.homeTeamId === t.id || m.awayTeamId === t.id
      );
      s.divisionName = match?.divisionName
        ?? (t.divisionId != null ? (divNameById.get(t.divisionId) ?? null) : null);
    }
  }

  const byDiv = new Map<string, (typeof stats extends Map<number, infer V> ? V & { id: number } : never)[]>();
  for (const [id, s] of stats) {
    const div = s.divisionName ?? "Other";
    if (divisionFilter && div !== divisionFilter) continue;
    if (!byDiv.has(div)) byDiv.set(div, []);
    byDiv.get(div)!.push({ ...s, id });
  }

  for (const [, rows] of byDiv) {
    rows.sort((a, b) => b.pts - a.pts || b.wins - a.wins || a.losses - b.losses);
  }

  return Array.from(byDiv.entries()).sort(([a], [b]) => a.localeCompare(b));
}, ["standings:getStandings"]);
