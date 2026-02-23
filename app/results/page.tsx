import { db, seasons, matches } from "@/lib/db";
import { eq, desc, asc } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function getResults(seasonId: number) {
  return db
    .select()
    .from(matches)
    .where(eq(matches.seasonId, seasonId))
    .orderBy(desc(matches.roundSeq), asc(matches.schedDate));
}

async function getActiveSeason() {
  const [s] = await db
    .select()
    .from(seasons)
    .where(eq(seasons.isActive, true))
    .limit(1);
  return s ?? null;
}

export default async function ResultsPage() {
  const season = await getActiveSeason();
  if (!season) {
    return (
      <div className="py-16 text-center text-slate-400">
        <p className="font-medium">No active season found</p>
        <p className="text-sm mt-1">Run a data refresh to load results.</p>
      </div>
    );
  }

  const allMatches = await getResults(season.id);
  // A match is "completed" if status is "C", or if either team has a non-zero score
  const completed = allMatches.filter(
    (m) => m.status === "C" || (m.homeScore ?? 0) + (m.awayScore ?? 0) > 0
  );

  // Group by round descending (most recent first)
  const byRound = completed.reduce<Record<number, typeof completed>>((acc, m) => {
    const r = m.roundSeq ?? 0;
    (acc[r] ??= []).push(m);
    return acc;
  }, {});

  const rounds = Object.entries(byRound)
    .map(([r, ms]) => ({ round: parseInt(r), matches: ms }))
    .sort((a, b) => b.round - a.round);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-100">
          Results — {season.name}
        </h2>
        <span className="text-sm text-slate-400">{completed.length} matches played</span>
      </div>

      {rounds.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-600 py-16 text-center text-slate-400">
          <p className="font-medium">No results yet this season</p>
          <p className="text-sm mt-1">Results will appear after Tuesday night games are played.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {rounds.map(({ round, matches: ms }) => {
            const firstMatch = ms[0];
            const dateStr = firstMatch?.prettyDate ?? firstMatch?.schedDate ?? `Week ${round}`;

            return (
              <div key={round} className="rounded-lg border border-slate-700 overflow-hidden shadow-xl">
                <div className="bg-slate-700 px-4 py-2">
                  <span className="text-sm font-semibold text-slate-200">
                    Week {round} — {dateStr}
                  </span>
                </div>
                <table className="w-full text-sm border-collapse">
                  <tbody>
                    {ms.map((m) => {
                      const homeScore = m.homeScore ?? 0;
                      const awayScore = m.awayScore ?? 0;
                      const homeWon = homeScore > awayScore;
                      const awayWon = awayScore > homeScore;
                      return (
                        <tr
                          key={m.id}
                          className="border-t border-slate-700/50 hover:bg-slate-700/40 transition-colors bg-slate-800"
                        >
                          <td className="px-4 py-2.5 text-xs text-slate-500 w-12">
                            {m.divisionName ?? ""}
                          </td>
                          <td
                            className={`px-4 py-2.5 text-right whitespace-nowrap ${
                              homeWon ? "text-white font-semibold" : "text-slate-400"
                            }`}
                          >
                            {m.homeTeamName}
                          </td>
                          <td className="px-4 py-2.5 text-center w-24">
                            <span className="font-bold tabular-nums text-slate-200">
                              {homeScore} – {awayScore}
                            </span>
                          </td>
                          <td
                            className={`px-4 py-2.5 whitespace-nowrap ${
                              awayWon ? "text-white font-semibold" : "text-slate-400"
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
      )}
    </div>
  );
}
