import { db, players } from "@/lib/db";
import PlayerView from "./PlayerView";
import { getActiveSeasonId, getSeasons } from "./data";

export const revalidate = 86400;

// This page never reads searchParams, so unlike /players/[id]/[seasonId]
// it's eligible for real static/ISR caching — Netlify's CDN can serve
// repeat hits (including crawler traffic, per robots.txt) without
// invoking the function at all, and generateStaticParams below actually
// gets to pre-render every player at build time.
export async function generateStaticParams() {
  const rows = await db.select({ id: players.id }).from(players);
  return rows.map((p) => ({ id: String(p.id) }));
}

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const playerId = parseInt(id);

  if (isNaN(playerId)) {
    return <div className="text-slate-400 py-16 text-center">Player not found.</div>;
  }

  const [allSeasons, trueActiveSeasonId] = await Promise.all([getSeasons(playerId), getActiveSeasonId()]);
  const activeId = allSeasons.find((s) => s.isActive)?.id ?? allSeasons[0]?.id;

  if (!activeId) {
    return <div className="text-slate-400 py-16 text-center">No seasons available.</div>;
  }

  return (
    <PlayerView
      playerId={playerId}
      basePath={`/players/${playerId}`}
      allSeasons={allSeasons}
      activeId={activeId}
      phase="REG"
      isActiveSeason={activeId === trueActiveSeasonId}
    />
  );
}
