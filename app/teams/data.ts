import { db, seasons, teams, divisions, players, playerSeasonTeams, matches } from "@/lib/db";
import { eq, asc, desc } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { type ScheduleMatch } from "@/lib/schedule";
import { cached } from "@/lib/cache";

// The bare basePath page never reads searchParams and gets real
// static/ISR caching; /teams/[seasonId] exists so SeasonSelector has an
// explicit route to navigate to for browsing past seasons.
export const getSeasons = cached(async () => {
  return db.select().from(seasons).where(eq(seasons.visible, true)).orderBy(desc(seasons.startDate));
}, ["teams:getSeasons"]);

export const getTeamData = cached(async (seasonId: number) => {
  const rows = await db
    .select({
      teamId: teams.id,
      teamName: teams.name,
      divisionName: divisions.name,
      captain: teams.captainName,
      venueName: teams.venueName,
      venueAddress: teams.venueAddress,
      venuePhone: teams.venuePhone,
      playerId: players.id,
      playerName: players.name,
    })
    .from(teams)
    .leftJoin(divisions, eq(teams.divisionId, divisions.id))
    .leftJoin(playerSeasonTeams, eq(playerSeasonTeams.teamId, teams.id))
    .leftJoin(players, eq(playerSeasonTeams.playerId, players.id))
    .where(eq(teams.seasonId, seasonId))
    .orderBy(asc(divisions.name), asc(teams.name), asc(players.name));

  type TeamEntry = {
    teamId: number;
    teamName: string;
    divisionName: string | null;
    captain: string | null;
    venueName: string | null;
    venueAddress: string | null;
    venuePhone: string | null;
    players: Array<{ id: number; name: string }>;
  };

  const teamMap = new Map<number, TeamEntry>();

  for (const row of rows) {
    if (!teamMap.has(row.teamId)) {
      teamMap.set(row.teamId, {
        teamId: row.teamId,
        teamName: row.teamName,
        divisionName: row.divisionName ?? null,
        captain: row.captain ?? null,
        venueName: row.venueName ?? null,
        venueAddress: row.venueAddress ?? null,
        venuePhone: row.venuePhone ?? null,
        players: [],
      });
    }
    if (row.playerId && row.playerName) {
      teamMap.get(row.teamId)!.players.push({ id: row.playerId, name: row.playerName });
    }
  }

  const divisionGroups = new Map<string, TeamEntry[]>();
  for (const team of teamMap.values()) {
    const divKey = team.divisionName ?? "Other";
    if (!divisionGroups.has(divKey)) divisionGroups.set(divKey, []);
    divisionGroups.get(divKey)!.push(team);
  }

  return Array.from(divisionGroups.entries()).sort(([a], [b]) => a.localeCompare(b));
}, ["teams:getTeamData"]);

// Returns an array of entries, not a Map — unstable_cache requires
// JSON-serializable return values, and a Map silently turns into a plain
// object on a cache hit anyway. The caller rebuilds a Map from this.
export const getScheduleByTeam = cached(async (seasonId: number): Promise<Array<[number, ScheduleMatch[]]>> => {
  // Join home team for venue name
  const homeTeams = alias(teams, "homeTeam");
  const rows = await db
    .select({
      id: matches.id,
      schedDate: matches.schedDate,
      roundSeq: matches.roundSeq,
      homeTeamId: matches.homeTeamId,
      awayTeamId: matches.awayTeamId,
      homeTeamName: matches.homeTeamName,
      awayTeamName: matches.awayTeamName,
      homeScore: matches.homeScore,
      awayScore: matches.awayScore,
      status: matches.status,
      dcGuid: matches.dcGuid,
      homeVenueName: homeTeams.venueName,
    })
    .from(matches)
    .leftJoin(homeTeams, eq(matches.homeTeamId, homeTeams.id))
    .where(eq(matches.seasonId, seasonId))
    .orderBy(asc(matches.schedDate));

  const map = new Map<number, ScheduleMatch[]>();
  for (const row of rows) {
    const m: ScheduleMatch = {
      id: row.id,
      schedDate: row.schedDate,
      roundSeq: row.roundSeq,
      homeTeamId: row.homeTeamId,
      awayTeamId: row.awayTeamId,
      homeTeamName: row.homeTeamName,
      awayTeamName: row.awayTeamName,
      homeScore: row.homeScore ?? 0,
      awayScore: row.awayScore ?? 0,
      status: row.status,
      dcGuid: row.dcGuid,
      homeVenueName: row.homeVenueName,
    };
    // Index by both homeTeamId and awayTeamId so we can look up per team
    if (row.homeTeamId) {
      if (!map.has(row.homeTeamId)) map.set(row.homeTeamId, []);
      map.get(row.homeTeamId)!.push(m);
    }
    if (row.awayTeamId) {
      if (!map.has(row.awayTeamId)) map.set(row.awayTeamId, []);
      map.get(row.awayTeamId)!.push(m);
    }
  }
  return Array.from(map.entries());
}, ["teams:getScheduleByTeam"]);
