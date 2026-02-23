import { db, seasons, teams, matches } from "@/lib/db";
import { eq, and, or, gt } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function getActiveSeason() {
  const [s] = await db
    .select()
    .from(seasons)
    .where(eq(seasons.isActive, true))
    .limit(1);
  return s ?? null;
}

async function getStandings(seasonId: number) {
  const [allTeams, allMatches] = await Promise.all([
    db.select().from(teams).where(eq(teams.seasonId, seasonId)),
    db
      .select()
      .from(matches)
      .where(
        and(
          eq(matches.seasonId, seasonId),
          or(eq(matches.status, "C"), gt(matches.homeScore!, 0), gt(matches.awayScore!, 0))
        )
      ),
  ]);

  // Build standings per team — prefer DartConnect-authoritative fields when available
  const stats = new Map<
    number,
    { name: string; divisionName: string | null; wins: number; losses: number; pts: number; usedDC: boolean }
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
    });
  }

  // For teams without DC data, compute W/L/Pts from match records
  for (const m of allMatches) {
    const hs = m.homeScore ?? 0;
    const as_ = m.awayScore ?? 0;
    if (hs + as_ === 0) continue;

    const home = m.homeTeamId ? stats.get(m.homeTeamId) : null;
    const away = m.awayTeamId ? stats.get(m.awayTeamId) : null;

    // divisionName always comes from matches regardless of DC data source
    if (home) home.divisionName = home.divisionName ?? m.divisionName;
    if (away) away.divisionName = away.divisionName ?? m.divisionName;

    if (home && !home.usedDC) {
      home.pts += hs;
      if (hs > as_) home.wins++;
      else home.losses++;
    }
    if (away && !away.usedDC) {
      away.pts += as_;
      if (as_ > hs) away.wins++;
      else away.losses++;
    }
  }

  // For teams that still have no divisionName (no played matches yet), fall back to a match lookup
  for (const t of allTeams) {
    const s = stats.get(t.id);
    if (s && !s.divisionName) {
      const match = allMatches.find(
        (m) => m.homeTeamId === t.id || m.awayTeamId === t.id
      );
      s.divisionName = match?.divisionName ?? null;
    }
  }

  // Group by division
  const byDiv = new Map<string, (typeof stats extends Map<number, infer V> ? V & { id: number } : never)[]>();
  for (const [id, s] of stats) {
    const div = s.divisionName ?? "Other";
    if (!byDiv.has(div)) byDiv.set(div, []);
    byDiv.get(div)!.push({ ...s, id });
  }

  // Sort each division by wins desc, pts desc, losses asc
  for (const [, rows] of byDiv) {
    rows.sort((a, b) => b.wins - a.wins || b.pts - a.pts || a.losses - b.losses);
  }

  // Sort divisions alphabetically
  return Array.from(byDiv.entries()).sort(([a], [b]) => a.localeCompare(b));
}

export default async function StandingsPage() {
  const season = await getActiveSeason();

  if (!season) {
    return (
      <div className="py-16 text-center text-slate-400">
        <p className="font-medium">No active season found</p>
        <p className="text-sm mt-1">Run a data refresh to load standings.</p>
      </div>
    );
  }

  const divisions = await getStandings(season.id);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-100">Team Standings — {season.name}</h2>
      </div>

      {divisions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-700 py-16 text-center text-slate-500">
          <p className="font-medium">No standings data yet</p>
          <p className="text-sm mt-1">Results will appear here as matches are played.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {divisions.map(([divName, rows]) => (
            <div key={divName} className="rounded-lg border border-slate-800 overflow-hidden shadow-xl">
              <div className="bg-slate-800/80 px-4 py-2.5 border-b border-slate-700">
                <span className="text-sm font-semibold text-slate-200">Division {divName}</span>
              </div>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-900 border-b border-slate-700/60">
                    <th className="px-4 py-2 text-left text-[0.65rem] uppercase tracking-wider text-slate-500 font-medium w-8">#</th>
                    <th className="px-4 py-2 text-left text-[0.65rem] uppercase tracking-wider text-slate-500 font-medium">Team</th>
                    <th className="px-4 py-2 text-center text-[0.65rem] uppercase tracking-wider text-slate-500 font-medium w-12">W</th>
                    <th className="px-4 py-2 text-center text-[0.65rem] uppercase tracking-wider text-slate-500 font-medium w-12">L</th>
                    <th className="px-4 py-2 text-center text-[0.65rem] uppercase tracking-wider text-slate-500 font-medium w-16">Pct</th>
                    <th className="px-4 py-2 text-center text-[0.65rem] uppercase tracking-wider text-amber-600 font-medium w-16">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const total = row.wins + row.losses;
                    const pct = total > 0 ? (row.wins / total).toFixed(3) : "—";
                    const isTop = i === 0 && row.wins > 0;
                    return (
                      <tr
                        key={row.id}
                        className={`border-t border-slate-800 transition-colors hover:bg-amber-500/5 ${
                          i % 2 === 0 ? "bg-slate-900" : "bg-slate-900/60"
                        }`}
                      >
                        <td className="px-4 py-2.5 text-slate-600 text-xs tabular-nums">{i + 1}</td>
                        <td className={`px-4 py-2.5 font-medium ${isTop ? "text-amber-400" : "text-slate-200"}`}>
                          {row.name}
                          {isTop && (
                            <span className="ml-2 text-[0.6rem] uppercase tracking-wider text-amber-600 font-semibold">
                              LEAD
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-center text-slate-200 tabular-nums font-semibold">{row.wins}</td>
                        <td className="px-4 py-2.5 text-center text-slate-400 tabular-nums">{row.losses}</td>
                        <td className="px-4 py-2.5 text-center text-slate-400 tabular-nums">{pct}</td>
                        <td className="px-4 py-2.5 text-center text-amber-400 tabular-nums font-semibold">{row.pts}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
