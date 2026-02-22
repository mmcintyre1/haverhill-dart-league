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
      <div className="py-16 text-center text-gray-500">
        <p className="font-medium">No active season found</p>
        <p className="text-sm mt-1">Run a data refresh to load results.</p>
      </div>
    );
  }

  const allMatches = await getResults(season.id);
  const completed = allMatches.filter((m) => m.status === "C");

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
        <h2 className="text-lg font-semibold text-gray-800">
          Results — {season.name}
        </h2>
        <span className="text-sm text-gray-500">{completed.length} matches played</span>
      </div>

      {rounds.length === 0 ? (
        <div className="py-16 text-center text-gray-500">
          <p className="font-medium">No results yet this season</p>
          <p className="text-sm mt-1">Results will appear after Tuesday night games are played.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {rounds.map(({ round, matches: ms }) => {
            const firstMatch = ms[0];
            const dateStr = firstMatch?.prettyDate ?? firstMatch?.schedDate ?? `Week ${round}`;

            return (
              <div key={round} className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
                <div className="bg-[#3a5a8a] px-4 py-2">
                  <span className="text-sm font-semibold text-white">
                    Week {round} — {dateStr}
                  </span>
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    {ms.map((m) => {
                      const homeWon = (m.homeScore ?? 0) > (m.awayScore ?? 0);
                      const awayWon = (m.awayScore ?? 0) > (m.homeScore ?? 0);
                      return (
                        <tr
                          key={m.id}
                          className="border-t border-gray-100 hover:bg-gray-50 transition-colors"
                        >
                          <td className="px-4 py-2.5 text-xs text-gray-400 w-12">
                            {m.divisionName ?? ""}
                          </td>
                          <td
                            className={`px-4 py-2.5 font-medium text-right ${
                              homeWon ? "text-gray-900 font-semibold" : "text-gray-500"
                            }`}
                          >
                            {m.homeTeamName}
                          </td>
                          <td className="px-4 py-2.5 text-center w-24">
                            <span className="font-bold tabular-nums text-gray-800">
                              {m.homeScore ?? 0} – {m.awayScore ?? 0}
                            </span>
                          </td>
                          <td
                            className={`px-4 py-2.5 font-medium ${
                              awayWon ? "text-gray-900 font-semibold" : "text-gray-500"
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
