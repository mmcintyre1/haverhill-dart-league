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
  getCSRFCookies,
  type DCMatch,
  type DCPlayerStat,
  type DCMatchHistoryEntry,
  type DCGameLeg,
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
  ldg: number;    // max for the week
}

function emptyWeek(opponentTeam: string): WeekAccum {
  return {
    opponentTeam,
    setWins: 0, setLosses: 0,
    crktWins: 0, crktLosses: 0,
    col601Wins: 0, col601Losses: 0,
    col501Wins: 0, col501Losses: 0,
    hundredPlus: 0, oneEighty: 0, ro9: 0, hOut: 0, ldg: 0,
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
          const pid = (p as Record<string, unknown>).id as number;
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

    const segResults = await Promise.allSettled(
      guids.map(async (guid) => {
        const sets = await fetchGameSegments(guid);
        segmentsMap.set(guid, sets);
      })
    );
    const segErrors = segResults.filter((r) => r.status === "rejected").length;
    debug.segmentsLoaded = segmentsMap.size;
    debug.segmentsErrors = segErrors;

    // ── 6. Build player accumulators from segments ──────────────────────────
    // We need a name→accum map; we identify players in turns by name string.
    // roster gives us canonical (dcId, name, teamName) tuples.

    // Build name→accum. If duplicate names exist on different teams, we key by "name|teamName".
    const accumByName = new Map<string, PlayerAccum>();
    for (const p of roster) {
      const s = p as Record<string, unknown>;
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

              const score = t.turn_score ?? 0;
              const remaining = t.current_score;
              const is01 = type === "601" || type === "501";
              const isCrkt = type === "crkt";

              const w = acc.weekStats.get(weekKey);

              // 100+: 601 single leg + 501 legs 1&2 only (no 501 tiebreaker)
              if (is01 && !is501Tiebreaker && score >= 100) {
                acc.hundredPlus += score;
                const cur = acc.weekHundredPlus.get(weekKey) ?? 0;
                acc.weekHundredPlus.set(weekKey, cur + score);
                if (w) w.hundredPlus += score;
              }

              // 180
              if (score === 180) {
                acc.oneEighty++;
                if (w) w.oneEighty++;
              }

              // H Out: finishing throw (remaining hits 0) >100 in 01 games
              if (is01 && remaining === 0 && score > 100) {
                if (score > acc.hOut) acc.hOut = score;
                if (w && score > w.hOut) w.hOut = score;
              }

              // Cricket marks for RNDS: legs 1 and 2 only (not leg 3 tiebreaker)
              if (isCrkt && leg.set_game_number !== 3) {
                acc.cricketRnds += score;
              }

              // RO9: cricket 9-mark turn
              if (isCrkt) {
                const notable = t.notable?.toLowerCase() ?? "";
                if (score === 9 || notable.includes("9") || notable.includes("nine")) {
                  acc.ro9++;
                  if (w) w.ro9++;
                }
              }
            }
          }

          // LDG: track highest per-leg PPR seen for each player (season + weekly)
          for (const side of ["home", "away"] as const) {
            const pprStr = leg[side]?.ppr;
            if (pprStr == null) continue;
            const pprVal = parseFloat(String(pprStr));
            if (isNaN(pprVal)) continue;
            const sideNames = side === "home" ? homePlayers : awayPlayers;
            for (const pname of sideNames) {
              const acc = accumByName.get(pname);
              if (!acc) continue;
              if (pprVal > acc.maxSetAvg) acc.maxSetAvg = pprVal;
              const w = acc.weekStats.get(weekKey);
              if (w && pprVal > w.ldg) w.ldg = pprVal;
            }
          }
        }
      }
    }

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
        await db
          .insert(teams)
          .values({
            id: side.id,
            seasonId,
            divisionId: m.division_id ?? null,
            name: side.team_name,
            captainName: side.captain_name ?? null,
          })
          .onConflictDoUpdate({
            target: teams.id,
            set: { name: side.team_name, captainName: side.captain_name ?? null },
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

    // ── 10. Upsert player stats ─────────────────────────────────────────────
    let playersUpdated = 0;

    for (const p of roster) {
      const s = p as Record<string, unknown>;
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
        rnds:        acc?.cricketRnds    ?? 0,
        oneEighty:   acc?.oneEighty       ?? 0,
        roHh:        0,  // not computed
        zeroOneHh,
        ro9:         acc?.ro9             ?? 0,
        hOut:        acc?.hOut            ?? 0,
        ldg:         acc ? Math.round(acc.maxSetAvg) : 0,
        ro6b:        0,  // not computed
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
