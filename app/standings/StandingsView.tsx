import { Suspense } from "react";
import SeasonSelector, { type SeasonOption } from "@/components/SeasonSelector";
import DivisionSelector from "@/components/DivisionSelector";
import { formatShortDate } from "@/lib/format";
import { dcRecapUrl } from "@/lib/dartconnect";
import { getDivisionsForSeason, getStandings } from "./data";

// Shared render for both the bare (static, current-season) page and the
// explicit /standings/[seasonId] (dynamic) page.
export default async function StandingsView({
  basePath,
  allSeasons,
  activeId,
  divisionFilter,
}: {
  basePath: string;
  allSeasons: { id: number; name: string }[];
  activeId: number | undefined;
  divisionFilter: string | null;
}) {
  if (!activeId) {
    return (
      <div className="py-16 text-center text-slate-400">
        <p className="font-medium">No season found</p>
        <p className="text-sm mt-1">Run a data refresh to load standings.</p>
      </div>
    );
  }

  const [standingsData, divisionList] = await Promise.all([
    getStandings(activeId, divisionFilter),
    getDivisionsForSeason(activeId),
  ]);

  const seasonOptions: SeasonOption[] = allSeasons.map((s) => ({ id: s.id, name: s.name }));
  const activeSeason = allSeasons.find((s) => s.id === activeId);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold text-slate-100">
          Team Standings — {activeSeason?.name}
        </h2>
        <Suspense fallback={null}>
          <SeasonSelector seasons={seasonOptions} currentId={activeId} basePath={basePath} />
        </Suspense>
        {divisionList.length > 1 && (
          <Suspense fallback={null}>
            <DivisionSelector divisions={divisionList} current={divisionFilter ?? "all"} basePath={basePath} seasonId={activeId} />
          </Suspense>
        )}
      </div>

      {standingsData.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-700 py-16 text-center text-slate-500">
          <p className="text-3xl mb-3 select-none">◎</p>
          <p className="font-medium">No standings data yet</p>
          <p className="text-sm mt-1">Results will appear here as matches are played.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {standingsData.map(([divName, rows]) => (
            <div key={divName} className="rounded-lg border border-slate-800 overflow-hidden shadow-xl">
              {/* Division header */}
              <div className="bg-slate-800/80 px-4 py-2.5 border-b border-slate-700">
                <span className="text-sm font-semibold text-slate-200">Division {divName}</span>
              </div>

              {/* Column headers */}
              <div className="flex items-center px-4 py-2 bg-slate-900 border-b border-slate-700/60 text-[0.65rem] uppercase tracking-wider text-slate-500 font-medium">
                <div className="w-4 mr-2" />
                <div className="w-6">#</div>
                <div className="flex-1">Team</div>
                <div className="w-12 text-center">W</div>
                <div className="w-12 text-center">L</div>
                <div className="hidden sm:block w-16 text-center">Pct</div>
                <div className="hidden sm:block w-16 text-center text-emerald-600">MPR</div>
                <div className="hidden sm:block w-16 text-center text-sky-600">3DA</div>
                <div className="w-16 text-center text-amber-600">Pts</div>
              </div>

              {/* Team rows */}
              {rows.map((row, i) => {
                const total = row.wins + row.losses;
                const pct = total > 0 ? (row.wins / total).toFixed(3) : "—";
                const isTop = i === 0 && row.wins > 0;
                return (
                  <details
                    key={row.id}
                    className={`group border-t border-slate-800 ${
                      i % 2 === 0 ? "bg-slate-900" : "bg-slate-900/60"
                    }`}
                  >
                    <summary className="flex items-center px-4 py-2.5 cursor-pointer hover:bg-amber-500/5 transition-colors list-none [&::-webkit-details-marker]:hidden select-none">
                      <span className="w-4 mr-2 text-[0.6rem] text-slate-600 transition-transform duration-150 group-open:rotate-90 inline-block">
                        ▸
                      </span>
                      <span className="w-6 text-xs text-slate-600 tabular-nums">{i + 1}</span>
                      <span className={`flex-1 text-sm font-medium ${isTop ? "text-amber-400" : "text-slate-200"}`}>
                        {row.name}
                        {isTop && (
                          <span className="ml-2 text-[0.6rem] uppercase tracking-wider text-amber-600 font-semibold">
                            LEAD
                          </span>
                        )}
                      </span>
                      <span className="w-12 text-center text-sm text-slate-200 tabular-nums font-semibold">{row.wins}</span>
                      <span className="w-12 text-center text-sm text-slate-400 tabular-nums">{row.losses}</span>
                      <span className="hidden sm:inline-block w-16 text-center text-sm text-slate-400 tabular-nums">{pct}</span>
                      <span className="hidden sm:inline-block w-16 text-center text-sm text-emerald-400 tabular-nums">{row.mpr != null ? row.mpr.toFixed(2) : "—"}</span>
                      <span className="hidden sm:inline-block w-16 text-center text-sm text-sky-400 tabular-nums">{row.ppr != null ? row.ppr.toFixed(2) : "—"}</span>
                      <span className="w-16 text-center text-sm text-amber-400 tabular-nums font-semibold">{row.pts}</span>
                    </summary>

                    {/* Expanded match rows */}
                    {row.matchRows.length > 0 && (
                      <div className="border-t border-slate-800/50 bg-slate-950/50">
                        <div className="flex items-center pl-8 pr-4 py-1.5 text-xs uppercase tracking-wider text-slate-600 border-b border-slate-800/40 gap-4">
                          <div className="w-24 shrink-0">Date</div>
                          <div className="flex-1 sm:w-48 sm:flex-none">Opponent</div>
                          <div className="hidden sm:block w-16 text-center text-emerald-700">MPR</div>
                          <div className="hidden sm:block w-16 text-center text-sky-700">3DA</div>
                          <div className="shrink-0">Result</div>
                        </div>
                        {row.matchRows.map((m, mi) => {
                          const won = m.teamScore > m.opponentScore;
                          return (
                            <div
                              key={mi}
                              className="flex items-center pl-8 pr-4 py-2 border-t border-slate-800/30 hover:bg-slate-800/30 transition-colors gap-4"
                            >
                              <span className="w-24 shrink-0 text-sm text-slate-500 tabular-nums whitespace-nowrap">
                                {formatShortDate(m.schedDate) || "—"}
                              </span>
                              <span className={`flex-1 sm:w-48 sm:flex-none min-w-0 text-sm truncate ${m.isBye ? "text-slate-600 italic" : "text-slate-300"}`}>{m.opponent}</span>
                              <span className="hidden sm:block w-16 text-center text-sm text-emerald-400 tabular-nums">{m.weekMpr != null ? m.weekMpr.toFixed(2) : "—"}</span>
                              <span className="hidden sm:block w-16 text-center text-sm text-sky-400 tabular-nums">{m.weekPpr != null ? m.weekPpr.toFixed(2) : "—"}</span>
                              <div className="flex items-center gap-2 shrink-0">
                                {m.isBye ? (
                                  <span className="inline-flex items-center justify-center gap-1 px-2 py-0.5 rounded text-xs font-semibold tabular-nums min-w-[3.5rem] bg-slate-800 text-slate-500">
                                    BYE
                                  </span>
                                ) : (
                                  <span className={`inline-flex items-center justify-center gap-1 px-2 py-0.5 rounded text-xs font-semibold tabular-nums min-w-[3.5rem] ${
                                    won ? "bg-emerald-900/40 text-emerald-300" : "bg-rose-900/40 text-rose-300"
                                  }`}>
                                    {won ? "W" : "L"} {m.teamScore}–{m.opponentScore}
                                  </span>
                                )}
                                {m.dcGuid && (
                                  <a
                                    href={dcRecapUrl(m.dcGuid)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label="View on DartConnect"
                                    className="text-red-700 hover:text-red-500 transition-colors"
                                  >
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                      <circle cx="12" cy="12" r="10"/>
                                      <circle cx="12" cy="12" r="5"/>
                                      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>
                                    </svg>
                                  </a>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </details>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
