"use client";

import { useState, useEffect } from "react";

type Season = {
  id: number;
  name: string;
  isActive: boolean;
  lastScrapedAt: Date | null;
};

type TabId = "posts" | "refresh" | "content" | "scoring";

// ── Tab bar ──────────────────────────────────────────────────────────────────

function TabBar({ active, onChange }: { active: TabId; onChange: (t: TabId) => void }) {
  const tabs: { id: TabId; label: string }[] = [
    { id: "posts", label: "News Posts" },
    { id: "refresh", label: "Data Refresh" },
    { id: "content", label: "Site Content" },
    { id: "scoring", label: "Scoring" },
  ];
  return (
    <div className="flex gap-1 mb-6 border-b border-slate-800">
      {tabs.map(({ id, label }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={`px-4 py-2 text-sm font-medium rounded-t transition-colors ${
            active === id
              ? "text-amber-400 border-b-2 border-amber-400 -mb-px"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ── Result banner ─────────────────────────────────────────────────────────────

type Result = { ok: boolean; message: string; detail?: string };

function ResultBanner({ result, onDismiss }: { result: Result; onDismiss: () => void }) {
  return (
    <div
      className={`mt-4 rounded-lg px-4 py-3 text-sm flex items-start justify-between gap-3 ${
        result.ok
          ? "bg-emerald-900/40 border border-emerald-700 text-emerald-300"
          : "bg-red-900/40 border border-red-700 text-red-300"
      }`}
    >
      <div>
        <span className="font-medium">{result.ok ? "✓" : "✗"} </span>
        {result.message}
        {result.detail && (
          <pre className="mt-2 text-xs opacity-70 whitespace-pre-wrap font-mono">{result.detail}</pre>
        )}
      </div>
      <button onClick={onDismiss} className="shrink-0 opacity-50 hover:opacity-100 text-base leading-none">
        ×
      </button>
    </div>
  );
}

// ── Posts tab ─────────────────────────────────────────────────────────────────

function PostsTab({ secret }: { secret: string }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [author, setAuthor] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (secret) headers["Authorization"] = `Bearer ${secret}`;
      const res = await fetch("/api/admin/news", {
        method: "POST",
        headers,
        body: JSON.stringify({ title, body, author: author || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Unknown error");
      setResult({ ok: true, message: `Post created (id: ${data.id})` });
      setTitle(""); setBody(""); setAuthor("");
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs uppercase tracking-wider text-slate-400 mb-1">Title *</label>
        <input
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
          placeholder="Post title"
        />
      </div>
      <div>
        <label className="block text-xs uppercase tracking-wider text-slate-400 mb-1">Body *</label>
        <textarea
          required
          rows={6}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="w-full rounded bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500 resize-y"
          placeholder="Post content…"
        />
      </div>
      <div>
        <label className="block text-xs uppercase tracking-wider text-slate-400 mb-1">Author</label>
        <input
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          className="w-full rounded bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
          placeholder="Optional"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="px-5 py-2 rounded bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
      >
        {loading ? "Creating…" : "Create Post"}
      </button>
      {result && <ResultBanner result={result} onDismiss={() => setResult(null)} />}
    </form>
  );
}

// ── Refresh tab ───────────────────────────────────────────────────────────────

type RefreshMode = "active" | "season" | "all" | "all-force";

function RefreshTab({ seasons, secret }: { seasons: Season[]; secret: string }) {
  const [mode, setMode] = useState<RefreshMode>("active");
  const [seasonId, setSeasonId] = useState<number>(seasons[0]?.id ?? 0);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function handleRefresh(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    const payload: Record<string, unknown> =
      mode === "active"    ? {} :
      mode === "season"    ? { seasonId } :
      mode === "all"       ? { all: true } :
                             { all: true, force: true };

    // NEXT_PUBLIC_SCRAPE_BG_URL is set on Netlify to "/.netlify/functions/scrape-background".
    // Calling the background function directly from the browser avoids the Next.js API route
    // timeout — Netlify returns 202 immediately and runs the function for up to 15 minutes.
    // When unset (local dev), falls back to /api/scrape which runs synchronously.
    const bgUrl = process.env.NEXT_PUBLIC_SCRAPE_BG_URL;

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (secret) headers["Authorization"] = `Bearer ${secret}`;

      const scrapeUrl = bgUrl ?? "/api/scrape";
      const res = await fetch(scrapeUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ ...payload, triggeredBy: "manual" }),
      });

      // Background function returns 202 immediately; API route returns 200 with JSON
      const isBackground = res.status === 202;

      if (!isBackground) {
        const text = await res.text();
        let data: Record<string, unknown>;
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error(`Server returned non-JSON (status ${res.status}) — likely a function timeout. Response: ${text.slice(0, 200)}`);
        }
        if (!res.ok) throw new Error((data.error as string) ?? "Unknown error");

        // Synchronous result (local dev)
        if (data.status !== "running") {
          const msg = `Scraped ${data.seasonsScraped} season(s) — ${data.playersUpdated} players, ${data.matchesUpdated} matches updated.`;
          setResult({ ok: true, message: msg, detail: JSON.stringify(data.debug ?? {}, null, 2) });
          setLoading(false);
          return;
        }
      }

      // Background path: poll for completion
      setResult({ ok: true, message: "Scrape running in background — checking for completion…" });
      const start = Date.now();
      const poll = async (): Promise<void> => {
        if (Date.now() - start > 15 * 60 * 1000) {
          setResult({ ok: false, message: "Timed out waiting for scrape to complete after 15 minutes." });
          setLoading(false);
          return;
        }
        await new Promise((r) => setTimeout(r, 4000));
        try {
          const statusRes = await fetch("/api/scrape/status");
          const entry = await statusRes.json() as { status: string; playersUpdated?: number; matchesUpdated?: number; errorMessage?: string } | null;
          if (!entry) { poll(); return; }
          if (entry.status === "success") {
            setResult({ ok: true, message: `Scrape complete — ${entry.playersUpdated ?? 0} players, ${entry.matchesUpdated ?? 0} matches updated.` });
            setLoading(false);
          } else if (entry.status === "error") {
            setResult({ ok: false, message: entry.errorMessage ?? "Scrape failed." });
            setLoading(false);
          } else {
            poll();
          }
        } catch { poll(); }
      };
      poll();
      return; // loading stays true until poll() resolves
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : String(e) });
      setLoading(false);
    }
  }

  const modeOptions: { value: RefreshMode; label: string; description: string }[] = [
    { value: "active",    label: "Active season only",        description: "Fast — re-scrapes players, matches, and scores for the current season." },
    { value: "season",    label: "Specific season",           description: "Full stats pipeline for one season." },
    { value: "all",       label: "All unscraped seasons",     description: "Runs the full pipeline for any season that hasn't been scraped yet." },
    { value: "all-force", label: "All seasons (force)",       description: "Re-scrapes every season regardless of lastScrapedAt. Slow." },
  ];

  return (
    <form onSubmit={handleRefresh} className="space-y-5">
      <div>
        <label className="block text-xs uppercase tracking-wider text-slate-400 mb-2">Mode</label>
        <div className="space-y-2">
          {modeOptions.map(({ value, label, description }) => (
            <label key={value} className="flex items-start gap-3 cursor-pointer">
              <input
                type="radio"
                name="mode"
                value={value}
                checked={mode === value}
                onChange={() => setMode(value)}
                className="mt-0.5 accent-amber-500"
              />
              <span>
                <span className="text-sm font-medium text-slate-200">{label}</span>
                <span className="block text-xs text-slate-500 mt-0.5">{description}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {mode === "season" && (
        <div>
          <label className="block text-xs uppercase tracking-wider text-slate-400 mb-1">Season</label>
          <select
            value={seasonId}
            onChange={(e) => setSeasonId(Number(e.target.value))}
            className="w-full rounded bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
          >
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}{s.isActive ? " (active)" : ""}{s.lastScrapedAt ? " ✓" : ""}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">✓ = already scraped</p>
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="px-5 py-2 rounded bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
      >
        {loading && (
          <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        )}
        {loading ? "Running…" : "Run Refresh"}
      </button>

      {result && <ResultBanner result={result} onDismiss={() => setResult(null)} />}
    </form>
  );
}

// ── Content tab ───────────────────────────────────────────────────────────────

const DEFAULT_GLOSSARY = JSON.stringify([
  { abbr: "CRKT",   name: "Cricket Record",         desc: "Win-loss record in Cricket games (e.g. 11-3)." },
  { abbr: "601",    name: "601 Record",              desc: "Win-loss record in 601 games." },
  { abbr: "501",    name: "501 Record",              desc: "Win-loss record in 501 games." },
  { abbr: "SOS",    name: "Strength of Schedule",    desc: "Average winning percentage of opponents faced." },
  { abbr: "100+",   name: "100+ Scores",             desc: "Cumulative count of 3-dart turns scoring 100 or more in 01 games (legs 1 and 2 only), tallied across the season." },
  { abbr: "180",    name: "180s",                    desc: "Perfect 3-dart scores of 180." },
  { abbr: "H Out",  name: "High Out",                desc: "Highest checkout (finish) scored, must be over 100. All 3 game types count." },
  { abbr: "3DA",    name: "3-Dart Average",          desc: "Average score per 3-dart turn across all 01 games." },
  { abbr: "01 HH",  name: "01 Hot Hand",             desc: "Highest total hot hand score in 01 games." },
  { abbr: "LDG",    name: "Low Dart Game",            desc: "Fewest darts used to win a 501 leg, tracked as the best (lowest) across the season." },
  { abbr: "RNDS",   name: "Cricket Marks",           desc: "Total cricket marks for turns at or above 6 marks, legs 1 and 2 only." },
  { abbr: "RO9",    name: "9-Mark Turns",            desc: "Cricket turns with three triples (9 marks)." },
  { abbr: "MPR",    name: "Marks Per Round",         desc: "Average cricket marks scored per round across all cricket games." },
  { abbr: "RO HH",  name: "Rounds Hot Hand",         desc: "Highest hot hand rounds in cricket." },
  { abbr: "RO6B",   name: "RO6B",                   desc: "Rounds of 6 bull's eyes hit." },
  { abbr: "AVG",    name: "Set Win %",               desc: "Percentage of individual sets (games) won." },
  { abbr: "PTS",    name: "Points",                  desc: "Total set wins accumulated across all match weeks." },
], null, 2);

function ContentTab({ secret }: { secret: string }) {
  const [scoring, setScoring] = useState("");
  const [glossary, setGlossary] = useState(DEFAULT_GLOSSARY);
  const [fetching, setFetching] = useState(true);
  const [scoringLoading, setScoringLoading] = useState(false);
  const [glossaryLoading, setGlossaryLoading] = useState(false);
  const [scoringResult, setScoringResult] = useState<Result | null>(null);
  const [glossaryResult, setGlossaryResult] = useState<Result | null>(null);

  useEffect(() => {
    async function load() {
      const headers: Record<string, string> = {};
      if (secret) headers["Authorization"] = `Bearer ${secret}`;
      const res = await fetch("/api/admin/content", { headers });
      if (res.ok) {
        const data = await res.json();
        if (data["about.scoring"]) setScoring(data["about.scoring"]);
        if (data["about.glossary"]) setGlossary(data["about.glossary"]);
      }
      setFetching(false);
    }
    load();
  }, [secret]);

  async function save(key: string, value: string, setLoading: (v: boolean) => void, setResult: (r: Result | null) => void) {
    setLoading(true);
    setResult(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (secret) headers["Authorization"] = `Bearer ${secret}`;
      const res = await fetch("/api/admin/content", {
        method: "POST",
        headers,
        body: JSON.stringify({ key, value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Unknown error");
      setResult({ ok: true, message: "Saved successfully." });
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  }

  if (fetching) {
    return <div className="text-slate-500 text-sm py-4">Loading content…</div>;
  }

  return (
    <div className="space-y-8">
      {/* Scoring explanation */}
      <div>
        <label className="block text-xs uppercase tracking-wider text-slate-400 mb-1">Scoring Explanation</label>
        <p className="text-xs text-slate-500 mb-2">Plain text shown on the About page under "How Scoring Works".</p>
        <textarea
          rows={6}
          value={scoring}
          onChange={(e) => setScoring(e.target.value)}
          className="w-full rounded bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500 resize-y"
          placeholder="Explain how team points, set wins, and match scoring work…"
        />
        <button
          onClick={() => save("about.scoring", scoring, setScoringLoading, setScoringResult)}
          disabled={scoringLoading}
          className="mt-2 px-4 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
        >
          {scoringLoading ? "Saving…" : "Save"}
        </button>
        {scoringResult && <ResultBanner result={scoringResult} onDismiss={() => setScoringResult(null)} />}
      </div>

      {/* Glossary JSON */}
      <div>
        <label className="block text-xs uppercase tracking-wider text-slate-400 mb-1">Stat Glossary</label>
        <p className="text-xs text-slate-500 mb-2">
          JSON array of <code className="text-amber-400/80">{`[{abbr, name, desc}]`}</code>. Edit descriptions or add/remove rows.
        </p>
        <textarea
          rows={22}
          value={glossary}
          onChange={(e) => setGlossary(e.target.value)}
          className="w-full rounded bg-slate-800 border border-slate-700 px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500 resize-y font-mono"
        />
        <button
          onClick={() => save("about.glossary", glossary, setGlossaryLoading, setGlossaryResult)}
          disabled={glossaryLoading}
          className="mt-2 px-4 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
        >
          {glossaryLoading ? "Saving…" : "Save"}
        </button>
        {glossaryResult && <ResultBanner result={glossaryResult} onDismiss={() => setGlossaryResult(null)} />}
      </div>
    </div>
  );
}

// ── Scoring tab ───────────────────────────────────────────────────────────────

type ScoringRow = { scope: string; division: string | null; key: string; value: string };

const DIVISIONS = ["A", "B", "C", "D"];

const HH_DIVISION_DEFAULTS: Record<string, { hh: string; roHh: string }> = {
  A: { hh: "475", roHh: "20" },
  B: { hh: "450", roHh: "17" },
  C: { hh: "425", roHh: "14" },
  D: { hh: "400", roHh: "12" },
};

function resolveConfig(rows: ScoringRow[], scope: string, division: string) {
  // Resolution order (later tiers override earlier): global → global+div → season → season+div
  const tiers = [
    rows.filter(r => r.scope === "global" && !r.division),
    rows.filter(r => r.scope === "global" && r.division === division),
    rows.filter(r => r.scope === scope && !r.division),
    rows.filter(r => r.scope === scope && r.division === division),
  ];
  const out: Record<string, string> = {};
  for (const tier of tiers) for (const row of tier) out[row.key] = row.value;
  return out;
}

function ScoringTab({ seasons, secret }: { seasons: Season[]; secret: string }) {
  const [scope, setScope] = useState("global");
  const [division, setDivision] = useState("A");
  const [allRows, setAllRows] = useState<ScoringRow[]>([]);
  const [fetching, setFetching] = useState(true);

  // Editable point-value fields
  const [cricketPts, setCricketPts] = useState("1");
  const [pts601, setPts601] = useState("1");
  const [pts501, setPts501] = useState("1");
  const [ptsLoading, setPtsLoading] = useState(false);
  const [ptsResult, setPtsResult] = useState<Result | null>(null);

  // Editable HH threshold fields
  const [hhThreshold, setHhThreshold] = useState("475");
  const [roHhThreshold, setRoHhThreshold] = useState("20");
  const [hhLoading, setHhLoading] = useState(false);
  const [hhResult, setHhResult] = useState<Result | null>(null);

  // Fetch all config rows for global + selected scope
  useEffect(() => {
    async function load() {
      setFetching(true);
      const headers: Record<string, string> = {};
      if (secret) headers["Authorization"] = `Bearer ${secret}`;
      const params = new URLSearchParams();
      params.append("scope", "global");
      if (scope !== "global") params.append("scope", scope);
      const res = await fetch(`/api/admin/scoring-config?${params}`, { headers });
      const rows: ScoringRow[] = res.ok ? await res.json() : [];
      setAllRows(rows);
      setFetching(false);
    }
    load();
  }, [scope, secret]);

  // Derive displayed values from rows + current division
  useEffect(() => {
    const cfg = resolveConfig(allRows, scope, division);
    setCricketPts(cfg["cricket.win_pts"] ?? "1");
    setPts601(cfg["601.win_pts"] ?? "1");
    setPts501(cfg["501.win_pts"] ?? "1");
    const divDef = HH_DIVISION_DEFAULTS[division] ?? HH_DIVISION_DEFAULTS["A"];
    setHhThreshold(cfg["01_hh.threshold"] ?? divDef.hh);
    setRoHhThreshold(cfg["ro_hh.threshold"] ?? divDef.roHh);
  }, [allRows, scope, division]);

  async function saveRow(key: string, value: string, div: string | null,
    setLoading: (v: boolean) => void, setResult: (r: Result | null) => void) {
    setLoading(true);
    setResult(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (secret) headers["Authorization"] = `Bearer ${secret}`;
      const res = await fetch("/api/admin/scoring-config", {
        method: "POST",
        headers,
        body: JSON.stringify({ scope, division: div, key, value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Unknown error");
      // Optimistically update allRows
      setAllRows(prev => {
        const filtered = prev.filter(r => !(r.scope === scope && r.division === div && r.key === key));
        return [...filtered, { scope, division: div, key, value }];
      });
      setResult({ ok: true, message: "Saved." });
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  }

  const inputCls = "w-20 rounded bg-slate-800 border border-slate-700 px-2 py-1.5 text-sm text-slate-200 text-center focus:outline-none focus:border-amber-500 tabular-nums";
  const saveBtnCls = "px-4 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium transition-colors disabled:opacity-50";

  const scopeIsGlobal = scope === "global";
  const scopeLabel = scopeIsGlobal ? "Global defaults" : (seasons.find(s => String(s.id) === scope)?.name ?? scope);

  return (
    <div className="space-y-8">
      {/* Scope selector */}
      <div>
        <label className="block text-xs uppercase tracking-wider text-slate-400 mb-2">Scope</label>
        <div className="flex flex-wrap gap-2 items-center">
          <button
            onClick={() => setScope("global")}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${scope === "global" ? "bg-amber-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}
          >
            Global defaults
          </button>
          {seasons.map(s => (
            <button
              key={s.id}
              onClick={() => setScope(String(s.id))}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${scope === String(s.id) ? "bg-amber-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}
            >
              {s.name}
            </button>
          ))}
        </div>
        {!scopeIsGlobal && (
          <p className="mt-1.5 text-xs text-slate-500">
            Showing resolved values for <span className="text-slate-300">{scopeLabel}</span> — season values override global. Save writes a season-specific override.
          </p>
        )}
      </div>

      {fetching ? (
        <div className="text-slate-500 text-sm py-2">Loading…</div>
      ) : (
        <>
          {/* Point values */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <h3 className="text-sm font-semibold text-slate-200">Point Values per Win</h3>
              <div className="flex-1 h-px bg-slate-800" />
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Wins earn the configured points; losses earn 0. AVG on the leaderboard is recalculated as earned ÷ available points.
            </p>
            <div className="flex flex-wrap gap-6 items-end">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Cricket</label>
                <input type="number" min="0" step="0.5" value={cricketPts}
                  onChange={e => setCricketPts(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">601</label>
                <input type="number" min="0" step="0.5" value={pts601}
                  onChange={e => setPts601(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">501</label>
                <input type="number" min="0" step="0.5" value={pts501}
                  onChange={e => setPts501(e.target.value)} className={inputCls} />
              </div>
              <button
                disabled={ptsLoading}
                className={saveBtnCls}
                onClick={() => {
                  const saves = [
                    saveRow("cricket.win_pts", cricketPts, null, setPtsLoading, setPtsResult),
                    saveRow("601.win_pts", pts601, null, setPtsLoading, setPtsResult),
                    saveRow("501.win_pts", pts501, null, setPtsLoading, setPtsResult),
                  ];
                  Promise.all(saves).then(() =>
                    setPtsResult({ ok: true, message: "Point values saved." })
                  ).catch(e =>
                    setPtsResult({ ok: false, message: e instanceof Error ? e.message : String(e) })
                  );
                }}
              >
                {ptsLoading ? "Saving…" : "Save Point Values"}
              </button>
            </div>
            {ptsResult && <ResultBanner result={ptsResult} onDismiss={() => setPtsResult(null)} />}
          </div>

          {/* Hot hand thresholds */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <h3 className="text-sm font-semibold text-slate-200">Hot Hand Thresholds</h3>
              <div className="flex-1 h-px bg-slate-800" />
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Minimum weekly total to qualify as a hot hand. 01 HH = sum of 100+ scores in a week (legs 1 &amp; 2). RO HH = total cricket marks in qualifying rounds.
            </p>
            <div className="flex flex-wrap gap-4 items-end">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Division</label>
                <select
                  value={division}
                  onChange={e => setDivision(e.target.value)}
                  className="rounded bg-slate-800 border border-slate-700 px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
                >
                  {DIVISIONS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">01 HH threshold</label>
                <input type="number" min="0" step="1" value={hhThreshold}
                  onChange={e => setHhThreshold(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">RO HH threshold</label>
                <input type="number" min="0" step="1" value={roHhThreshold}
                  onChange={e => setRoHhThreshold(e.target.value)} className={inputCls} />
              </div>
              <button
                disabled={hhLoading}
                className={saveBtnCls}
                onClick={() => {
                  const saves = [
                    saveRow("01_hh.threshold", hhThreshold, division, setHhLoading, setHhResult),
                    saveRow("ro_hh.threshold", roHhThreshold, division, setHhLoading, setHhResult),
                  ];
                  Promise.all(saves).then(() =>
                    setHhResult({ ok: true, message: `Thresholds saved for Division ${division}.` })
                  ).catch(e =>
                    setHhResult({ ok: false, message: e instanceof Error ? e.message : String(e) })
                  );
                }}
              >
                {hhLoading ? "Saving…" : `Save Division ${division}`}
              </button>
            </div>
            {hhResult && <ResultBanner result={hhResult} onDismiss={() => setHhResult(null)} />}
          </div>
        </>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function AdminPanel({ seasons, secret }: { seasons: Season[]; secret: string }) {
  const [tab, setTab] = useState<TabId>("posts");

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-6">
      <TabBar active={tab} onChange={setTab} />
      {tab === "posts"    ? <PostsTab secret={secret} /> :
       tab === "refresh"  ? <RefreshTab seasons={seasons} secret={secret} /> :
       tab === "scoring"  ? <ScoringTab seasons={seasons} secret={secret} /> :
                            <ContentTab secret={secret} />}
    </div>
  );
}
