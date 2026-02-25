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
  { key: "col601",     label: "601",                                          sectionStart: true },
  { key: "crkt",       label: "CRKT",  title: "Cricket Record" },
  { key: "col501",     label: "501" },
  { key: "sos",        label: "SOS",   title: "Strength of Schedule" },
  // 01 Games
  { key: "hundredPlus", label: "100+", title: "100+ score total",             sectionStart: true },
  { key: "oneEighty",  label: "180" },
  { key: "hOut",       label: "H Out", title: "High Out (>100)" },
  { key: "ppr",        label: "3DA",   title: "3-Dart Avg (01 games)" },
  { key: "zeroOneHh",  label: "01 HH", title: "01 Hot Hand" },
  { key: "ldg",        label: "LDG",   title: "Lowest darts to win a 501 leg" },
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

import type { ScoringPts } from "@/app/leaderboard/page";

function parseRecord(s: string | null): { w: number; l: number } {
  if (!s) return { w: 0, l: 0 };
  const parts = s.split("-").map(Number);
  return { w: parts[0] || 0, l: parts[1] || 0 };
}

function computeCustomAvg(row: LeaderboardRow, sp: ScoringPts): number | null {
  const crkt = parseRecord(row.crkt);
  const r601 = parseRecord(row.col601);
  const r501 = parseRecord(row.col501);
  const earned = crkt.w * sp.cricket + r601.w * sp["601"] + r501.w * sp["501"];
  const avail = (crkt.w + crkt.l) * sp.cricket + (r601.w + r601.l) * sp["601"] + (r501.w + r501.l) * sp["501"];
  return avail > 0 ? earned / avail : null;
}

function computeCustomPts(row: LeaderboardRow, sp: ScoringPts): number | null {
  const crkt = parseRecord(row.crkt);
  const r601 = parseRecord(row.col601);
  const r501 = parseRecord(row.col501);
  const avail = (crkt.w + crkt.l) + (r601.w + r601.l) + (r501.w + r501.l);
  if (avail === 0) return null;
  return crkt.w * sp.cricket + r601.w * sp["601"] + r501.w * sp["501"];
}

// ── Mobile helpers ───────────────────────────────────────────────────────────

function StatLine({
  label,
  value,
  fire,
  green,
}: {
  label: string;
  value: string | number | null;
  fire?: boolean;
  green?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-px">
      <span className="text-slate-600 shrink-0">{label}</span>
      <span
        className={`tabular-nums ${
          fire && value != null
            ? "text-rose-400 font-semibold"
            : green
            ? "text-emerald-400 font-medium"
            : "text-slate-400"
        }`}
      >
        {value != null ? `${value}${fire ? " 🔥" : ""}` : "—"}
      </span>
    </div>
  );
}

function MobileCard({
  row,
  idx,
  sp,
  seasonId,
  phase,
}: {
  row: LeaderboardRow;
  idx: number;
  sp: ScoringPts;
  seasonId?: number;
  phase?: string;
}) {
  const customAvg = computeCustomAvg(row, sp);
  const customPts = computeCustomPts(row, sp);
  const avgDisplay =
    customAvg != null
      ? `${(customAvg * 100).toFixed(1)}%`
      : row.avg != null
      ? `${(parseFloat(row.avg) * 100).toFixed(1)}%`
      : "—";
  const ptsDisplay =
    customPts != null
      ? Number.isInteger(customPts)
        ? String(customPts)
        : customPts.toFixed(1)
      : String(row.pts ?? "—");

  const href = `/players/${row.id}${seasonId ? `?season=${seasonId}` : ""}${
    phase && phase !== "REG"
      ? `${seasonId ? "&" : "?"}phase=${phase}`
      : ""
  }`;

  const records: [string, string | null][] = [
    ["CRKT", row.crkt],
    ["601", row.col601],
    ["501", row.col501],
  ];

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-3 space-y-2">
      {/* Header: position + name + summary stats */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-slate-500 text-xs tabular-nums shrink-0">
            {row.pos ?? idx + 1}
          </span>
          <Link
            href={href}
            className="font-semibold text-slate-100 hover:text-amber-400 transition-colors leading-tight"
          >
            {row.playerName}
          </Link>
        </div>
        <div className="shrink-0 text-right">
          <span className="text-amber-400 font-bold tabular-nums">{ptsDisplay}</span>
          <span className="text-slate-500 text-xs ml-1">pts</span>
          <span className="text-amber-300/80 tabular-nums text-xs ml-2">{avgDisplay}</span>
        </div>
      </div>

      {/* Team / division */}
      {(row.teamName || row.divisionName) && (
        <p className="text-slate-500 text-xs">
          {row.teamName ?? ""}
          {row.teamName && row.divisionName ? " · " : ""}
          {row.divisionName ? `Div ${row.divisionName}` : ""}
        </p>
      )}

      {/* Records */}
      <div className="flex gap-4 text-xs">
        {records.map(([label, val]) => (
          <div key={label} className="flex gap-1.5">
            <span className="text-slate-600">{label}</span>
            <span className="text-slate-300 tabular-nums whitespace-nowrap">{val ?? "—"}</span>
          </div>
        ))}
      </div>

      {/* Stats grid: 01 Games | Cricket */}
      <div className="grid grid-cols-2 gap-x-6 text-xs pt-2 border-t border-slate-800/80">
        <div>
          <p className="text-[0.6rem] uppercase tracking-wider text-slate-600 font-semibold mb-1.5">
            01 Games
          </p>
          <StatLine label="100+" value={row.hundredPlus} />
          <StatLine label="180" value={row.oneEighty} />
          <StatLine label="H Out" value={row.hOut} />
          <StatLine
            label="3DA"
            value={row.ppr != null ? parseFloat(row.ppr).toFixed(1) : null}
          />
          <StatLine label="01 HH" value={row.zeroOneHh} fire />
          <StatLine label="LDG" value={row.ldg} />
        </div>
        <div>
          <p className="text-[0.6rem] uppercase tracking-wider text-slate-600 font-semibold mb-1.5">
            Cricket
          </p>
          <StatLine label="RNDS" value={row.rnds} />
          <StatLine label="RO9" value={row.ro9} />
          <StatLine
            label="MPR"
            value={row.mpr != null ? parseFloat(row.mpr).toFixed(2) : null}
            green
          />
          <StatLine label="RO HH" value={row.roHh} fire />
          <StatLine label="RO6B" value={row.ro6b} />
        </div>
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function LeaderboardTable({
  rows,
  seasonId,
  phase,
  scoringPts,
}: {
  rows: LeaderboardRow[];
  seasonId?: number;
  phase?: string;
  scoringPts?: ScoringPts;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("pts");
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  const sp = scoringPts ?? { cricket: 1, "601": 1, "501": 1 };

  const sorted = [...rows].sort((a, b) => {
    if (sortKey === "playerName" || sortKey === "teamName") {
      return (String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? ""))) * sortDir * -1;
    }
    if (sortKey === "pts") {
      const av = computeCustomPts(a, sp) ?? 0;
      const bv = computeCustomPts(b, sp) ?? 0;
      return (bv - av) * sortDir;
    }
    if (sortKey === "ldg") {
      // Lower darts = better; null/0 always last
      const av = a.ldg ?? 0;
      const bv = b.ldg ?? 0;
      if (av === 0 && bv === 0) return 0;
      if (av === 0) return 1;
      if (bv === 0) return -1;
      return (av - bv) * sortDir;
    }
    return numericSort(a, b, sortKey, sortDir);
  });

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 1 ? -1 : 1));
    } else {
      setSortKey(key);
      setSortDir(key === "ldg" ? -1 : 1);
    }
  }

  function arrow(key: SortKey) {
    if (key !== sortKey) return null;
    return sortDir === 1 ? " ↓" : " ↑";
  }

  function exportCSV() {
    const headers = [
      "Pos", "Name", "Team", "Div", "WP",
      "601", "CRKT", "501", "SOS",
      "100+", "180", "H Out", "3DA", "01 HH", "LDG",
      "RNDS", "RO9", "MPR", "RO HH", "RO6B",
      "AVG", "PTS",
    ];
    const csvRows = sorted.map((row, i) => {
      const customAvg = computeCustomAvg(row, sp);
      const avgDisplay = customAvg != null
        ? `${(customAvg * 100).toFixed(1)}%`
        : row.avg != null ? `${(parseFloat(row.avg) * 100).toFixed(1)}%` : "";
      const customPts = computeCustomPts(row, sp);
      const ptsDisplay = customPts != null
        ? (Number.isInteger(customPts) ? String(customPts) : customPts.toFixed(1))
        : String(row.pts ?? "");
      const cells = [
        String(row.pos ?? i + 1),
        row.playerName,
        row.teamName ?? "",
        row.divisionName ?? "",
        row.wp ?? "",
        row.col601 ?? "",
        row.crkt ?? "",
        row.col501 ?? "",
        row.sos ?? "",
        String(row.hundredPlus ?? ""),
        String(row.oneEighty ?? ""),
        String(row.hOut ?? ""),
        row.ppr != null ? parseFloat(row.ppr).toFixed(1) : "",
        String(row.zeroOneHh ?? ""),
        String(row.ldg ?? ""),
        String(row.rnds ?? ""),
        String(row.ro9 ?? ""),
        row.mpr != null ? parseFloat(row.mpr).toFixed(2) : "",
        String(row.roHh ?? ""),
        String(row.ro6b ?? ""),
        avgDisplay,
        ptsDisplay,
      ];
      return cells.map((v) => `"${v.replace(/"/g, '""')}"`).join(",");
    });
    const csv = [headers.join(","), ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "leaderboard.csv";
    a.click();
    URL.revokeObjectURL(url);
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
    <>
      {/* ── Mobile: sort dropdown + player cards ─────────────────────────── */}
      <div className="sm:hidden space-y-2">
        <div className="flex items-center gap-2 mb-3">
          <label className="text-xs text-slate-500 shrink-0">Sort by</label>
          <select
            value={sortKey}
            onChange={(e) => {
              const k = e.target.value as SortKey;
              setSortKey(k);
              setSortDir(k === "ldg" ? -1 : 1);
            }}
            className="flex-1 bg-slate-800 border border-slate-700 text-slate-300 text-xs rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
          >
            <option value="pts">PTS</option>
            <option value="avg">AVG</option>
            <option value="hundredPlus">100+</option>
            <option value="oneEighty">180</option>
            <option value="ppr">3-Dart Avg</option>
            <option value="zeroOneHh">01 Hot Hand</option>
            <option value="ldg">LDG (fewest darts)</option>
            <option value="rnds">RNDS</option>
            <option value="ro9">RO9</option>
            <option value="mpr">MPR</option>
            <option value="roHh">RO Hot Hand</option>
            <option value="playerName">Name</option>
          </select>
        </div>
        {sorted.map((row, i) => (
          <MobileCard
            key={`${row.playerName}-${i}`}
            row={row}
            idx={i}
            sp={sp}
            seasonId={seasonId}
            phase={phase}
          />
        ))}
      </div>

      {/* ── Desktop: export button + scrollable table ─────────────────────── */}
      <div className="hidden sm:block">
        <div className="flex justify-end mb-2">
          <button
            onClick={exportCSV}
            className="px-3 py-1.5 rounded text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors"
          >
            Export CSV
          </button>
        </div>
        <div className="overflow-x-auto rounded-lg border border-slate-800 shadow-2xl">
          <table className="w-full text-sm border-collapse whitespace-nowrap">
            <thead>
              {/* Column group headers */}
              <tr className="bg-slate-950/80 border-b border-slate-700/30">
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
              <tr className="bg-slate-950 border-b border-slate-700/80">
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
                    <Link
                      href={`/players/${row.id}${seasonId ? `?season=${seasonId}` : ""}${phase && phase !== "REG" ? `${seasonId ? "&" : "?"}phase=${phase}` : ""}`}
                      className="font-semibold text-slate-100 hover:text-amber-400 transition-colors"
                    >
                      {row.playerName}
                    </Link>
                  </td>
                  <td className="px-2 py-1.5 text-slate-400 whitespace-nowrap text-xs">{row.teamName ?? "—"}</td>
                  <td className="px-2 py-1.5 text-center text-slate-500 text-xs">{row.divisionName ?? "—"}</td>
                  <td className="px-2 py-1.5 text-center text-slate-500 tabular-nums text-xs">{row.wp ?? "—"}</td>
                  {/* Records */}
                  <td className="px-2 py-1.5 text-center text-slate-400 tabular-nums border-l border-slate-800">{row.col601 ?? "—"}</td>
                  <td className="px-2 py-1.5 text-center text-slate-300 tabular-nums">{row.crkt ?? "—"}</td>
                  <td className="px-2 py-1.5 text-center text-slate-400 tabular-nums">{row.col501 ?? "—"}</td>
                  <td className="px-2 py-1.5 text-center text-slate-500 tabular-nums">{row.sos ?? "—"}</td>
                  {/* 01 Games */}
                  <td className="px-2 py-1.5 text-center text-slate-300 tabular-nums border-l border-slate-800">{row.hundredPlus ?? "—"}</td>
                  <td className="px-2 py-1.5 text-center text-slate-400 tabular-nums">{row.oneEighty ?? "—"}</td>
                  <td className="px-2 py-1.5 text-center text-slate-300 tabular-nums">{row.hOut ?? "—"}</td>
                  <td className="px-2 py-1.5 text-center text-amber-300 tabular-nums font-medium">
                    {row.ppr != null ? parseFloat(row.ppr).toFixed(1) : "—"}
                  </td>
                  <td className={`px-2 py-1.5 text-center tabular-nums ${row.zeroOneHh != null ? "text-rose-400 font-semibold" : "text-slate-400"}`}>
                    {row.zeroOneHh != null ? `${row.zeroOneHh} 🔥` : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-center text-slate-300 tabular-nums">{row.ldg ?? "—"}</td>
                  {/* Cricket */}
                  <td className="px-2 py-1.5 text-center text-slate-400 tabular-nums border-l border-slate-800">{row.rnds ?? "—"}</td>
                  <td className="px-2 py-1.5 text-center text-slate-400 tabular-nums">{row.ro9 ?? "—"}</td>
                  <td className="px-2 py-1.5 text-center text-emerald-400 tabular-nums font-medium">
                    {row.mpr != null ? parseFloat(row.mpr).toFixed(2) : "—"}
                  </td>
                  <td className={`px-2 py-1.5 text-center tabular-nums ${row.roHh != null ? "text-rose-400 font-semibold" : "text-slate-500"}`}>
                    {row.roHh != null ? `${row.roHh} 🔥` : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-center text-slate-500 tabular-nums">{row.ro6b ?? "—"}</td>
                  {/* Summary */}
                  <td className="px-2 py-1.5 text-center text-amber-300 font-medium tabular-nums border-l border-slate-800">
                    {(() => {
                      const customAvg = computeCustomAvg(row, sp);
                      return customAvg != null
                        ? `${(customAvg * 100).toFixed(1)}%`
                        : row.avg != null ? `${(parseFloat(row.avg) * 100).toFixed(1)}%` : "—";
                    })()}
                  </td>
                  <td className="px-2 py-1.5 text-center font-bold text-amber-400 tabular-nums">
                    {(() => {
                      const v = computeCustomPts(row, sp);
                      if (v == null) return row.pts ?? "—";
                      return Number.isInteger(v) ? v : v.toFixed(1);
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
