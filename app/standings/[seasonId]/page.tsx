import StandingsView from "../StandingsView";
import { getSeasons } from "../data";

// Explicit season/division browsing — rarer traffic than the bare
// /standings page (per product guidance: ~90% of visits just want the
// current season). Reading searchParams here forces this route fully
// dynamic, which is an acceptable tradeoff given how infrequently it's hit
// compared to the static default page.
export default async function StandingsSeasonPage({
  params,
  searchParams,
}: {
  params: Promise<{ seasonId: string }>;
  searchParams: Promise<{ division?: string }>;
}) {
  const { seasonId } = await params;
  const sp = await searchParams;
  const allSeasons = await getSeasons();

  const requestedId = parseInt(seasonId);
  const activeId = allSeasons.some((s) => s.id === requestedId)
    ? requestedId
    : allSeasons.find((s) => s.isActive)?.id ?? allSeasons[0]?.id;

  const divisionFilter = sp.division ?? null;

  return <StandingsView basePath="/standings" allSeasons={allSeasons} activeId={activeId} divisionFilter={divisionFilter} />;
}
