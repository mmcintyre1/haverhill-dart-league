import StandingsView from "./StandingsView";
import { getSeasons } from "./data";

export const revalidate = 86400;

// Bare /standings — the common case (current season, no filters). This
// page never reads searchParams, so unlike /standings/[seasonId] it's
// eligible for real static/ISR caching: Netlify's CDN can serve repeat
// hits without invoking the function at all. Switching season/division
// always navigates to the explicit [seasonId] route instead.
export default async function StandingsPage() {
  const allSeasons = await getSeasons();
  const activeId = allSeasons.find((s) => s.isActive)?.id ?? allSeasons[0]?.id;

  return <StandingsView basePath="/standings" allSeasons={allSeasons} activeId={activeId} divisionFilter={null} />;
}
