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

async function dcPost<T>(
  path: string,
  body: object,
  cookies?: { xsrf: string; session: string }
): Promise<T> {
  const { xsrf, session } = cookies ?? (await getCSRFCookies());
  const xsrfDecoded = decodeURIComponent(xsrf);

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

  if (!res.ok) {
    throw new Error(`DC API error ${res.status} on ${path}: ${await res.text()}`);
  }

  return res.json() as Promise<T>;
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
  cookies?: { xsrf: string; session: string }
): Promise<unknown> {
  return dcPost(
    `/api/league/${LEAGUE_ID}/lineups/${seasonId}`,
    {},
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
  opponents: Array<{
    name: string;
    score: number;       // league points for this match — includes forfeited sets
    set_wins: number;
    league_points: number;
    league_standings_points: number;
  }>;
}

/** Extended return from fetchMatchData — includes the authoritative score and
 *  any round/scheduling metadata discoverable from the recap page props. */
export interface DCMatchData {
  matchInfo: DCMatchInfo;
  roundSeq: number | null;
  schedDate: string | null;  // ISO "YYYY-MM-DD" if present in props
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

/** Fetch the authoritative match score (and any available round metadata) from
 *  the /matches/ recap endpoint.
 *  matchInfo.opponents[].score is DC-computed and includes forfeited sets.
 *  Also probes several candidate prop locations for round_seq / sched_date.
 *  NOTE: /matches/ segments have a different schema — use fetchGameSegments for player stats. */
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

  return {
    matchInfo,
    roundSeq: isNaN(roundSeq as number) ? null : roundSeq,
    schedDate,
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

/** Fetch per-player stats from a match recap page (doubles-level breakdown).
 *  Returns the `players` array from the Inertia props of recap.dartconnect.com/players/{guid}. */
export async function fetchMatchPlayerStats(matchGuid: string): Promise<DCMatchPlayerStat[]> {
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
  return (props.players ?? []) as DCMatchPlayerStat[];
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

// ─── Venue scraping (my.dartconnect.com schedule page) ───────────────────────

function cleanAddress(addr: string): string {
  return addr
    .replace(/,?\s*(USA|United States of America|United States)\s*$/i, "")
    .trim();
}

function decodeHtmlEntities(s: string): string {
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

/**
 * Scrape the my.dartconnect.com schedule page for a given slug + seasonId and
 * return a Map of teamName → venue info.  Home team names are matched by the
 * "(H)" marker in the HTML.  Returns an empty Map if the fetch or parse fails
 * (non-blocking — venue info is best-effort).
 */
export async function fetchTeamVenues(
  slug: string,
  seasonId: number
): Promise<Map<string, DCTeamVenue>> {
  const result = new Map<string, DCTeamVenue>();

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

    const raw = await res.text();
    const html = decodeHtmlEntities(raw);

    // Find all home-team positions — spans with class="truncate" immediately
    // followed by a "(H)" sibling span.
    const homeTeamRe =
      /<span class="truncate">([^<]+)<\/span>\s*<span[^>]*>\(H\)<\/span>/g;
    const homeTeams: Array<{ name: string; index: number }> = [];
    let m: RegExpExecArray | null;
    while ((m = homeTeamRe.exec(html)) !== null) {
      homeTeams.push({ name: m[1].trim(), index: m.index });
    }

    for (let i = 0; i < homeTeams.length; i++) {
      const startIdx = homeTeams[i].index;
      // Look forward to the next home-team entry (or end of HTML).
      const endIdx =
        i + 1 < homeTeams.length ? homeTeams[i + 1].index : html.length;
      const section = html.slice(startIdx, endIdx);

      // Venue name: font-semibold div is the name; the following div is the city (ignored).
      const venueNameM = section.match(
        /<div class="font-semibold">([^<]+)<\/div>\s*<div>([^<]+)<\/div>/
      );

      // Address block.
      const addressM = section.match(
        /<div class="text-xl font-bold">Venue Address<\/div>\s*<div>\s*<div class="space-y-1">\s*<span>([^<]+)<\/span>/
      );

      // Phone link.
      const phoneM = section.match(/href="tel:\+1 ([\d\s()-]+)"/);

      if (!venueNameM && !addressM && !phoneM) continue;

      const teamName = homeTeams[i].name;
      if (result.has(teamName)) continue; // already populated from an earlier match week

      result.set(teamName, {
        name: venueNameM ? venueNameM[1].trim() : "",
        address: addressM ? cleanAddress(addressM[1].trim()) : "",
        phone: phoneM ? phoneM[1].trim() : "",
      });
    }
  } catch (err) {
    console.warn("fetchTeamVenues: failed", err);
  }

  return result;
}
