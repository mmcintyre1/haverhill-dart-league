"use client";

import { useState } from "react";
import Link from "next/link";

export interface LeaderboardRow {
  id: number;
  pos: number | null;
  playerName: string;
  teamName: string | null;
  divisionName: string | null;
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
  mpr: string | null;
  ppr: string | null;
  avg: string | null;
  pts: number | null;
}

type SortKey = keyof LeaderboardRow;

// sectionStart adds a visual left-border divider to group related columns
const COLUMNS: { key: SortKey; label: string; title?: string; sectionStart?: boolean }[] = [
  // Identity
  { key: "pos",          label: "Pos" },
  { key: "playerName",   label: "Name" },
  { key: "teamName",     label: "Team" },
  { key: "divisionName", label: "Div",  title: "Division" },
  { key: "wp",           label: "WP",   title: "Weeks Played" },
  // Records
  { key: "crkt",       label: "CRKT",  title: "Cricket Record",              sectionStart: true },
  { key: "col601",     label: "601" },
  { key: "col501",     label: "501" },
  { key: "sos",        label: "SOS",   title: "Strength of Schedule" },
  // 01 Games
  { key: "hundredPlus", label: "100+", title: "100+ score total",             sectionStart: true },
  { key: "oneEighty",  label: "180" },
  { key: "hOut",       label: "H Out", title: "High Out (>100)" },
  { key: "ppr",        label: "3DA",   title: "3-Dart Avg (01 games)" },
  { key: "zeroOneHh",  label: "01 HH", title: "01 Hot Hand" },
  { key: "ldg",        label: "LDG",   title: "Highest single-set avg (01)" },
  // Cricket
  { key: "rnds",       label: "RNDS",  title: "Cricket marks (legs 1+2)",     sectionStart: true },
  { key: "ro9",        label: "RO9",   title: "9-mark cricket turns" },
  { key: "mpr",        label: "MPR",   title: "Marks Per Round (Cricket)" },
  { key: "roHh",       label: "RO HH", title: "Rounds of Head-to-Head" },
  { key: "ro6b",       label: "RO6B" },
  // Summary
  { key: "avg",        label: "AVG",   title: "Set Win %",                    sectionStart: true },
  { key: "pts",        label: "PTS",   title: "Total Set Wins" },
];

function numericSort(a: LeaderboardRow, b: LeaderboardRow, key: SortKey, dir: 1 | -1) {
  const av = parseFloat(String(a[key] ?? "")) || 0;
  const bv = parseFloat(String(b[key] ?? "")) || 0;
  return (bv - av) * dir;
}

export default function LeaderboardTable({ rows, seasonId, phase }: { rows: LeaderboardRow[]; seasonId?: number; phase?: string }) {
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
        <p className="text-3xl mb-3 select-none">◎</p>
        <p className="text-lg font-medium">Season hasn&apos;t started yet</p>
        <p className="text-sm mt-1">Stats will appear once games are played.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-800 shadow-2xl">
      <table className="w-full text-sm border-collapse">
        <thead>
          {/* Column group headers */}
          <tr className="bg-slate-900/50 border-b border-slate-700/30">
            <th colSpan={5} className="px-2 py-1" />
            <th colSpan={4} className="px-2 py-1 text-center text-[0.6rem] uppercase tracking-wider text-slate-600 border-l border-slate-700/60 font-semibold">
              Records
            </th>
            <th colSpan={6} className="px-2 py-1 text-center text-[0.6rem] uppercase tracking-wider text-slate-600 border-l border-slate-700/60 font-semibold">
              01 Games
            </th>
            <th colSpan={5} className="px-2 py-1 text-center text-[0.6rem] uppercase tracking-wider text-slate-600 border-l border-slate-700/60 font-semibold">
              Cricket
            </th>
            <th colSpan={2} className="px-2 py-1 text-center text-[0.6rem] uppercase tracking-wider text-amber-600/70 border-l border-slate-700/60 font-semibold">
              Summary
            </th>
          </tr>
          <tr className="bg-slate-900 border-b border-slate-700/80">
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                title={col.title}
                onClick={() => handleSort(col.key)}
                className={`px-2 py-2 text-center font-medium cursor-pointer select-none whitespace-nowrap transition-colors text-[0.65rem] uppercase tracking-wider ${
                  col.sectionStart ? "border-l border-slate-700/60" : ""
                } ${
                  col.key === sortKey
                    ? "text-amber-400 bg-slate-800"
                    : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/60"
                }`}
              >
                {col.label}
                <span className="opacity-70">{arrow(col.key)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr
              key={`${row.playerName}-${i}`}
              className={`border-b border-slate-800 transition-colors hover:bg-amber-500/5 ${
                i % 2 === 0 ? "bg-slate-900" : "bg-slate-900/60"
              }`}
            >
              {/* Identity */}
              <td className="px-2 py-1.5 text-center text-slate-500 tabular-nums text-xs">{row.pos ?? i + 1}</td>
              <td className="px-2 py-1.5 whitespace-nowrap">
                <Link href={`/players/${row.id}${seasonId ? `?season=${seasonId}` : ""}${phase && phase !== "REG" ? `${seasonId ? "&" : "?"}phase=${phase}` : ""}`} className="font-semibold text-slate-100 hover:text-amber-400 transition-colors">
                  {row.playerName}
                </Link>
              </td>
              <td className="px-2 py-1.5 text-slate-400 whitespace-nowrap text-xs">{row.teamName ?? "—"}</td>
              <td className="px-2 py-1.5 text-center text-slate-500 text-xs">{row.divisionName ?? "—"}</td>
              <td className="px-2 py-1.5 text-center text-slate-500 tabular-nums text-xs">{row.wp ?? "—"}</td>
              {/* Records */}
              <td className="px-2 py-1.5 text-center text-slate-300 tabular-nums border-l border-slate-800">{row.crkt ?? "—"}</td>
              <td className="px-2 py-1.5 text-center text-slate-400 tabular-nums">{row.col601 ?? "—"}</td>
              <td className="px-2 py-1.5 text-center text-slate-400 tabular-nums">{row.col501 ?? "—"}</td>
              <td className="px-2 py-1.5 text-center text-slate-500 tabular-nums">{row.sos ?? "—"}</td>
              {/* 01 Games */}
              <td className="px-2 py-1.5 text-center text-slate-300 tabular-nums border-l border-slate-800">{row.hundredPlus ?? "—"}</td>
              <td className="px-2 py-1.5 text-center text-slate-400 tabular-nums">{row.oneEighty ?? "—"}</td>
              <td className="px-2 py-1.5 text-center text-slate-300 tabular-nums">{row.hOut ?? "—"}</td>
              <td className="px-2 py-1.5 text-center text-sky-400 tabular-nums font-medium">
                {row.ppr != null ? parseFloat(row.ppr).toFixed(1) : "—"}
              </td>
              <td className="px-2 py-1.5 text-center text-slate-400 tabular-nums">{row.zeroOneHh ?? "—"}</td>
              <td className="px-2 py-1.5 text-center text-slate-300 tabular-nums">{row.ldg ?? "—"}</td>
              {/* Cricket */}
              <td className="px-2 py-1.5 text-center text-slate-400 tabular-nums border-l border-slate-800">{row.rnds ?? "—"}</td>
              <td className="px-2 py-1.5 text-center text-slate-400 tabular-nums">{row.ro9 ?? "—"}</td>
              <td className="px-2 py-1.5 text-center text-emerald-400 tabular-nums font-medium">
                {row.mpr != null ? parseFloat(row.mpr).toFixed(2) : "—"}
              </td>
              <td className="px-2 py-1.5 text-center text-slate-500 tabular-nums">{row.roHh ?? "—"}</td>
              <td className="px-2 py-1.5 text-center text-slate-500 tabular-nums">{row.ro6b ?? "—"}</td>
              {/* Summary */}
              <td className="px-2 py-1.5 text-center text-sky-400 font-medium tabular-nums border-l border-slate-800">
                {row.avg != null
                  ? `${(parseFloat(row.avg) * 100).toFixed(1)}%`
                  : "—"}
              </td>
              <td className="px-2 py-1.5 text-center font-bold text-amber-400 tabular-nums">{row.pts ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
