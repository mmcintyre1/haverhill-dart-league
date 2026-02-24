import { Suspense } from "react";
import { db, seasons, playerStats, players, playerSeasonTeams } from "@/lib/db";
import { divisions } from "@/lib/db/schema";
import { eq, and, desc, asc } from "drizzle-orm";
import LeaderboardTable, { type LeaderboardRow } from "@/components/LeaderboardTable";
import SeasonSelector from "@/components/SeasonSelector";
import DivisionSelector from "@/components/DivisionSelector";
import PhaseSelector from "@/components/PhaseSelector";
import RefreshButton from "@/components/RefreshButton";

export const dynamic = "force-dynamic";

async function getSeasons() {
  return db.select().from(seasons).orderBy(desc(seasons.startDate));
}

async function getDivisionsForSeason(seasonId: number): Promise<string[]> {
  const rows = await db
    .selectDistinct({ name: divisions.name })
    .from(divisions)
    .where(eq(divisions.seasonId, seasonId))
    .orderBy(asc(divisions.name));
  return rows.map((r) => r.name).filter(Boolean) as string[];
}

async function hasPostseason(seasonId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: playerStats.id })
    .from(playerStats)
    .where(and(eq(playerStats.seasonId, seasonId), eq(playerStats.phase, "POST")))
    .limit(1);
  return !!row;
}

async function getLeaderboard(
  seasonId: number,
  divisionFilter: string | null,
  phase: string
): Promise<LeaderboardRow[]> {
  const query = db
    .select({
      id: playerStats.playerId,
      pos: playerStats.pos,
      playerName: players.name,
      teamName: playerSeasonTeams.teamName,
      divisionName: playerSeasonTeams.divisionName,
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
      mpr: playerStats.mpr,
      ppr: playerStats.ppr,
      avg: playerStats.avg,
      pts: playerStats.pts,
    })
    .from(playerStats)
    .innerJoin(players, eq(playerStats.playerId, players.id))
    .leftJoin(
      playerSeasonTeams,
      and(
        eq(playerStats.playerId, playerSeasonTeams.playerId),
        eq(playerStats.seasonId, playerSeasonTeams.seasonId)
      )
    )
    .where(
      divisionFilter
        ? and(eq(playerStats.seasonId, seasonId), eq(playerStats.phase, phase), eq(playerSeasonTeams.divisionName, divisionFilter))
        : and(eq(playerStats.seasonId, seasonId), eq(playerStats.phase, phase))
    )
    .orderBy(asc(playerStats.pos));

  return query as unknown as Promise<LeaderboardRow[]>;
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
  searchParams: Promise<{ season?: string; division?: string; phase?: string }>;
}) {
  const params = await searchParams;
  const allSeasons = await getSeasons();

  const activeId =
    params.season
      ? parseInt(params.season)
      : allSeasons.find((s) => s.isActive)?.id ?? allSeasons[0]?.id;

  const divisionFilter = params.division ?? null;
  const phase = params.phase ?? "REG";

  const [rows, lastScraped, divisionList, postExists] = await Promise.all([
    activeId ? getLeaderboard(activeId, divisionFilter, phase) : Promise.resolve([]),
    activeId ? getLastScraped(activeId) : Promise.resolve(null),
    activeId ? getDivisionsForSeason(activeId) : Promise.resolve([]),
    activeId ? hasPostseason(activeId) : Promise.resolve(false),
  ]);

  const seasonOptions = allSeasons.map((s) => ({ id: s.id, name: s.name }));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold text-slate-100">Player Leaderboard</h2>
          <Suspense fallback={null}>
            <SeasonSelector seasons={seasonOptions} currentId={activeId ?? null} />
          </Suspense>
          {divisionList.length > 1 && (
            <Suspense fallback={null}>
              <DivisionSelector divisions={divisionList} current={divisionFilter ?? "all"} />
            </Suspense>
          )}
          {postExists && (
            <Suspense fallback={null}>
              <PhaseSelector current={phase} />
            </Suspense>
          )}
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
        <LeaderboardTable rows={rows} seasonId={activeId} phase={phase} />
      )}
    </div>
  );
}
