import LeaderboardView from "../LeaderboardView";
import { getSeasons } from "../data";

// Explicit season/division/phase browsing — rarer traffic than the bare
// /leaderboard page (per product guidance: ~90% of visits just want the
// current season). Reading searchParams here forces this route fully
// dynamic, which is an acceptable tradeoff given how infrequently it's hit
// compared to the static default page.
export default async function LeaderboardSeasonPage({
  params,
  searchParams,
}: {
  params: Promise<{ seasonId: string }>;
  searchParams: Promise<{ division?: string; phase?: string }>;
}) {
  const { seasonId } = await params;
  const sp = await searchParams;
  const allSeasons = await getSeasons();

  const requestedId = parseInt(seasonId);
  const activeSeasonRow = allSeasons.find((s) => s.isActive) ?? allSeasons[0];
  const activeId = allSeasons.some((s) => s.id === requestedId) ? requestedId : activeSeasonRow?.id;

  const divisionFilter = sp.division ?? null;
  const phase = sp.phase ?? "REG";

  return (
    <LeaderboardView
      basePath="/leaderboard"
      allSeasons={allSeasons}
      activeId={activeId}
      divisionFilter={divisionFilter}
      phase={phase}
      isActiveSeason={activeId === activeSeasonRow?.id && divisionFilter == null && phase === "REG"}
    />
  );
}
