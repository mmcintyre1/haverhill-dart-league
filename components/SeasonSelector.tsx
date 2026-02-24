"use client";

import { useRouter, useSearchParams } from "next/navigation";

export interface SeasonOption {
  id: number;
  name: string;
}

export default function SeasonSelector({
  seasons,
  currentId,
}: {
  seasons: SeasonOption[];
  currentId: number | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("season", e.target.value);
    params.delete("division");
    router.push(`?${params.toString()}`);
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
