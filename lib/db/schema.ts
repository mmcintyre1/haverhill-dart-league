import {
  pgTable,
  serial,
  integer,
  text,
  numeric,
  boolean,
  timestamp,
  date,
  time,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ─── Seasons ──────────────────────────────────────────────────────────────────

export const seasons = pgTable("seasons", {
  id: integer("id").primaryKey(), // DartConnect season ID
  leagueId: text("league_id").notNull(),
  name: text("name").notNull(), // e.g. "Spring 2026"
  startDate: date("start_date"),
  isActive: boolean("is_active").notNull().default(false),
  lastScrapedAt: timestamp("last_scraped_at"),
});

// ─── Divisions ────────────────────────────────────────────────────────────────

export const divisions = pgTable(
  "divisions",
  {
    id: serial("id").primaryKey(),           // internal serial PK
    dcId: integer("dc_id").notNull(),        // DartConnect division ID
    seasonId: integer("season_id")
      .notNull()
      .references(() => seasons.id),
    name: text("name").notNull(),            // "A", "B", etc.
  },
  (t) => [uniqueIndex("divisions_dc_season_idx").on(t.dcId, t.seasonId)]
);

// ─── Teams ────────────────────────────────────────────────────────────────────
// One row per team per season — same DC team can play in multiple seasons.

export const teams = pgTable(
  "teams",
  {
    id: serial("id").primaryKey(),          // internal serial PK
    dcId: integer("dc_id").notNull(),        // DartConnect team ID
    seasonId: integer("season_id")
      .notNull()
      .references(() => seasons.id),
    divisionId: integer("division_id").references(() => divisions.id),
    name: text("name").notNull(),
    captainName: text("captain_name"),
    venueName:    text("venue_name"),
    venueAddress: text("venue_address"),
    venuePhone:   text("venue_phone"),
    // DartConnect-authoritative standings (from fetchStandingsPageProps competitors)
    dcWins: integer("dc_wins"),
    dcLosses: integer("dc_losses"),
    dcLeaguePoints: integer("dc_league_points"),
  },
  (t) => [uniqueIndex("teams_dc_season_idx").on(t.dcId, t.seasonId)]
);

// ─── Players ──────────────────────────────────────────────────────────────────

export const players = pgTable(
  "players",
  {
    id: serial("id").primaryKey(),
    dcGuid: text("dc_guid"),
    name: text("name").notNull(),
  },
  (t) => [uniqueIndex("players_name_idx").on(t.name)]
);

// ─── Player Stats (one row per player per season) ─────────────────────────────

export const playerStats = pgTable(
  "player_stats",
  {
    id: serial("id").primaryKey(),
    seasonId: integer("season_id")
      .notNull()
      .references(() => seasons.id),
    playerId: integer("player_id")
      .notNull()
      .references(() => players.id),
    teamId: integer("team_id").references(() => teams.id),
    teamName: text("team_name"),
    // Rank / position
    pos: integer("pos"),
    // Stats (stored as text to preserve "11-3" style records)
    wp: text("wp"),          // Weeks Played or Win %
    crkt: text("crkt"),      // Cricket record e.g. "11-3"
    col601: text("col_601"), // 601 record e.g. "6-6"
    col501: text("col_501"), // 501 record e.g. "14-0"
    sos: numeric("sos", { precision: 5, scale: 3 }),
    hundredPlus: integer("hundred_plus"),
    rnds: integer("rnds"),
    oneEighty: integer("one_eighty"),
    roHh: integer("ro_hh"),
    zeroOneHh: integer("zero1_hh"),
    ro9: integer("ro9"),
    hOut: integer("h_out"),
    ldg: integer("ldg"),
    ro6b: integer("ro6b"),
    mpr: numeric("mpr", { precision: 5, scale: 2 }),
    ppr: numeric("ppr", { precision: 6, scale: 2 }),
    avg: numeric("avg", { precision: 6, scale: 3 }),
    pts: integer("pts"),
    phase: text("phase").notNull().default("REG"), // "REG" | "POST"
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("player_stats_season_player_phase_idx").on(t.seasonId, t.playerId, t.phase),
  ]
);

// ─── Matches / Schedule ───────────────────────────────────────────────────────

export const matches = pgTable(
  "matches",
  {
    id: integer("id").primaryKey(), // DC league_match_id (negative synthetic for history-only rows)
    seasonId: integer("season_id")
      .notNull()
      .references(() => seasons.id),
    divisionId: integer("division_id").references(() => divisions.id),
    divisionName: text("division_name"),
    roundSeq: integer("round_seq"),
    homeTeamId: integer("home_team_id").references(() => teams.id),
    awayTeamId: integer("away_team_id").references(() => teams.id),
    homeTeamName: text("home_team_name"),
    awayTeamName: text("away_team_name"),
    schedDate: date("sched_date"),
    schedTime: time("sched_time"),
    status: text("status").notNull().default("P"), // "P" = pending, "C" = complete
    homeScore: integer("home_score").default(0),
    awayScore: integer("away_score").default(0),
    dcMatchId: integer("dc_match_id"),     // null until played on boards
    dcGuid: text("dc_guid"),              // hex GUID for recap.dartconnect.com/games/{guid}
    seasonStatus: text("season_status"),   // "REG" or "POST"
    prettyDate: text("pretty_date"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("matches_dc_guid_idx").on(t.dcGuid)]
);

// ─── Player Week Stats (one row per player per week per season) ───────────────

export const playerWeekStats = pgTable(
  "player_week_stats",
  {
    id: serial("id").primaryKey(),
    seasonId: integer("season_id")
      .notNull()
      .references(() => seasons.id),
    playerId: integer("player_id")
      .notNull()
      .references(() => players.id),
    weekKey: text("week_key").notNull(),   // e.g. "27 Jan 2026"
    opponentTeam: text("opponent_team"),
    setWins: integer("set_wins").notNull().default(0),
    setLosses: integer("set_losses").notNull().default(0),
    crktWins: integer("crkt_wins").notNull().default(0),
    crktLosses: integer("crkt_losses").notNull().default(0),
    col601Wins: integer("col601_wins").notNull().default(0),
    col601Losses: integer("col601_losses").notNull().default(0),
    col501Wins: integer("col501_wins").notNull().default(0),
    col501Losses: integer("col501_losses").notNull().default(0),
    hundredPlus: integer("hundred_plus").notNull().default(0),
    oneEighty: integer("one_eighty").notNull().default(0),
    ro9: integer("ro9").notNull().default(0),
    hOut: integer("h_out").notNull().default(0),
    ldg: integer("ldg").notNull().default(0),
    rnds: integer("rnds").notNull().default(0),
    mpr: numeric("mpr", { precision: 5, scale: 2 }),
    ppr: numeric("ppr", { precision: 6, scale: 2 }),
    phase: text("phase").notNull().default("REG"), // "REG" | "POST"
  },
  (t) => [
    uniqueIndex("player_week_stats_idx").on(t.seasonId, t.playerId, t.weekKey, t.phase),
  ]
);

// ─── Player Season Teams (one row per player per season) ──────────────────────
// Authoritative team/division membership, decoupled from playerStats.

export const playerSeasonTeams = pgTable(
  "player_season_teams",
  {
    id: serial("id").primaryKey(),
    playerId: integer("player_id")
      .notNull()
      .references(() => players.id),
    seasonId: integer("season_id")
      .notNull()
      .references(() => seasons.id),
    teamId: integer("team_id").references(() => teams.id),
    teamName: text("team_name"),
    divisionId: integer("division_id").references(() => divisions.id),
    divisionName: text("division_name"),
  },
  (t) => [uniqueIndex("pst_player_season_idx").on(t.playerId, t.seasonId)]
);

// ─── News Posts ───────────────────────────────────────────────────────────────

export const newsPosts = pgTable("news_posts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  author: text("author"),
  publishedAt: timestamp("published_at").notNull().defaultNow(),
});

// ─── Site Content (admin-editable key/value store) ────────────────────────────

export const siteContent = pgTable("site_content", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Scoring Config (extensible key/value, scoped to global or season + division) ──

export const scoringConfig = pgTable(
  "scoring_config",
  {
    id: serial("id").primaryKey(),
    scope: text("scope").notNull().default("global"), // "global" | "<seasonId>"
    division: text("division"),                        // null = all divisions
    key: text("key").notNull(),
    value: text("value").notNull(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("scoring_config_scope_div_key_idx").on(t.scope, t.division, t.key)]
);

// ─── Scrape Log ───────────────────────────────────────────────────────────────

export const scrapeLog = pgTable("scrape_log", {
  id: serial("id").primaryKey(),
  seasonId: integer("season_id"),
  triggeredBy: text("triggered_by").notNull().default("manual"), // "manual" | "scheduled"
  status: text("status").notNull(), // "success" | "error"
  playersUpdated: integer("players_updated").default(0),
  matchesUpdated: integer("matches_updated").default(0),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
