import { db, siteContent } from "@/lib/db";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function getContent(): Promise<{ scoring: string | null }> {
  const [row] = await db
    .select()
    .from(siteContent)
    .where(eq(siteContent.key, "about.scoring"))
    .limit(1);
  return { scoring: row?.value ?? null };
}

export default async function AboutPage() {
  const { scoring } = await getContent();

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

      <section>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-base font-semibold text-slate-100">Stat Reference</h2>
          <div className="flex-1 h-px bg-slate-800" />
        </div>
        <p className="text-slate-500 text-sm">
          A full breakdown of how each stat is calculated — including game 3 rules and hot hand
          thresholds — is available inline on the{" "}
          <a href="/leaderboard" className="text-amber-400 hover:underline">Leaderboard</a>{" "}
          via the <span className="text-slate-300">ⓘ Scoring Guide</span> toggle.
        </p>
      </section>
    </div>
  );
}
