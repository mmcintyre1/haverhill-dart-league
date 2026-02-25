import { Suspense } from "react";
import { db, seasons, playerStats, players, playerSeasonTeams, scoringConfig, playerWeekStats } from "@/lib/db";
import { divisions } from "@/lib/db/schema";
import { eq, and, desc, asc, or, isNull } from "drizzle-orm";
import LeaderboardTable, { type LeaderboardRow } from "@/components/LeaderboardTable";
import SeasonSelector from "@/components/SeasonSelector";
import DivisionSelector from "@/components/DivisionSelector";
import PhaseSelector from "@/components/PhaseSelector";
import ScoringGuide from "@/components/ScoringGuide";

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

export type ScoringPts = { cricket: number; "601": number; "501": number };

async function getScoringPts(seasonId: number): Promise<ScoringPts> {
  const rows = await db
    .select()
    .from(scoringConfig)
    .where(
      and(
        or(eq(scoringConfig.scope, "global"), eq(scoringConfig.scope, String(seasonId))),
        isNull(scoringConfig.division)
      )
    );
  // Resolution: global first, then season-specific overrides
  const pts: ScoringPts = { cricket: 1, "601": 1, "501": 1 };
  const globalRows = rows.filter(r => r.scope === "global");
  const seasonRows = rows.filter(r => r.scope !== "global");
  for (const r of [...globalRows, ...seasonRows]) {
    if (r.key === "cricket.win_pts") pts.cricket = Number(r.value);
    if (r.key === "601.win_pts")     pts["601"]   = Number(r.value);
    if (r.key === "501.win_pts")     pts["501"]   = Number(r.value);
  }
  return pts;
}

// Default hot hand thresholds per division (01 HH ton points, RO HH cricket marks)
const DEFAULT_HH: Record<string, { hh: number; roHh: number }> = {
  A: { hh: 475, roHh: 20 },
  B: { hh: 450, roHh: 17 },
  C: { hh: 425, roHh: 14 },
  D: { hh: 400, roHh: 12 },
};

async function getHhThresholds(
  seasonId: number
): Promise<Record<string, { hh: number; roHh: number }>> {
  const rows = await db
    .select()
    .from(scoringConfig)
    .where(
      and(
        or(eq(scoringConfig.scope, "global"), eq(scoringConfig.scope, String(seasonId))),
        or(eq(scoringConfig.key, "01_hh.threshold"), eq(scoringConfig.key, "ro_hh.threshold"))
      )
    );

  // Build per-division map; season rows override global rows
  const result: Record<string, { hh: number; roHh: number }> = {};
  const globalRows = rows.filter((r) => r.scope === "global");
  const seasonRows = rows.filter((r) => r.scope !== "global");

  for (const r of [...globalRows, ...seasonRows]) {
    const div = r.division ?? "";
    if (!result[div]) result[div] = { ...DEFAULT_HH[div] ?? { hh: 475, roHh: 20 } };
    if (r.key === "01_hh.threshold") result[div].hh = Number(r.value);
    if (r.key === "ro_hh.threshold") result[div].roHh = Number(r.value);
  }

  return result;
}

async function getG3Config(seasonId: number): Promise<Record<string, string>> {
  const rows = await db
    .select()
    .from(scoringConfig)
    .where(
      and(
        or(eq(scoringConfig.scope, "global"), eq(scoringConfig.scope, String(seasonId))),
        isNull(scoringConfig.division)
      )
    );
  const map: Record<string, string> = {};
  for (const r of rows.filter((r) => r.scope === "global")) map[r.key] = r.value;
  for (const r of rows.filter((r) => r.scope !== "global")) map[r.key] = r.value;
  return map;
}

async function getWeeklyStats(
  seasonId: number,
  phase: string
): Promise<{ playerId: number; hundredPlus: number; rnds: number }[]> {
  const rows = await db
    .select({
      playerId: playerWeekStats.playerId,
      hundredPlus: playerWeekStats.hundredPlus,
      rnds: playerWeekStats.rnds,
    })
    .from(playerWeekStats)
    .where(
      and(eq(playerWeekStats.seasonId, seasonId), eq(playerWeekStats.phase, phase))
    );
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

  const [rows, lastScraped, divisionList, postExists, scoringPts, hhThresholds, weeklyStats, g3Config] =
    await Promise.all([
      activeId ? getLeaderboard(activeId, divisionFilter, phase) : Promise.resolve([]),
      activeId ? getLastScraped(activeId) : Promise.resolve(null),
      activeId ? getDivisionsForSeason(activeId) : Promise.resolve([]),
      activeId ? hasPostseason(activeId) : Promise.resolve(false),
      activeId ? getScoringPts(activeId) : Promise.resolve({ cricket: 1, "601": 1, "501": 1 }),
      activeId ? getHhThresholds(activeId) : Promise.resolve({} as Record<string, { hh: number; roHh: number }>),
      activeId ? getWeeklyStats(activeId, phase) : Promise.resolve([]),
      activeId ? getG3Config(activeId) : Promise.resolve({} as Record<string, string>),
    ]);

  // Group weekly stats by playerId
  const weeksByPlayer = new Map<number, { hundredPlus: number; rnds: number }[]>();
  for (const w of weeklyStats) {
    const arr = weeksByPlayer.get(w.playerId) ?? [];
    arr.push({ hundredPlus: w.hundredPlus, rnds: w.rnds });
    weeksByPlayer.set(w.playerId, arr);
  }

  // Compute hot hand values and override DC-stored ones
  const enrichedRows = rows.map((row) => {
    const div = row.divisionName ?? "";
    const thresholds =
      hhThresholds[div] ?? hhThresholds[""] ?? DEFAULT_HH[div] ?? { hh: 475, roHh: 20 };
    const weeks = weeksByPlayer.get(row.id) ?? [];

    let zeroOneHh: number | null = null;
    let roHh: number | null = null;
    for (const w of weeks) {
      if (w.hundredPlus >= thresholds.hh) {
        zeroOneHh = zeroOneHh === null ? w.hundredPlus : Math.max(zeroOneHh, w.hundredPlus);
      }
      if (w.rnds >= thresholds.roHh) {
        roHh = roHh === null ? w.rnds : Math.max(roHh, w.rnds);
      }
    }

    return { ...row, zeroOneHh, roHh };
  });

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
      </div>

      {allSeasons.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-600 py-16 text-center text-slate-400">
          <p className="text-3xl mb-3 select-none">◎</p>
          <p className="font-medium">No data yet</p>
          <p className="mt-1 text-sm">
            Run a data refresh from the admin panel to load the latest from DartConnect.
          </p>
        </div>
      ) : (
        <>
          <ScoringGuide scoringPts={scoringPts} g3Cfg={g3Config} hhThresholds={hhThresholds} />
          <LeaderboardTable rows={enrichedRows} seasonId={activeId} phase={phase} scoringPts={scoringPts} />
        </>
      )}
    </div>
  );
}
