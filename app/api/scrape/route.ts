import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db, seasons, divisions, teams, players, playerStats, playerWeekStats, matches, scrapeLog } from "@/lib/db";
import {
  fetchLeaguePageProps,
  fetchStandingsPageProps,
  fetchPlayerStandings,
  fetchLineups,
  normalizeLineups,
  fetchTeamMatchHistory,
  fetchGameSegments,
  fetchMatchPlayerStats,
  fetchLeaderboard,
  getCSRFCookies,
  type DCMatch,
  type DCPlayerStat,
  type DCMatchHistoryEntry,
  type DCGameLeg,
  type DCMatchPlayerStat,
} from "@/lib/dartconnect";

export const runtime = "nodejs";
export const maxDuration = 60;

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse DartConnect cricket notation (e.g. "T20, S18x2, DB, 0") into a total mark count.
 * T=3 marks, D=2 marks, S=1 mark (including SB), DB=2 marks.
 * xN suffix (single digit) means the preceding hit is repeated N times.
 * A bare "0" means a miss (0 marks).
 */
function parseCricketMarks(notation: unknown): number {
  if (typeof notation !== "string") return 0;
  // Match hits like T20, S18, D20, SB, DB optionally followed by x{single digit}
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

/** Determine set winner index from its legs (best-of-3, or single-leg for 601) */
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
  hOut: number;   // max for the week
  ldg: number;    // max 01-leg PPR for the week
  rnds: number;
  // MPR/PPR sourced from recap/players/{matchGuid} (not computed from turn notation)
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
    hundredPlus: 0, oneEighty: 0, ro9: 0, hOut: 0, ldg: 0, rnds: 0,
    mpr: null, ppr: null,
  };
}

interface PlayerAccum {
  // identifiers
  dcId: string;
  name: string;
  teamName: string;
  // set records (season totals)
  setWins: number;
  setLosses: number;
  crktWins: number; crktLosses: number;
  col601Wins: number; col601Losses: number;
  col501Wins: number; col501Losses: number;
  // detailed stats (season totals)
  hundredPlus: number;
  cricketRnds: number;
  oneEighty: number;
  ro9: number;
  hOut: number;
  maxSetAvg: number;
  // Season PPR aggregated from recap/players across all matches
  // (leaderboard API handles MPR; PPR we sum points+darts and compute at upsert time)
  zeroOnePointsTotal: number;
  zeroOneDartsTotal: number;
  // Season cricket totals for MPR fallback (when player is absent from leaderboard API)
  crktMarksTotal: number;
  crktDartsTotal: number;
  weekHundredPlus: Map<string, number>;
  weeksPlayed: Set<string>;
  opponentNames: string[];
  // per-week breakdown
  weekStats: Map<string, WeekAccum>;
}

function emptyAccum(dcId: string, name: string, teamName: string): PlayerAccum {
  return {
    dcId, name, teamName,
    setWins: 0, setLosses: 0,
    crktWins: 0, crktLosses: 0,
    col601Wins: 0, col601Losses: 0,
    col501Wins: 0, col501Losses: 0,
    hundredPlus: 0, cricketRnds: 0, oneEighty: 0, ro9: 0, hOut: 0, maxSetAvg: 0,
    zeroOnePointsTotal: 0, zeroOneDartsTotal: 0,
    crktMarksTotal: 0, crktDartsTotal: 0,
    weekHundredPlus: new Map(),
    weeksPlayed: new Set(),
    opponentNames: [],
    weekStats: new Map(),
  };
}

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const secret = process.env.SCRAPE_SECRET;
  const authHeader = req.headers.get("authorization");
  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const triggeredBy = req.headers.get("x-triggered-by") ?? "manual";
  const debug: Record<string, unknown> = {};

  try {
    // ── 1. Fetch season list ────────────────────────────────────────────────
    const pageProps = await fetchLeaguePageProps();
    const allSeasons = [
      ...pageProps.activeSeasons,
      ...pageProps.archivedSeasons,
    ];

    if (allSeasons.length === 0) {
      return NextResponse.json({ error: "No seasons found" }, { status: 500 });
    }

    const activeSeason = pageProps.activeSeasons[0];
    if (!activeSeason) {
      return NextResponse.json({ ok: true, message: "No active season" });
    }

    const seasonId = activeSeason.id;

    // ── 2. Fetch schedule / lineups ─────────────────────────────────────────
    let matchList: DCMatch[] = [];
    try {
      const c1 = await getCSRFCookies();
      const raw = await fetchLineups(seasonId, c1);
      matchList = normalizeLineups(raw);
      debug.matchListLength = matchList.length;
    } catch (e) {
      debug.lineupsError = e instanceof Error ? e.message : String(e);
    }

    // ── 3. Fetch team standings list (for team IDs) ─────────────────────────
    type Competitor = Record<string, unknown>;
    let teamCompetitors: Competitor[] = [];

    try {
      const standingsProps = await fetchStandingsPageProps(seasonId);
      teamCompetitors = (standingsProps.competitors ?? []) as Competitor[];
      debug.teamsCount = teamCompetitors.length;
      // Log sample so we can see what fields are available (wins, losses, pts, etc.)
      debug.competitorSample = teamCompetitors[0] ?? null;
    } catch (e) {
      debug.standingsError = e instanceof Error ? e.message : String(e);
    }

    // ── 4. Fetch player rosters + match histories per team ──────────────────
    type PlayerWithTeam = DCPlayerStat & { _teamName: string };
    const roster: PlayerWithTeam[] = [];
    const seenPlayerIds = new Set<number>();

    // matchGuid → { homeTeamId, awayTeamId, weekKey }
    const matchMeta: Map<string, { homeTeamId: string; awayTeamId: string; weekKey: string }> = new Map();
    // teamId → set of match GUIDs
    const teamMatches: Map<string, Set<string>> = new Map();

    for (const team of teamCompetitors) {
      const teamId = String(team.id);
      const teamName = String(team.name ?? "");
      teamMatches.set(teamId, new Set());

      try {
        const c = await getCSRFCookies();

        // Player roster
        const res = await fetchPlayerStandings(
          seasonId,
          { season_status: "REG", opponent_guid: teamId },
          c
        );
        for (const p of res.roster ?? []) {
          const pid = (p as unknown as Record<string, unknown>).id as number;
          if (!seenPlayerIds.has(pid)) {
            seenPlayerIds.add(pid);
            roster.push({ ...(p as DCPlayerStat), _teamName: teamName });
          }
        }

        // Match history
        const c2 = await getCSRFCookies();
        const history: DCMatchHistoryEntry[] = await fetchTeamMatchHistory(seasonId, teamId, c2);
        for (const entry of history) {
          const guid = entry.match_id;
          if (!guid) continue;
          teamMatches.get(teamId)!.add(guid);
          if (!matchMeta.has(guid)) {
            // first time we see this match — side tells us home/away
            const weekKey = entry.match_start_date ?? "";
            matchMeta.set(guid, {
              homeTeamId: entry.side === "Home" ? teamId : "__unknown__",
              awayTeamId: entry.side === "Away" ? teamId : "__unknown__",
              weekKey,
            });
          } else {
            // second team — fill in the missing side
            const meta = matchMeta.get(guid)!;
            if (meta.homeTeamId === "__unknown__") meta.homeTeamId = teamId;
            if (meta.awayTeamId === "__unknown__") meta.awayTeamId = teamId;
          }
        }
      } catch { /* non-fatal */ }
    }

    debug.rosterLength = roster.length;
    debug.uniqueMatchGuids = matchMeta.size;

    // ── 5. Fetch game segments for all unique matches ───────────────────────
    const guids = Array.from(matchMeta.keys());
    // segments keyed by GUID
    const segmentsMap: Map<string, DCGameLeg[][]> = new Map();

    // Fetch game segments AND per-player match stats in parallel
    const matchPlayerStatsMap: Map<string, DCMatchPlayerStat[]> = new Map();

    const segResults = await Promise.allSettled(
      guids.map(async (guid) => {
        const [sets, playerStats] = await Promise.allSettled([
          fetchGameSegments(guid),
          fetchMatchPlayerStats(guid),
        ]);
        if (sets.status === "fulfilled") segmentsMap.set(guid, sets.value);
        if (playerStats.status === "fulfilled") matchPlayerStatsMap.set(guid, playerStats.value);
      })
    );
    const segErrors = segResults.filter((r) => r.status === "rejected").length;
    debug.segmentsLoaded = segmentsMap.size;
    debug.matchPlayerStatsLoaded = matchPlayerStatsMap.size;
    debug.segmentsErrors = segErrors;

    // ── 6. Build player accumulators from segments ──────────────────────────
    // We need a name→accum map; we identify players in turns by name string.
    // roster gives us canonical (dcId, name, teamName) tuples.

    // Build name→accum. If duplicate names exist on different teams, we key by "name|teamName".
    const accumByName = new Map<string, PlayerAccum>();
    for (const p of roster) {
      const s = p as unknown as Record<string, unknown>;
      const firstName = String(s.player_first_name ?? "").trim();
      const lastName = String(s.player_last_name ?? "").trim();
      const playerName = [firstName, lastName].filter(Boolean).join(" ");
      if (!playerName) continue;
      const dcId = s.id != null ? String(s.id) : "";
      const teamName = String(s._teamName ?? "");
      if (!accumByName.has(playerName)) {
        accumByName.set(playerName, emptyAccum(dcId, playerName, teamName));
      }
    }

    // Collect a sample of cricket turn_score values for debug inspection
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

        // Collect all player names on each side across all legs of this set
        const homePlayers = new Set<string>();
        const awayPlayers = new Set<string>();
        for (const leg of legs) {
          for (const turn of leg.turns ?? []) {
            if (turn.home?.name) homePlayers.add(turn.home.name);
            if (turn.away?.name) awayPlayers.add(turn.away.name);
          }
        }

        // Award set W/L; track individual opponent names (SOS) and init WeekAccum
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
            for (const oppName of opponentPlayers) {
              acc.opponentNames.push(oppName);
            }
            // Init week entry on first set of the week for this player
            if (!acc.weekStats.has(weekKey)) {
              acc.weekStats.set(weekKey, emptyWeek(opponentTeamName));
            }
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

        const homeWon = winner === 0;
        awardSet(homePlayers, homeWon, awayPlayers, awayTeamName);
        awardSet(awayPlayers, !homeWon, homePlayers, homeTeamName);

        // Process turn-level stats
        for (const leg of legs) {
          // Tiebreaker only applies to 501 (best-of-3); 601 is single-leg, cricket leg 3 counts
          const is501Tiebreaker = type === "501" && leg.set_game_number === 3;

          for (const turn of leg.turns ?? []) {
            for (const side of ["home", "away"] as const) {
              const t = turn[side];
              if (!t?.name) continue;
              const acc = accumByName.get(t.name);
              if (!acc) continue;

              const is01 = type === "601" || type === "501";
              const isCrkt = type === "crkt";
              // For 01 games turn_score is numeric; for cricket it's a notation string
              const score01 = is01 ? (typeof t.turn_score === "number" ? t.turn_score : Number(t.turn_score ?? 0)) : 0;
              const crktMarks = isCrkt ? parseCricketMarks(t.turn_score) : 0;

              // Sample cricket notations for debug (first 20 distinct non-null values)
              if (isCrkt && t.turn_score != null && sampleCricketScores.length < 20) {
                const s = String(t.turn_score);
                if (!sampleCricketScores.includes(s)) sampleCricketScores.push(s);
              }
              const remaining = t.current_score;

              const w = acc.weekStats.get(weekKey);

              // 100+: 601 single leg + 501 legs 1&2 only (no 501 tiebreaker)
              if (is01 && !is501Tiebreaker && score01 >= 100) {
                acc.hundredPlus += score01;
                const cur = acc.weekHundredPlus.get(weekKey) ?? 0;
                acc.weekHundredPlus.set(weekKey, cur + score01);
                if (w) w.hundredPlus += score01;
              }

              // 180
              if (is01 && score01 === 180) {
                acc.oneEighty++;
                if (w) w.oneEighty++;
              }

              // H Out: finishing throw (remaining hits 0) >100 in 01 games
              if (is01 && remaining === 0 && score01 > 100) {
                if (score01 > acc.hOut) acc.hOut = score01;
                if (w && score01 > w.hOut) w.hOut = score01;
              }

              // RNDS: sum of marks from cricket turns that scored >= 6 marks, legs 1+2 only
              if (isCrkt && leg.set_game_number !== 3 && crktMarks >= 6) {
                acc.cricketRnds += crktMarks;
                if (w) w.rnds += crktMarks;
              }

              // RO9: cricket 9-mark turn
              if (isCrkt && crktMarks === 9) {
                acc.ro9++;
                if (w) w.ro9++;
              }
            }
          }

          // LDG: track max single-leg 01 PPR (from leg[side].ppr) for 01 legs only.
          // MPR and season PPR come from the leaderboard / recap/players APIs instead.
          if (type !== "crkt") {
            for (const side of ["home", "away"] as const) {
              const sideNames = side === "home" ? homePlayers : awayPlayers;
              const pprStr = leg[side]?.ppr;
              if (pprStr == null) continue;
              const pprVal = parseFloat(String(pprStr));
              if (isNaN(pprVal) || pprVal === 0) continue;
              for (const pname of sideNames) {
                const acc = accumByName.get(pname);
                if (!acc) continue;
                const w = acc.weekStats.get(weekKey);
                if (pprVal > acc.maxSetAvg) acc.maxSetAvg = pprVal;
                if (w && pprVal > w.ldg) w.ldg = pprVal;
              }
            }
          }
        }
      }
    }

    // ── 6.5. Merge per-match player stats (MPR, PPR, season PPR aggregation) ──
    // recap.dartconnect.com/players/{guid} gives authoritative per-player stats
    // for each match: cricket_average (MPR), average_01 (PPR), points_scored_01,
    // darts_thrown_01. Use these instead of computing from turn notation.

    for (const [guid, playerMatchStats] of matchPlayerStatsMap) {
      const meta = matchMeta.get(guid);
      if (!meta) continue;
      const weekKey = meta.weekKey;

      for (const ps of playerMatchStats) {
        const acc = accumByName.get(ps.name);
        if (!acc) continue;

        // Week MPR / PPR — set directly on the week accumulator
        const w = acc.weekStats.get(weekKey);
        if (w) {
          if (ps.cricket_average && parseFloat(ps.cricket_average) > 0) {
            w.mpr = ps.cricket_average;
          }
          const avgPpr = parseFloat(ps.average_01);
          if (!isNaN(avgPpr) && avgPpr > 0) {
            w.ppr = ps.average_01;
          }
        }

        // Season PPR: accumulate raw points+darts so we can compute the true
        // weighted average at upsert time (PPR = total_points * 3 / total_darts)
        const pts01 = parseInt(String(ps.points_scored_01).replace(/,/g, ""), 10);
        const dts01 = parseInt(String(ps.darts_thrown_01).replace(/,/g, ""), 10);
        if (!isNaN(pts01) && !isNaN(dts01) && dts01 > 0) {
          acc.zeroOnePointsTotal += pts01;
          acc.zeroOneDartsTotal += dts01;
        }

        // Season cricket totals for MPR fallback (leaderboard API may exclude low-game players)
        const marks = Number(ps.cricket_marks_scored);
        const crktDarts = Number(ps.cricket_darts_thrown);
        if (!isNaN(marks) && !isNaN(crktDarts) && crktDarts > 0) {
          acc.crktMarksTotal += marks;
          acc.crktDartsTotal += crktDarts;
        }
      }
    }

    // ── 6.6. Update completed match scores from segment data ─────────────────
    // Compute home/away set-win counts from segments already in memory.

    let matchScoresUpdated = 0;

    for (const [guid, sets] of segmentsMap) {
      const meta = matchMeta.get(guid);
      if (!meta) continue;
      if (meta.homeTeamId === "__unknown__" || meta.awayTeamId === "__unknown__") continue;
      const homeTeamIdNum = parseInt(meta.homeTeamId);
      const awayTeamIdNum = parseInt(meta.awayTeamId);
      if (isNaN(homeTeamIdNum) || isNaN(awayTeamIdNum)) continue;

      let homeSetWins = 0, awaySetWins = 0;
      for (const legs of sets) {
        if (legs.length === 0) continue;
        const w = setWinner(legs);
        if (w === 0) homeSetWins++;
        else if (w === 1) awaySetWins++;
      }
      if (homeSetWins + awaySetWins === 0) continue;

      await db
        .update(matches)
        .set({ homeScore: homeSetWins, awayScore: awaySetWins, status: "C", updatedAt: new Date() })
        .where(and(
          eq(matches.seasonId, seasonId),
          eq(matches.homeTeamId, homeTeamIdNum),
          eq(matches.awayTeamId, awayTeamIdNum),
        ));
      matchScoresUpdated++;
    }
    debug.matchScoresUpdated = matchScoresUpdated;

    // ── 7. Compute per-player win% for SOS ──────────────────────────────────
    const playerWinPct = new Map<string, number>();
    for (const [name, acc] of accumByName) {
      const total = acc.setWins + acc.setLosses;
      playerWinPct.set(name, total > 0 ? acc.setWins / total : 0);
    }

    // ── 8. Upsert seasons ───────────────────────────────────────────────────
    for (const s of allSeasons) {
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

    // ── 9. Upsert divisions + teams + matches ───────────────────────────────
    let matchesUpdated = 0;

    for (const m of matchList) {
      if (m.division_id) {
        await db
          .insert(divisions)
          .values({ id: m.division_id, seasonId, name: m.division })
          .onConflictDoUpdate({
            target: divisions.id,
            set: { name: m.division },
          });
      }

      for (const side of [m.left, m.right]) {
        // Merge in DartConnect standings fields from competitorSample data
        const comp = teamCompetitors.find((c) => Number(c.id) === side.id);
        const dcWins   = comp?.win   != null ? Number(comp.win)   : null;
        const dcLosses = comp?.loss  != null ? Number(comp.loss)  : null;
        const dcLeaguePoints = comp?.league_points != null ? Number(comp.league_points) : null;

        await db
          .insert(teams)
          .values({
            id: side.id,
            seasonId,
            divisionId: m.division_id ?? null,
            name: side.team_name,
            captainName: side.captain_name ?? null,
            dcWins,
            dcLosses,
            dcLeaguePoints,
          })
          .onConflictDoUpdate({
            target: teams.id,
            set: {
              name: side.team_name,
              captainName: side.captain_name ?? null,
              dcWins,
              dcLosses,
              dcLeaguePoints,
            },
          });
      }

      await db
        .insert(matches)
        .values({
          id: m.id,
          seasonId,
          divisionId: m.division_id ?? null,
          divisionName: m.division,
          roundSeq: m.round_seq,
          homeTeamId: m.left.id,
          awayTeamId: m.right.id,
          homeTeamName: m.left.team_name,
          awayTeamName: m.right.team_name,
          schedDate: m.sched_date,
          schedTime: m.sched_time,
          status: m.status,
          homeScore: m.home_score ?? 0,
          awayScore: m.away_score ?? 0,
          dcMatchId: m.dc_match_id ?? null,
          seasonStatus: m.season_status,
          prettyDate: m.pretty_date,
        })
        .onConflictDoUpdate({
          target: matches.id,
          set: {
            status: m.status,
            homeScore: m.home_score ?? 0,
            awayScore: m.away_score ?? 0,
            dcMatchId: m.dc_match_id ?? null,
            updatedAt: new Date(),
          },
        });

      matchesUpdated++;
    }

    // ── 10. Fetch season MPR from leaderboard API (cricket doubles) ─────────────
    // leaderboard.dartconnect.com/getLeaderboard returns per-player season totals:
    //   points_scored = total cricket marks, darts_thrown = total darts thrown
    //   MPR = points_scored * 3 / darts_thrown  (matches DartConnect's displayed formula)
    //   Note: winning rounds may use fewer than 3 darts, so marks/rounds < marks*3/darts
    // This is the authoritative source — avoids the per-leg computation issues.
    const leaderboardMprByName = new Map<string, string>();
    try {
      const lbStats = await fetchLeaderboard("29qj", seasonId, "cricket", "doubles");
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
    debug.sampleCricketScores = sampleCricketScores;

    // ── 11. Upsert player stats ─────────────────────────────────────────────
    let playersUpdated = 0;

    for (const p of roster) {
      const s = p as unknown as Record<string, unknown>;
      const firstName  = String(s.player_first_name ?? "").trim();
      const lastName   = String(s.player_last_name  ?? "").trim();
      const playerName = [firstName, lastName].filter(Boolean).join(" ");
      if (!playerName) continue;

      const dcId = s.id != null ? String(s.id) : null;
      const teamName = String(s._teamName ?? "");

      const [player] = await db
        .insert(players)
        .values({ dcGuid: dcId, name: playerName })
        .onConflictDoUpdate({
          target: players.name,
          set: { dcGuid: dcId },
        })
        .returning({ id: players.id });

      const playerId = player.id;

      const teamRows = await db
        .select({ id: teams.id })
        .from(teams)
        .where(and(eq(teams.seasonId, seasonId), eq(teams.name, teamName)))
        .limit(1);

      const teamId = teamRows[0]?.id ?? null;

      // Pull from segment-based accumulator (falls back to zeros if no games yet)
      const acc = accumByName.get(playerName);

      const setWins   = acc?.setWins   ?? 0;
      const setLosses = acc?.setLosses ?? 0;
      const setTotal  = setWins + setLosses;

      // AVG = set win percentage
      const avgPct = setTotal > 0 ? setWins / setTotal : null;

      // WP = weeks played count
      const wp = acc ? String(acc.weeksPlayed.size) : null;

      // Set records
      const crkt = acc && (acc.crktWins + acc.crktLosses) > 0
        ? `${acc.crktWins}-${acc.crktLosses}` : null;
      const col601 = acc && (acc.col601Wins + acc.col601Losses) > 0
        ? `${acc.col601Wins}-${acc.col601Losses}` : null;
      const col501 = acc && (acc.col501Wins + acc.col501Losses) > 0
        ? `${acc.col501Wins}-${acc.col501Losses}` : null;

      // SOS: average win% of the individual players you faced
      let sos: string | null = null;
      if (acc && acc.opponentNames.length > 0) {
        const pctSum = acc.opponentNames.reduce(
          (sum: number, oppName: string) => sum + (playerWinPct.get(oppName) ?? 0),
          0
        );
        sos = (pctSum / acc.opponentNames.length).toFixed(3);
      }

      // 01 HH: max weekly 100+ total >450
      let zeroOneHh = 0;
      if (acc) {
        for (const weekTotal of acc.weekHundredPlus.values()) {
          if (weekTotal > 450 && weekTotal > zeroOneHh) zeroOneHh = weekTotal;
        }
      }

      // pos: use player_rank from API (positional within the standings call)
      const pos = (s.player_rank ?? null) as number | null;

      const vals = {
        seasonId,
        playerId,
        teamId,
        teamName,
        pos,
        wp,
        crkt,
        col601,
        col501,
        sos,
        hundredPlus: acc?.hundredPlus     ?? 0,
        rnds:        acc?.cricketRnds      ?? 0,
        oneEighty:   acc?.oneEighty       ?? 0,
        roHh:        0,  // not computed
        zeroOneHh,
        ro9:         acc?.ro9             ?? 0,
        hOut:        acc?.hOut            ?? 0,
        ldg:         acc ? Math.round(acc.maxSetAvg) : 0,
        ro6b:        0,  // not computed
        // MPR: from leaderboard API (marks * 3 / darts). Falls back to accumulated
        // cricket totals from recap/players for players absent from the leaderboard
        // (e.g. below minimum-game threshold).
        mpr:         leaderboardMprByName.get(playerName) ??
          (acc && acc.crktDartsTotal > 0
            ? ((acc.crktMarksTotal * 3) / acc.crktDartsTotal).toFixed(2)
            : null),
        // PPR (3DA): aggregated from recap/players across all matches this season.
        // points_scored_01 * 3 / darts_thrown_01 = true weighted season average.
        ppr:         acc && acc.zeroOneDartsTotal > 0
          ? (acc.zeroOnePointsTotal * 3 / acc.zeroOneDartsTotal).toFixed(2)
          : null,
        avg:         avgPct != null ? String(avgPct.toFixed(3)) : null,
        pts:         setWins,
        updatedAt:   new Date(),
      };

      await db
        .insert(playerStats)
        .values(vals)
        .onConflictDoUpdate({
          target: [playerStats.seasonId, playerStats.playerId],
          set: { ...vals },
        });

      // Upsert per-week rows for this player
      if (acc) {
        for (const [wk, w] of acc.weekStats) {
          await db
            .insert(playerWeekStats)
            .values({
              seasonId,
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
              ldg: Math.round(w.ldg),
              rnds: w.rnds,
              mpr: w.mpr,
              ppr: w.ppr,
            })
            .onConflictDoUpdate({
              target: [playerWeekStats.seasonId, playerWeekStats.playerId, playerWeekStats.weekKey],
              set: {
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
                ldg: Math.round(w.ldg),
                rnds: w.rnds,
                mpr: w.mpr,
                ppr: w.ppr,
              },
            });
        }
      }

      playersUpdated++;
    }

    // ── 11. Update last_scraped_at ──────────────────────────────────────────
    await db
      .update(seasons)
      .set({ lastScrapedAt: new Date() })
      .where(eq(seasons.id, seasonId));

    await db.insert(scrapeLog).values({
      seasonId,
      triggeredBy,
      status: "success",
      playersUpdated,
      matchesUpdated,
    });

    return NextResponse.json({
      ok: true,
      seasonId,
      seasonName: activeSeason.season,
      playersUpdated,
      matchesUpdated,
      debug,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.insert(scrapeLog).values({
      triggeredBy,
      status: "error",
      errorMessage: message,
    }).catch(() => {});
    return NextResponse.json({ error: message, debug }, { status: 500 });
  }
}
