import { Suspense } from "react";
import Link from "next/link";
import { db, seasons, teams, divisions, players, playerSeasonTeams } from "@/lib/db";
import { eq, asc, desc } from "drizzle-orm";
import SeasonSelector from "@/components/SeasonSelector";

export const dynamic = "force-dynamic";

async function getSeasons() {
  return db.select().from(seasons).orderBy(desc(seasons.startDate));
}

async function getTeamData(seasonId: number) {
  const rows = await db
    .select({
      teamId: teams.id,
      teamName: teams.name,
      divisionName: divisions.name,
      captain: teams.captainName,
      venueName: teams.venueName,
      venueAddress: teams.venueAddress,
      venuePhone: teams.venuePhone,
      playerId: players.id,
      playerName: players.name,
    })
    .from(teams)
    .leftJoin(divisions, eq(teams.divisionId, divisions.id))
    .leftJoin(playerSeasonTeams, eq(playerSeasonTeams.teamId, teams.id))
    .leftJoin(players, eq(playerSeasonTeams.playerId, players.id))
    .where(eq(teams.seasonId, seasonId))
    .orderBy(asc(divisions.name), asc(teams.name), asc(players.name));

  type TeamEntry = {
    teamId: number;
    teamName: string;
    divisionName: string | null;
    captain: string | null;
    venueName: string | null;
    venueAddress: string | null;
    venuePhone: string | null;
    players: Array<{ id: number; name: string }>;
  };

  const teamMap = new Map<number, TeamEntry>();

  for (const row of rows) {
    if (!teamMap.has(row.teamId)) {
      teamMap.set(row.teamId, {
        teamId: row.teamId,
        teamName: row.teamName,
        divisionName: row.divisionName ?? null,
        captain: row.captain ?? null,
        venueName: row.venueName ?? null,
        venueAddress: row.venueAddress ?? null,
        venuePhone: row.venuePhone ?? null,
        players: [],
      });
    }
    if (row.playerId && row.playerName) {
      teamMap.get(row.teamId)!.players.push({ id: row.playerId, name: row.playerName });
    }
  }

  const divisionGroups = new Map<string, TeamEntry[]>();
  for (const team of teamMap.values()) {
    const divKey = team.divisionName ?? "Other";
    if (!divisionGroups.has(divKey)) divisionGroups.set(divKey, []);
    divisionGroups.get(divKey)!.push(team);
  }

  return Array.from(divisionGroups.entries()).sort(([a], [b]) => a.localeCompare(b));
}

export default async function TeamsPage({
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

  if (!activeId) {
    return (
      <div className="py-16 text-center text-slate-400">
        <p className="font-medium">No season found</p>
        <p className="text-sm mt-1">Run a data refresh to load teams.</p>
      </div>
    );
  }

  const divisionGroups = await getTeamData(activeId);
  const seasonOptions = allSeasons.map((s) => ({ id: s.id, name: s.name }));
  const hasAnyTeams = divisionGroups.some(([, ts]) => ts.length > 0);

  return (
    <div className="space-y-8">
      {/* ── Filter bar ── */}
      <div className="flex flex-wrap items-center gap-3">
        <Suspense fallback={null}>
          <SeasonSelector seasons={seasonOptions} currentId={activeId} />
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
                {divTeams.map((team) => (
                  <details key={team.teamId} className="group bg-slate-900">
                    {/* Collapsed summary row */}
                    <summary className="flex items-center px-4 py-3 cursor-pointer hover:bg-slate-800/50 transition-colors list-none [&::-webkit-details-marker]:hidden select-none">
                      <span className="w-4 mr-2 text-[0.6rem] text-slate-600 transition-transform duration-150 group-open:rotate-90 inline-block shrink-0">
                        ▸
                      </span>
                      <div className="flex-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 min-w-0">
                        <span className="font-semibold text-white text-sm">{team.teamName}</span>
                        {team.captain && (
                          <span className="text-xs text-slate-500">Capt. {team.captain}</span>
                        )}
                        {team.venueName && (
                          <span className="hidden sm:flex items-center gap-1 text-xs text-amber-400">
                            <svg className="shrink-0 text-slate-400" width="9" height="11" viewBox="0 0 24 28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 2C7.58 2 4 5.58 4 10c0 6.5 8 16 8 16s8-9.5 8-16c0-4.42-3.58-8-8-8z"/>
                              <circle cx="12" cy="10" r="3"/>
                            </svg>
                            {team.venueName}
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
                    <div className="pl-10 pr-4 pb-5 pt-3 border-t border-slate-800/60 space-y-4">
                      {/* Venue details */}
                      {team.venueName && (
                        <div>
                          <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-slate-600 mb-1.5">Venue</p>
                          <p className="text-sm text-amber-400 leading-snug">{team.venueName}</p>
                          {team.venueAddress && (
                            <p className="text-xs text-slate-500 mt-0.5">{team.venueAddress}</p>
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

                      {/* Roster grid */}
                      {team.players.length > 0 && (
                        <div>
                          <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-slate-600 mb-2">Roster</p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-1.5">
                            {team.players.map((p) => (
                              <Link
                                key={p.id}
                                href={`/players/${p.id}?season=${activeId}`}
                                className="text-sm text-slate-300 hover:text-amber-400 transition-colors truncate"
                              >
                                {p.name}
                              </Link>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </details>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
