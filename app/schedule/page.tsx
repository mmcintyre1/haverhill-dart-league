import { db, seasons, matches } from "@/lib/db";
import { eq, desc, asc } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function getSchedule(seasonId: number) {
  return db
    .select()
    .from(matches)
    .where(eq(matches.seasonId, seasonId))
    .orderBy(asc(matches.roundSeq), asc(matches.schedDate), asc(matches.schedTime));
}

async function getActiveSeason() {
  const [s] = await db
    .select()
    .from(seasons)
    .where(eq(seasons.isActive, true))
    .limit(1);
  return s ?? null;
}

function formatTime(t: string | null) {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

export default async function SchedulePage() {
  const season = await getActiveSeason();
  if (!season) {
    return (
      <div className="py-16 text-center text-slate-400">
        <p className="font-medium">No active season found</p>
        <p className="text-sm mt-1">Run a data refresh to load the schedule.</p>
      </div>
    );
  }

  const allMatches = await getSchedule(season.id);
  const pending = allMatches.filter((m) => m.status === "P");

  // Group by round
  const byRound = pending.reduce<Record<number, typeof pending>>((acc, m) => {
    const r = m.roundSeq ?? 0;
    (acc[r] ??= []).push(m);
    return acc;
  }, {});

  const rounds = Object.entries(byRound)
    .map(([r, ms]) => ({ round: parseInt(r), matches: ms }))
    .sort((a, b) => a.round - b.round);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-100">
          Upcoming Schedule — {season.name}
        </h2>
        <span className="text-sm text-slate-400">{pending.length} matches remaining</span>
      </div>

      {rounds.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-600 py-16 text-center text-slate-400">
          <p className="font-medium">No upcoming matches found.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {rounds.map(({ round, matches: ms }) => {
            const firstMatch = ms[0];
            const dateStr = firstMatch?.prettyDate ?? firstMatch?.schedDate ?? `Week ${round}`;
            const timeStr = formatTime(firstMatch?.schedTime ?? null);

            return (
              <div key={round} className="rounded-lg border border-slate-700 overflow-hidden shadow-xl">
                <div className="bg-slate-700 px-4 py-2 flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-200">
                    Week {round} — {dateStr}
                  </span>
                  {timeStr && (
                    <span className="text-xs text-slate-400">{timeStr}</span>
                  )}
                </div>
                <table className="w-full text-sm border-collapse">
                  <tbody>
                    {ms.map((m) => (
                      <tr
                        key={m.id}
                        className="border-t border-slate-700/50 hover:bg-slate-700/40 transition-colors bg-slate-800"
                      >
                        <td className="px-4 py-2.5 text-xs text-slate-500 w-12">
                          {m.divisionName ?? ""}
                        </td>
                        <td className="px-4 py-2.5 font-medium text-slate-200 text-right whitespace-nowrap">
                          {m.homeTeamName}
                        </td>
                        <td className="px-4 py-2.5 text-center text-slate-500 text-xs font-medium w-10">
                          vs
                        </td>
                        <td className="px-4 py-2.5 font-medium text-slate-200 whitespace-nowrap">
                          {m.awayTeamName}
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
  );
}
