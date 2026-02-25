"use client";

import { useState } from "react";
import type { ScoringPts } from "@/app/leaderboard/page";

// Mirrors the defaults in leaderboard/page.tsx
const DEFAULT_HH: Record<string, { hh: number; roHh: number }> = {
  A: { hh: 475, roHh: 20 },
  B: { hh: 450, roHh: 17 },
  C: { hh: 425, roHh: 14 },
  D: { hh: 400, roHh: 12 },
};

type Stat = { abbr: string; desc: string };

type Props = {
  scoringPts: ScoringPts;
  g3Cfg: Record<string, string>;
  hhThresholds: Record<string, { hh: number; roHh: number }>;
};

function g3on(cfg: Record<string, string>, key: string, defaultOn: boolean): boolean {
  const v = cfg[key];
  if (v === "true") return true;
  if (v === "false") return false;
  return defaultOn;
}

function effectiveHh(hhMap: Record<string, { hh: number; roHh: number }>, div: string) {
  return hhMap[div] ?? hhMap[""] ?? DEFAULT_HH[div] ?? { hh: 475, roHh: 20 };
}

function hhLine(hhMap: Record<string, { hh: number; roHh: number }>, key: "hh" | "roHh"): string {
  const divs = ["A", "B", "C", "D"] as const;
  const vals = divs.map((d) => effectiveHh(hhMap, d)[key]);
  if (vals.every((v) => v === vals[0])) return `≥ ${vals[0]} (all divisions)`;
  return divs.map((d, i) => `Div ${d} ≥ ${vals[i]}`).join(" · ");
}

function StatRow({ abbr, desc }: Stat) {
  return (
    <div className="grid grid-cols-[4.5rem_1fr] gap-2 py-1.5 border-b border-slate-800/50 last:border-0">
      <span className="font-mono text-amber-400/90 text-[0.7rem] font-semibold pt-px">{abbr}</span>
      <span className="text-slate-400 text-xs leading-relaxed">{desc}</span>
    </div>
  );
}

export default function ScoringGuide({ scoringPts, g3Cfg, hhThresholds }: Props) {
  const [open, setOpen] = useState(false);

  const sp = scoringPts;
  const allEqual = sp.cricket === sp["601"] && sp["601"] === sp["501"];
  const ptsLine = allEqual
    ? `${sp.cricket} pt${sp.cricket === 1 ? "" : "s"} per win (all game types).`
    : `Cricket ${sp.cricket} · 601 ${sp["601"]} · 501 ${sp["501"]} pts per win.`;

  const inc100p = g3on(g3Cfg, "g3.include_100plus", false);
  const incRnds = g3on(g3Cfg, "g3.include_rnds",    false);
  const incPerf = g3on(g3Cfg, "g3.include_perfect", false);
  const inc180  = g3on(g3Cfg, "g3.include_180",     true);
  const incRo9  = g3on(g3Cfg, "g3.include_ro9",     true);
  const incHout = g3on(g3Cfg, "g3.include_hout",    true);

  function legNote(on: boolean, perfNote?: string): string {
    if (on) return "All legs, including game 3 (tiebreaker).";
    if (perfNote && incPerf) return `Legs 1 & 2 only — game 3 ${perfNote} are also counted.`;
    return "Legs 1 & 2 only; game 3 (tiebreaker) excluded.";
  }

  const stats01: Stat[] = [
    {
      abbr: "100+",
      desc: `Cumulative 3-dart scores of 100+ in 01 games. ${legNote(inc100p, "180s")}`,
    },
    {
      abbr: "180",
      desc: `Perfect 3-dart turns of 180. ${legNote(inc180)}`,
    },
    {
      abbr: "H Out",
      desc: `Best single-turn checkout over 100. ${legNote(incHout)}`,
    },
    {
      abbr: "3DA",
      desc: "Average score per 3-dart turn across all 01 games.",
    },
    {
      abbr: "01 HH",
      desc: `Best single week where the weekly 100+ total meets the threshold — ${hhLine(hhThresholds, "hh")}.`,
    },
    {
      abbr: "LDG",
      desc: "Fewest darts thrown to win a 501 leg — season best.",
    },
  ];

  const statsCrkt: Stat[] = [
    {
      abbr: "RNDS",
      desc: `Cricket mark total for turns scoring ≥ 6 marks. ${legNote(incRnds, "RO9s (9-mark turns)")}`,
    },
    {
      abbr: "RO9",
      desc: `Turns scoring all 9 marks (three triples). ${legNote(incRo9)}`,
    },
    {
      abbr: "MPR",
      desc: "Average cricket marks scored per round, season-wide.",
    },
    {
      abbr: "RO HH",
      desc: `Best single week where the weekly cricket mark total meets the threshold — ${hhLine(hhThresholds, "roHh")}.`,
    },
    {
      abbr: "RO6B",
      desc: "Cricket rounds scoring 6 bull's-eye marks.",
    },
  ];

  return (
    <div className="mb-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
      >
        <span className="opacity-60 text-[0.8rem]">ⓘ</span>
        <span>Scoring Guide</span>
        <span className="opacity-40 text-[0.65rem]">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="mt-2 rounded-lg border border-slate-800 bg-slate-900/60 p-4 space-y-5">
          {/* AVG & Points */}
          <div>
            <p className="text-[0.65rem] uppercase tracking-wider text-slate-600 font-semibold mb-2">
              AVG &amp; Points
            </p>
            <p className="text-slate-400 text-xs leading-relaxed">
              {ptsLine}{" "}
              <span className="text-slate-500">
                AVG = earned pts ÷ available pts. PTS = total pts earned across the season.
              </span>
            </p>
          </div>

          {/* 01 Game Stats */}
          <div>
            <p className="text-[0.65rem] uppercase tracking-wider text-slate-600 font-semibold mb-1">
              01 Game Stats
            </p>
            {stats01.map((s) => (
              <StatRow key={s.abbr} {...s} />
            ))}
          </div>

          {/* Cricket Stats */}
          <div>
            <p className="text-[0.65rem] uppercase tracking-wider text-slate-600 font-semibold mb-1">
              Cricket Stats
            </p>
            {statsCrkt.map((s) => (
              <StatRow key={s.abbr} {...s} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
