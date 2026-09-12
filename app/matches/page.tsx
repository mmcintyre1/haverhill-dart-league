import MatchesView from "./MatchesView";
import { getSeasons } from "./data";

export const revalidate = 86400;

// Bare /matches — the common case (current season, no filters). This page
// never reads searchParams, so unlike /matches/[seasonId] it's eligible
// for real static/ISR caching: Netlify's CDN can serve repeat hits without
// invoking the function at all. Switching season/division always
// navigates to the explicit [seasonId] route instead.
export default async function MatchesPage() {
  const allSeasons = await getSeasons();
  const activeId = allSeasons.find((s) => s.isActive)?.id ?? allSeasons[0]?.id;

  return <MatchesView basePath="/matches" allSeasons={allSeasons} activeId={activeId} divisionFilter={null} />;
}
