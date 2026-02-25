import { eq, and, inArray } from "drizzle-orm";
import { db, seasons, divisions, teams, players, playerStats, playerWeekStats, matches, scrapeLog, playerSeasonTeams, scoringConfig } from "./db";
import {
  fetchLeaguePageProps,
  fetchStandingsPageProps,
  fetchPlayerStandings,
  fetchLineups,
  normalizeLineups,
  fetchTeamMatchHistory,
  fetchGameSegments,
  fetchMatchData,
  fetchMatchPlayerStats,
  fetchLeaderboard,
  getCSRFCookies,
  type DCMatch,
  type DCPlayerStat,
  type DCMatchHistoryEntry,
  type DCGameLeg,
  type DCMatchData,
  type DCMatchPlayerStat,
  type DCSeason,
} from "./dartconnect";

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseCricketMarks(notation: unknown): number {
  if (typeof notation !== "string") return 0;
  const re = /([TDS](?:B|[0-9]+))(?:x([0-9]))?/g;
  let marks = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(notation)) !== null) {
    const hit = m[1];
    const rep = m[2] ? parseInt(m[2]) : 1;
    if (hit === "DB") marks += 2 * rep;
    else if (hit === "SB") marks += 1 * rep;
    else if (hit[0] === "T") marks += 3 * rep;
    else if (hit[0] === "D") marks += 2 * rep;
    else if (hit[0] === "S") marks += 1 * rep;
  }
  return marks;
}

function gameType(gameName: string): "601" | "501" | "crkt" | "other" {
  const n = gameName.toLowerCase();
  if (n.includes("601")) return "601";
  if (n.includes("501")) return "501";
  if (n.includes("cricket")) return "crkt";
  return "other";
}

function setWinner(legs: DCGameLeg[]): 0 | 1 | null {
  if (legs.length === 0) return null;
  let home = 0, away = 0;
  for (const leg of legs) {
    if (leg.winner_index === 0) home++;
    else if (leg.winner_index === 1) away++;
  }
  if (home > away) return 0;
  if (away > home) return 1;
  return null;
}

interface WeekAccum {
  opponentTeam: string;
  setWins: number; setLosses: number;
  crktWins: number; crktLosses: number;
  col601Wins: number; col601Losses: number;
  col501Wins: number; col501Losses: number;
  hundredPlus: number;
  oneEighty: number;
  ro9: number;
  hOut: number;
  ldg: number;
  rnds: number;
  mpr: string | null;
  ppr: string | null;
}

function emptyWeek(opponentTeam: string): WeekAccum {
  return {
    opponentTeam,
    setWins: 0, setLosses: 0,
    crktWins: 0, crktLosses: 0,
    col601Wins: 0, col601Losses: 0,
    col501Wins: 0, col501Losses: 0,
    hundredPlus: 0, oneEighty: 0, ro9: 0, hOut: 0, ldg: 999, rnds: 0,
    mpr: null, ppr: null,
  };
}

interface PlayerAccum {
  dcId: string;
  name: string;
  teamName: string;
  setWins: number; setLosses: number;
  crktWins: number; crktLosses: number;
  col601Wins: number; col601Losses: number;
  col501Wins: number; col501Losses: number;
  hundredPlus: number;
  cricketRnds: number;
  oneEighty: number;
  ro9: number;
  hOut: number;
  minDarts501: number;
  zeroOnePointsTotal: number;
  zeroOneDartsTotal: number;
  crktMarksTotal: number;
  crktDartsTotal: number;
  weekHundredPlus: Map<string, number>;
  weeksPlayed: Set<string>;
  opponentNames: string[];
  weekStats: Map<string, WeekAccum>;
}

function emptyAccum(dcId: string, name: string, teamName: string): PlayerAccum {
  return {
    dcId, name, teamName,
    setWins: 0, setLosses: 0,
    crktWins: 0, crktLosses: 0,
    col601Wins: 0, col601Losses: 0,
    col501Wins: 0, col501Losses: 0,
    hundredPlus: 0, cricketRnds: 0, oneEighty: 0, ro9: 0, hOut: 0, minDarts501: 999,
    zeroOnePointsTotal: 0, zeroOneDartsTotal: 0,
    crktMarksTotal: 0, crktDartsTotal: 0,
    weekHundredPlus: new Map(),
    weeksPlayed: new Set(),
    opponentNames: [],
    weekStats: new Map(),
  };
}

async function backfillArchivedMetadata(
  archivedSeasons: DCSeason[],
  debug: Record<string, unknown>
): Promise<void> {
  if (archivedSeasons.length === 0) return;
  let ok = 0;
  for (const s of archivedSeasons) {
    try {
      type ArchComp = Record<string, unknown>;
      let comps: ArchComp[] = [];
      try {
        const props = await fetchStandingsPageProps(s.id);
        comps = (props.competitors ?? []) as ArchComp[];
      } catch { /* very old seasons may not have standings */ }
      if (comps.length === 0) { ok++; continue; }

      const divIdMap = new Map<number, number>();
      for (const comp of comps) {
        const dcDivId = comp.division_id != null ? Number(comp.division_id) : null;
        if (dcDivId == null) continue;
        const [row] = await db
          .insert(divisions)
          .values({ dcId: dcDivId, seasonId: s.id, name: String(comp.division ?? "") })
          .onConflictDoUpdate({ target: [divisions.dcId, divisions.seasonId], set: { name: String(comp.division ?? "") } })
          .returning({ id: divisions.id });
        if (row) divIdMap.set(dcDivId, row.id);
      }

      for (const comp of comps) {
        const dcTeamId = Number(comp.id);
        if (!dcTeamId) continue;
        const dcDivId = comp.division_id != null ? Number(comp.division_id) : null;
        await db
          .insert(teams)
          .values({
            dcId: dcTeamId,
            seasonId: s.id,
            divisionId: dcDivId != null ? (divIdMap.get(dcDivId) ?? null) : null,
            name: String(comp.team_name ?? comp.name ?? ""),
            dcWins: comp.win != null ? Number(comp.win) : null,
            dcLosses: comp.loss != null ? Number(comp.loss) : null,
            dcLeaguePoints: comp.league_points != null ? Number(comp.league_points) : null,
          })
          .onConflictDoUpdate({
            target: [teams.dcId, teams.seasonId],
            set: {
              divisionId: dcDivId != null ? (divIdMap.get(dcDivId) ?? null) : null,
              dcWins: comp.win != null ? Number(comp.win) : null,
              dcLosses: comp.loss != null ? Number(comp.loss) : null,
              dcLeaguePoints: comp.league_points != null ? Number(comp.league_points) : null,
            },
          });
      }
      ok++;
    } catch (e) {
      debug.archivedSeasonErrors = [
        ...((debug.archivedSeasonErrors as string[]) ?? []),
        `Season ${s.id}: ${e instanceof Error ? e.message : String(e)}`,
      ];
    }
  }
  debug.archivedSeasonsProcessed = ok;
}

function weekKeyToISODate(weekKey: string): string | null {
  const M: Record<string, string> = {
    Jan:"01",Feb:"02",Mar:"03",Apr:"04",May:"05",Jun:"06",
    Jul:"07",Aug:"08",Sep:"09",Oct:"10",Nov:"11",Dec:"12",
  };
  const [d, m, y] = weekKey.split(" ");
  const mn = M[m];
  if (!mn || !d || !y) return null;
  return `${y}-${mn}-${d.padStart(2, "0")}`;
}

function guidToFakeId(guid: string): number {
  let h = 0;
  for (const c of guid) {
    h = (h * 31 + c.charCodeAt(0)) | 0;
  }
  return h < 0 ? h : ~h;
}

// ── scrapeSeasonStats ─────────────────────────────────────────────────────────

async function scrapeSeasonStats(
  targetSeasonId: number,
  leagueGuid: string,
  debug: Record<string, unknown>
): Promise<{ playersUpdated: number; matchesUpdated: number }> {

  // ── A. Fetch schedule / lineups ─────────────────────────────────────────────
  let matchList: DCMatch[] = [];
  try {
    const c = await getCSRFCookies();
    const raw = await fetchLineups(targetSeasonId, c);
    matchList = normalizeLineups(raw);
    debug.matchListLength = matchList.length;
  } catch (e) {
    debug.lineupsError = e instanceof Error ? e.message : String(e);
  }

  // ── B. Fetch standings (team competitors) ───────────────────────────────────
  type Competitor = Record<string, unknown>;
  let teamCompetitors: Competitor[] = [];
  try {
    const props = await fetchStandingsPageProps(targetSeasonId);
    teamCompetitors = (props.competitors ?? []) as Competitor[];
    debug.teamsCount = teamCompetitors.length;
    debug.competitorSample = teamCompetitors[0] ?? null;
  } catch (e) {
    debug.standingsError = e instanceof Error ? e.message : String(e);
  }

  // ── C. Fetch player rosters + match histories per team ──────────────────────
  type PlayerWithTeam = DCPlayerStat & { _teamName: string };
  const roster: PlayerWithTeam[] = [];
  const seenPlayerIds = new Set<number>();
  const matchMeta = new Map<string, { homeTeamId: string; awayTeamId: string; weekKey: string; roundSeq: number | null }>();

  let sampleHistoryEntry: unknown = null;

  for (const team of teamCompetitors) {
    const teamId = String(team.id);
    const teamName = String(team.team_name ?? team.name ?? "");
    try {
      const c = await getCSRFCookies();
      const res = await fetchPlayerStandings(targetSeasonId, { season_status: "REG", opponent_guid: teamId }, c);
      for (const p of res.roster ?? []) {
        const pid = (p as unknown as Record<string, unknown>).id as number;
        if (!seenPlayerIds.has(pid)) {
          seenPlayerIds.add(pid);
          roster.push({ ...(p as DCPlayerStat), _teamName: teamName });
        }
      }
      const c2 = await getCSRFCookies();
      const rawRes = await (async () => {
        const { xsrf, session } = c2;
        const xsrfDecoded = decodeURIComponent(xsrf);
        const r = await fetch(`https://tv.dartconnect.com/api/league/${process.env.DC_LEAGUE_ID ?? ""}/standings/${targetSeasonId}/matches`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "X-XSRF-TOKEN": xsrfDecoded,
            Cookie: `XSRF-TOKEN=${xsrf}; ${session}`,
            "User-Agent": "Mozilla/5.0",
            Referer: `https://tv.dartconnect.com/league/${process.env.DC_LEAGUE_ID ?? ""}`,
          },
          body: JSON.stringify({ season_status: "REG", opponent_guid: teamId }),
        });
        return r.ok ? (await r.json() as { matches?: unknown[] }) : { matches: [] };
      })();
      const rawMatches = rawRes.matches ?? [];
      if (!sampleHistoryEntry && rawMatches.length > 0) {
        sampleHistoryEntry = rawMatches[0];
      }
      const history = rawMatches as DCMatchHistoryEntry[];
      for (const entry of history) {
        const guid = entry.match_id;
        if (!guid) continue;
        const entryRoundSeq = entry.round_seq != null ? Number(entry.round_seq) : null;
        if (!matchMeta.has(guid)) {
          matchMeta.set(guid, {
            homeTeamId: entry.side === "Home" ? teamId : "__unknown__",
            awayTeamId: entry.side === "Away" ? teamId : "__unknown__",
            weekKey: entry.match_start_date ?? "",
            roundSeq: entryRoundSeq,
          });
        } else {
          const meta = matchMeta.get(guid)!;
          if (meta.homeTeamId === "__unknown__") meta.homeTeamId = teamId;
          if (meta.awayTeamId === "__unknown__") meta.awayTeamId = teamId;
          if (meta.roundSeq == null && entryRoundSeq != null) meta.roundSeq = entryRoundSeq;
        }
      }
    } catch { /* non-fatal per team */ }
  }

  debug.sampleHistoryEntry = sampleHistoryEntry;
  debug.rosterLength = roster.length;
  debug.uniqueMatchGuids = matchMeta.size;

  // ── D. Fetch segments + authoritative scores + per-match player stats ────────
  const guids = Array.from(matchMeta.keys());
  const segmentsMap = new Map<string, DCGameLeg[][]>();
  const matchDataMap = new Map<string, DCMatchData>();
  const matchPlayerStatsMap = new Map<string, DCMatchPlayerStat[]>();

  const segResults = await Promise.allSettled(
    guids.map(async (guid) => {
      const [sets, matchData, pStats] = await Promise.allSettled([
        fetchGameSegments(guid),
        fetchMatchData(guid),
        fetchMatchPlayerStats(guid),
      ]);
      if (sets.status === "fulfilled") segmentsMap.set(guid, sets.value);
      if (matchData.status === "fulfilled") matchDataMap.set(guid, matchData.value);
      if (pStats.status === "fulfilled") matchPlayerStatsMap.set(guid, pStats.value);
    })
  );
  debug.segmentsLoaded = segmentsMap.size;
  debug.matchPlayerStatsLoaded = matchPlayerStatsMap.size;
  debug.segmentsErrors = segResults.filter((r) => r.status === "rejected").length;
  const firstMatchData = matchDataMap.values().next().value as DCMatchData | undefined;
  if (firstMatchData) debug.sampleMatchPropKeys = firstMatchData.propKeys;

  // ── E. Build player accumulators from segments ──────────────────────────────
  const accumByName = new Map<string, PlayerAccum>();
  for (const p of roster) {
    const s = p as unknown as Record<string, unknown>;
    const firstName = String(s.player_first_name ?? "").trim();
    const lastName = String(s.player_last_name ?? "").trim();
    const playerName = [firstName, lastName].filter(Boolean).join(" ");
    if (!playerName) continue;
    if (!accumByName.has(playerName)) {
      accumByName.set(playerName, emptyAccum(
        s.id != null ? String(s.id) : "",
        playerName,
        String(s._teamName ?? "")
      ));
    }
  }

  // ── E0. Load game-3 / tiebreaker config ─────────────────────────────────────
  // Keys: g3.include_180, g3.include_ro9, g3.include_hout (default true)
  //       g3.include_100plus, g3.include_rnds, g3.include_perfect (default false)
  const g3CfgRows = await db.select().from(scoringConfig)
    .where(inArray(scoringConfig.scope, ["global", String(targetSeasonId)]));
  const g3CfgMap: Record<string, string> = {};
  for (const r of g3CfgRows.filter(r => r.scope === "global" && !r.division)) g3CfgMap[r.key] = r.value;
  for (const r of g3CfgRows.filter(r => r.scope === String(targetSeasonId) && !r.division)) g3CfgMap[r.key] = r.value;
  const g3 = {
    include180:     g3CfgMap["g3.include_180"]     !== "false", // default true
    includeRo9:     g3CfgMap["g3.include_ro9"]     !== "false", // default true
    includeHout:    g3CfgMap["g3.include_hout"]    !== "false", // default true
    include100p:    g3CfgMap["g3.include_100plus"] === "true",  // default false
    includeRnds:    g3CfgMap["g3.include_rnds"]    === "true",  // default false
    includePerfect: g3CfgMap["g3.include_perfect"] === "true",  // default false
  };

  const sampleCricketScores: string[] = [];

  for (const [guid, sets] of segmentsMap) {
    const meta = matchMeta.get(guid);
    if (!meta) continue;
    const { homeTeamId, awayTeamId, weekKey } = meta;
    const homeTeamName = String(teamCompetitors.find((t) => String(t.id) === homeTeamId)?.name ?? "");
    const awayTeamName = String(teamCompetitors.find((t) => String(t.id) === awayTeamId)?.name ?? "");

    for (const legs of sets) {
      if (legs.length === 0) continue;
      const type = gameType(legs[0].game_name ?? "");
      const winner = setWinner(legs);

      const homePlayers = new Set<string>();
      const awayPlayers = new Set<string>();
      for (const leg of legs) {
        for (const turn of leg.turns ?? []) {
          if (turn.home?.name) homePlayers.add(turn.home.name);
          if (turn.away?.name) awayPlayers.add(turn.away.name);
        }
      }

      function awardSet(
        playerSet: Set<string>,
        isWinner: boolean,
        opponentPlayers: Set<string>,
        opponentTeamName: string
      ) {
        for (const pname of playerSet) {
          const acc = accumByName.get(pname);
          if (!acc) continue;
          acc.weeksPlayed.add(weekKey);
          for (const oppName of opponentPlayers) acc.opponentNames.push(oppName);
          if (!acc.weekStats.has(weekKey)) acc.weekStats.set(weekKey, emptyWeek(opponentTeamName));
          const w = acc.weekStats.get(weekKey)!;
          if (isWinner) {
            acc.setWins++; w.setWins++;
            if (type === "crkt") { acc.crktWins++;   w.crktWins++;   }
            else if (type === "601") { acc.col601Wins++; w.col601Wins++; }
            else if (type === "501") { acc.col501Wins++; w.col501Wins++; }
          } else {
            acc.setLosses++; w.setLosses++;
            if (type === "crkt") { acc.crktLosses++;   w.crktLosses++;   }
            else if (type === "601") { acc.col601Losses++; w.col601Losses++; }
            else if (type === "501") { acc.col501Losses++; w.col501Losses++; }
          }
        }
      }

      awardSet(homePlayers, winner === 0, awayPlayers, awayTeamName);
      awardSet(awayPlayers, winner === 1, homePlayers, homeTeamName);

      for (const leg of legs) {
        const is501Tiebreaker = type === "501" && leg.set_game_number === 3;
        const isCrktG3 = type === "crkt" && leg.set_game_number === 3;

        for (const turn of leg.turns ?? []) {
          for (const side of ["home", "away"] as const) {
            const t = turn[side];
            if (!t?.name) continue;
            const acc = accumByName.get(t.name);
            if (!acc) continue;
            const is01 = type === "601" || type === "501";
            const isCrkt = type === "crkt";
            const score01 = is01 ? (typeof t.turn_score === "number" ? t.turn_score : Number(t.turn_score ?? 0)) : 0;
            const crktMarks = isCrkt ? parseCricketMarks(t.turn_score) : 0;

            if (isCrkt && t.turn_score != null && sampleCricketScores.length < 20) {
              const sc = String(t.turn_score);
              if (!sampleCricketScores.includes(sc)) sampleCricketScores.push(sc);
            }

            const remaining = t.current_score;
            const w = acc.weekStats.get(weekKey);

            if (is01 && score01 >= 100 && (!is501Tiebreaker || g3.include100p || (g3.includePerfect && score01 === 180))) {
              acc.hundredPlus += score01;
              acc.weekHundredPlus.set(weekKey, (acc.weekHundredPlus.get(weekKey) ?? 0) + score01);
              if (w) w.hundredPlus += score01;
            }
            if (is01 && score01 === 180 && (!is501Tiebreaker || g3.include180)) { acc.oneEighty++; if (w) w.oneEighty++; }
            if (is01 && remaining === 0 && score01 > 100 && (!is501Tiebreaker || g3.includeHout)) {
              if (score01 > acc.hOut) acc.hOut = score01;
              if (w && score01 > w.hOut) w.hOut = score01;
            }
            if (isCrkt && crktMarks >= 6 && (!isCrktG3 || g3.includeRnds || (g3.includePerfect && crktMarks === 9))) {
              acc.cricketRnds += crktMarks;
              if (w) w.rnds += crktMarks;
            }
            if (isCrkt && crktMarks === 9 && (!isCrktG3 || g3.includeRo9)) { acc.ro9++; if (w) w.ro9++; }
          }
        }

        if (type === "501") {
          for (const side of ["home", "away"] as const) {
            const sideIdx = side === "home" ? 0 : 1;
            if (leg.winner_index !== sideIdx) continue;
            const darts = leg[side]?.darts_thrown;
            if (darts == null || darts <= 0) continue;
            const sideNames = side === "home" ? homePlayers : awayPlayers;
            for (const pname of sideNames) {
              const acc = accumByName.get(pname);
              if (!acc) continue;
              const w = acc.weekStats.get(weekKey);
              if (darts < acc.minDarts501) acc.minDarts501 = darts;
              if (w && darts < w.ldg) w.ldg = darts;
            }
          }
        }
      }
    }
  }

  // ── F. Merge per-match player stats (MPR, PPR, season aggregates) ───────────
  for (const [guid, playerMatchStats] of matchPlayerStatsMap) {
    const meta = matchMeta.get(guid);
    if (!meta) continue;
    const weekKey = meta.weekKey;
    for (const ps of playerMatchStats) {
      const acc = accumByName.get(ps.name);
      if (!acc) continue;
      const w = acc.weekStats.get(weekKey);
      if (w) {
        if (ps.cricket_average && parseFloat(ps.cricket_average) > 0) w.mpr = ps.cricket_average;
        const avgPpr = parseFloat(ps.average_01);
        if (!isNaN(avgPpr) && avgPpr > 0) w.ppr = ps.average_01;
      }
      const pts01 = parseInt(String(ps.points_scored_01).replace(/,/g, ""), 10);
      const dts01 = parseInt(String(ps.darts_thrown_01).replace(/,/g, ""), 10);
      if (!isNaN(pts01) && !isNaN(dts01) && dts01 > 0) {
        acc.zeroOnePointsTotal += pts01;
        acc.zeroOneDartsTotal += dts01;
      }
      const marks = Number(ps.cricket_marks_scored);
      const crktDarts = Number(ps.cricket_darts_thrown);
      if (!isNaN(marks) && !isNaN(crktDarts) && crktDarts > 0) {
        acc.crktMarksTotal += marks;
        acc.crktDartsTotal += crktDarts;
      }
    }
  }

  // ── G. Compute per-player win% for SOS ──────────────────────────────────────
  const playerWinPct = new Map<string, number>();
  for (const [name, acc] of accumByName) {
    const total = acc.setWins + acc.setLosses;
    playerWinPct.set(name, total > 0 ? acc.setWins / total : 0);
  }

  // ── H. Upsert divisions + teams + matches from lineups ──────────────────────
  let matchesUpdated = 0;
  const divSerialIdByDcId = new Map<number, number>();
  const dcTeamToSerialId = new Map<number, number>();
  const dateToRoundSeq = new Map<string, number>();

  for (const m of matchList) {
    let divSerialId: number | null = null;
    if (m.division_id != null) {
      if (divSerialIdByDcId.has(m.division_id)) {
        divSerialId = divSerialIdByDcId.get(m.division_id)!;
      } else {
        const [divRow] = await db
          .insert(divisions)
          .values({ dcId: m.division_id, seasonId: targetSeasonId, name: m.division })
          .onConflictDoUpdate({ target: [divisions.dcId, divisions.seasonId], set: { name: m.division } })
          .returning({ id: divisions.id });
        divSerialId = divRow?.id ?? null;
        if (divSerialId != null) divSerialIdByDcId.set(m.division_id, divSerialId);
      }
    }

    let homeSerialId: number | null = null;
    let awaySerialId: number | null = null;

    for (const [side, isHome] of [[m.left, true], [m.right, false]] as [typeof m.left, boolean][]) {
      if (!side.id) continue;
      const comp = teamCompetitors.find((c) => Number(c.id) === side.id);
      const dcWins = comp?.win != null ? Number(comp.win) : null;
      const dcLosses = comp?.loss != null ? Number(comp.loss) : null;
      const dcLeaguePoints = comp?.league_points != null ? Number(comp.league_points) : null;
      const [teamRow] = await db
        .insert(teams)
        .values({ dcId: side.id, seasonId: targetSeasonId, divisionId: divSerialId, name: side.team_name, captainName: side.captain_name ?? null, dcWins, dcLosses, dcLeaguePoints })
        .onConflictDoUpdate({ target: [teams.dcId, teams.seasonId], set: { divisionId: divSerialId, name: side.team_name, captainName: side.captain_name ?? null, dcWins, dcLosses, dcLeaguePoints } })
        .returning({ id: teams.id });
      if (teamRow?.id) {
        dcTeamToSerialId.set(side.id, teamRow.id);
        if (isHome) homeSerialId = teamRow.id;
        else awaySerialId = teamRow.id;
      }
    }

    if (m.round_seq != null) {
      if (m.sched_date) dateToRoundSeq.set(m.sched_date, m.round_seq);
      if (m.pretty_date) dateToRoundSeq.set(m.pretty_date, m.round_seq);
    }

    if (!m.id) { matchesUpdated++; continue; }

    await db
      .insert(matches)
      .values({ id: m.id, seasonId: targetSeasonId, divisionId: divSerialId, divisionName: m.division, roundSeq: m.round_seq, homeTeamId: homeSerialId, awayTeamId: awaySerialId, homeTeamName: m.left.team_name, awayTeamName: m.right.team_name, schedDate: m.sched_date, schedTime: m.sched_time, status: m.status, homeScore: m.home_score ?? 0, awayScore: m.away_score ?? 0, dcMatchId: m.dc_match_id ?? null, seasonStatus: m.season_status, prettyDate: m.pretty_date })
      .onConflictDoUpdate({ target: matches.id, set: { status: m.status, homeScore: m.home_score ?? 0, awayScore: m.away_score ?? 0, dcMatchId: m.dc_match_id ?? null, updatedAt: new Date() } });
    matchesUpdated++;
  }

  {
    const isoEntries = Array.from(dateToRoundSeq.entries())
      .filter(([k]) => /^\d{4}-/.test(k))
      .sort(([a], [b]) => a.localeCompare(b));
    if (isoEntries.length > 0) {
      const [minDate, minRound] = isoEntries[0];
      const minMs = new Date(minDate).getTime();
      const inferred: Record<string, number> = {};
      for (const meta of matchMeta.values()) {
        const isoDate = weekKeyToISODate(meta.weekKey);
        if (!isoDate || isoDate >= minDate || dateToRoundSeq.has(isoDate)) continue;
        const daysBack = Math.round((minMs - new Date(isoDate).getTime()) / 86400000);
        if (daysBack > 0 && daysBack % 7 === 0) {
          const inferredRound = minRound - daysBack / 7;
          if (inferredRound > 0) {
            dateToRoundSeq.set(isoDate, inferredRound);
            inferred[isoDate] = inferredRound;
          }
        }
      }
      if (Object.keys(inferred).length > 0) debug.inferredRounds = inferred;
    }
  }

  debug.dateToRoundSeq = Object.fromEntries(
    Array.from(dateToRoundSeq.entries()).filter(([k]) => /^\d{4}-/.test(k))
  );

  if (matchList.length === 0 && teamCompetitors.length > 0) {
    const teamRows = await db
      .select({ id: teams.id, dcId: teams.dcId })
      .from(teams)
      .where(eq(teams.seasonId, targetSeasonId));
    for (const row of teamRows) dcTeamToSerialId.set(row.dcId, row.id);
  }

  // ── I. Update completed match scores from segment data ──────────────────────
  let matchScoresUpdated = 0;
  for (const [guid, sets] of segmentsMap) {
    const meta = matchMeta.get(guid);
    if (!meta || meta.homeTeamId === "__unknown__" || meta.awayTeamId === "__unknown__") continue;
    const homeSerialId = dcTeamToSerialId.get(parseInt(meta.homeTeamId));
    const awaySerialId = dcTeamToSerialId.get(parseInt(meta.awayTeamId));
    if (!homeSerialId || !awaySerialId) continue;

    let homeSetWins = 0, awaySetWins = 0;
    for (const legs of sets) {
      if (legs.length === 0) continue;
      const w = setWinner(legs);
      if (w === 0) homeSetWins++;
      else if (w === 1) awaySetWins++;
    }
    if (homeSetWins + awaySetWins === 0) continue;

    const homeComp = teamCompetitors.find((t) => String(t.id) === meta.homeTeamId);
    const awayComp  = teamCompetitors.find((t) => String(t.id) === meta.awayTeamId);
    const homeTeamNameStr = String(homeComp?.team_name ?? homeComp?.name ?? "");
    const awayTeamNameStr = String(awayComp?.team_name  ?? awayComp?.name  ?? "");

    const matchData = matchDataMap.get(guid);
    const parsedDate = matchData?.schedDate ?? weekKeyToISODate(meta.weekKey);
    const roundSeq =
      meta.roundSeq ??
      matchData?.roundSeq ??
      (parsedDate != null ? (dateToRoundSeq.get(parsedDate) ?? null) : null) ??
      null;

    const matchInfo = matchData?.matchInfo;
    let homeScore = homeSetWins, awayScore = awaySetWins;
    if (matchInfo?.opponents && matchInfo.opponents.length >= 2) {
      const oppByName = new Map(matchInfo.opponents.map((o) => [o.name, o.score]));
      const fromHome = oppByName.get(homeTeamNameStr);
      const fromAway = oppByName.get(awayTeamNameStr);
      if (fromHome !== undefined && fromAway !== undefined) {
        homeScore = fromHome;
        awayScore = fromAway;
      } else {
        homeScore = matchInfo.opponents[0].score ?? homeSetWins;
        awayScore = matchInfo.opponents[1].score ?? awaySetWins;
      }
    }

    await db
      .update(matches)
      .set({ homeScore, awayScore, ...(roundSeq != null ? { roundSeq } : {}), status: "C", dcGuid: guid, updatedAt: new Date() })
      .where(and(
        eq(matches.seasonId, targetSeasonId),
        eq(matches.homeTeamId, homeSerialId),
        eq(matches.awayTeamId, awaySerialId),
      ));

    await db
      .insert(matches)
      .values({
        id: guidToFakeId(guid),
        seasonId: targetSeasonId,
        homeTeamId: homeSerialId,
        awayTeamId: awaySerialId,
        homeTeamName: homeTeamNameStr,
        awayTeamName: awayTeamNameStr,
        schedDate: parsedDate,
        prettyDate: meta.weekKey || null,
        roundSeq,
        status: "C",
        homeScore,
        awayScore,
        dcGuid: guid,
      })
      .onConflictDoUpdate({
        target: matches.dcGuid,
        set: {
          homeScore,
          awayScore,
          ...(roundSeq != null ? { roundSeq } : {}),
          prettyDate: meta.weekKey || null,
          status: "C",
          awayTeamId: awaySerialId,
          awayTeamName: awayTeamNameStr,
          updatedAt: new Date(),
        },
      });
    matchScoresUpdated++;
  }
  debug.matchScoresUpdated = matchScoresUpdated;
  debug.sampleCricketScores = sampleCricketScores;

  // ── J. Fetch season MPR from leaderboard API ────────────────────────────────
  const leaderboardMprByName = new Map<string, string>();
  try {
    const lbStats = await fetchLeaderboard(leagueGuid, targetSeasonId, "cricket", "doubles");
    for (const row of lbStats) {
      if (!row.darts_thrown || row.darts_thrown === 0) continue;
      const mpr = (row.points_scored * 3) / row.darts_thrown;
      const fullName = [row.first_name, row.last_name].filter(Boolean).join(" ");
      if (fullName) leaderboardMprByName.set(fullName, mpr.toFixed(2));
    }
    debug.leaderboardMprCount = leaderboardMprByName.size;
  } catch (e) {
    debug.leaderboardMprError = e instanceof Error ? e.message : String(e);
  }

  // ── K. Upsert player stats + per-week stats ─────────────────────────────────
  let playersUpdated = 0;

  for (const p of roster) {
    const s = p as unknown as Record<string, unknown>;
    const firstName = String(s.player_first_name ?? "").trim();
    const lastName  = String(s.player_last_name  ?? "").trim();
    const playerName = [firstName, lastName].filter(Boolean).join(" ");
    if (!playerName) continue;

    const dcId = s.id != null ? String(s.id) : null;
    const teamName = String(s._teamName ?? "");

    const [player] = await db
      .insert(players)
      .values({ dcGuid: dcId, name: playerName })
      .onConflictDoUpdate({ target: players.name, set: { dcGuid: dcId } })
      .returning({ id: players.id });

    const playerId = player.id;

    const teamRows = await db
      .select({ id: teams.id, divisionId: teams.divisionId })
      .from(teams)
      .where(and(eq(teams.seasonId, targetSeasonId), eq(teams.name, teamName)))
      .limit(1);
    const teamId = teamRows[0]?.id ?? null;
    const teamDivisionId = teamRows[0]?.divisionId ?? null;

    let divisionName: string | null = null;
    if (teamDivisionId != null) {
      const divRows = await db
        .select({ name: divisions.name })
        .from(divisions)
        .where(eq(divisions.id, teamDivisionId))
        .limit(1);
      divisionName = divRows[0]?.name ?? null;
    }

    await db
      .insert(playerSeasonTeams)
      .values({
        playerId,
        seasonId: targetSeasonId,
        teamId: teamId ?? null,
        teamName: teamName || null,
        divisionId: teamDivisionId ?? null,
        divisionName,
      })
      .onConflictDoUpdate({
        target: [playerSeasonTeams.playerId, playerSeasonTeams.seasonId],
        set: {
          teamId: teamId ?? null,
          teamName: teamName || null,
          divisionId: teamDivisionId ?? null,
          divisionName,
        },
      });

    const acc = accumByName.get(playerName);
    const setWins_   = acc?.setWins   ?? 0;
    const setLosses_ = acc?.setLosses ?? 0;
    const setTotal   = setWins_ + setLosses_;
    const avgPct     = setTotal > 0 ? setWins_ / setTotal : null;
    const wp         = acc ? String(acc.weeksPlayed.size) : null;
    const crkt  = acc && (acc.crktWins + acc.crktLosses) > 0 ? `${acc.crktWins}-${acc.crktLosses}` : null;
    const col601 = acc && (acc.col601Wins + acc.col601Losses) > 0 ? `${acc.col601Wins}-${acc.col601Losses}` : null;
    const col501 = acc && (acc.col501Wins + acc.col501Losses) > 0 ? `${acc.col501Wins}-${acc.col501Losses}` : null;

    let sos: string | null = null;
    if (acc && acc.opponentNames.length > 0) {
      const pctSum = acc.opponentNames.reduce(
        (sum: number, oppName: string) => sum + (playerWinPct.get(oppName) ?? 0), 0
      );
      sos = (pctSum / acc.opponentNames.length).toFixed(3);
    }

    let zeroOneHh = 0;
    if (acc) {
      for (const weekTotal of acc.weekHundredPlus.values()) {
        if (weekTotal > 450 && weekTotal > zeroOneHh) zeroOneHh = weekTotal;
      }
    }

    const pos = (s.player_rank ?? null) as number | null;

    const vals = {
      phase: "REG" as const,
      seasonId: targetSeasonId,
      playerId,
      teamId,
      teamName,
      pos,
      wp,
      crkt,
      col601,
      col501,
      sos,
      hundredPlus: acc?.hundredPlus  ?? 0,
      rnds:        acc?.cricketRnds  ?? 0,
      oneEighty:   acc?.oneEighty    ?? 0,
      roHh:        0,
      zeroOneHh,
      ro9:         acc?.ro9          ?? 0,
      hOut:        acc?.hOut         ?? 0,
      ldg:         acc && acc.minDarts501 < 999 ? acc.minDarts501 : null,
      ro6b:        0,
      mpr: leaderboardMprByName.get(playerName) ??
        (acc && acc.crktDartsTotal > 0
          ? ((acc.crktMarksTotal * 3) / acc.crktDartsTotal).toFixed(2)
          : null),
      ppr: acc && acc.zeroOneDartsTotal > 0
        ? (acc.zeroOnePointsTotal * 3 / acc.zeroOneDartsTotal).toFixed(2)
        : null,
      avg:  avgPct != null ? String(avgPct.toFixed(3)) : null,
      pts:  setWins_,
      updatedAt: new Date(),
    };

    await db
      .insert(playerStats)
      .values(vals)
      .onConflictDoUpdate({ target: [playerStats.seasonId, playerStats.playerId, playerStats.phase], set: { ...vals } });

    if (acc) {
      for (const [wk, w] of acc.weekStats) {
        const weekVals = {
          phase: "REG" as const,
          seasonId: targetSeasonId,
          playerId,
          weekKey: wk,
          opponentTeam: w.opponentTeam,
          setWins: w.setWins,
          setLosses: w.setLosses,
          crktWins: w.crktWins,
          crktLosses: w.crktLosses,
          col601Wins: w.col601Wins,
          col601Losses: w.col601Losses,
          col501Wins: w.col501Wins,
          col501Losses: w.col501Losses,
          hundredPlus: w.hundredPlus,
          oneEighty: w.oneEighty,
          ro9: w.ro9,
          hOut: w.hOut,
          ldg: w.ldg < 999 ? w.ldg : 0,
          rnds: w.rnds,
          mpr: w.mpr,
          ppr: w.ppr,
        };
        await db
          .insert(playerWeekStats)
          .values(weekVals)
          .onConflictDoUpdate({
            target: [playerWeekStats.seasonId, playerWeekStats.playerId, playerWeekStats.weekKey, playerWeekStats.phase],
            set: weekVals,
          });
      }
    }
    playersUpdated++;
  }

  // ── POST pass (postseason scraping) ─────────────────────────────────────────
  const postMatchMeta = new Map<string, { homeTeamId: string; awayTeamId: string; weekKey: string }>();
  const postRoster: PlayerWithTeam[] = [];
  const postSeenPlayerIds = new Set<number>();

  for (const team of teamCompetitors) {
    const teamId = String(team.id);
    const teamName = String(team.team_name ?? team.name ?? "");
    try {
      const c = await getCSRFCookies();
      const res = await fetchPlayerStandings(targetSeasonId, { season_status: "POST", opponent_guid: teamId }, c);
      for (const p of res.roster ?? []) {
        const pid = (p as unknown as Record<string, unknown>).id as number;
        if (!postSeenPlayerIds.has(pid)) {
          postSeenPlayerIds.add(pid);
          postRoster.push({ ...(p as DCPlayerStat), _teamName: teamName });
        }
      }
      const c2 = await getCSRFCookies();
      const history = await fetchTeamMatchHistory(targetSeasonId, teamId, c2, "POST");
      for (const entry of history) {
        const guid = entry.match_id;
        if (!guid) continue;
        if (!postMatchMeta.has(guid)) {
          postMatchMeta.set(guid, {
            homeTeamId: entry.side === "Home" ? teamId : "__unknown__",
            awayTeamId: entry.side === "Away" ? teamId : "__unknown__",
            weekKey: entry.match_start_date ?? "",
          });
        } else {
          const meta = postMatchMeta.get(guid)!;
          if (meta.homeTeamId === "__unknown__") meta.homeTeamId = teamId;
          if (meta.awayTeamId === "__unknown__") meta.awayTeamId = teamId;
        }
      }
    } catch { /* non-fatal per team */ }
  }

  debug.postMatchGuids = postMatchMeta.size;

  if (postMatchMeta.size > 0) {
    const postGuids = Array.from(postMatchMeta.keys());
    const postSegmentsMap = new Map<string, DCGameLeg[][]>();
    const postMatchPlayerStatsMap = new Map<string, DCMatchPlayerStat[]>();

    await Promise.allSettled(
      postGuids.map(async (guid) => {
        const [sets, pStats] = await Promise.allSettled([
          fetchGameSegments(guid),
          fetchMatchPlayerStats(guid),
        ]);
        if (sets.status === "fulfilled") postSegmentsMap.set(guid, sets.value);
        if (pStats.status === "fulfilled") postMatchPlayerStatsMap.set(guid, pStats.value);
      })
    );
    debug.postSegmentsLoaded = postSegmentsMap.size;

    const postAccumByName = new Map<string, PlayerAccum>();
    for (const p of postRoster) {
      const s = p as unknown as Record<string, unknown>;
      const firstName = String(s.player_first_name ?? "").trim();
      const lastName  = String(s.player_last_name  ?? "").trim();
      const playerName = [firstName, lastName].filter(Boolean).join(" ");
      if (!playerName) continue;
      if (!postAccumByName.has(playerName)) {
        postAccumByName.set(playerName, emptyAccum(
          s.id != null ? String(s.id) : "",
          playerName,
          String(s._teamName ?? "")
        ));
      }
    }

    for (const [guid, sets] of postSegmentsMap) {
      const meta = postMatchMeta.get(guid);
      if (!meta) continue;
      const { homeTeamId, awayTeamId, weekKey } = meta;
      const homeTeamName = String(teamCompetitors.find((t) => String(t.id) === homeTeamId)?.name ?? "");
      const awayTeamName = String(teamCompetitors.find((t) => String(t.id) === awayTeamId)?.name ?? "");

      for (const legs of sets) {
        if (legs.length === 0) continue;
        const type = gameType(legs[0].game_name ?? "");
        const winner = setWinner(legs);

        const homePlayers = new Set<string>();
        const awayPlayers = new Set<string>();
        for (const leg of legs) {
          for (const turn of leg.turns ?? []) {
            if (turn.home?.name) homePlayers.add(turn.home.name);
            if (turn.away?.name) awayPlayers.add(turn.away.name);
          }
        }

        const awardSetPost = (playerSet: Set<string>, isWinner: boolean, opponentPlayers: Set<string>, opponentTeamName: string) => {
          for (const pname of playerSet) {
            const acc = postAccumByName.get(pname);
            if (!acc) continue;
            acc.weeksPlayed.add(weekKey);
            for (const oppName of opponentPlayers) acc.opponentNames.push(oppName);
            if (!acc.weekStats.has(weekKey)) acc.weekStats.set(weekKey, emptyWeek(opponentTeamName));
            const w = acc.weekStats.get(weekKey)!;
            if (isWinner) {
              acc.setWins++; w.setWins++;
              if (type === "crkt") { acc.crktWins++;    w.crktWins++;    }
              else if (type === "601") { acc.col601Wins++; w.col601Wins++; }
              else if (type === "501") { acc.col501Wins++; w.col501Wins++; }
            } else {
              acc.setLosses++; w.setLosses++;
              if (type === "crkt") { acc.crktLosses++;   w.crktLosses++;   }
              else if (type === "601") { acc.col601Losses++; w.col601Losses++; }
              else if (type === "501") { acc.col501Losses++; w.col501Losses++; }
            }
          }
        };

        awardSetPost(homePlayers, winner === 0, awayPlayers, awayTeamName);
        awardSetPost(awayPlayers, winner === 1, homePlayers, homeTeamName);

        for (const leg of legs) {
          const is501Tiebreaker = type === "501" && leg.set_game_number === 3;
          const isCrktG3 = type === "crkt" && leg.set_game_number === 3;
          for (const turn of leg.turns ?? []) {
            for (const side of ["home", "away"] as const) {
              const t = turn[side];
              if (!t?.name) continue;
              const acc = postAccumByName.get(t.name);
              if (!acc) continue;
              const is01   = type === "601" || type === "501";
              const isCrkt = type === "crkt";
              const score01   = is01   ? (typeof t.turn_score === "number" ? t.turn_score : Number(t.turn_score ?? 0)) : 0;
              const crktMarks = isCrkt ? parseCricketMarks(t.turn_score) : 0;
              const remaining = t.current_score;
              const w = acc.weekStats.get(weekKey);
              if (is01 && score01 >= 100 && (!is501Tiebreaker || g3.include100p || (g3.includePerfect && score01 === 180))) {
                acc.hundredPlus += score01;
                acc.weekHundredPlus.set(weekKey, (acc.weekHundredPlus.get(weekKey) ?? 0) + score01);
                if (w) w.hundredPlus += score01;
              }
              if (is01 && score01 === 180 && (!is501Tiebreaker || g3.include180)) { acc.oneEighty++; if (w) w.oneEighty++; }
              if (is01 && remaining === 0 && score01 > 100 && (!is501Tiebreaker || g3.includeHout)) {
                if (score01 > acc.hOut) acc.hOut = score01;
                if (w && score01 > w.hOut) w.hOut = score01;
              }
              if (isCrkt && crktMarks >= 6 && (!isCrktG3 || g3.includeRnds || (g3.includePerfect && crktMarks === 9))) {
                acc.cricketRnds += crktMarks;
                if (w) w.rnds += crktMarks;
              }
              if (isCrkt && crktMarks === 9 && (!isCrktG3 || g3.includeRo9)) { acc.ro9++; if (w) w.ro9++; }
            }
          }
          if (type === "501") {
            for (const side of ["home", "away"] as const) {
              const sideIdx = side === "home" ? 0 : 1;
              if (leg.winner_index !== sideIdx) continue;
              const darts = leg[side]?.darts_thrown;
              if (darts == null || darts <= 0) continue;
              const sideNames = side === "home" ? homePlayers : awayPlayers;
              for (const pname of sideNames) {
                const acc = postAccumByName.get(pname);
                if (!acc) continue;
                const w = acc.weekStats.get(weekKey);
                if (darts < acc.minDarts501) acc.minDarts501 = darts;
                if (w && darts < w.ldg) w.ldg = darts;
              }
            }
          }
        }
      }
    }

    for (const [guid, playerMatchStats] of postMatchPlayerStatsMap) {
      const meta = postMatchMeta.get(guid);
      if (!meta) continue;
      const weekKey = meta.weekKey;
      for (const ps of playerMatchStats) {
        const acc = postAccumByName.get(ps.name);
        if (!acc) continue;
        const w = acc.weekStats.get(weekKey);
        if (w) {
          if (ps.cricket_average && parseFloat(ps.cricket_average) > 0) w.mpr = ps.cricket_average;
          const avgPpr = parseFloat(ps.average_01);
          if (!isNaN(avgPpr) && avgPpr > 0) w.ppr = ps.average_01;
        }
        const pts01 = parseInt(String(ps.points_scored_01).replace(/,/g, ""), 10);
        const dts01 = parseInt(String(ps.darts_thrown_01).replace(/,/g, ""), 10);
        if (!isNaN(pts01) && !isNaN(dts01) && dts01 > 0) {
          acc.zeroOnePointsTotal += pts01;
          acc.zeroOneDartsTotal  += dts01;
        }
        const marks    = Number(ps.cricket_marks_scored);
        const crktDarts = Number(ps.cricket_darts_thrown);
        if (!isNaN(marks) && !isNaN(crktDarts) && crktDarts > 0) {
          acc.crktMarksTotal += marks;
          acc.crktDartsTotal += crktDarts;
        }
      }
    }

    let postPlayersUpdated = 0;
    for (const p of postRoster) {
      const s = p as unknown as Record<string, unknown>;
      const firstName  = String(s.player_first_name ?? "").trim();
      const lastName   = String(s.player_last_name  ?? "").trim();
      const playerName = [firstName, lastName].filter(Boolean).join(" ");
      if (!playerName) continue;

      const dcId     = s.id != null ? String(s.id) : null;
      const teamName = String(s._teamName ?? "");

      const [player] = await db
        .insert(players)
        .values({ dcGuid: dcId, name: playerName })
        .onConflictDoUpdate({ target: players.name, set: { dcGuid: dcId } })
        .returning({ id: players.id });
      const playerId = player.id;

      const teamRows = await db
        .select({ id: teams.id })
        .from(teams)
        .where(and(eq(teams.seasonId, targetSeasonId), eq(teams.name, teamName)))
        .limit(1);
      const teamId = teamRows[0]?.id ?? null;

      const acc = postAccumByName.get(playerName);
      const setWins_   = acc?.setWins   ?? 0;
      const setLosses_ = acc?.setLosses ?? 0;
      const setTotal   = setWins_ + setLosses_;
      const avgPct     = setTotal > 0 ? setWins_ / setTotal : null;
      const wp    = acc ? String(acc.weeksPlayed.size) : null;
      const crkt  = acc && (acc.crktWins + acc.crktLosses) > 0 ? `${acc.crktWins}-${acc.crktLosses}` : null;
      const col601 = acc && (acc.col601Wins + acc.col601Losses) > 0 ? `${acc.col601Wins}-${acc.col601Losses}` : null;
      const col501 = acc && (acc.col501Wins + acc.col501Losses) > 0 ? `${acc.col501Wins}-${acc.col501Losses}` : null;
      const pos = (s.player_rank ?? null) as number | null;

      const postVals = {
        phase: "POST" as const,
        seasonId: targetSeasonId,
        playerId,
        teamId,
        teamName,
        pos,
        wp, crkt, col601, col501,
        sos: null,
        hundredPlus: acc?.hundredPlus  ?? 0,
        rnds:        acc?.cricketRnds  ?? 0,
        oneEighty:   acc?.oneEighty    ?? 0,
        roHh: 0, zeroOneHh: 0,
        ro9:  acc?.ro9  ?? 0,
        hOut: acc?.hOut ?? 0,
        ldg:  acc && acc.minDarts501 < 999 ? acc.minDarts501 : null,
        ro6b: 0,
        mpr: acc && acc.crktDartsTotal > 0
          ? ((acc.crktMarksTotal * 3) / acc.crktDartsTotal).toFixed(2)
          : null,
        ppr: acc && acc.zeroOneDartsTotal > 0
          ? (acc.zeroOnePointsTotal * 3 / acc.zeroOneDartsTotal).toFixed(2)
          : null,
        avg:  avgPct != null ? String(avgPct.toFixed(3)) : null,
        pts:  setWins_,
        updatedAt: new Date(),
      };

      await db
        .insert(playerStats)
        .values(postVals)
        .onConflictDoUpdate({ target: [playerStats.seasonId, playerStats.playerId, playerStats.phase], set: { ...postVals } });

      if (acc) {
        for (const [wk, w] of acc.weekStats) {
          const postWeekVals = {
            phase: "POST" as const,
            seasonId: targetSeasonId,
            playerId,
            weekKey: wk,
            opponentTeam: w.opponentTeam,
            setWins: w.setWins, setLosses: w.setLosses,
            crktWins: w.crktWins, crktLosses: w.crktLosses,
            col601Wins: w.col601Wins, col601Losses: w.col601Losses,
            col501Wins: w.col501Wins, col501Losses: w.col501Losses,
            hundredPlus: w.hundredPlus,
            oneEighty: w.oneEighty,
            ro9: w.ro9,
            hOut: w.hOut,
            ldg: w.ldg < 999 ? w.ldg : 0,
            rnds: w.rnds,
            mpr: w.mpr,
            ppr: w.ppr,
          };
          await db
            .insert(playerWeekStats)
            .values(postWeekVals)
            .onConflictDoUpdate({
              target: [playerWeekStats.seasonId, playerWeekStats.playerId, playerWeekStats.weekKey, playerWeekStats.phase],
              set: postWeekVals,
            });
        }
      }
      postPlayersUpdated++;
    }
    debug.postPlayersUpdated = postPlayersUpdated;
  }

  await db.update(seasons).set({ lastScrapedAt: new Date() }).where(eq(seasons.id, targetSeasonId));

  return { playersUpdated, matchesUpdated };
}

// ── runScrape ─────────────────────────────────────────────────────────────────
// Main entry point called by both the API route (local) and the background
// function (Netlify). Returns the result or throws on fatal error.

export interface ScrapePayload {
  seasonId?: number;
  all?: boolean;
  force?: boolean;
}

export interface ScrapeResult {
  seasonsScraped: number;
  playersUpdated: number;
  matchesUpdated: number;
  debug: Record<string, unknown>;
}

export async function runScrape(
  payload: ScrapePayload,
  triggeredBy = "manual"
): Promise<ScrapeResult> {
  const debug: Record<string, unknown> = {};

  const pageProps = await fetchLeaguePageProps();
  const leagueGuid = pageProps.leagueInfo.guid;
  const allSeasonsList = [...pageProps.activeSeasons, ...pageProps.archivedSeasons];
  const activeSeason = pageProps.activeSeasons[0];

  if (allSeasonsList.length === 0) {
    throw new Error("No seasons found");
  }

  for (const s of allSeasonsList) {
    await db
      .insert(seasons)
      .values({
        id: s.id,
        leagueId: s.league_id,
        name: s.season,
        startDate: s.start_date,
        isActive: pageProps.activeSeasons.some((a) => a.id === s.id),
      })
      .onConflictDoUpdate({
        target: seasons.id,
        set: {
          name: s.season,
          isActive: pageProps.activeSeasons.some((a) => a.id === s.id),
        },
      });
  }

  await backfillArchivedMetadata(pageProps.archivedSeasons, debug);

  let seasonsToScrape: DCSeason[] = [];

  if (payload.all) {
    if (payload.force) {
      seasonsToScrape = allSeasonsList;
    } else {
      const dbRows = await db.select({ id: seasons.id, lastScrapedAt: seasons.lastScrapedAt }).from(seasons);
      const lastScrapedById = new Map(dbRows.map((r) => [r.id, r.lastScrapedAt]));
      seasonsToScrape = allSeasonsList.filter((s) => !lastScrapedById.get(s.id));
    }
  } else if (payload.seasonId) {
    const found = allSeasonsList.find((s) => s.id === payload.seasonId);
    if (!found) throw new Error(`Season ${payload.seasonId} not found`);
    seasonsToScrape = [found];
  } else {
    if (!activeSeason) return { seasonsScraped: 0, playersUpdated: 0, matchesUpdated: 0, debug };
    seasonsToScrape = [activeSeason];
  }

  let totalPlayersUpdated = 0;
  let totalMatchesUpdated = 0;
  const seasonResults: Record<string, unknown> = {};

  for (const s of seasonsToScrape) {
    const seasonDebug: Record<string, unknown> = {};
    try {
      const result = await scrapeSeasonStats(s.id, leagueGuid, seasonDebug);
      totalPlayersUpdated += result.playersUpdated;
      totalMatchesUpdated += result.matchesUpdated;
      seasonResults[`${s.id}_${s.season}`] = { ok: true, ...result, debug: seasonDebug };
    } catch (e) {
      seasonResults[`${s.id}_${s.season}`] = {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        debug: seasonDebug,
      };
    }
  }
  debug.seasonResults = seasonResults;

  await db.insert(scrapeLog).values({
    seasonId: activeSeason?.id,
    triggeredBy,
    status: "success",
    playersUpdated: totalPlayersUpdated,
    matchesUpdated: totalMatchesUpdated,
  });

  return {
    seasonsScraped: seasonsToScrape.length,
    playersUpdated: totalPlayersUpdated,
    matchesUpdated: totalMatchesUpdated,
    debug,
  };
}
