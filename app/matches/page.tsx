import { db, seasons, matches } from "@/lib/db";
import { eq, asc, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function getActiveSeason() {
  const [s] = await db
    .select()
    .from(seasons)
    .where(eq(seasons.isActive, true))
    .limit(1);
  return s ?? null;
}

async function getAllMatches(seasonId: number) {
  return db
    .select()
    .from(matches)
    .where(eq(matches.seasonId, seasonId))
    .orderBy(asc(matches.roundSeq), asc(matches.schedDate), asc(matches.schedTime));
}

function formatTime(t: string | null) {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

function groupByRound<T extends { roundSeq: number | null }>(items: T[]) {
  const map = items.reduce<Record<number, T[]>>((acc, m) => {
    const r = m.roundSeq ?? 0;
    (acc[r] ??= []).push(m);
    return acc;
  }, {});
  return Object.entries(map).map(([r, ms]) => ({ round: parseInt(r), matches: ms }));
}

export default async function MatchesPage() {
  const season = await getActiveSeason();

  if (!season) {
    return (
      <div className="py-16 text-center text-slate-400">
        <p className="font-medium">No active season found</p>
        <p className="text-sm mt-1">Run a data refresh to load matches.</p>
      </div>
    );
  }

  const allMatches = await getAllMatches(season.id);

  // DartConnect sometimes keeps status="P" even after a match is played.
  // Use scores as the primary completion signal: any non-zero score = played.
  const completed = allMatches.filter(
    (m) => m.status === "C" || (m.homeScore ?? 0) + (m.awayScore ?? 0) > 0
  );
  const pending = allMatches.filter(
    (m) => m.status !== "C" && (m.homeScore ?? 0) + (m.awayScore ?? 0) === 0
  );

  const upcomingRounds = groupByRound(pending).sort((a, b) => a.round - b.round);
  const resultsRounds = groupByRound(completed).sort((a, b) => b.round - a.round);

  return (
    <div className="space-y-10">
      {/* ── Upcoming ── */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100">Upcoming — {season.name}</h2>
          <span className="text-sm text-slate-400">{pending.length} matches remaining</span>
        </div>

        {upcomingRounds.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-700 py-10 text-center text-slate-500">
            <p className="font-medium">Season complete — no upcoming matches.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {upcomingRounds.map(({ round, matches: ms }) => {
              const first = ms[0];
              const dateStr = first?.prettyDate ?? first?.schedDate ?? `Week ${round}`;
              const timeStr = formatTime(first?.schedTime ?? null);
              return (
                <div key={round} className="rounded-lg border border-slate-700 overflow-hidden shadow-lg">
                  <div className="bg-slate-800 px-4 py-2 flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-200">
                      Week {round} — {dateStr}
                    </span>
                    {timeStr && <span className="text-xs text-slate-400">{timeStr}</span>}
                  </div>
                  <table className="w-full text-sm border-collapse">
                    <tbody>
                      {ms.map((m) => (
                        <tr
                          key={m.id}
                          className="border-t border-slate-700/50 bg-slate-900 hover:bg-slate-800/60 transition-colors"
                        >
                          <td className="px-4 py-2.5 text-xs text-slate-500 w-12">{m.divisionName ?? ""}</td>
                          <td className="px-4 py-2.5 font-medium text-slate-200 text-right whitespace-nowrap">
                            {m.homeTeamName}
                          </td>
                          <td className="px-4 py-2.5 text-center text-slate-500 text-xs font-medium w-10">vs</td>
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

      {/* ── Divider ── */}
      {resultsRounds.length > 0 && (
        <div className="flex items-center gap-4">
          <div className="flex-1 h-px bg-slate-800" />
          <span className="text-xs uppercase tracking-widest text-slate-600 shrink-0">Results</span>
          <div className="flex-1 h-px bg-slate-800" />
        </div>
      )}

      {/* ── Results ── */}
      {resultsRounds.length > 0 && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-100">Results — {season.name}</h2>
            <span className="text-sm text-slate-400">{completed.length} matches played</span>
          </div>

          <div className="space-y-4">
            {resultsRounds.map(({ round, matches: ms }) => {
              const first = ms[0];
              const dateStr = first?.prettyDate ?? first?.schedDate ?? `Week ${round}`;
              return (
                <div key={round} className="rounded-lg border border-slate-700 overflow-hidden shadow-lg">
                  <div className="bg-slate-800 px-4 py-2">
                    <span className="text-sm font-semibold text-slate-200">
                      Week {round} — {dateStr}
                    </span>
                  </div>
                  <table className="w-full text-sm border-collapse">
                    <tbody>
                      {ms.map((m) => {
                        const hs = m.homeScore ?? 0;
                        const as_ = m.awayScore ?? 0;
                        const hw = hs > as_;
                        const aw = as_ > hs;
                        return (
                          <tr
                            key={m.id}
                            className="border-t border-slate-700/50 bg-slate-900 hover:bg-slate-800/60 transition-colors"
                          >
                            <td className="px-4 py-2.5 text-xs text-slate-500 w-12">{m.divisionName ?? ""}</td>
                            <td className={`px-4 py-2.5 text-right whitespace-nowrap ${hw ? "text-white font-semibold" : "text-slate-400"}`}>
                              {m.homeTeamName}
                            </td>
                            <td className="px-4 py-2.5 text-center w-24">
                              <span className="font-bold tabular-nums text-slate-200">{hs} – {as_}</span>
                            </td>
                            <td className={`px-4 py-2.5 whitespace-nowrap ${aw ? "text-white font-semibold" : "text-slate-400"}`}>
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
        </div>
      )}
    </div>
  );
}
