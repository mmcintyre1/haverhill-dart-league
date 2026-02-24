import { Suspense } from "react";
import { db, seasons, matches } from "@/lib/db";
import { divisions } from "@/lib/db/schema";
import { eq, asc, desc } from "drizzle-orm";
import SeasonSelector from "@/components/SeasonSelector";
import DivisionSelector from "@/components/DivisionSelector";

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

async function getAllMatches(seasonId: number) {
  return db
    .select()
    .from(matches)
    .where(eq(matches.seasonId, seasonId))
    .orderBy(asc(matches.roundSeq), asc(matches.schedDate), asc(matches.schedTime));
}

function formatTime(t: string | null) {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

function groupByRound<T extends { roundSeq: number | null; schedDate: string | null }>(items: T[]) {
  const map = new Map<string, { round: number | null; matches: T[] }>();
  for (const m of items) {
    // Key by roundSeq when present; fall back to schedDate for history-sourced rows
    const key = m.roundSeq != null ? `r:${m.roundSeq}` : `d:${m.schedDate ?? ""}`;
    if (!map.has(key)) map.set(key, { round: m.roundSeq, matches: [] });
    map.get(key)!.matches.push(m);
  }
  return Array.from(map.values());
}

export default async function MatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string; division?: string }>;
}) {
  const params = await searchParams;
  const allSeasons = await getSeasons();

  const activeId =
    params.season
      ? parseInt(params.season)
      : allSeasons.find((s) => s.isActive)?.id ?? allSeasons[0]?.id;

  const divisionFilter = params.division ?? null;

  if (!activeId) {
    return (
      <div className="py-16 text-center text-slate-400">
        <p className="font-medium">No season found</p>
        <p className="text-sm mt-1">Run a data refresh to load matches.</p>
      </div>
    );
  }

  const [allMatches, divisionList] = await Promise.all([
    getAllMatches(activeId),
    getDivisionsForSeason(activeId),
  ]);

  const filtered = divisionFilter
    ? allMatches.filter((m) => m.divisionName === divisionFilter)
    : allMatches;

  // Treat a match as completed if: status=C, or has non-zero scores,
  // or its scheduled date is in the past (handles unscored played rounds).
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const completed = filtered.filter(
    (m) =>
      m.status === "C" ||
      (m.homeScore ?? 0) + (m.awayScore ?? 0) > 0 ||
      (m.schedDate != null && new Date(m.schedDate) < today)
  );
  const pending = filtered.filter(
    (m) =>
      m.status !== "C" &&
      (m.homeScore ?? 0) + (m.awayScore ?? 0) === 0 &&
      (m.schedDate == null || new Date(m.schedDate) >= today)
  );

  const upcomingRounds = groupByRound(pending).sort((a, b) =>
    (a.matches[0]?.schedDate ?? "").localeCompare(b.matches[0]?.schedDate ?? "")
  );
  const resultsRounds = groupByRound(completed).sort((a, b) =>
    (b.matches[0]?.schedDate ?? "").localeCompare(a.matches[0]?.schedDate ?? "")
  );

  const seasonOptions = allSeasons.map((s) => ({ id: s.id, name: s.name }));
  const activeSeason = allSeasons.find((s) => s.id === activeId);

  return (
    <div className="space-y-10">
      {/* ── Filter bar ── */}
      <div className="flex flex-wrap items-center gap-3">
        <Suspense fallback={null}>
          <SeasonSelector seasons={seasonOptions} currentId={activeId} />
        </Suspense>
        {divisionList.length > 1 && (
          <Suspense fallback={null}>
            <DivisionSelector divisions={divisionList} current={divisionFilter ?? "all"} />
          </Suspense>
        )}
      </div>

      {/* ── Upcoming ── */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100">
            Upcoming — {activeSeason?.name}
          </h2>
          <span className="text-sm text-slate-400">{pending.length} matches remaining</span>
        </div>

        {upcomingRounds.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-700 py-10 text-center text-slate-500">
            <p className="font-medium">No upcoming matches.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {upcomingRounds.map(({ round, matches: ms }) => {
              const first = ms[0];
              const dateStr = first?.prettyDate ?? first?.schedDate ?? "";
              const timeStr = formatTime(first?.schedTime ?? null);
              const label = round != null ? `Week ${round} — ${dateStr}` : dateStr;
              return (
                <div key={round ?? dateStr} className="rounded-lg border border-slate-700 overflow-hidden shadow-lg">
                  <div className="bg-slate-800 px-4 py-2 flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-200">
                      {label}
                    </span>
                    {timeStr && <span className="text-xs text-slate-400">{timeStr}</span>}
                  </div>
                  <table className="w-full table-fixed text-sm border-collapse">
                    <colgroup>
                      <col className="w-12" />
                      <col className="w-[43%]" />
                      <col className="w-8" />
                      <col className="w-[43%]" />
                    </colgroup>
                    <tbody>
                      {ms.map((m) => (
                        <tr
                          key={m.id}
                          className="border-t border-slate-700/50 bg-slate-900 hover:bg-slate-800/60 transition-colors"
                        >
                          <td className="px-3 py-2.5 text-xs text-slate-500 truncate">
                            {m.divisionName ?? ""}
                          </td>
                          <td className="px-3 py-2.5 font-medium text-slate-200 text-right truncate">
                            {m.awayTeamName}
                          </td>
                          <td className="py-2.5 text-center text-slate-500 text-xs font-semibold">
                            @
                          </td>
                          <td className="px-3 py-2.5 font-medium text-slate-200 truncate">
                            {m.homeTeamName}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Divider ── */}
      {resultsRounds.length > 0 && (
        <div className="flex items-center gap-4">
          <div className="flex-1 h-px bg-slate-800" />
          <span className="text-xs uppercase tracking-widest text-slate-600 shrink-0">Results</span>
          <div className="flex-1 h-px bg-slate-800" />
        </div>
      )}

      {/* ── Results ── */}
      {resultsRounds.length > 0 && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-100">
              Results — {activeSeason?.name}
            </h2>
            <span className="text-sm text-slate-400">{completed.length} matches played</span>
          </div>

          <div className="space-y-4">
            {resultsRounds.map(({ round, matches: ms }) => {
              const first = ms[0];
              const dateStr = first?.prettyDate ?? first?.schedDate ?? "";
              const label = round != null ? `Week ${round} — ${dateStr}` : dateStr;
              return (
                <div key={round ?? dateStr} className="rounded-lg border border-slate-700 overflow-hidden shadow-lg">
                  <div className="bg-slate-800 px-4 py-2">
                    <span className="text-sm font-semibold text-slate-200">
                      {label}
                    </span>
                  </div>
                  <table className="w-full table-fixed text-sm border-collapse">
                    <colgroup>
                      <col className="w-12" />
                      <col className="w-[40%]" />
                      <col className="w-24" />
                      <col className="w-[40%]" />
                    </colgroup>
                    <tbody>
                      {ms.map((m) => {
                        const hs = m.homeScore ?? 0;
                        const as_ = m.awayScore ?? 0;
                        const scored = hs + as_ > 0;
                        const hw = hs > as_;
                        const aw = as_ > hs;
                        return (
                          <tr
                            key={m.id}
                            className="border-t border-slate-700/50 bg-slate-900 hover:bg-slate-800/60 transition-colors"
                          >
                            <td className="px-3 py-2.5 text-xs text-slate-500 truncate">
                              {m.divisionName ?? ""}
                            </td>
                            <td
                              className={`px-3 py-2.5 text-right truncate ${
                                hw ? "text-white font-semibold" : "text-slate-400"
                              }`}
                            >
                              {m.homeTeamName}
                            </td>
                            <td className="py-2.5 text-center">
                              {scored ? (
                                <span className="font-bold tabular-nums text-slate-200">
                                  {hs} – {as_}
                                </span>
                              ) : (
                                <span className="text-slate-600 text-xs">—</span>
                              )}
                            </td>
                            <td
                              className={`px-3 py-2.5 truncate ${
                                aw ? "text-white font-semibold" : "text-slate-400"
                              }`}
                            >
                              {m.awayTeamName}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
