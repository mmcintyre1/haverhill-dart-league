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
  leagueId: text("league_id").notNull().default("HaverDL"),
  name: text("name").notNull(), // e.g. "Spring 2026"
  startDate: date("start_date"),
  isActive: boolean("is_active").notNull().default(false),
  lastScrapedAt: timestamp("last_scraped_at"),
});

// ─── Divisions ────────────────────────────────────────────────────────────────

export const divisions = pgTable(
  "divisions",
  {
    id: integer("id").primaryKey(), // DartConnect division ID
    seasonId: integer("season_id")
      .notNull()
      .references(() => seasons.id),
    name: text("name").notNull(), // "A", "B", etc.
  }
);

// ─── Teams ────────────────────────────────────────────────────────────────────

export const teams = pgTable(
  "teams",
  {
    id: integer("id").primaryKey(), // DartConnect team ID
    seasonId: integer("season_id")
      .notNull()
      .references(() => seasons.id),
    divisionId: integer("division_id").references(() => divisions.id),
    name: text("name").notNull(),
    captainName: text("captain_name"),
    // DartConnect-authoritative standings (from fetchStandingsPageProps competitors)
    dcWins: integer("dc_wins"),
    dcLosses: integer("dc_losses"),
    dcLeaguePoints: integer("dc_league_points"),
  }
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
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("player_stats_season_player_idx").on(t.seasonId, t.playerId),
  ]
);

// ─── Matches / Schedule ───────────────────────────────────────────────────────

export const matches = pgTable("matches", {
  id: integer("id").primaryKey(), // DartConnect league_match_id
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
  seasonStatus: text("season_status"),   // "REG" or "POST"
  prettyDate: text("pretty_date"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

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
  },
  (t) => [
    uniqueIndex("player_week_stats_idx").on(t.seasonId, t.playerId, t.weekKey),
  ]
);

// ─── News Posts ───────────────────────────────────────────────────────────────

export const newsPosts = pgTable("news_posts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  author: text("author"),
  publishedAt: timestamp("published_at").notNull().defaultNow(),
});

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
