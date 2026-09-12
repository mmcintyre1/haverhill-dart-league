import PlayerView from "../PlayerView";
import { getActiveSeasonId, getSeasons } from "../data";

// Explicit season/phase browsing — rarer traffic than the bare
// /players/[id] page (per product guidance: ~90% of visits just want the
// current season). Reading searchParams here forces this route fully
// dynamic, which is an acceptable tradeoff given how infrequently it's hit
// compared to the static default page.
export default async function PlayerSeasonPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; seasonId: string }>;
  searchParams: Promise<{ phase?: string }>;
}) {
  const { id, seasonId } = await params;
  const sp = await searchParams;
  const playerId = parseInt(id);

  if (isNaN(playerId)) {
    return <div className="text-slate-400 py-16 text-center">Player not found.</div>;
  }

  const [allSeasons, trueActiveSeasonId] = await Promise.all([getSeasons(playerId), getActiveSeasonId()]);
  const requestedId = parseInt(seasonId);
  const activeId = allSeasons.some((s) => s.id === requestedId)
    ? requestedId
    : allSeasons.find((s) => s.isActive)?.id ?? allSeasons[0]?.id;
  const phase = sp.phase ?? "REG";

  if (!activeId) {
    return <div className="text-slate-400 py-16 text-center">No seasons available.</div>;
  }

  return (
    <PlayerView
      playerId={playerId}
      basePath={`/players/${playerId}`}
      allSeasons={allSeasons}
      activeId={activeId}
      phase={phase}
      isActiveSeason={activeId === trueActiveSeasonId && phase === "REG"}
    />
  );
}
