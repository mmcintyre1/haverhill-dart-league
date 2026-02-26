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
                  <div key={team.teamId} className="px-4 py-4 bg-slate-900">
                    <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-6">

                      {/* Team name + captain */}
                      <div className="sm:w-48 shrink-0">
                        <p className="font-semibold text-white text-sm leading-snug">
                          {team.teamName}
                        </p>
                        {team.captain && (
                          <p className="text-xs text-slate-500 mt-0.5">
                            Capt. {team.captain}
                          </p>
                        )}
                      </div>

                      {/* Venue */}
                      <div className="sm:w-60 shrink-0">
                        {team.venueName ? (
                          <>
                            <p className="text-sm text-slate-300 leading-snug">{team.venueName}</p>
                            {team.venueAddress && (
                              <p className="text-xs text-slate-500 mt-0.5 leading-snug">
                                {team.venueAddress}
                              </p>
                            )}
                            {team.venuePhone && (
                              <a
                                href={`tel:${team.venuePhone}`}
                                className="text-xs text-slate-500 hover:text-slate-300 transition-colors mt-0.5 block"
                              >
                                {team.venuePhone}
                              </a>
                            )}
                          </>
                        ) : (
                          <p className="text-xs text-slate-700 italic">No venue on file</p>
                        )}
                      </div>

                      {/* Roster */}
                      {team.players.length > 0 && (
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                            Roster
                          </p>
                          <p className="text-sm text-slate-400 leading-relaxed">
                            {team.players.map((p, i) => (
                              <span key={p.id}>
                                <Link
                                  href={`/players/${p.id}?season=${activeId}`}
                                  className="hover:text-amber-400 transition-colors"
                                >
                                  {p.name}
                                </Link>
                                {i < team.players.length - 1 && (
                                  <span className="mx-1 text-slate-700">·</span>
                                )}
                              </span>
                            ))}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
