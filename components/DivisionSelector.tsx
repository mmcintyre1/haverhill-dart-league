"use client";

import { useRouter, useSearchParams } from "next/navigation";

export default function DivisionSelector({
  divisions,
  current,
}: {
  divisions: string[];
  current: string; // "all" or a division name
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
    router.push(`?${params.toString()}`);
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
