import TeamsView from "./TeamsView";
import { getSeasons } from "./data";

export const revalidate = 86400;

// Bare /teams — the common case (current season). This page never reads
// searchParams, so unlike /teams/[seasonId] it's eligible for real
// static/ISR caching: Netlify's CDN can serve repeat hits without
// invoking the function at all. Switching season navigates to the
// explicit [seasonId] route instead.
export default async function TeamsPage() {
  const allSeasons = await getSeasons();
  const activeId = allSeasons.find((s) => s.isActive)?.id ?? allSeasons[0]?.id;

  return <TeamsView basePath="/teams" allSeasons={allSeasons} activeId={activeId} isActiveSeason />;
}
