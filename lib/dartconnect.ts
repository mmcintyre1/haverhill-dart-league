const DC_BASE = "https://tv.dartconnect.com";
// Read from env so the same codebase can serve any DartConnect league.
const LEAGUE_ID = process.env.DC_LEAGUE_ID ?? "";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DCSeason {
  id: number;
  league_id: string;
  season: string;
  start_date: string;
  has_reg_season: string;
  post_season_is_active: boolean;
  post_bracket_type: string;
}

export interface DCLeagueInfo {
  id: string;
  name: string;
  guid: string;
  league_type: string;
  timezone: string;
  report_dart_avg_units: string;
  season_has_started: boolean;
  has_previous_seasons: boolean;
}

export interface DCPageProps {
  leagueInfo: DCLeagueInfo;
  activeSeasons: DCSeason[];
  archivedSeasons: DCSeason[];
}

export interface DCPlayerStat {
  id: number;                      // DartConnect player numeric ID
  postseason_status?: string;
  player_first_name: string;
  player_last_name: string;
  player_rank: number | null;
  matches: number;                 // team match nights played
  legs: number | string;           // total legs played
  wins: number | string;           // leg wins
  points_01: number | string;      // total points in 01 games
  darts_01: number | string;       // total darts in 01 games
  marks_cr: number | string;       // total cricket marks
  darts_cr: number | string;       // total cricket darts
  ppr: number | string | null;     // points per round (01 average) — pre-computed
  mpr: number | string | null;     // marks per round (cricket avg) — pre-computed
  lw: number | null;               // leg win rate (0–1)
  player_guid?: string;
}

export interface DCTeamPlayer {
  id: number;
  name: string;
  average?: number | null;
}

export interface DCMatchTeam {
  id: number;
  team_name: string;
  captain_name: string;
  score: number | null;
  points: number | null;
  average: number | null;
  players: DCTeamPlayer[];
  players_published_at: string | null;
}

export interface DCMatch {
  id: number;
  league_match_id: number;
  division_id: number;
  division: string;
  sched_date: string;
  sched_time: string;
  round_seq: number;
  season_status: string;
  status: string; // "P" = pending, "C" = complete
  home_score: number;
  away_score: number;
  dc_match_id: number | null;
  left: DCMatchTeam;
  right: DCMatchTeam;
  pretty_date: string;
}

// ─── CSRF / session helpers ───────────────────────────────────────────────────

function extractCookieValue(setCookieHeaders: string[], name: string): string {
  for (const header of setCookieHeaders) {
    const parts = header.split(";");
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.startsWith(`${name}=`)) {
        return trimmed.slice(name.length + 1);
      }
    }
  }
  return "";
}

async function getCSRFCookies(): Promise<{ xsrf: string; session: string }> {
  const res = await fetch(`${DC_BASE}/league/${LEAGUE_ID}`, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
  });

  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  // Node 18+: getSetCookie returns array; fallback to set-cookie header
  const setCookieRaw =
    raw.length > 0
      ? raw
      : (res.headers.get("set-cookie") ?? "").split(",").map((s) => s.trim());

  const xsrf = extractCookieValue(setCookieRaw, "XSRF-TOKEN");
  // Session cookie name may change; find whatever tv_session_* is set
  let session = "";
  for (const h of setCookieRaw) {
    const match = h.match(/^(tv_session_\w+)=([^;]+)/);
    if (match) {
      session = `${match[1]}=${match[2]}`;
      break;
    }
  }

  return { xsrf, session };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** DC throttles this API. A full scrape makes one call per team, and the last
 *  team in the loop was reliably getting "429 Too Many Attempts" on every run —
 *  silently leaving that one team's matches stale forever, since the error was
 *  only recorded in the scrape debug blob. Back off and retry rather than
 *  dropping the team's data. */
async function dcPost<T>(
  path: string,
  body: object,
  cookies?: { xsrf: string; session: string }
): Promise<T> {
  const { xsrf, session } = cookies ?? (await getCSRFCookies());
  const xsrfDecoded = decodeURIComponent(xsrf);

  const delaysMs = [2000, 5000, 10000];
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${DC_BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-XSRF-TOKEN": xsrfDecoded,
        Cookie: `XSRF-TOKEN=${xsrf}; ${session}`,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        Referer: `${DC_BASE}/league/${LEAGUE_ID}`,
      },
      body: JSON.stringify(body),
    });

    if (res.ok) return res.json() as Promise<T>;

    if (res.status === 429 && attempt < delaysMs.length) {
      // Honour Retry-After when DC sends one, otherwise escalate our own wait.
      const retryAfter = Number(res.headers.get("retry-after"));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 30000)
        : delaysMs[attempt];
      console.warn(`dcPost: 429 on ${path}, retrying in ${waitMs}ms (attempt ${attempt + 1})`);
      await sleep(waitMs);
      continue;
    }

    throw new Error(`DC API error ${res.status} on ${path}: ${await res.text()}`);
  }
}

// ─── Public API functions ─────────────────────────────────────────────────────

/** Fetch league info + season list from the SPA page props */
export async function fetchLeaguePageProps(): Promise<DCPageProps> {
  const res = await fetch(`${DC_BASE}/league/${LEAGUE_ID}`, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Accept: "text/html",
    },
    next: { revalidate: 0 },
  });

  const html = await res.text();
  const match = html.match(/data-page="([^"]+)"/);
  if (!match) throw new Error("Could not find data-page in DartConnect HTML");

  const json = JSON.parse(match[1].replace(/&quot;/g, '"'));
  return json.props as DCPageProps;
}

export interface DCStandingsPageProps {
  competitors: unknown[];       // player/team standings rows
  leagueDivisions: unknown[];   // division list
  leagueInfo: DCLeagueInfo;
}

/** Fetch player standings by parsing the standings page Inertia props.
 *  This avoids the broken /standings/players API (opponent_guid mystery). */
export async function fetchStandingsPageProps(
  seasonId: number
): Promise<DCStandingsPageProps> {
  const res = await fetch(
    `${DC_BASE}/league/${LEAGUE_ID}/${seasonId}/standings`,
    {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "text/html",
      },
    }
  );
  const html = await res.text();
  const match = html.match(/data-page="([^"]+)"/);
  if (!match) throw new Error("Could not find data-page in standings HTML");
  const json = JSON.parse(match[1].replace(/&quot;/g, '"'));
  return json.props as DCStandingsPageProps;
}

/** Fetch player leaderboard stats for a given season.
 *  opponent_guid must be the team's numeric ID string (or league GUID for all-league);
 *  season_status must be "REG". */
export async function fetchPlayerStandings(
  seasonId: number,
  body: object,
  cookies?: { xsrf: string; session: string }
): Promise<{ roster: DCPlayerStat[] }> {
  return dcPost(
    `/api/league/${LEAGUE_ID}/standings/${seasonId}/players`,
    body,
    cookies
  );
}

/** Fetch team match standings for a given season.
 *  leagueGuid: the league's own GUID (from DCLeagueInfo.guid). */
export async function fetchMatchStandings(
  seasonId: number,
  leagueGuid: string,
  seasonStatus: "regular" | "post" = "regular",
  cookies?: { xsrf: string; session: string }
): Promise<{
  stats: Record<string, number>;
  matches: unknown[];
}> {
  return dcPost(
    `/api/league/${LEAGUE_ID}/standings/${seasonId}/matches`,
    { season_status: seasonStatus, opponent_guid: leagueGuid },
    cookies
  );
}

/** Fetch full schedule / lineups for a given season */
export async function fetchLineups(
  seasonId: number,
  cookies?: { xsrf: string; session: string },
  seasonStatus?: "REG" | "POST"
): Promise<unknown> {
  return dcPost(
    `/api/league/${LEAGUE_ID}/lineups/${seasonId}`,
    seasonStatus ? { season_status: seasonStatus } : {},
    cookies
  );
}

/** Normalize whatever the lineups endpoint returns into a flat DCMatch array */
export function normalizeLineups(raw: unknown): DCMatch[] {
  if (Array.isArray(raw)) return raw as DCMatch[];

  const obj = raw as Record<string, unknown>;

  // Flat matches array under a key
  for (const key of ["matches", "data", "lineups", "schedule"]) {
    if (Array.isArray(obj[key])) return obj[key] as DCMatch[];
  }

  // Grouped by division: { divisions: [{ matches: [...] }] }
  if (Array.isArray(obj["divisions"])) {
    return (obj["divisions"] as Record<string, unknown>[]).flatMap(
      (d) => (Array.isArray(d["matches"]) ? (d["matches"] as DCMatch[]) : [])
    );
  }

  console.warn("fetchLineups: unrecognised response shape", JSON.stringify(raw).slice(0, 300));
  return [];
}

// ─── Match history + recap types ─────────────────────────────────────────────

export interface DCMatchHistoryEntry {
  match_id: string;          // hex GUID used in recap URL
  match_start_date: string;  // e.g. "27 Jan 2026"
  team_name: string;
  other_team: string;
  side: string;              // "Home" | "Away"
  outcome: string;           // "W" | "L"
  recap_url: string;
  // These may or may not be present depending on DC API version:
  round_seq?: number | null;
  division?: string | null;
  league_match_id?: number | null;
}

export interface DCGameTurnSide {
  name: string;
  turn_score: number | string | null; // number for 01 games; notation string for cricket (e.g. "T20, S18")
  current_score: number | null;
  notable: string | null;
  color: string | null;
}

export interface DCGameTurn {
  home: DCGameTurnSide;
  away: DCGameTurnSide;
}

export interface DCGameLegSide {
  ppr: string | null;
  darts_thrown: number | null;
  ending_points: number | null;
}

export interface DCGameLeg {
  set_index: number;
  set_game_number: number;  // 1=first leg, 2=second, 3=tiebreaker
  game_name: string;        // "601 DIDO" | "501 DIDO" | "Cricket"
  winner_index: number;     // 0=home won, 1=away won
  home: DCGameLegSide;
  away: DCGameLegSide;
  turns: DCGameTurn[];
}

// setIndex → array of legs (1 or 3 per set)
export type DCGameSegments = DCGameLeg[][];

/** Fetch completed match history for a team in a season */
export async function fetchTeamMatchHistory(
  seasonId: number,
  teamId: string,
  cookies: { xsrf: string; session: string },
  seasonStatus: "REG" | "POST" = "REG"
): Promise<DCMatchHistoryEntry[]> {
  const res = await dcPost<{ matches?: unknown[] }>(
    `/api/league/${LEAGUE_ID}/standings/${seasonId}/matches`,
    { season_status: seasonStatus, opponent_guid: teamId },
    cookies
  );
  return (res.matches ?? []) as DCMatchHistoryEntry[];
}

export interface DCMatchInfo {
  home_label: string;
  away_label: string;
  total_sets: number;
  match_winner: number | null; // 0 = opponents[0] won, 1 = opponents[1] won
  round_seq?: number | null;   // may be present directly on matchInfo
  sched_date?: string | null;
  league_match_id?: number | null; // the authoritative matches.id (DC league_match_id)
  // Free-form admin notes — DC's only record of *which* set was forfeited
  // and by whom, e.g. "Set #11: Set Forfeited by The Punishers". Whether
  // that set has any player data depends on how the forfeit was entered —
  // see DCForfeitSet / fetchMatchData's parsed forfeitSets.
  notes?: { sets?: string[] | null; games?: string[] | null } | null;
  opponents: Array<{
    name: string;
    // score/set_wins: a separate DC aggregate that does NOT reflect manual
    // "Team Points/Division Points" corrections made in DC's admin, and has
    // been observed to drift/go stale on its own — do not use for the
    // team's actual score.
    score: number;
    set_wins: number;
    // league_points/league_standings_points: the authoritative per-team
    // standings-points tally — DOES reflect forfeit credit and manual DC
    // corrections. Use this as the team's score (see scrape-runner.ts).
    league_points: number;
    league_standings_points: number;
  }>;
}

/** A forfeited set as recorded in /matches/'s own segments prop — a
 *  different schema from /games/'s (0-indexed set_index; a note's
 *  "Set #N" maps to setIndex = N - 1). When a team enters a forfeit
 *  "correctly" in DC (the winning side still has a player registered
 *  uncontested), that side's `players`/`win` here shows it — a real,
 *  clean result needing no admin attention. `isForfeitBoth` or an empty
 *  winning side's `players` means DC recorded no player at all for that
 *  set, which is the case that genuinely needs manual admin attention
 *  (DC has no way to attribute individual stats after the fact). A
 *  `player_label` of "-SHORT-" is DC's placeholder for a missing roster
 *  slot, not a real person — never a genuine winner. */
/** A player slot on a forfeited set. /matches/'s segments are the one place DC
 *  attaches a player id to set participation (`player_guid`, the same numeric id
 *  as the roster's `id` and our `players.dcGuid`), so credit for a forfeit win
 *  can be assigned by id rather than by matching a label string. */
export interface DCForfeitPlayer {
  label: string;
  dcId: string | null;
}

export interface DCForfeitSet {
  setIndex: number;
  gameLabel: string | null; // e.g. "Singles 501", "Doubles Cricket", "3-Person 601"
  isForfeitBoth: boolean;
  homeWin: boolean;
  homePlayers: DCForfeitPlayer[];
  awayWin: boolean;
  awayPlayers: DCForfeitPlayer[];
}

function parseForfeitSets(segments: Record<string, unknown[]> | unknown[] | undefined): DCForfeitSet[] {
  if (!segments || Array.isArray(segments)) return [];
  const flat = (Object.values(segments) as unknown[][]).flat(1);
  const result: DCForfeitSet[] = [];
  for (const set of flat) {
    if (!Array.isArray(set) || set.length === 0) continue;
    const entry = set[0] as Record<string, unknown>;
    if (!entry?.is_forfeit) continue;
    const home = entry.home as Record<string, unknown> | undefined;
    const away = entry.away as Record<string, unknown> | undefined;
    const leagueSegment = entry.league_segment as Record<string, unknown> | undefined;
    const playerLabels = (side: Record<string, unknown> | undefined): DCForfeitPlayer[] =>
      Array.isArray(side?.players)
        ? (side!.players as Array<{ player_label?: string; player_guid?: number | string | null }>)
            .map((p) => ({
              label: p.player_label ?? "",
              dcId: p.player_guid != null ? String(p.player_guid) : null,
            }))
            .filter((p) => p.label || p.dcId)
        : [];
    result.push({
      setIndex: Number(entry.set_index),
      gameLabel: leagueSegment?.label ? String(leagueSegment.label) : (entry.game_name ? String(entry.game_name) : null),
      isForfeitBoth: !!entry.is_forfeit_both,
      homeWin: !!home?.win,
      homePlayers: playerLabels(home),
      awayWin: !!away?.win,
      awayPlayers: playerLabels(away),
    });
  }
  return result;
}

/** Every set this recap contains, as 1-indexed set numbers — matching /games/'s
 *  `set_index` and DC's own "Set #N" note text. /matches/'s raw `set_index` is
 *  0-indexed, hence the +1.
 *
 *  Why this is worth carrying: when a match is exited and resumed, DC writes two
 *  separate recaps under one league_match_id and never merges them. The second
 *  recap *continues* the set numbering rather than restarting it, so disjoint set
 *  numbers across two recaps identify a genuine split match (safe to combine),
 *  while overlapping ones mean the same sets were played twice (a redo — the
 *  scraper can't tell which result is real, so it alerts instead). */
function parseSetIndexes(segments: Record<string, unknown[]> | unknown[] | undefined): number[] {
  if (!segments || Array.isArray(segments)) return [];
  const flat = (Object.values(segments) as unknown[][]).flat(1);
  const out = new Set<number>();
  for (const set of flat) {
    if (!Array.isArray(set) || set.length === 0) continue;
    const raw = (set[0] as Record<string, unknown>)?.set_index;
    if (raw == null) continue;
    const n = Number(raw);
    if (Number.isFinite(n)) out.add(n + 1);
  }
  return [...out].sort((a, b) => a - b);
}

/** Every (player_label, player_guid) pair this recap attributes to a set, across
 *  all sets — not just forfeited ones. This is the bridge for stat accumulation:
 *  /games/ turn data carries only a player's NAME, and DC's spelling there drifts
 *  from the roster's ("Fran` Donoghue" for "Fran Donoghue", "Steve Sirios" for
 *  "Steve Sirois"), which silently dropped those players' stats. The labels here
 *  match the turn names exactly and carry the id, so a drifted name can be
 *  resolved back to the right player. */
function parsePlayerIds(segments: Record<string, unknown[]> | unknown[] | undefined): DCForfeitPlayer[] {
  if (!segments || Array.isArray(segments)) return [];
  const flat = (Object.values(segments) as unknown[][]).flat(1);
  const seen = new Map<string, DCForfeitPlayer>();
  for (const set of flat) {
    if (!Array.isArray(set) || set.length === 0) continue;
    const entry = set[0] as Record<string, unknown>;
    for (const side of ["home", "away"] as const) {
      const s = entry[side] as Record<string, unknown> | undefined;
      if (!Array.isArray(s?.players)) continue;
      for (const p of s!.players as Array<{ player_label?: string; player_guid?: number | string | null }>) {
        const label = p.player_label ?? "";
        const dcId = p.player_guid != null ? String(p.player_guid) : null;
        if (!label || !dcId) continue;
        seen.set(`${label} ${dcId}`, { label, dcId });
      }
    }
  }
  return [...seen.values()];
}

/** Extended return from fetchMatchData — includes the authoritative score and
 *  any round/scheduling metadata discoverable from the recap page props. */
export interface DCMatchData {
  matchInfo: DCMatchInfo;
  roundSeq: number | null;
  schedDate: string | null;  // ISO "YYYY-MM-DD" if present in props
  forfeitSets: DCForfeitSet[];
  setIndexes: number[];      // 1-indexed set numbers present in this recap
  playerIds: DCForfeitPlayer[]; // label -> DC player id, across every set
  propKeys: string[];        // top-level prop keys — for investigating new fields
}

/** Parse a segments prop (from /games/ or /matches/) into a flat DCGameSegments array.
 *  Handles all three shapes DC uses: flat array, single-key object, multi-key object. */
function parseSegmentsProp(segments: Record<string, unknown[]> | unknown[] | undefined): DCGameSegments {
  if (!segments) return [];
  let setsRaw: unknown[];
  if (Array.isArray(segments)) {
    setsRaw = segments;
  } else {
    // Flatten all values one level — handles both {"": [all sets]} and
    // {"Cricket": [...], "601 DIDO": [...], ...} keyed-by-game-type shapes.
    setsRaw = (Object.values(segments) as unknown[][]).flat(1);
  }
  return setsRaw.map((set) => (Array.isArray(set) ? (set as DCGameLeg[]) : []));
}

/** Fetch match metadata (and any available round metadata) from the /matches/
 *  recap endpoint. The authoritative team score is matchInfo.opponents[].league_points,
 *  not .score — see the DCMatchInfo comments.
 *  Also probes several candidate prop locations for round_seq / sched_date.
 *  NOTE: /matches/ segments have a different schema from /games/'s — still not
 *  usable for full player-stat accumulation (use fetchGameSegments for that),
 *  but it's the only place a forfeited set's player attribution shows up —
 *  see parseForfeitSets / DCForfeitSet. */
export async function fetchMatchData(matchGuid: string): Promise<DCMatchData> {
  const url = `https://recap.dartconnect.com/matches/${matchGuid}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      Accept: "text/html",
    },
  });
  if (!res.ok) throw new Error(`match fetch error ${res.status} for ${matchGuid}`);

  const html = await res.text();
  const m = html.match(/data-page="([^"]+)"/);
  if (!m) throw new Error(`no data-page in match recap for ${matchGuid}`);

  const json = JSON.parse(m[1].replace(/&quot;/g, '"'));
  const props = json.props as Record<string, unknown>;
  const matchInfo = (props.matchInfo ?? { opponents: [] }) as DCMatchInfo;

  // Hunt for round_seq in several candidate locations DC might use.
  // "match" sub-object is common in Inertia apps for the primary resource.
  const matchProp = props.match as Record<string, unknown> | undefined;
  const rawRound =
    matchInfo.round_seq ??
    matchProp?.round_seq ??
    matchProp?.roundSeq ??
    props.round_seq ??
    props.roundSeq ??
    null;
  const roundSeq = rawRound != null ? Number(rawRound) : null;

  const rawDate =
    matchInfo.sched_date ??
    (matchProp?.sched_date as string | undefined) ??
    (matchProp?.schedDate as string | undefined) ??
    null;
  // Normalise to "YYYY-MM-DD" — DC may return full ISO timestamps
  const schedDate = rawDate ? String(rawDate).slice(0, 10) : null;

  const segmentsProp = props.segments as Record<string, unknown[]> | unknown[] | undefined;
  const forfeitSets = parseForfeitSets(segmentsProp);
  const setIndexes = parseSetIndexes(segmentsProp);
  const playerIds = parsePlayerIds(segmentsProp);

  return {
    matchInfo,
    roundSeq: isNaN(roundSeq as number) ? null : roundSeq,
    schedDate,
    forfeitSets,
    setIndexes,
    playerIds,
    propKeys: Object.keys(props),
  };
}

/** Fetch game segments from a recap GUID.
 *  Returns DCGameLeg[][] — outer index = set, inner = legs (1-3 per set).
 *  The /games/ endpoint has full turn-by-turn data needed for player stats.
 *  Use fetchMatchData separately for the authoritative team score. */
export async function fetchGameSegments(matchGuid: string): Promise<DCGameSegments> {
  const url = `https://recap.dartconnect.com/games/${matchGuid}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      Accept: "text/html",
    },
  });
  if (!res.ok) throw new Error(`recap fetch error ${res.status} for ${matchGuid}`);

  const html = await res.text();
  const m = html.match(/data-page="([^"]+)"/);
  if (!m) throw new Error(`no data-page in recap for ${matchGuid}`);

  const json = JSON.parse(m[1].replace(/&quot;/g, '"'));
  const props = json.props as Record<string, unknown>;

  return parseSegmentsProp(props.segments as Record<string, unknown[]> | unknown[] | undefined);
}

export interface DCMatchPlayerStat {
  name: string;
  total_games: number;
  total_wins: number;
  // 01 stats
  points_scored_01: string;   // e.g. "1,641" — strip commas before parsing
  darts_thrown_01: string;    // e.g. "102"
  average_01: string;         // pre-computed PPR e.g. "48.26"
  // Cricket stats
  cricket_marks_scored: number;
  cricket_darts_thrown: number;
  cricket_average: string | null; // pre-computed MPR e.g. "2.2", null if no cricket played
}

/** One player's throwing in ONE LEG, from the same recap page's
 *  `playersPerGame` prop. Verified against a real match: summing these per
 *  player reproduces the match aggregates in `players` exactly, for all 13
 *  players and all four totals. That exactness is what lets a forfeited set's
 *  contribution be subtracted back out without the numbers drifting. */
export interface DCPlayerLegStat {
  name: string;
  set_number: number;   // 1-indexed, same numbering as /games/ set_index
  game_name: string;    // "601 DIDO" | "501 SIDO" | "Cricket"
  darts_thrown: number | string | null;
  points_scored: number | string | null;  // 01 games
  marks_scored: number | string | null;   // cricket
}

export interface DCMatchPlayerStats {
  players: DCMatchPlayerStat[];
  /** Flattened per-leg breakdown. Empty if DC didn't send `playersPerGame`. */
  perLeg: DCPlayerLegStat[];
}

/** Fetch per-player stats from a match recap page (doubles-level breakdown),
 *  plus the per-leg breakdown those totals are built from. */
export async function fetchMatchPlayerStats(matchGuid: string): Promise<DCMatchPlayerStats> {
  const url = `https://recap.dartconnect.com/players/${matchGuid}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      Accept: "text/html",
    },
  });
  if (!res.ok) throw new Error(`recap/players fetch error ${res.status} for ${matchGuid}`);

  const html = await res.text();
  const m = html.match(/data-page="([^"]+)"/);
  if (!m) throw new Error(`no data-page in recap/players for ${matchGuid}`);

  const json = JSON.parse(m[1].replace(/&quot;/g, '"'));
  const props = json.props as Record<string, unknown>;
  // playersPerGame nests as [set][side][player]; flatten to a plain leg list.
  // A multi-leg set appears once per leg, which is exactly what we want.
  const perLegRaw = Array.isArray(props.playersPerGame)
    ? (props.playersPerGame as unknown[]).flat(2)
    : [];
  return {
    players: (props.players ?? []) as DCMatchPlayerStat[],
    perLeg: perLegRaw.filter((e): e is DCPlayerLegStat =>
      !!e && typeof e === "object" && typeof (e as DCPlayerLegStat).name === "string"),
  };
}

export interface DCLeaderboardStat {
  first_name: string;
  last_name: string;
  player_guid: number;
  team_name: string;
  division: string;
  // Cricket: points_scored = marks, rounds_played = turns played
  points_scored: number;
  darts_thrown: number;
  rounds_played: number;
  legs: number;
  wins: number;
}

/** Fetch the leaderboard stats for a league season.
 *  game_type: "cricket" for cricket stats.
 *  player_format: "doubles" for doubles format.
 *  Returns the `stats` array; MPR = points_scored / rounds_played. */
export async function fetchLeaderboard(
  leagueGuid: string,
  seasonId: number,
  gameType: string,
  playerFormat: string
): Promise<DCLeaderboardStat[]> {
  const res = await fetch("https://leaderboard.dartconnect.com/getLeaderboard", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    },
    body: JSON.stringify({
      mode: "L",
      id: `${leagueGuid}_${seasonId}_all`,
      gameTypeFilter: {
        game_type: gameType,
        game_name: "all",
        player_format: playerFormat,
        in_format: "all",
        out_format: "all",
        finish: "all",
        legs: "all",
        category: "all",
        matchCount: "all",
        range: "all",
      },
      logged_in: false,
      getEvent: false,
    }),
  });

  if (!res.ok) throw new Error(`leaderboard fetch error ${res.status}`);
  const data = await res.json() as { payload?: { stats?: DCLeaderboardStat[] } };
  return data.payload?.stats ?? [];
}

/** Get CSRF cookies (exported for reuse across calls in a single scrape) */
export { getCSRFCookies };

/** URL for a DartConnect match recap page */
export function dcRecapUrl(guid: string | null | undefined): string {
  return `https://recap.dartconnect.com/matches/${guid ?? ""}`;
}

// ─── Venue scraping (my.dartconnect.com schedule page) ───────────────────────

function cleanAddress(addr: string): string {
  return addr
    .replace(/,?\s*(USA|United States of America|United States)\s*$/i, "")
    .trim();
}

/**
 * Normalize addresses from DartConnect, which sometimes stores them as
 * "Street. , Zip City" (zip before city, no state) instead of the standard
 * "Street, City, MA Zip". Detects the bad pattern and reformats it.
 */
function normalizeAddress(addr: string): string {
  // Match "...Street... , 01234 City" — zip followed by city name, no state before zip
  const m = addr.match(/^(.+?)\s*\.?\s*,\s*(\d{5})\s+(.+)$/);
  if (m) {
    const street = m[1].trim();
    const zip = m[2];
    const city = m[3].trim();
    return `${street}, ${city}, MA ${zip}`;
  }
  return addr;
}

export function decodeHtmlEntities(s: string | null | undefined): string | null | undefined {
  // DC's declared types lie about nullability here just like team_name does
  // for BYE slots (team_name: string, but null at runtime) — stay defensive.
  if (s == null) return s;
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
}

export interface DCTeamVenue {
  name: string;
  address: string;
  phone: string;
}

/** DC's phone strings are hand-entered and wildly inconsistent — real values
 *  seen on one league's venues include "+1 978-687-9565", "1 (978)687-9848",
 *  "+1 (603) 328-5476" and "-1 603-382-0222" (someone typed a minus for the
 *  plus). Reduce to digits, drop a leading country code, and render one way. */
function normalizePhone(raw: string | null | undefined): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  const local = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (local.length !== 10) return "";
  return `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}`;
}

/** One scheduled match as the my.dartconnect.com schedule page's Inertia props
 *  describe it. Only the fields venue lookup needs are declared. */
interface DCScheduleItem {
  item_type?: string;
  is_bye?: boolean;
  home?: { id?: number | null; name?: string | null } | null;
  venue?: {
    name?: string | null;
    location?: string | null;
    city?: string | null;
    info?: { phone_number?: string | null } | null;
  } | null;
}

/**
 * Fetch each team's home venue from the my.dartconnect.com schedule page,
 * keyed by **DC team id** — the same id stored on `teams.dcId`.
 *
 * The page is an Inertia app, so the schedule is right there as JSON in the
 * `data-page` attribute: match groups → divisions → items, each item carrying
 * `home.id` and a structured `venue` object. This replaces an earlier pass that
 * regex-scraped the rendered HTML for team names next to an "(H)" marker and
 * then matched those names against `teams.name` — brittle on two counts (it
 * broke whenever DC changed markup, and it tied venue data to a mutable team
 * name), and it silently dropped venues DC rendered differently.
 *
 * Best-effort: returns an empty Map if the fetch or parse fails, since venue
 * info is decoration rather than league data.
 */
export async function fetchTeamVenues(
  slug: string,
  seasonId: number
): Promise<Map<number, DCTeamVenue>> {
  const result = new Map<number, DCTeamVenue>();

  try {
    const res = await fetch(
      `https://my.dartconnect.com/league/schedule/${slug}/${seasonId}`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
          Accept: "text/html",
        },
      }
    );

    if (!res.ok) {
      console.warn(`fetchTeamVenues: HTTP ${res.status} for ${slug}/${seasonId}`);
      return result;
    }

    const html = await res.text();
    const m = html.match(/data-page="([^"]+)"/);
    if (!m) {
      console.warn(`fetchTeamVenues: no data-page props for ${slug}/${seasonId}`);
      return result;
    }
    const props = (JSON.parse(m[1].replace(/&quot;/g, '"')) as { props?: Record<string, unknown> }).props ?? {};

    // Future/pending/completed are three separate groupings of the same
    // schedule — a team's venue can appear in any of them depending on how far
    // the season has run, so walk all three.
    const groups = ["future_match_groups", "pending_match_groups", "completed_match_groups"]
      .flatMap((k) => (Array.isArray(props[k]) ? (props[k] as Array<{ divisions?: Array<{ items?: DCScheduleItem[] }> }>) : []));

    for (const group of groups) {
      for (const division of group.divisions ?? []) {
        for (const item of division.items ?? []) {
          if (item.is_bye || !item.venue) continue;
          const teamDcId = item.home?.id;
          if (teamDcId == null) continue;
          const venue: DCTeamVenue = {
            // Names come HTML-escaped here the same as everywhere else in DC's
            // payloads ("Amvet&#039;s 147", "J Brians Pub &amp; Grille").
            name: decodeHtmlEntities(item.venue.name ?? "") ?? "",
            address: normalizeAddress(cleanAddress(item.venue.location ?? "")),
            phone: normalizePhone(item.venue.info?.phone_number),
          };
          const existing = result.get(teamDcId);
          // First occurrence wins, but let a later one fill in blanks — DC has
          // been seen leaving a field empty on one card and populated on another.
          if (!existing) {
            result.set(teamDcId, venue);
          } else {
            result.set(teamDcId, {
              name: existing.name || venue.name,
              address: existing.address || venue.address,
              phone: existing.phone || venue.phone,
            });
          }
        }
      }
    }
  } catch (err) {
    console.warn("fetchTeamVenues: failed", err);
  }

  return result;
}
