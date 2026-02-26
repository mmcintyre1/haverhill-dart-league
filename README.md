# Haverhill Dart League

Custom league website that automatically pulls stats, schedules, and results from DartConnect and presents them in a clean, league-specific format with an admin interface for content and scoring configuration.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js (App Router), React 19, TypeScript |
| Database | Neon PostgreSQL (serverless) |
| ORM | Drizzle ORM |
| Styling | Tailwind CSS v4 |
| Hosting | Netlify |
| Scheduled jobs | Netlify scheduled functions |

---

## Setup

### 1. Create a Neon database

Go to [console.neon.tech](https://console.neon.tech), create a project, and copy the **pooled connection string**.

### 2. Configure environment variables

Create `.env.local` in the project root:

```env
# Neon PostgreSQL (pooled connection string)
DATABASE_URL=postgresql://...

# Protects /api/scrape and admin API routes
# Generate with: openssl rand -hex 32
SCRAPE_SECRET=your-secret-here

# DartConnect identifiers
DC_LEAGUE_ID=HaverDL         # Used for TV/API URLs
DC_LEAGUE_SLUG=HaverDL       # Used to scrape venue info from schedule page

# Display
LEAGUE_NAME=Haverhill Dart League

# Optional: enables HTTP Basic Auth on /admin
ADMIN_PASSWORD=your-password-here
```

Netlify sets `URL` and `DEPLOY_URL` automatically.

### 3. Push the database schema

```bash
npm run db:push
```

### 4. Run locally

```bash
npm install
npm run dev        # http://localhost:3000
npm run db:studio  # Drizzle Studio GUI
```

### 5. Trigger the first scrape

```bash
curl -X POST http://localhost:3000/api/scrape \
  -H "Authorization: Bearer your-secret" \
  -H "Content-Type: application/json" \
  -d '{}'
```

---

## Deployment (Netlify)

1. Push repo to GitHub
2. Connect to Netlify → Import from Git
3. Build settings are already in `netlify.toml` (`npm run build`, publish `.next`)
4. Add environment variables in **Netlify → Site settings → Environment variables**:
   - `DATABASE_URL`, `SCRAPE_SECRET`, `DC_LEAGUE_ID`, `DC_LEAGUE_SLUG`, `LEAGUE_NAME`
5. Deploy

The scheduled function (`netlify/functions/scheduled-scrape.mts`) runs every **Wednesday at 6:00 AM ET** — the morning after Tuesday night play.

After deploying, apply any schema changes with:

```bash
npm run db:push
```

---

## Pages

| Route | Description |
|---|---|
| `/` | Home — hero, news/announcements, next upcoming round, last week's results |
| `/standings` | Team standings by division with expandable per-match history |
| `/matches` | Full schedule — upcoming rounds and completed results with scores |
| `/leaderboard` | Player stats table — PPR, MPR, records, 100+, 180s, etc. |
| `/players/[id]` | Individual player profile — season summary and week-by-week breakdown |
| `/teams` | Team rosters, captains, and venue info grouped by division |
| `/about` | League rules, scoring explanation, and stat glossary |
| `/admin` | Admin panel — news posts, data refresh, site content, scoring config |

---

## Database Schema

| Table | Purpose |
|---|---|
| `seasons` | One row per season with `isActive` flag and `lastScrapedAt` timestamp |
| `divisions` | Divisions (A, B, C, D) per season, keyed to DartConnect IDs |
| `teams` | Teams per season — captain, venue name/address/phone, DC standings (wins/losses/points) |
| `players` | Master player list — name and optional DartConnect GUID |
| `playerStats` | Aggregated per-player per-season stats (records, averages, 100+, MPR, PPR, etc.), split by phase (REG/POST) |
| `playerWeekStats` | Week-by-week breakdown per player — set wins/losses by game type, HH, LDG, marks, opponent team |
| `playerSeasonTeams` | Authoritative team/division membership per player per season |
| `matches` | Match schedule — home/away, scores, round, date, DC GUID, status (P=pending, C=complete) |
| `newsPosts` | Admin-created announcements with title, body, author |
| `siteContent` | Key-value store for admin-editable page content (scoring explanation, glossary) |
| `scoringConfig` | Configurable scoring rules — point values, hot-hand thresholds, game-3 tiebreaker inclusion. Scoped to global or season+division |
| `scrapeLog` | Log of each scrape run — status, players/matches updated, error message |

---

## Scraping

The scraper (`lib/scrape-runner.ts`) pulls from DartConnect's TV API (`tv.dartconnect.com`) and the recap API (`recap.dartconnect.com`).

### What it fetches

1. League seasons and active season status
2. Match schedule, team competitors, and division info
3. Player rosters (one request per team)
4. Completed match GUIDs from each team's match history
5. Game segments — leg-by-leg turn data from the recap API
6. Authoritative team scores
7. Per-player per-match stats
8. Venue info (name, address, phone) from `my.dartconnect.com/league/schedule/{slug}/{seasonId}`
9. Postseason data (same flow with `season_status: "POST"`)

### How to trigger

**Admin UI:** Go to `/admin` → Data Refresh tab. Four modes:
- Active season only
- Specific season (choose from dropdown)
- All unscraped seasons
- Force all (re-scrapes everything)

**API:**
```bash
curl -X POST https://your-site.netlify.app/api/scrape \
  -H "Authorization: Bearer your-secret" \
  -H "Content-Type: application/json" \
  -d '{"all": true}'
```

Body options: `{ seasonId?: number, all?: boolean, force?: boolean }`

**Automatic:** Every Wednesday at 6:00 AM ET via `netlify/functions/scheduled-scrape.mts`.

### DartConnect API endpoints used

| Endpoint | Data |
|---|---|
| `GET tv.dartconnect.com/league/{id}` | Season list and league info (Inertia page props) |
| `POST .../standings/{seasonId}/players` | Player leaderboard stats |
| `POST .../standings/{seasonId}/matches` | Team match history per opponent |
| `POST .../lineups/{seasonId}` | Full schedule and lineups |
| `GET recap.dartconnect.com/games/{guid}` | Leg-by-leg game segments |
| `GET recap.dartconnect.com/matches/{guid}` | Authoritative match scores |
| `GET recap.dartconnect.com/players/{guid}` | Per-player match stats |
| `GET my.dartconnect.com/league/schedule/{slug}/{seasonId}` | Venue info (HTML scrape) |

All endpoints are publicly accessible — no DartConnect account required. CSRF tokens are fetched automatically.

---

## Scoring Config

Rules are configurable from `/admin` → Scoring Config and stored in the `scoringConfig` table. They can be scoped globally or overridden per season and division.

| Key | Default | Description |
|---|---|---|
| `cricket.win_pts` | 1 | Points per Cricket set win |
| `601.win_pts` | 1 | Points per 601 set win |
| `501.win_pts` | 1 | Points per 501 set win |
| `01_hh.threshold` | 475/450/425/400 (A/B/C/D) | 100+ score threshold for hot hand 🔥 |
| `ro_hh.threshold` | 20/17/14/12 (A/B/C/D) | Cricket marks threshold for hot hand 🔥 |
| `g3.include_180` | true | Count 180s in game-3 tiebreakers |
| `g3.include_ro9` | true | Count RO9 marks in game-3 |
| `g3.include_hout` | true | Count high outs in game-3 |
| `g3.include_100plus` | false | Count 100+ scores in game-3 |
| `g3.include_rnds` | false | Count cricket rounds in game-3 |

---

## Key Files

```
app/
  page.tsx                    Home page
  standings/page.tsx          Team standings
  matches/page.tsx            Schedule and results
  leaderboard/page.tsx        Player leaderboard
  players/[id]/page.tsx       Player profile
  teams/page.tsx              Team rosters and venues
  about/page.tsx              Rules and glossary
  admin/page.tsx              Admin panel
  api/
    scrape/route.ts           Scrape trigger endpoint
    scrape/status/route.ts    Scrape status polling
    admin/                    News, content, scoring config APIs

lib/
  db/
    schema.ts                 Drizzle schema (all tables)
    index.ts                  DB client and table exports
  scrape-runner.ts            Core scraping and stat calculation logic
  dartconnect.ts              DartConnect fetch helpers and venue parser
  format.ts                   Shared date formatting utilities

components/
  VenueToggle.tsx             Expandable venue info with map pin icon
  SeasonSelector.tsx          Season switcher (URL search param)
  DivisionSelector.tsx        Division filter (URL search param)
  NavLinks.tsx                Main navigation links

netlify/functions/
  scheduled-scrape.mts        Wednesday 6 AM ET cron trigger
  scrape-background.ts        Long-running background scrape handler

public/
  sw.js                       Service worker (cache-first static, network-first nav)
  manifest.json               PWA manifest
```
