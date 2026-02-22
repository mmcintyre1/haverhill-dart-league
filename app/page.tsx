import { Suspense } from "react";
import { db, seasons, playerStats, players } from "@/lib/db";
import { eq, desc, asc } from "drizzle-orm";
import LeaderboardTable, { type LeaderboardRow } from "@/components/LeaderboardTable";
import SeasonSelector from "@/components/SeasonSelector";
import RefreshButton from "@/components/RefreshButton";

export const dynamic = "force-dynamic";

async function getSeasons() {
  return db.select().from(seasons).orderBy(desc(seasons.startDate));
}

async function getLeaderboard(seasonId: number): Promise<LeaderboardRow[]> {
  const rows = await db
    .select({
      id: playerStats.playerId,
      pos: playerStats.pos,
      playerName: players.name,
      teamName: playerStats.teamName,
      wp: playerStats.wp,
      crkt: playerStats.crkt,
      col601: playerStats.col601,
      col501: playerStats.col501,
      sos: playerStats.sos,
      hundredPlus: playerStats.hundredPlus,
      rnds: playerStats.rnds,
      oneEighty: playerStats.oneEighty,
      roHh: playerStats.roHh,
      zeroOneHh: playerStats.zeroOneHh,
      ro9: playerStats.ro9,
      hOut: playerStats.hOut,
      ldg: playerStats.ldg,
      ro6b: playerStats.ro6b,
      avg: playerStats.avg,
      pts: playerStats.pts,
    })
    .from(playerStats)
    .innerJoin(players, eq(playerStats.playerId, players.id))
    .where(eq(playerStats.seasonId, seasonId))
    .orderBy(asc(playerStats.pos));

  return rows;
}

async function getLastScraped(seasonId: number): Promise<Date | null> {
  const [row] = await db
    .select({ lastScrapedAt: seasons.lastScrapedAt })
    .from(seasons)
    .where(eq(seasons.id, seasonId))
    .limit(1);
  return row?.lastScrapedAt ?? null;
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>;
}) {
  const params = await searchParams;
  const allSeasons = await getSeasons();

  const activeId =
    params.season
      ? parseInt(params.season)
      : allSeasons.find((s) => s.isActive)?.id ?? allSeasons[0]?.id;

  const [rows, lastScraped] = await Promise.all([
    activeId ? getLeaderboard(activeId) : Promise.resolve([]),
    activeId ? getLastScraped(activeId) : Promise.resolve(null),
  ]);

  const seasonOptions = allSeasons.map((s) => ({ id: s.id, name: s.name }));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-slate-100">Player Leaderboard</h2>
          <Suspense fallback={null}>
            <SeasonSelector seasons={seasonOptions} currentId={activeId ?? null} />
          </Suspense>
        </div>
        <div className="flex items-center gap-4">
          {lastScraped && (
            <span className="text-xs text-slate-400">
              Last updated:{" "}
              {new Intl.DateTimeFormat("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
                timeZone: "America/New_York",
              }).format(lastScraped)}{" "}
              ET
            </span>
          )}
          <RefreshButton />
        </div>
      </div>

      {allSeasons.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-600 py-16 text-center text-slate-400">
          <p className="font-medium">No data yet</p>
          <p className="mt-1 text-sm">
            Click &ldquo;Refresh Data&rdquo; to pull the latest from DartConnect.
          </p>
        </div>
      ) : (
        <LeaderboardTable rows={rows} />
      )}
    </div>
  );
}
