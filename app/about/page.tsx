export const revalidate = 86400;

export default async function AboutPage() {
  return (
    <div className="max-w-3xl space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">About the League</h1>
        <p className="text-slate-500 text-sm">Who we are and how it works.</p>
      </div>

      {/* About */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-base font-semibold text-slate-100">About the Haverhill Dart League</h2>
          <div className="flex-1 h-px bg-slate-800" />
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 px-6 py-5">
          <p className="text-slate-300 text-sm leading-relaxed">
            We play on Tuesday nights. The Haverhill Dart League sponsors and teams reside in the
            greater Haverhill area. Any team out of a club in a city or town within 9 miles of the
            city center (use 323 Main St as an address) Haverhill, MA is welcome to join. We have
            teams playing out of Haverhill, Plaistow, NH, Merrimack, MA, Methuen, MA and Lawrence,
            MA. While affording short travel times for our players whenever possible, we promote
            sportsmanship, and hope to have our players grow in the sport by advancing through the
            divisions.
          </p>
        </div>
      </section>

      {/* Stat Reference */}
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
