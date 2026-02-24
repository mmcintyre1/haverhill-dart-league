import { Suspense } from "react";
import Link from "next/link";
import { db, seasons, players, playerStats, playerWeekStats, playerSeasonTeams, scoringConfig } from "@/lib/db";
import { eq, and, asc, desc, or, isNull } from "drizzle-orm";
import SeasonSelector from "@/components/SeasonSelector";
import PhaseSelector from "@/components/PhaseSelector";

export const dynamic = "force-dynamic";

async function getSeasons() {
  return db.select().from(seasons).orderBy(desc(seasons.startDate));
}

async function getPlayerHeader(playerId: number, seasonId: number, phase: string) {
  const [player] = await db
    .select({ name: players.name })
    .from(players)
    .where(eq(players.id, playerId))
    .limit(1);

  const [stat] = await db
    .select({
      teamName: playerSeasonTeams.teamName,
      divisionName: playerSeasonTeams.divisionName,
      setWins: playerStats.pts,
      wp: playerStats.wp,
      crkt: playerStats.crkt,
      col601: playerStats.col601,
      col501: playerStats.col501,
      avg: playerStats.avg,
      hundredPlus: playerStats.hundredPlus,
      mpr: playerStats.mpr,
      ppr: playerStats.ppr,
    })
    .from(playerStats)
    .leftJoin(
      playerSeasonTeams,
      and(
        eq(playerStats.playerId, playerSeasonTeams.playerId),
        eq(playerStats.seasonId, playerSeasonTeams.seasonId)
      )
    )
    .where(and(eq(playerStats.playerId, playerId), eq(playerStats.seasonId, seasonId), eq(playerStats.phase, phase)))
    .limit(1);

  return { player, stat };
}

async function hasPlayerPostseason(playerId: number, seasonId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: playerStats.id })
    .from(playerStats)
    .where(and(eq(playerStats.playerId, playerId), eq(playerStats.seasonId, seasonId), eq(playerStats.phase, "POST")))
    .limit(1);
  return !!row;
}

async function getWeeklyRows(playerId: number, seasonId: number, phase: string) {
  return db
    .select()
    .from(playerWeekStats)
    .where(and(eq(playerWeekStats.playerId, playerId), eq(playerWeekStats.seasonId, seasonId), eq(playerWeekStats.phase, phase)))
    .orderBy(asc(playerWeekStats.weekKey));
}

const DEFAULT_HH: Record<string, { hh: number; roHh: number }> = {
  A: { hh: 475, roHh: 20 },
  B: { hh: 450, roHh: 17 },
  C: { hh: 425, roHh: 14 },
  D: { hh: 400, roHh: 12 },
};

async function getHhThresholds(seasonId: number): Promise<Record<string, { hh: number; roHh: number }>> {
  const rows = await db
    .select()
    .from(scoringConfig)
    .where(
      and(
        or(eq(scoringConfig.scope, "global"), eq(scoringConfig.scope, String(seasonId))),
        or(eq(scoringConfig.key, "01_hh.threshold"), eq(scoringConfig.key, "ro_hh.threshold"))
      )
    );
  const result: Record<string, { hh: number; roHh: number }> = {};
  const globalRows = rows.filter((r) => r.scope === "global");
  const seasonRows = rows.filter((r) => r.scope !== "global");
  for (const r of [...globalRows, ...seasonRows]) {
    const div = r.division ?? "";
    if (!result[div]) result[div] = { ...(DEFAULT_HH[div] ?? { hh: 475, roHh: 20 }) };
    if (r.key === "01_hh.threshold") result[div].hh = Number(r.value);
    if (r.key === "ro_hh.threshold") result[div].roHh = Number(r.value);
  }
  return result;
}

async function getScoringPts(seasonId: number): Promise<{ cricket: number; "601": number; "501": number }> {
  const rows = await db
    .select()
    .from(scoringConfig)
    .where(
      and(
        or(eq(scoringConfig.scope, "global"), eq(scoringConfig.scope, String(seasonId))),
        isNull(scoringConfig.division)
      )
    );
  const pts = { cricket: 1, "601": 1, "501": 1 };
  const globalRows = rows.filter((r) => r.scope === "global");
  const seasonRows = rows.filter((r) => r.scope !== "global");
  for (const r of [...globalRows, ...seasonRows]) {
    if (r.key === "cricket.win_pts") pts.cricket = Number(r.value);
    if (r.key === "601.win_pts")     pts["601"]   = Number(r.value);
    if (r.key === "501.win_pts")     pts["501"]   = Number(r.value);
  }
  return pts;
}

function parseRecord(s: string | null | undefined): { w: number; l: number } {
  if (!s) return { w: 0, l: 0 };
  const parts = String(s).split("-").map(Number);
  return { w: parts[0] || 0, l: parts[1] || 0 };
}

function record(wins: number, losses: number): string {
  return wins + losses > 0 ? `${wins}-${losses}` : "—";
}

const MONTH_IDX: Record<string, number> = {
  Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11,
};

function parseWeekKey(key: string): number {
  const [d, m, y] = key.split(" ");
  const mi = MONTH_IDX[m];
  if (mi == null) return 0;
  return new Date(parseInt(y), mi, parseInt(d)).getTime();
}

export default async function PlayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ season?: string; phase?: string }>;
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
  const phase = sp.phase ?? "REG";

  if (!activeId) {
    return <div className="text-slate-400 py-16 text-center">No seasons available.</div>;
  }

  const [{ player, stat }, weeksRaw, postExists, hhThresholds, pts] = await Promise.all([
    getPlayerHeader(playerId, activeId, phase),
    getWeeklyRows(playerId, activeId, phase),
    hasPlayerPostseason(playerId, activeId),
    getHhThresholds(activeId),
    getScoringPts(activeId),
  ]);

  if (!player) {
    return <div className="text-slate-400 py-16 text-center">Player not found.</div>;
  }

  // Sort weeks most recent first
  const weeks = [...weeksRaw].sort((a, b) => parseWeekKey(b.weekKey) - parseWeekKey(a.weekKey));

  const div = stat?.divisionName ?? "";
  const hhThreshold = hhThresholds[div] ?? DEFAULT_HH[div] ?? { hh: 475, roHh: 20 };

  const seasonOptions = allSeasons.map((s) => ({ id: s.id, name: s.name }));
  const seasonName = allSeasons.find((s) => s.id === activeId)?.name ?? "";

  const customPts = stat ? (() => {
    const crkt = parseRecord(String(stat.crkt));
    const r601 = parseRecord(String(stat.col601));
    const r501 = parseRecord(String(stat.col501));
    const total = crkt.w + crkt.l + r601.w + r601.l + r501.w + r501.l;
    if (total === 0) return null;
    const v = crkt.w * pts.cricket + r601.w * pts["601"] + r501.w * pts["501"];
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
  })() : null;

  const avgPct = stat?.avg != null
    ? `${(parseFloat(String(stat.avg)) * 100).toFixed(1)}%`
    : null;

  const pprDisplay = stat?.ppr != null
    ? parseFloat(String(stat.ppr)).toFixed(1)
    : null;

  const mprDisplay = stat?.mpr != null
    ? parseFloat(String(stat.mpr)).toFixed(2)
    : null;

  return (
    <div>
      {/* Back link */}
      <div className="mb-5">
        <Link href={`/leaderboard?season=${activeId}${phase !== "REG" ? `&phase=${phase}` : ""}`} className="text-sm text-slate-400 hover:text-amber-400 transition-colors">
          ← Leaderboard
        </Link>
      </div>

      {/* Player header card */}
      <div className="bg-slate-900 rounded-lg border border-slate-800 p-5 mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white">{player.name}</h2>
            {(stat?.teamName || seasonName) && (
              <p className="text-slate-500 text-sm mt-0.5">
                {[stat?.teamName, stat?.divisionName ? `Div ${stat.divisionName}` : null, seasonName]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Suspense fallback={null}>
              <SeasonSelector seasons={seasonOptions} currentId={activeId} />
            </Suspense>
            {postExists && (
              <Suspense fallback={null}>
                <PhaseSelector current={phase} />
              </Suspense>
            )}
          </div>
        </div>

        {stat && (
          <div className="mt-4 grid grid-cols-4 sm:grid-cols-8 gap-2">
            {(
              [
                { label: "PTS",  value: customPts ?? (stat.setWins != null ? String(stat.setWins) : null), color: "text-amber-400 text-base" },
                { label: "CRKT", value: stat.crkt,   color: "text-slate-200 text-sm" },
                { label: "601",  value: stat.col601, color: "text-slate-200 text-sm" },
                { label: "501",  value: stat.col501, color: "text-slate-200 text-sm" },
                { label: "AVG",  value: avgPct,      color: "text-sky-400 text-sm" },
                { label: "WP",   value: stat.wp ? `${stat.wp}w` : null, color: "text-slate-200 text-sm" },
                { label: "3DA",  value: pprDisplay,  color: "text-sky-400 text-sm" },
                { label: "MPR",  value: mprDisplay,  color: "text-emerald-400 text-sm" },
              ] as { label: string; value: string | null; color: string }[]
            ).map(({ label, value, color }) =>
              value != null ? (
                <div key={label} className="bg-slate-800 rounded-lg px-2 py-2.5 text-center border border-slate-700/50">
                  <div className={`font-bold ${color}`}>{value}</div>
                  <div className="text-[0.6rem] uppercase tracking-wider text-slate-500 mt-1">{label}</div>
                </div>
              ) : null
            )}
          </div>
        )}
      </div>

      {/* Week-by-week table */}
      {weeks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-700 py-12 text-center text-slate-500">
          <p className="font-medium">No weekly data yet</p>
          <p className="text-sm mt-1">Run a scrape to populate week-by-week stats.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-800 shadow-2xl">
          <table className="w-full text-sm border-collapse">
            <thead>
              {/* Group headers */}
              <tr className="bg-slate-950/80 border-b border-slate-700/30">
                <th colSpan={2} className="px-2 py-1" />
                <th colSpan={3} className="px-2 py-1 text-center text-[0.6rem] uppercase tracking-wider text-slate-600 border-l border-slate-700/60 font-semibold">Records</th>
                <th colSpan={5} className="px-2 py-1 text-center text-[0.6rem] uppercase tracking-wider text-slate-600 border-l border-slate-700/60 font-semibold">01 Games</th>
                <th colSpan={3} className="px-2 py-1 text-center text-[0.6rem] uppercase tracking-wider text-slate-600 border-l border-slate-700/60 font-semibold">Cricket</th>
                <th colSpan={2} className="px-2 py-1 text-center text-[0.6rem] uppercase tracking-wider text-amber-600/70 border-l border-slate-700/60 font-semibold">Summary</th>
              </tr>
              {/* Column headers */}
              <tr className="bg-slate-950 border-b border-slate-700/80">
                <th className="px-2 py-2 text-left font-medium whitespace-nowrap text-[0.65rem] uppercase tracking-wider text-slate-500">Week</th>
                <th className="px-2 py-2 text-left font-medium whitespace-nowrap text-[0.65rem] uppercase tracking-wider text-slate-500">Opponent</th>
                {/* Records */}
                <th className="px-2 py-2 text-center font-medium whitespace-nowrap text-[0.65rem] uppercase tracking-wider text-slate-500 border-l border-slate-700/60">601</th>
                <th className="px-2 py-2 text-center font-medium whitespace-nowrap text-[0.65rem] uppercase tracking-wider text-slate-500" title="Cricket Record">CRKT</th>
                <th className="px-2 py-2 text-center font-medium whitespace-nowrap text-[0.65rem] uppercase tracking-wider text-slate-500">501</th>
                {/* 01 Games */}
                <th className="px-2 py-2 text-center font-medium whitespace-nowrap text-[0.65rem] uppercase tracking-wider text-slate-500 border-l border-slate-700/60" title="100+ score total">100+</th>
                <th className="px-2 py-2 text-center font-medium whitespace-nowrap text-[0.65rem] uppercase tracking-wider text-slate-500">180</th>
                <th className="px-2 py-2 text-center font-medium whitespace-nowrap text-[0.65rem] uppercase tracking-wider text-slate-500" title="High Out (>100)">H Out</th>
                <th className="px-2 py-2 text-center font-medium whitespace-nowrap text-[0.65rem] uppercase tracking-wider text-amber-500/80" title="3-Dart Avg (01 games)">3DA</th>
                <th className="px-2 py-2 text-center font-medium whitespace-nowrap text-[0.65rem] uppercase tracking-wider text-slate-500" title="Lowest darts to win a 501 leg">LDG</th>
                {/* Cricket */}
                <th className="px-2 py-2 text-center font-medium whitespace-nowrap text-[0.65rem] uppercase tracking-wider text-slate-500 border-l border-slate-700/60" title="Cricket marks (legs 1+2)">RNDS</th>
                <th className="px-2 py-2 text-center font-medium whitespace-nowrap text-[0.65rem] uppercase tracking-wider text-slate-500" title="9-mark cricket turns">RO9</th>
                <th className="px-2 py-2 text-center font-medium whitespace-nowrap text-[0.65rem] uppercase tracking-wider text-emerald-600" title="Marks Per Round (Cricket)">MPR</th>
                {/* Summary */}
                <th className="px-2 py-2 text-center font-medium whitespace-nowrap text-[0.65rem] uppercase tracking-wider text-amber-500/80 border-l border-slate-700/60" title="Set win % this week">AVG</th>
                <th className="px-2 py-2 text-center font-medium whitespace-nowrap text-[0.65rem] uppercase tracking-wider text-amber-500/80" title="Set wins this week">PTS</th>
              </tr>
            </thead>
            <tbody>
              {weeks.map((w, i) => {
                const setTotal = w.setWins + w.setLosses;
                const weekAvg = setTotal > 0 ? `${(w.setWins / setTotal * 100).toFixed(1)}%` : "—";
                return (
                  <tr
                    key={w.id}
                    className={`border-b border-slate-800 hover:bg-amber-500/5 transition-colors ${
                      i % 2 === 0 ? "bg-slate-900" : "bg-slate-900/60"
                    }`}
                  >
                    <td className="px-2 py-1.5 text-slate-300 whitespace-nowrap text-xs">{w.weekKey}</td>
                    <td className="px-2 py-1.5 text-slate-400 whitespace-nowrap text-xs">{w.opponentTeam ?? "—"}</td>
                    {/* Records */}
                    <td className="px-2 py-1.5 text-center text-slate-400 tabular-nums border-l border-slate-800">{record(w.col601Wins, w.col601Losses)}</td>
                    <td className="px-2 py-1.5 text-center text-slate-300 tabular-nums">{record(w.crktWins, w.crktLosses)}</td>
                    <td className="px-2 py-1.5 text-center text-slate-400 tabular-nums">{record(w.col501Wins, w.col501Losses)}</td>
                    {/* 01 Games */}
                    <td className={`px-2 py-1.5 text-center tabular-nums border-l border-slate-800 ${w.hundredPlus >= hhThreshold.hh ? "text-rose-400 font-semibold" : "text-slate-300"}`}>
                      {w.hundredPlus > 0 ? w.hundredPlus : "—"}{w.hundredPlus >= hhThreshold.hh ? " 🔥" : ""}
                    </td>
                    <td className="px-2 py-1.5 text-center text-slate-400 tabular-nums">{w.oneEighty > 0 ? w.oneEighty : "—"}</td>
                    <td className="px-2 py-1.5 text-center text-slate-300 tabular-nums">{w.hOut > 0 ? w.hOut : "—"}</td>
                    <td className="px-2 py-1.5 text-center text-amber-300 tabular-nums font-medium">
                      {w.ppr != null ? parseFloat(String(w.ppr)).toFixed(1) : "—"}
                    </td>
                    <td className="px-2 py-1.5 text-center text-slate-300 tabular-nums">{w.ldg > 0 ? w.ldg : "—"}</td>
                    {/* Cricket */}
                    <td className={`px-2 py-1.5 text-center tabular-nums border-l border-slate-800 ${w.rnds >= hhThreshold.roHh ? "text-rose-400 font-semibold" : "text-slate-400"}`}>
                      {w.rnds > 0 ? w.rnds : "—"}{w.rnds >= hhThreshold.roHh ? " 🔥" : ""}
                    </td>
                    <td className="px-2 py-1.5 text-center text-slate-400 tabular-nums">{w.ro9 > 0 ? w.ro9 : "—"}</td>
                    <td className="px-2 py-1.5 text-center text-emerald-400 tabular-nums font-medium">
                      {w.mpr != null ? parseFloat(String(w.mpr)).toFixed(2) : "—"}
                    </td>
                    {/* Summary */}
                    <td className="px-2 py-1.5 text-center text-amber-300 tabular-nums font-medium border-l border-slate-800">{weekAvg}</td>
                    <td className="px-2 py-1.5 text-center text-amber-400 tabular-nums font-bold">{(() => {
                      const v = w.crktWins * pts.cricket + w.col601Wins * pts["601"] + w.col501Wins * pts["501"];
                      if (v === 0) return "—";
                      return Number.isInteger(v) ? v : v.toFixed(1);
                    })()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
