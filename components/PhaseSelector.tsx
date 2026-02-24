"use client";

import { useRouter, useSearchParams } from "next/navigation";

export default function PhaseSelector({ current }: { current: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("phase", e.target.value);
    router.push(`?${params.toString()}`);
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
