# Haverhill Dart League Site

Custom league website that pulls stats, schedule, and results from DartConnect's public TV API and displays them in a clean, league-specific format.

## Stack

- **Next.js 14** (App Router, TypeScript)
- **Neon** (serverless PostgreSQL)
- **Drizzle ORM**
- **Tailwind CSS**
- **Netlify** (deployment + scheduled scraping)

## Setup

### 1. Create a Neon database

1. Go to [console.neon.tech](https://console.neon.tech) and create a free account
2. Create a new project (e.g. "haverhill-dart-league")
3. Copy the **pooled connection string** (Connection Details → Pooled connection)

### 2. Configure environment variables

Copy `.env.local` and fill in your values:

```bash
DATABASE_URL=postgresql://...  # your Neon pooled connection string
SCRAPE_SECRET=your-random-secret  # run: openssl rand -hex 32
```

### 3. Push the database schema

```bash
npm run db:push
```

### 4. Run locally

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000).

### 5. Trigger the first data scrape

```bash
curl -X POST http://localhost:3000/api/scrape \
  -H "Authorization: Bearer your-random-secret"
```

The schedule will populate immediately. Player stats will appear after the first Tuesday night of games.

---

## Deployment (Netlify)

1. Push this repo to GitHub
2. Connect to Netlify → **Import from Git**
3. Build settings are already configured in `netlify.toml`
4. Add environment variables in **Netlify → Site settings → Environment variables**:
   - `DATABASE_URL`
   - `SCRAPE_SECRET`
5. Deploy

The **Netlify Scheduled Function** (`netlify/functions/scheduled-scrape.mts`) will automatically scrape DartConnect every **Wednesday at 6am ET** — the morning after Tuesday night play.

---

## Data Refresh

- **Automatic**: Every Wednesday morning via Netlify Scheduled Function
- **Manual**: Click "Refresh Data" on the leaderboard page (requires the scrape secret)

---

## DartConnect API Details

| Endpoint | Method | Data |
|---|---|---|
| `GET /league/HaverDL` | GET | Season list + league info (Inertia page props) |
| `/api/league/HaverDL/standings/{id}/players` | POST | Player leaderboard stats |
| `/api/league/HaverDL/standings/{id}/matches` | POST | Team match standings |
| `/api/league/HaverDL/lineups/{id}` | POST | Full schedule + lineups |

All endpoints are publicly accessible — no DartConnect login required.
CSRF tokens are fetched automatically from the initial GET request.

Current season: **Spring 2026** (ID: `20788`)
League GUID: `29qj`
