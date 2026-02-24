import Link from "next/link";
import { db, seasons, matches, newsPosts } from "@/lib/db";
import { eq, desc, asc, and, or, gt, isNotNull } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function getActiveSeason() {
  const [s] = await db
    .select()
    .from(seasons)
    .where(eq(seasons.isActive, true))
    .limit(1);
  return s ?? null;
}

async function getNews() {
  return db
    .select()
    .from(newsPosts)
    .orderBy(desc(newsPosts.publishedAt))
    .limit(10);
}

async function getNextRound(seasonId: number) {
  const pending = await db
    .select()
    .from(matches)
    .where(and(eq(matches.seasonId, seasonId), eq(matches.status, "P"), isNotNull(matches.roundSeq)))
    .orderBy(asc(matches.roundSeq), asc(matches.schedDate))
    .limit(20);

  if (pending.length === 0) return null;
  const nextRound = pending[0].roundSeq;
  return {
    round: nextRound,
    date: pending[0].prettyDate ?? pending[0].schedDate ?? `Week ${nextRound}`,
    matches: pending.filter((m) => m.roundSeq === nextRound),
  };
}

async function getLastRound(seasonId: number) {
  const completed = await db
    .select()
    .from(matches)
    .where(
      and(
        eq(matches.seasonId, seasonId),
        isNotNull(matches.roundSeq),
        or(eq(matches.status, "C"), gt(matches.homeScore!, 0))
      )
    )
    .orderBy(desc(matches.roundSeq), asc(matches.schedDate))
    .limit(20);

  if (completed.length === 0) return null;
  const lastRound = completed[0].roundSeq;
  return {
    round: lastRound,
    date: completed[0].prettyDate ?? completed[0].schedDate ?? `Week ${lastRound}`,
    matches: completed.filter((m) => m.roundSeq === lastRound),
  };
}

function formatDate(d: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

export default async function HomePage() {
  const [season, news] = await Promise.all([getActiveSeason(), getNews()]);

  const [nextRound, lastRound] = season
    ? await Promise.all([getNextRound(season.id), getLastRound(season.id)])
    : [null, null];

  return (
    <div className="space-y-10">
      {/* ── Hero + News (side-by-side on desktop, stacked on mobile) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hero */}
        <div className="relative rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 shadow-2xl">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 via-transparent to-slate-900/80 pointer-events-none" />
          <div className="relative px-8 py-10 flex flex-col h-full">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-amber-400 text-3xl select-none">◎</span>
                <span className="text-xs font-semibold uppercase tracking-widest text-amber-500">
                  {process.env.LEAGUE_NAME}
                </span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold text-white leading-tight mb-3">
                Home of Tuesday Night Darts
              </h1>
              <p className="text-slate-400 text-base">
                {season
                  ? `${season.name} is underway. Follow standings, results, and player stats all season long.`
                  : "Stats, schedules, and results for every week of the season."}
              </p>
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/leaderboard"
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-semibold px-4 py-2 transition-colors"
              >
                View Leaderboard →
              </Link>
              <Link
                href="/matches"
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium px-4 py-2 border border-slate-700 transition-colors"
              >
                This Week's Matches
              </Link>
              {season && process.env.DC_LEAGUE_ID && (
                <a
                  href={`https://tv.dartconnect.com/league/${process.env.DC_LEAGUE_ID}/${season.id}/standings`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 text-sm font-medium px-4 py-2 border border-slate-700 transition-colors"
                >
                  DartConnect ↗
                </a>
              )}
            </div>
          </div>
        </div>

        {/* News */}
        <div className="flex flex-col">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-lg font-semibold text-slate-100">News &amp; Announcements</h2>
            <div className="flex-1 h-px bg-slate-800" />
          </div>

          {news.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-700 py-14 text-center text-slate-500 flex-1 flex flex-col items-center justify-center">
              <p className="text-3xl mb-3 select-none">◎</p>
              <p className="font-medium text-slate-400">Stay tuned for announcements</p>
              <p className="text-sm mt-1">League news and updates will appear here throughout the season.</p>
            </div>
          ) : (
            <div className="space-y-4 overflow-y-auto max-h-[420px] pr-1">
              {news.map((post) => (
                <article
                  key={post.id}
                  className="rounded-xl border border-slate-800 bg-slate-900 p-5 hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <h3 className="text-base font-semibold text-white leading-snug">{post.title}</h3>
                    <time className="text-xs text-slate-500 shrink-0 mt-0.5">
                      {formatDate(post.publishedAt)}
                    </time>
                  </div>
                  <p className="text-slate-400 text-sm leading-relaxed whitespace-pre-wrap">{post.body}</p>
                  {post.author && (
                    <p className="mt-3 text-xs text-slate-600">— {post.author}</p>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Quick Look: Next Up + Last Week ── */}
      {(nextRound || lastRound) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Next Up */}
          {nextRound && (
            <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
              <div className="bg-slate-800/60 px-4 py-2.5 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">
                  Next Up
                </span>
                <span className="text-xs text-slate-400">
                  Week {nextRound.round} — {nextRound.date}
                </span>
              </div>
              <div className="divide-y divide-slate-800">
                {nextRound.matches.map((m) => (
                  <div
                    key={m.id}
                    className="px-4 py-2.5 flex items-center gap-2 text-sm"
                  >
                    <span className="text-slate-500 text-xs w-6 shrink-0">{m.divisionName}</span>
                    <span className="text-slate-300 font-medium text-right flex-1 truncate">{m.homeTeamName}</span>
                    <span className="text-slate-600 text-xs shrink-0">vs</span>
                    <span className="text-slate-300 font-medium flex-1 truncate">{m.awayTeamName}</span>
                  </div>
                ))}
              </div>
              <div className="px-4 py-2 border-t border-slate-800">
                <Link href="/matches" className="text-xs text-slate-500 hover:text-amber-400 transition-colors">
                  Full schedule →
                </Link>
              </div>
            </div>
          )}

          {/* Last Week */}
          {lastRound && (
            <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
              <div className="bg-slate-800/60 px-4 py-2.5 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Last Week
                </span>
                <span className="text-xs text-slate-400">
                  Week {lastRound.round} — {lastRound.date}
                </span>
              </div>
              <div className="divide-y divide-slate-800">
                {lastRound.matches.map((m) => {
                  const hw = (m.homeScore ?? 0) > (m.awayScore ?? 0);
                  const aw = (m.awayScore ?? 0) > (m.homeScore ?? 0);
                  return (
                    <div
                      key={m.id}
                      className="px-4 py-2.5 flex items-center gap-2 text-sm"
                    >
                      <span className="text-slate-500 text-xs w-6 shrink-0">{m.divisionName}</span>
                      <span className={`flex-1 text-right truncate font-medium ${hw ? "text-white" : "text-slate-400"}`}>
                        {m.homeTeamName}
                      </span>
                      <span className="text-slate-200 font-bold tabular-nums text-xs shrink-0">
                        {m.homeScore} – {m.awayScore}
                      </span>
                      <span className={`flex-1 truncate font-medium ${aw ? "text-white" : "text-slate-400"}`}>
                        {m.awayTeamName}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="px-4 py-2 border-t border-slate-800">
                <Link href="/matches" className="text-xs text-slate-500 hover:text-amber-400 transition-colors">
                  All results →
                </Link>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
