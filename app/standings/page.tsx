import { Suspense } from "react";
import { db, seasons, teams, matches } from "@/lib/db";
import { divisions } from "@/lib/db/schema";
import { eq, and, or, gt, desc, asc } from "drizzle-orm";
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

type MatchRow = {
  weekLabel: string;
  opponent: string;
  teamScore: number;
  opponentScore: number;
  dcGuid: string | null;
};

async function getStandings(seasonId: number, divisionFilter: string | null) {
  const [allTeams, allMatches, allDivisions] = await Promise.all([
    db.select().from(teams).where(eq(teams.seasonId, seasonId)),
    db
      .select()
      .from(matches)
      .where(
        and(
          eq(matches.seasonId, seasonId),
          or(eq(matches.status, "C"), gt(matches.homeScore!, 0), gt(matches.awayScore!, 0))
        )
      )
      .orderBy(asc(matches.schedDate)),
    db.select().from(divisions).where(eq(divisions.seasonId, seasonId)),
  ]);

  const divNameById = new Map(allDivisions.map((d) => [d.id, d.name]));

  const stats = new Map<
    number,
    {
      name: string;
      divisionName: string | null;
      wins: number;
      losses: number;
      pts: number;
      usedDC: boolean;
      matchRows: MatchRow[];
    }
  >();

  for (const t of allTeams) {
    const hasDC = t.dcWins != null && t.dcLosses != null;
    stats.set(t.id, {
      name: t.name,
      divisionName: null,
      wins: hasDC ? t.dcWins! : 0,
      losses: hasDC ? t.dcLosses! : 0,
      pts: hasDC && t.dcLeaguePoints != null ? t.dcLeaguePoints : 0,
      usedDC: hasDC,
      matchRows: [],
    });
  }

  for (const m of allMatches) {
    const hs = m.homeScore ?? 0;
    const as_ = m.awayScore ?? 0;
    if (hs + as_ === 0) continue;

    const home = m.homeTeamId ? stats.get(m.homeTeamId) : null;
    const away = m.awayTeamId ? stats.get(m.awayTeamId) : null;

    if (home) home.divisionName = home.divisionName ?? m.divisionName;
    if (away) away.divisionName = away.divisionName ?? m.divisionName;

    const weekLabel = m.prettyDate ?? m.schedDate ?? "";

    if (home) {
      home.matchRows.push({
        weekLabel,
        opponent: m.awayTeamName ?? "Unknown",
        teamScore: hs,
        opponentScore: as_,
        dcGuid: m.dcGuid ?? null,
      });
      if (!home.usedDC) {
        home.pts += hs;
        if (hs > as_) home.wins++;
        else home.losses++;
      }
    }
    if (away) {
      away.matchRows.push({
        weekLabel,
        opponent: m.homeTeamName ?? "Unknown",
        teamScore: as_,
        opponentScore: hs,
        dcGuid: m.dcGuid ?? null,
      });
      if (!away.usedDC) {
        away.pts += as_;
        if (as_ > hs) away.wins++;
        else away.losses++;
      }
    }
  }

  // Fallback divisionName for teams that had no completed matches
  for (const t of allTeams) {
    const s = stats.get(t.id);
    if (s && !s.divisionName) {
      const match = allMatches.find(
        (m) => m.homeTeamId === t.id || m.awayTeamId === t.id
      );
      s.divisionName = match?.divisionName
        ?? (t.divisionId != null ? (divNameById.get(t.divisionId) ?? null) : null);
    }
  }

  const byDiv = new Map<string, (typeof stats extends Map<number, infer V> ? V & { id: number } : never)[]>();
  for (const [id, s] of stats) {
    const div = s.divisionName ?? "Other";
    if (divisionFilter && div !== divisionFilter) continue;
    if (!byDiv.has(div)) byDiv.set(div, []);
    byDiv.get(div)!.push({ ...s, id });
  }

  for (const [, rows] of byDiv) {
    rows.sort((a, b) => b.pts - a.pts || b.wins - a.wins || a.losses - b.losses);
  }

  return Array.from(byDiv.entries()).sort(([a], [b]) => a.localeCompare(b));
}

export default async function StandingsPage({
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
        <p className="text-sm mt-1">Run a data refresh to load standings.</p>
      </div>
    );
  }

  const [standingsData, divisionList] = await Promise.all([
    getStandings(activeId, divisionFilter),
    getDivisionsForSeason(activeId),
  ]);

  const seasonOptions = allSeasons.map((s) => ({ id: s.id, name: s.name }));
  const activeSeason = allSeasons.find((s) => s.id === activeId);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold text-slate-100">
          Team Standings — {activeSeason?.name}
        </h2>
        <Suspense fallback={null}>
          <SeasonSelector seasons={seasonOptions} currentId={activeId} />
        </Suspense>
        {divisionList.length > 1 && (
          <Suspense fallback={null}>
            <DivisionSelector divisions={divisionList} current={divisionFilter ?? "all"} />
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
                <div className="w-6 mr-2" />
                <div className="w-6">#</div>
                <div className="flex-1">Team</div>
                <div className="w-12 text-center">W</div>
                <div className="w-12 text-center">L</div>
                <div className="w-16 text-center">Pct</div>
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
                      <span className="w-16 text-center text-sm text-slate-400 tabular-nums">{pct}</span>
                      <span className="w-16 text-center text-sm text-amber-400 tabular-nums font-semibold">{row.pts}</span>
                    </summary>

                    {/* Expanded match rows */}
                    {row.matchRows.length > 0 && (
                      <div className="border-t border-slate-800/50 bg-slate-950/50">
                        <div className="flex items-center pl-12 pr-4 py-1.5 text-[0.6rem] uppercase tracking-wider text-slate-600 border-b border-slate-800/40 gap-4">
                          <div className="w-24 shrink-0">Date</div>
                          <div className="flex-1 max-w-[200px]">Opponent</div>
                          <div className="shrink-0">Result</div>
                        </div>
                        {row.matchRows.map((m, mi) => {
                          const won = m.teamScore > m.opponentScore;
                          return (
                            <div
                              key={mi}
                              className="flex items-center pl-12 pr-4 py-1.5 border-t border-slate-800/30 hover:bg-slate-800/30 transition-colors gap-4"
                            >
                              <span className="w-24 shrink-0 text-xs text-slate-500 tabular-nums">{m.weekLabel || "—"}</span>
                              <span className="flex-1 max-w-[200px] text-xs text-slate-300 truncate">{m.opponent}</span>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[0.65rem] font-semibold tabular-nums ${
                                  won ? "bg-emerald-900/40 text-emerald-300" : "bg-rose-900/40 text-rose-300"
                                }`}>
                                  {won ? "W" : "L"} {m.teamScore}–{m.opponentScore}
                                </span>
                                {m.dcGuid && (
                                  <a
                                    href={`https://recap.dartconnect.com/games/${m.dcGuid}`}
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
