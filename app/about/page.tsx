import { db, siteContent } from "@/lib/db";
import { inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

type GlossaryEntry = { abbr: string; name: string; desc: string };

const FALLBACK_GLOSSARY: GlossaryEntry[] = [
  { abbr: "CRKT",   name: "Cricket Record",          desc: "Win-loss record in Cricket games (e.g. 11-3)." },
  { abbr: "601",    name: "601 Record",               desc: "Win-loss record in 601 games." },
  { abbr: "501",    name: "501 Record",               desc: "Win-loss record in 501 games." },
  { abbr: "SOS",    name: "Strength of Schedule",     desc: "Average winning percentage of opponents faced." },
  { abbr: "100+",   name: "100+ Scores",              desc: "Times you scored 100 or more in a single 3-dart turn." },
  { abbr: "180",    name: "180s",                     desc: "Perfect 3-dart scores of 180." },
  { abbr: "H Out",  name: "High Out",                 desc: "Highest checkout (finish) scored, must be over 100." },
  { abbr: "3DA",    name: "3-Dart Average",           desc: "Average score per 3-dart turn in 01 games." },
  { abbr: "01 HH",  name: "01 Hot Hand",              desc: "Best consecutive performance streak in 01 games." },
  { abbr: "LDG",    name: "Leg Average",              desc: "Highest single-leg average in 01 games." },
  { abbr: "RNDS",   name: "Cricket Marks",            desc: "Total cricket marks scored across legs 1 and 2." },
  { abbr: "RO9",    name: "9-Mark Turns",             desc: "Cricket turns where all 3 darts scored marks (9 total)." },
  { abbr: "MPR",    name: "Marks Per Round",          desc: "Average cricket marks scored per round." },
  { abbr: "RO HH",  name: "Rounds of Head-to-Head",   desc: "Number of head-to-head match rounds played." },
  { abbr: "RO6B",   name: "RO6B",                    desc: "Rounds played in 6-bull format." },
  { abbr: "AVG",    name: "Set Win %",                desc: "Percentage of individual sets (games) won." },
  { abbr: "PTS",    name: "Points",                   desc: "Total set wins accumulated across all match weeks." },
];

async function getContent(): Promise<{ scoring: string | null; glossary: GlossaryEntry[] }> {
  const rows = await db
    .select()
    .from(siteContent)
    .where(inArray(siteContent.key, ["about.scoring", "about.glossary"]));

  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  let glossary = FALLBACK_GLOSSARY;
  if (map["about.glossary"]) {
    try {
      const parsed = JSON.parse(map["about.glossary"]);
      if (Array.isArray(parsed)) glossary = parsed;
    } catch {
      // fall through to default
    }
  }

  return { scoring: map["about.scoring"] ?? null, glossary };
}

export default async function AboutPage() {
  const { scoring, glossary } = await getContent();

  return (
    <div className="max-w-3xl space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">About the League</h1>
        <p className="text-slate-500 text-sm">How it works and what everything means.</p>
      </div>

      {/* Scoring */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-base font-semibold text-slate-100">How Scoring Works</h2>
          <div className="flex-1 h-px bg-slate-800" />
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 px-6 py-5">
          {scoring ? (
            <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">{scoring}</p>
          ) : (
            <p className="text-slate-500 text-sm italic">
              Scoring information hasn&apos;t been added yet. Check back soon, or ask the league admin.
            </p>
          )}
        </div>
      </section>

      {/* Stat Glossary */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-base font-semibold text-slate-100">Stat Glossary</h2>
          <div className="flex-1 h-px bg-slate-800" />
        </div>
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-950 border-b border-slate-700/80">
                <th className="px-4 py-2.5 text-left text-[0.65rem] uppercase tracking-wider text-slate-500 font-semibold w-20">Abbr</th>
                <th className="px-4 py-2.5 text-left text-[0.65rem] uppercase tracking-wider text-slate-500 font-semibold w-40">Stat</th>
                <th className="px-4 py-2.5 text-left text-[0.65rem] uppercase tracking-wider text-slate-500 font-semibold">Description</th>
              </tr>
            </thead>
            <tbody>
              {glossary.map((entry, i) => (
                <tr
                  key={entry.abbr}
                  className={`border-b border-slate-800 ${i % 2 === 0 ? "bg-slate-900" : "bg-slate-900/60"}`}
                >
                  <td className="px-4 py-2.5 font-mono text-amber-400 font-semibold text-xs whitespace-nowrap">
                    {entry.abbr}
                  </td>
                  <td className="px-4 py-2.5 text-slate-200 text-xs whitespace-nowrap">{entry.name}</td>
                  <td className="px-4 py-2.5 text-slate-400 text-xs leading-relaxed">{entry.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
