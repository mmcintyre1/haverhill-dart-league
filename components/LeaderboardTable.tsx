"use client";

import { useState } from "react";
import Link from "next/link";

export interface LeaderboardRow {
  id: number;
  pos: number | null;
  playerName: string;
  teamName: string | null;
  wp: string | null;
  crkt: string | null;
  col601: string | null;
  col501: string | null;
  sos: string | null;
  hundredPlus: number | null;
  rnds: number | null;
  oneEighty: number | null;
  roHh: number | null;
  zeroOneHh: number | null;
  ro9: number | null;
  hOut: number | null;
  ldg: number | null;
  ro6b: number | null;
  avg: string | null;
  pts: number | null;
}

type SortKey = keyof LeaderboardRow;

const COLUMNS: { key: SortKey; label: string; title?: string }[] = [
  { key: "pos", label: "Pos" },
  { key: "playerName", label: "Name" },
  { key: "teamName", label: "Team" },
  { key: "wp", label: "WP", title: "Weeks Played" },
  { key: "crkt", label: "CRKT", title: "Cricket Record" },
  { key: "col601", label: "601" },
  { key: "col501", label: "501" },
  { key: "sos", label: "SOS", title: "Strength of Schedule" },
  { key: "hundredPlus", label: "100+", title: "100+ score total" },
  { key: "rnds", label: "RNDS", title: "Sets played" },
  { key: "oneEighty", label: "180" },
  { key: "roHh", label: "RO HH", title: "Rounds of Head-to-Head" },
  { key: "zeroOneHh", label: "01 HH", title: "01 Hot Hand" },
  { key: "ro9", label: "RO9", title: "9-mark cricket turns" },
  { key: "hOut", label: "H Out", title: "High Out (>100)" },
  { key: "ldg", label: "LDG", title: "Highest single-set average" },
  { key: "ro6b", label: "RO6B" },
  { key: "avg", label: "AVG", title: "Set Win %" },
  { key: "pts", label: "PTS", title: "Total Set Wins" },
];

function numericSort(a: LeaderboardRow, b: LeaderboardRow, key: SortKey, dir: 1 | -1) {
  const av = parseFloat(String(a[key] ?? "")) || 0;
  const bv = parseFloat(String(b[key] ?? "")) || 0;
  return (bv - av) * dir;
}

export default function LeaderboardTable({ rows }: { rows: LeaderboardRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("pts");
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  const sorted = [...rows].sort((a, b) => {
    if (sortKey === "playerName" || sortKey === "teamName") {
      return (String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? ""))) * sortDir * -1;
    }
    return numericSort(a, b, sortKey, sortDir);
  });

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 1 ? -1 : 1));
    } else {
      setSortKey(key);
      setSortDir(1);
    }
  }

  function arrow(key: SortKey) {
    if (key !== sortKey) return null;
    return sortDir === 1 ? " ↓" : " ↑";
  }

  if (rows.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400">
        <p className="text-lg font-medium">Season hasn&apos;t started yet</p>
        <p className="text-sm mt-1">Stats will appear once games are played.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-700 shadow-xl">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-slate-800 text-slate-200 border-b border-slate-600">
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                title={col.title}
                onClick={() => handleSort(col.key)}
                className={`px-2 py-2.5 text-center font-semibold cursor-pointer select-none whitespace-nowrap transition-colors ${
                  col.key === sortKey
                    ? "text-sky-400 bg-slate-700"
                    : "hover:bg-slate-700 hover:text-sky-300"
                }`}
              >
                {col.label}
                <span className="text-xs opacity-80">{arrow(col.key)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr
              key={`${row.playerName}-${i}`}
              className={`border-b border-slate-700/50 transition-colors hover:bg-slate-700/40 ${
                i % 2 === 0 ? "bg-slate-800" : "bg-slate-800/50"
              }`}
            >
              <td className="px-2 py-1.5 text-center text-slate-400 tabular-nums">{row.pos ?? i + 1}</td>
              <td className="px-2 py-1.5 whitespace-nowrap">
                <Link href={`/players/${row.id}`} className="font-medium text-sky-400 hover:text-sky-300 hover:underline">
                  {row.playerName}
                </Link>
              </td>
              <td className="px-2 py-1.5 text-slate-300 whitespace-nowrap">{row.teamName ?? "—"}</td>
              <td className="px-2 py-1.5 text-center text-slate-300 tabular-nums">{row.wp ?? "—"}</td>
              <td className="px-2 py-1.5 text-center text-slate-200 tabular-nums">{row.crkt ?? "—"}</td>
              <td className="px-2 py-1.5 text-center text-slate-300 tabular-nums">{row.col601 ?? "—"}</td>
              <td className="px-2 py-1.5 text-center text-slate-300 tabular-nums">{row.col501 ?? "—"}</td>
              <td className="px-2 py-1.5 text-center text-slate-400 tabular-nums">{row.sos ?? "—"}</td>
              <td className="px-2 py-1.5 text-center text-slate-200 tabular-nums">{row.hundredPlus ?? "—"}</td>
              <td className="px-2 py-1.5 text-center text-slate-400 tabular-nums">{row.rnds ?? "—"}</td>
              <td className="px-2 py-1.5 text-center text-slate-300 tabular-nums">{row.oneEighty ?? "—"}</td>
              <td className="px-2 py-1.5 text-center text-slate-400 tabular-nums">{row.roHh ?? "—"}</td>
              <td className="px-2 py-1.5 text-center text-slate-300 tabular-nums">{row.zeroOneHh ?? "—"}</td>
              <td className="px-2 py-1.5 text-center text-slate-300 tabular-nums">{row.ro9 ?? "—"}</td>
              <td className="px-2 py-1.5 text-center text-slate-200 tabular-nums">{row.hOut ?? "—"}</td>
              <td className="px-2 py-1.5 text-center text-slate-200 tabular-nums">{row.ldg ?? "—"}</td>
              <td className="px-2 py-1.5 text-center text-slate-400 tabular-nums">{row.ro6b ?? "—"}</td>
              <td className="px-2 py-1.5 text-center text-sky-300 font-medium tabular-nums">
                {row.avg != null
                  ? `${(parseFloat(row.avg) * 100).toFixed(1)}%`
                  : "—"}
              </td>
              <td className="px-2 py-1.5 text-center font-bold text-white tabular-nums">{row.pts ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
