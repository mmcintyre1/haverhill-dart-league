import { Suspense } from "react";
import Link from "next/link";
import { db, seasons, players, playerStats, playerWeekStats } from "@/lib/db";
import { eq, and, asc, desc } from "drizzle-orm";
import SeasonSelector from "@/components/SeasonSelector";

export const dynamic = "force-dynamic";

async function getSeasons() {
  return db.select().from(seasons).orderBy(desc(seasons.startDate));
}

async function getPlayerHeader(playerId: number, seasonId: number) {
  const [player] = await db
    .select({ name: players.name })
    .from(players)
    .where(eq(players.id, playerId))
    .limit(1);

  const [stat] = await db
    .select({
      teamName: playerStats.teamName,
      setWins: playerStats.pts,
      wp: playerStats.wp,
      crkt: playerStats.crkt,
      col601: playerStats.col601,
      col501: playerStats.col501,
      avg: playerStats.avg,
      hundredPlus: playerStats.hundredPlus,
    })
    .from(playerStats)
    .where(and(eq(playerStats.playerId, playerId), eq(playerStats.seasonId, seasonId)))
    .limit(1);

  return { player, stat };
}

async function getWeeklyRows(playerId: number, seasonId: number) {
  return db
    .select()
    .from(playerWeekStats)
    .where(and(eq(playerWeekStats.playerId, playerId), eq(playerWeekStats.seasonId, seasonId)))
    .orderBy(asc(playerWeekStats.weekKey));
}

function record(wins: number, losses: number): string {
  return wins + losses > 0 ? `${wins}-${losses}` : "—";
}

export default async function PlayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ season?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const playerId = parseInt(id);

  if (isNaN(playerId)) {
    return <div className="text-slate-400 py-16 text-center">Player not found.</div>;
  }

  const allSeasons = await getSeasons();
  const activeId = sp.season
    ? parseInt(sp.season)
    : allSeasons.find((s) => s.isActive)?.id ?? allSeasons[0]?.id;

  if (!activeId) {
    return <div className="text-slate-400 py-16 text-center">No seasons available.</div>;
  }

  const [{ player, stat }, weeks] = await Promise.all([
    getPlayerHeader(playerId, activeId),
    getWeeklyRows(playerId, activeId),
  ]);

  if (!player) {
    return <div className="text-slate-400 py-16 text-center">Player not found.</div>;
  }

  const seasonOptions = allSeasons.map((s) => ({ id: s.id, name: s.name }));
  const seasonName = allSeasons.find((s) => s.id === activeId)?.name ?? "";

  const avgPct = stat?.avg != null
    ? `${(parseFloat(String(stat.avg)) * 100).toFixed(1)}%`
    : null;

  return (
    <div>
      {/* Back link */}
      <div className="mb-5">
        <Link href="/" className="text-sm text-sky-400 hover:text-sky-300 transition-colors">
          ← Back to Leaderboard
        </Link>
      </div>

      {/* Player header card */}
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-5 mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white">{player.name}</h2>
            {stat?.teamName && (
              <p className="text-slate-400 text-sm mt-0.5">{stat.teamName}</p>
            )}
          </div>
          <Suspense fallback={null}>
            <SeasonSelector seasons={seasonOptions} currentId={activeId} />
          </Suspense>
        </div>

        {stat && (
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <span className="text-slate-300">
              <span className="text-slate-500 mr-1">{seasonName}</span>
              {stat.crkt && <span className="mr-3">CRKT {stat.crkt}</span>}
              {stat.col601 && <span className="mr-3">601 {stat.col601}</span>}
              {stat.col501 && <span>501 {stat.col501}</span>}
            </span>
            {avgPct && (
              <span className="text-sky-300 font-medium">{avgPct} AVG</span>
            )}
            {stat.setWins != null && (
              <span className="text-white font-bold">{stat.setWins} PTS</span>
            )}
            {stat.wp && (
              <span className="text-slate-400">{stat.wp} weeks played</span>
            )}
          </div>
        )}
      </div>

      {/* Week-by-week table */}
      {weeks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-600 py-12 text-center text-slate-400">
          <p className="font-medium">No weekly data yet</p>
          <p className="text-sm mt-1">Run a scrape to populate week-by-week stats.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-700 shadow-xl">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-800 text-slate-200 border-b border-slate-600">
                <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">Week</th>
                <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">Opponent</th>
                <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">Sets</th>
                <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">601</th>
                <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">CRKT</th>
                <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">501</th>
                <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap" title="100+ score total">100+</th>
                <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">180</th>
                <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap" title="9-mark cricket turns">RO9</th>
                <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap" title="High Out (>100)">H Out</th>
                <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap" title="Highest single-set average">LDG</th>
              </tr>
            </thead>
            <tbody>
              {weeks.map((w, i) => (
                <tr
                  key={w.id}
                  className={`border-b border-slate-700/50 hover:bg-slate-700/40 transition-colors ${
                    i % 2 === 0 ? "bg-slate-800" : "bg-slate-800/50"
                  }`}
                >
                  <td className="px-3 py-2 text-slate-300 whitespace-nowrap">{w.weekKey}</td>
                  <td className="px-3 py-2 text-slate-300 whitespace-nowrap">{w.opponentTeam ?? "—"}</td>
                  <td className="px-3 py-2 text-center text-slate-200 tabular-nums">
                    {record(w.setWins, w.setLosses)}
                  </td>
                  <td className="px-3 py-2 text-center text-slate-300 tabular-nums">
                    {record(w.col601Wins, w.col601Losses)}
                  </td>
                  <td className="px-3 py-2 text-center text-slate-300 tabular-nums">
                    {record(w.crktWins, w.crktLosses)}
                  </td>
                  <td className="px-3 py-2 text-center text-slate-300 tabular-nums">
                    {record(w.col501Wins, w.col501Losses)}
                  </td>
                  <td className="px-3 py-2 text-center text-slate-200 tabular-nums font-medium">
                    {w.hundredPlus > 0 ? w.hundredPlus : "—"}
                  </td>
                  <td className="px-3 py-2 text-center text-slate-300 tabular-nums">
                    {w.oneEighty > 0 ? w.oneEighty : "—"}
                  </td>
                  <td className="px-3 py-2 text-center text-slate-300 tabular-nums">
                    {w.ro9 > 0 ? w.ro9 : "—"}
                  </td>
                  <td className="px-3 py-2 text-center text-slate-200 tabular-nums">
                    {w.hOut > 0 ? w.hOut : "—"}
                  </td>
                  <td className="px-3 py-2 text-center text-sky-300 tabular-nums font-medium">
                    {w.ldg > 0 ? w.ldg : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
