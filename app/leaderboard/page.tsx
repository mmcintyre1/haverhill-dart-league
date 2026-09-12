import LeaderboardView from "./LeaderboardView";
import { getSeasons } from "./data";

export const revalidate = 86400;

// Bare /leaderboard — the common case (current season, no filters). This
// page never reads searchParams, so unlike /leaderboard/[seasonId] it's
// eligible for real static/ISR caching: Netlify's CDN can serve repeat
// hits without invoking the function at all. Switching season/division/
// phase always navigates to the explicit [seasonId] route instead.
export default async function LeaderboardPage() {
  const allSeasons = await getSeasons();
  const activeId = allSeasons.find((s) => s.isActive)?.id ?? allSeasons[0]?.id;

  return (
    <LeaderboardView
      basePath="/leaderboard"
      allSeasons={allSeasons}
      activeId={activeId}
      divisionFilter={null}
      phase="REG"
      isActiveSeason
    />
  );
}
