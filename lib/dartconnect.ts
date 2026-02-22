const DC_BASE = "https://tv.dartconnect.com";
const LEAGUE_ID = "HaverDL";
const LEAGUE_GUID = "29qj";

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
 *  opponent_guid must be a team's numeric ID string; season_status must be "REG". */
export async function fetchPlayerStandings(
  seasonId: number,
  body: object = { season_status: "REG", opponent_guid: LEAGUE_GUID },
  cookies?: { xsrf: string; session: string }
): Promise<{ roster: DCPlayerStat[] }> {
  return dcPost(
    `/api/league/${LEAGUE_ID}/standings/${seasonId}/players`,
    body,
    cookies
  );
}

/** Fetch team match standings for a given season */
export async function fetchMatchStandings(
  seasonId: number,
  seasonStatus: "regular" | "post" = "regular",
  cookies?: { xsrf: string; session: string }
): Promise<{
  stats: Record<string, number>;
  matches: unknown[];
}> {
  return dcPost(
    `/api/league/${LEAGUE_ID}/standings/${seasonId}/matches`,
    { season_status: seasonStatus, opponent_guid: LEAGUE_GUID },
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
  cookies: { xsrf: string; session: string }
): Promise<DCMatchHistoryEntry[]> {
  const res = await dcPost<{ matches?: unknown[] }>(
    `/api/league/${LEAGUE_ID}/standings/${seasonId}/matches`,
    { season_status: "REG", opponent_guid: teamId },
    cookies
  );
  return (res.matches ?? []) as DCMatchHistoryEntry[];
}

/** Fetch game segments from a recap GUID.
 *  Returns DCGameLeg[][] — outer index = set (0-10), inner = legs (1-3). */
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

  // segments is an object keyed by "" (or division name); value = array[11 sets]
  const segments = props.segments as Record<string, unknown[]> | unknown[] | undefined;
  if (!segments) return [];

  let setsRaw: unknown[];
  if (Array.isArray(segments)) {
    setsRaw = segments;
  } else {
    // object — take the first key's value
    const firstVal = Object.values(segments)[0];
    setsRaw = Array.isArray(firstVal) ? firstVal : [];
  }

  // Each element of setsRaw is an array of leg objects
  return setsRaw.map((set) => (Array.isArray(set) ? (set as DCGameLeg[]) : []));
}

/** Get CSRF cookies (exported for reuse across calls in a single scrape) */
export { getCSRFCookies };
