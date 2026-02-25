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

  // Group by division
  const divisionGroups = new Map<string, TeamEntry[]>();
  for (const team of teamMap.values()) {
    const divKey = team.divisionName ?? "Other";
    if (!divisionGroups.has(divKey)) divisionGroups.set(divKey, []);
    divisionGroups.get(divKey)!.push(team);
  }

  // Sort divisions alphabetically
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

  const [divisionGroups, seasonOptions] = await Promise.all([
    getTeamData(activeId),
    Promise.resolve(allSeasons.map((s) => ({ id: s.id, name: s.name }))),
  ]);

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
        <div className="space-y-10">
          {divisionGroups.map(([divisionName, divTeams]) => (
            <div key={divisionName}>
              {/* Division header */}
              <div className="flex items-center gap-3 mb-4">
                <span className="text-xs font-semibold uppercase tracking-widest text-amber-500">
                  Division {divisionName}
                </span>
                <div className="flex-1 h-px bg-slate-800" />
              </div>

              {/* Team cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {divTeams.map((team) => (
                  <div
                    key={team.teamId}
                    className="rounded-xl border border-slate-800 bg-slate-900 p-5 flex flex-col gap-3"
                  >
                    {/* Team name + meta */}
                    <div>
                      <h2 className="text-base font-semibold text-white leading-snug">
                        {team.teamName}
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Div {team.divisionName ?? "—"}
                        {team.captain && (
                          <>
                            <span className="mx-1.5 text-slate-700">·</span>
                            Captain: {team.captain}
                          </>
                        )}
                      </p>
                    </div>

                    {/* Venue */}
                    {(team.venueName || team.venueAddress || team.venuePhone) && (
                      <div className="text-sm space-y-0.5">
                        {team.venueName && (
                          <p className="text-slate-300 font-medium">{team.venueName}</p>
                        )}
                        {team.venueAddress && (
                          <p className="text-slate-500 text-xs">{team.venueAddress}</p>
                        )}
                        {team.venuePhone && (
                          <p className="text-slate-500 text-xs">
                            <a
                              href={`tel:${team.venuePhone}`}
                              className="hover:text-slate-300 transition-colors"
                            >
                              {team.venuePhone}
                            </a>
                          </p>
                        )}
                      </div>
                    )}

                    {/* Roster */}
                    {team.players.length > 0 && (
                      <div>
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
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
