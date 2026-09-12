import { Suspense } from "react";
import LeaderboardTable from "@/components/LeaderboardTable";
import SeasonSelector, { type SeasonOption } from "@/components/SeasonSelector";
import DivisionSelector from "@/components/DivisionSelector";
import PhaseSelector from "@/components/PhaseSelector";
import ScoringGuide from "@/components/ScoringGuide";
import {
  DEFAULT_HH,
  getDivisionsForSeason,
  getG3Config,
  getHhThresholds,
  getLastScraped,
  getLeaderboard,
  getScoringPts,
  getWeeklyStats,
  hasPostseason,
} from "./data";

// Shared render for both the bare (static, current-season) page and the
// explicit /leaderboard/[seasonId] (dynamic) page — this is where all the
// data-fetching and JSX actually lives, parameterized by plain values so
// neither page reads searchParams itself.
export default async function LeaderboardView({
  basePath,
  allSeasons,
  activeId,
  divisionFilter,
  phase,
  isActiveSeason,
}: {
  basePath: string;
  allSeasons: { id: number; name: string; isActive: boolean }[];
  activeId: number | undefined;
  divisionFilter: string | null;
  phase: string;
  // Whether (activeId, phase) is the default view — when true, player
  // row links target the bare, static /players/[id] page instead of the
  // dynamic /players/[id]/[seasonId].
  isActiveSeason: boolean;
}) {
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

  const seasonOptions: SeasonOption[] = allSeasons.map((s) => ({ id: s.id, name: s.name }));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold text-slate-100">Player Leaderboard</h2>
          <Suspense fallback={null}>
            <SeasonSelector seasons={seasonOptions} currentId={activeId ?? null} basePath={basePath} />
          </Suspense>
          {divisionList.length > 1 && activeId != null && (
            <Suspense fallback={null}>
              <DivisionSelector divisions={divisionList} current={divisionFilter ?? "all"} basePath={basePath} seasonId={activeId} />
            </Suspense>
          )}
          {postExists && activeId != null && (
            <Suspense fallback={null}>
              <PhaseSelector current={phase} basePath={basePath} seasonId={activeId} />
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
            }).format(new Date(lastScraped))}{" "}
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
          <LeaderboardTable rows={enrichedRows} seasonId={activeId} phase={phase} scoringPts={scoringPts} isActiveSeason={isActiveSeason} />
        </>
      )}
    </div>
  );
}
