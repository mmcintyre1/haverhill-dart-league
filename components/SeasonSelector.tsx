"use client";

import { useRouter } from "next/navigation";

export interface SeasonOption {
  id: number;
  name: string;
}

// basePath is the section's route root (e.g. "/leaderboard", "/players/42").
// Picking a season always navigates to the explicit basePath/[seasonId]
// route — even when picking the currently-active season — so the bare
// basePath page (the common case: no season/division/phase in the URL) can
// stay a plain Server Component that never reads searchParams and is
// eligible for real static/ISR caching. See lib/cache.ts for background.
export default function SeasonSelector({
  seasons,
  currentId,
  basePath,
}: {
  seasons: SeasonOption[];
  currentId: number | null;
  basePath: string;
}) {
  const router = useRouter();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    // Switching seasons resets division/phase filters.
    router.push(`${basePath}/${e.target.value}`);
  }

  return (
    <select
      value={currentId ?? ""}
      onChange={onChange}
      className="rounded border border-slate-600 bg-slate-700 px-3 py-1.5 text-sm text-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
    >
      {seasons.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}
