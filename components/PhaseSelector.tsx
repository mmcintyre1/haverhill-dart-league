"use client";

import { useRouter, useSearchParams } from "next/navigation";

// basePath/seasonId always target the explicit [seasonId] route — even when
// filtering the currently-active season — so the bare basePath page (no
// season/division/phase in the URL) can stay a plain Server Component with
// no searchParams reads and be eligible for real static/ISR caching.
export default function PhaseSelector({
  current,
  basePath,
  seasonId,
}: {
  current: string;
  basePath: string;
  seasonId: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("phase", e.target.value);
    router.push(`${basePath}/${seasonId}?${params.toString()}`);
  }

  return (
    <select
      value={current}
      onChange={onChange}
      className="rounded border border-slate-600 bg-slate-700 px-3 py-1.5 text-sm text-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
    >
      <option value="REG">Regular Season</option>
      <option value="POST">Postseason</option>
    </select>
  );
}
