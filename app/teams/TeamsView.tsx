import { Suspense } from "react";
import Link from "next/link";
import SeasonSelector, { type SeasonOption } from "@/components/SeasonSelector";
import { groupTeamSchedule } from "@/lib/schedule";
import { formatShortDate, formatCaptainName } from "@/lib/format";
import { dcRecapUrl } from "@/lib/dartconnect";
import { getScheduleByTeam, getTeamData } from "./data";

// Shared render for both the bare (static, current-season) page and the
// explicit /teams/[seasonId] (dynamic) page.
export default async function TeamsView({
  basePath,
  allSeasons,
  activeId,
  isActiveSeason,
}: {
  basePath: string;
  allSeasons: { id: number; name: string }[];
  activeId: number | undefined;
  // Whether activeId is the league's current season — when true, the
  // player roster links target the bare, static /players/[id] page
  // instead of the dynamic /players/[id]/[seasonId], so clicking through
  // from the common case doesn't land on a route that has to be dynamic.
  isActiveSeason: boolean;
}) {
  if (!activeId) {
    return (
      <div className="py-16 text-center text-slate-400">
        <p className="font-medium">No season found</p>
        <p className="text-sm mt-1">Run a data refresh to load teams.</p>
      </div>
    );
  }

  const [divisionGroups, scheduleByTeamEntries] = await Promise.all([
    getTeamData(activeId),
    getScheduleByTeam(activeId),
  ]);
  const scheduleByTeam = new Map(scheduleByTeamEntries);

  const seasonOptions: SeasonOption[] = allSeasons.map((s) => ({ id: s.id, name: s.name }));
  const hasAnyTeams = divisionGroups.some(([, ts]) => ts.length > 0);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-8">
      {/* ── Filter bar ── */}
      <div className="flex flex-wrap items-center gap-3">
        <Suspense fallback={null}>
          <SeasonSelector seasons={seasonOptions} currentId={activeId} basePath={basePath} />
        </Suspense>
      </div>

      {!hasAnyTeams ? (
        <div className="rounded-lg border border-dashed border-slate-700 py-16 text-center text-slate-500">
          <p className="text-3xl mb-3 select-none">◎</p>
          <p className="font-medium">No teams found</p>
          <p className="text-sm mt-1">Run a data refresh to load team info.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {divisionGroups.map(([divisionName, divTeams]) => (
            <div key={divisionName} className="rounded-xl border border-slate-800 overflow-hidden">
              {/* Division header */}
              <div className="bg-slate-800/60 px-4 py-2.5 flex items-center gap-2.5">
                <span className="text-xs font-semibold uppercase tracking-widest text-amber-500">
                  Division {divisionName}
                </span>
                <span className="text-xs text-slate-600">— {divTeams.length} teams</span>
              </div>

              {/* Team rows */}
              <div className="divide-y divide-slate-800">
                {divTeams.map((team) => {
                  const teamMatches = scheduleByTeam.get(team.teamId) ?? [];
                  const { past, upcoming } = groupTeamSchedule(teamMatches, today);
                  return (
                    <details key={team.teamId} className="group bg-slate-900">
                      {/* Collapsed summary row */}
                      <summary className="flex items-center px-4 py-3 cursor-pointer hover:bg-slate-800/50 transition-colors list-none [&::-webkit-details-marker]:hidden select-none">
                        <span className="w-4 mr-2 text-[0.6rem] text-slate-600 transition-transform duration-150 group-open:rotate-90 inline-block shrink-0">
                          ▸
                        </span>
                        <div className="flex-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 min-w-0">
                          <span className="font-semibold text-white text-sm">{team.teamName}</span>
                          {team.captain && (
                            <span className="text-xs text-slate-500">Capt. {formatCaptainName(team.captain)}</span>
                          )}
                          {(team.venueName || team.venueAddress) && (
                            <span className="hidden sm:flex items-center gap-1 text-xs text-amber-400">
                              <svg className="shrink-0 text-slate-400" width="9" height="11" viewBox="0 0 24 28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 2C7.58 2 4 5.58 4 10c0 6.5 8 16 8 16s8-9.5 8-16c0-4.42-3.58-8-8-8z"/>
                                <circle cx="12" cy="10" r="3"/>
                              </svg>
                              {team.venueName || team.venueAddress}
                            </span>
                          )}
                        </div>
                        {team.players.length > 0 && (
                          <span className="text-xs text-slate-600 shrink-0 ml-3">
                            {team.players.length} players
                          </span>
                        )}
                      </summary>

                      {/* Expanded content */}
                      <div className="pl-10 pr-4 pb-5 pt-3 border-t border-slate-800/60 space-y-5">
                        {/* Venue details */}
                        {(team.venueName || team.venueAddress) && (
                          <div>
                            <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-slate-600 mb-1.5">Venue</p>
                            {team.venueName && (
                              <p className="text-sm text-amber-400 leading-snug">{team.venueName}</p>
                            )}
                            {team.venueAddress && (
                              <p className={team.venueName ? "text-xs text-slate-500 mt-0.5" : "text-sm text-amber-400 leading-snug"}>{team.venueAddress}</p>
                            )}
                            {team.venuePhone && (
                              <a
                                href={`tel:${team.venuePhone}`}
                                className="text-xs text-slate-500 hover:text-slate-300 transition-colors mt-0.5 block"
                              >
                                {team.venuePhone}
                              </a>
                            )}
                          </div>
                        )}

                        {/* Schedule */}
                        {(past.length > 0 || upcoming.length > 0) && (
                          <div>
                            <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-slate-600 mb-2">Schedule</p>
                            <div className="space-y-3">
                              {/* Upcoming */}
                              {upcoming.length > 0 && (
                                <details className="group/sched" open>
                                  <summary className="flex items-center gap-2 cursor-pointer list-none [&::-webkit-details-marker]:hidden select-none">
                                    <span className="text-[0.6rem] text-slate-600 transition-transform duration-150 group-open/sched:rotate-90 inline-block">▸</span>
                                    <span className="text-xs font-medium text-slate-400">Upcoming ({upcoming.length})</span>
                                  </summary>
                                  <div className="mt-2 rounded-lg border border-slate-800 overflow-hidden">
                                    {upcoming.map((m, i) => {
                                      const isHome = m.homeTeamId === team.teamId;
                                      const opponent = isHome ? m.awayTeamName : m.homeTeamName;
                                      const venue = isHome ? team.venueName : m.homeVenueName;
                                      return (
                                        <div
                                          key={m.id}
                                          className={`flex items-start sm:items-center gap-2 sm:gap-3 px-3 py-2 text-xs sm:text-sm text-slate-300 ${i % 2 === 1 ? "bg-slate-800/30" : ""} ${i > 0 ? "border-t border-slate-800/60" : ""}`}
                                        >
                                          <span className="w-20 sm:w-24 shrink-0 whitespace-nowrap text-slate-500 pt-0.5 sm:pt-0">
                                            {formatShortDate(m.schedDate)}
                                          </span>
                                          <span className={`shrink-0 w-12 sm:w-14 text-center px-1 py-0.5 rounded text-[0.6rem] sm:text-[0.65rem] font-semibold uppercase mt-0.5 sm:mt-0 ${isHome ? "bg-sky-900/50 text-sky-400" : "bg-slate-700/60 text-slate-400"}`}>
                                            {isHome ? "Home" : "Away"}
                                          </span>
                                          <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center">
                                            <span className={`truncate font-medium ${opponent ? "" : "text-slate-600 italic"}`}>{opponent || "BYE"}</span>
                                            {venue && opponent && (
                                              <span className="flex items-center gap-1 text-slate-600 truncate text-[11px] sm:text-xs sm:ml-auto sm:pl-4">
                                                <svg width="8" height="10" viewBox="0 0 24 28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                                                  <path d="M12 2C7.58 2 4 5.58 4 10c0 6.5 8 16 8 16s8-9.5 8-16c0-4.42-3.58-8-8-8z"/>
                                                  <circle cx="12" cy="10" r="3"/>
                                                </svg>
                                                {venue}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </details>
                              )}

                              {/* Past */}
                              {past.length > 0 && (
                                <details className="group/sched">
                                  <summary className="flex items-center gap-2 cursor-pointer list-none [&::-webkit-details-marker]:hidden select-none">
                                    <span className="text-[0.6rem] text-slate-600 transition-transform duration-150 group-open/sched:rotate-90 inline-block">▸</span>
                                    <span className="text-xs font-medium text-slate-400">Past ({past.length})</span>
                                  </summary>
                                  <div className="mt-2 rounded-lg border border-slate-800 overflow-hidden">
                                    {past.map((m, i) => {
                                      const isHome = m.homeTeamId === team.teamId;
                                      const opponent = isHome ? m.awayTeamName : m.homeTeamName;
                                      const teamScore = isHome ? m.homeScore : m.awayScore;
                                      const oppScore = isHome ? m.awayScore : m.homeScore;
                                      const won = teamScore > oppScore;
                                      return (
                                        <div
                                          key={m.id}
                                          className={`flex items-center gap-2 sm:gap-3 px-3 py-2 text-xs sm:text-sm text-slate-400 ${i % 2 === 1 ? "bg-slate-800/30" : ""} ${i > 0 ? "border-t border-slate-800/60" : ""}`}
                                        >
                                          <span className="w-20 sm:w-24 shrink-0 whitespace-nowrap text-slate-500">
                                            {formatShortDate(m.schedDate)}
                                          </span>
                                          <span className={`shrink-0 w-12 sm:w-14 text-center px-1 py-0.5 rounded text-[0.6rem] sm:text-[0.65rem] font-semibold uppercase ${isHome ? "bg-sky-900/50 text-sky-400" : "bg-slate-700/60 text-slate-400"}`}>
                                            {isHome ? "Home" : "Away"}
                                          </span>
                                          <span className={`truncate flex-1 ${opponent ? "" : "text-slate-600 italic"}`}>{opponent || "BYE"}</span>
                                          {opponent && (
                                            <span className={`shrink-0 font-semibold tabular-nums ${won ? "text-emerald-400" : "text-rose-400"}`}>
                                              {teamScore}–{oppScore}
                                            </span>
                                          )}
                                          {m.dcGuid && (
                                            <a
                                              href={dcRecapUrl(m.dcGuid)}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="shrink-0 text-red-700 hover:text-red-500 transition-colors"
                                              title="DC Recap"
                                            >
                                              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                                                <circle cx="12" cy="12" r="10"/>
                                                <circle cx="12" cy="12" r="4" fill="none" stroke="white" strokeWidth="1.5"/>
                                                <line x1="12" y1="2" x2="12" y2="8" stroke="white" strokeWidth="1.5"/>
                                                <line x1="12" y1="16" x2="12" y2="22" stroke="white" strokeWidth="1.5"/>
                                                <line x1="2" y1="12" x2="8" y2="12" stroke="white" strokeWidth="1.5"/>
                                                <line x1="16" y1="12" x2="22" y2="12" stroke="white" strokeWidth="1.5"/>
                                              </svg>
                                            </a>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </details>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Roster */}
                        {team.players.length > 0 && (
                          <div>
                            <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-slate-600 mb-2">Roster</p>
                            <div className="flex flex-wrap gap-1.5">
                              {team.players.map((p) => {
                                const isCaptain =
                                  formatCaptainName(team.captain)?.toLowerCase() === p.name.toLowerCase();
                                return (
                                  <Link
                                    key={p.id}
                                    href={isActiveSeason ? `/players/${p.id}` : `/players/${p.id}/${activeId}`}
                                    prefetch={false}
                                    className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm transition-colors ${
                                      isCaptain
                                        ? "border-amber-700/50 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                                        : "border-slate-700/60 bg-slate-800/50 text-slate-300 hover:border-slate-600 hover:bg-slate-800 hover:text-amber-400"
                                    }`}
                                  >
                                    {isCaptain && (
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="shrink-0">
                                        <path d="M12 2l2.9 6.26 6.9.6-5.2 4.53 1.57 6.75L12 16.9l-6.17 3.24 1.57-6.75-5.2-4.53 6.9-.6z" />
                                      </svg>
                                    )}
                                    {p.name}
                                  </Link>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </details>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
