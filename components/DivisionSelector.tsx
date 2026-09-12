"use client";

import { useRouter, useSearchParams } from "next/navigation";

// basePath/seasonId always target the explicit [seasonId] route — even when
// filtering the currently-active season — so the bare basePath page (no
// season/division/phase in the URL) can stay a plain Server Component with
// no searchParams reads and be eligible for real static/ISR caching.
export default function DivisionSelector({
  divisions,
  current,
  basePath,
  seasonId,
}: {
  divisions: string[];
  current: string; // "all" or a division name
  basePath: string;
  seasonId: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString());
    if (e.target.value === "all") {
      params.delete("division");
    } else {
      params.set("division", e.target.value);
    }
    const qs = params.toString();
    router.push(`${basePath}/${seasonId}${qs ? `?${qs}` : ""}`);
  }

  return (
    <select
      value={current}
      onChange={onChange}
      className="rounded border border-slate-600 bg-slate-700 px-3 py-1.5 text-sm text-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
    >
      <option value="all">All Divisions</option>
      {divisions.map((d) => (
        <option key={d} value={d}>
          Division {d}
        </option>
      ))}
    </select>
  );
}
