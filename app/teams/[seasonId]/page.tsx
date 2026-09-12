import TeamsView from "../TeamsView";
import { getSeasons } from "../data";

export const revalidate = 86400;

// Unlike the other sections' [seasonId] routes, this one reads no
// searchParams (teams has no division/phase filter) — so it can be
// pre-rendered per season too and stay static/ISR-cached, not just the
// bare default page.
export async function generateStaticParams() {
  const allSeasons = await getSeasons();
  return allSeasons.map((s) => ({ seasonId: String(s.id) }));
}

export default async function TeamsSeasonPage({
  params,
}: {
  params: Promise<{ seasonId: string }>;
}) {
  const { seasonId } = await params;
  const allSeasons = await getSeasons();

  const requestedId = parseInt(seasonId);
  const activeSeasonRow = allSeasons.find((s) => s.isActive) ?? allSeasons[0];
  const resolvedId = allSeasons.some((s) => s.id === requestedId) ? requestedId : activeSeasonRow?.id;

  return (
    <TeamsView
      basePath="/teams"
      allSeasons={allSeasons}
      activeId={resolvedId}
      isActiveSeason={resolvedId != null && resolvedId === activeSeasonRow?.id}
    />
  );
}
