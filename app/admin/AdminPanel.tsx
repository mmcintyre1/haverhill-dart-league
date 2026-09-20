"use client";

import { useState, useEffect } from "react";
import { formatShortDate } from "@/lib/format";

// Local copy (not imported from lib/dartconnect.ts, which pulls in server-only
// fetch logic that has no reason to end up in the client bundle).
function dcRecapUrl(guid: string): string {
  return `https://recap.dartconnect.com/matches/${guid}`;
}

type Season = {
  id: number;
  name: string;
  isActive: boolean;
  visible: boolean;
  lastScrapedAt: Date | null;
};

type TabId = "posts" | "refresh" | "scoring" | "alerts" | "documents" | "config";

// ── Tab bar ──────────────────────────────────────────────────────────────────

function TabBar({ active, onChange }: { active: TabId; onChange: (t: TabId) => void }) {
  const tabs: { id: TabId; label: string }[] = [
    { id: "posts", label: "News Posts" },
    { id: "refresh", label: "Data Refresh" },
    { id: "scoring", label: "Scoring" },
    { id: "alerts", label: "Alerts" },
    { id: "documents", label: "Documents" },
    { id: "config", label: "Site Config" },
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

type NewsPost = { id: number; title: string; body: string; author: string | null; publishedAt: string; hidden: boolean };

function PostsTab({ secret }: { secret: string }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [author, setAuthor] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [posts, setPosts] = useState<NewsPost[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editAuthor, setEditAuthor] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  const headers = (extra?: Record<string, string>): Record<string, string> => ({
    "Content-Type": "application/json",
    ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
    ...extra,
  });

  async function loadPosts() {
    try {
      const res = await fetch("/api/admin/news", { headers: headers({ "Content-Type": "" }) });
      if (res.ok) setPosts(await res.json());
    } catch { /* non-fatal */ }
  }

  useEffect(() => { loadPosts(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/news", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ title, body, author: author || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Unknown error");
      setResult({ ok: true, message: `Post created (id: ${data.id})` });
      setTitle(""); setBody(""); setAuthor("");
      await loadPosts();
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this post permanently?")) return;
    try {
      const res = await fetch(`/api/admin/news?id=${id}`, { method: "DELETE", headers: headers({ "Content-Type": "" }) });
      if (!res.ok) throw new Error((await res.json()).error);
      setResult({ ok: true, message: "Post deleted" });
      await loadPosts();
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleToggleHidden(post: NewsPost) {
    try {
      const res = await fetch("/api/admin/news", {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify({ id: post.id, hidden: !post.hidden }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await loadPosts();
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : String(e) });
    }
  }

  function handleStartEdit(post: NewsPost) {
    setEditingId(post.id);
    setEditTitle(post.title);
    setEditBody(post.body);
    setEditAuthor(post.author ?? "");
  }

  function handleCancelEdit() {
    setEditingId(null);
  }

  async function handleSaveEdit(id: number) {
    setEditLoading(true);
    try {
      const res = await fetch("/api/admin/news", {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify({ id, title: editTitle, body: editBody, author: editAuthor || null }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setEditingId(null);
      await loadPosts();
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setEditLoading(false);
    }
  }

  return (
    <div className="space-y-8">
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

      {posts.length > 0 && (
        <div>
          <h3 className="text-xs uppercase tracking-wider text-slate-400 mb-3">Existing Posts</h3>
          <div className="space-y-2">
            {posts.map((post) =>
              editingId === post.id ? (
                <div key={post.id} className="rounded-lg border border-amber-700/50 bg-slate-900 px-4 py-3 space-y-3">
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-slate-400 mb-1">Title *</label>
                    <input
                      required
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full rounded bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-slate-400 mb-1">Body *</label>
                    <textarea
                      required
                      rows={5}
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      className="w-full rounded bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500 resize-y"
                    />
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-slate-400 mb-1">Author</label>
                    <input
                      value={editAuthor}
                      onChange={(e) => setEditAuthor(e.target.value)}
                      className="w-full rounded bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
                      placeholder="Optional"
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={handleCancelEdit}
                      disabled={editLoading}
                      className="px-2.5 py-1 rounded text-xs font-medium border border-slate-600 text-slate-300 hover:border-slate-500 hover:text-white transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleSaveEdit(post.id)}
                      disabled={editLoading || !editTitle || !editBody}
                      className="px-3 py-1 rounded text-xs font-medium bg-amber-600 hover:bg-amber-500 text-white transition-colors disabled:opacity-50"
                    >
                      {editLoading ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  key={post.id}
                  className={`rounded-lg border px-4 py-3 flex items-start justify-between gap-4 ${
                    post.hidden ? "border-slate-700/50 bg-slate-900/40 opacity-60" : "border-slate-700 bg-slate-900"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-200 truncate">{post.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {new Date(post.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      {post.hidden && <span className="ml-2 text-rose-400">hidden</span>}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => handleStartEdit(post)}
                      className="px-2.5 py-1 rounded text-xs font-medium border border-slate-600 text-slate-300 hover:border-slate-500 hover:text-white transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleToggleHidden(post)}
                      className="px-2.5 py-1 rounded text-xs font-medium border border-slate-600 text-slate-300 hover:border-slate-500 hover:text-white transition-colors"
                    >
                      {post.hidden ? "Show" : "Hide"}
                    </button>
                    <button
                      onClick={() => handleDelete(post.id)}
                      className="px-2.5 py-1 rounded text-xs font-medium border border-rose-800 text-rose-400 hover:border-rose-600 hover:text-rose-300 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Refresh tab ───────────────────────────────────────────────────────────────

type RefreshMode = "active" | "season" | "all" | "all-force";

function RefreshTab({ seasons, secret }: { seasons: Season[]; secret: string }) {
  const [mode, setMode] = useState<RefreshMode>("active");
  const [seasonId, setSeasonId] = useState<number>(seasons[0]?.id ?? 0);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [seasonList, setSeasonList] = useState<Season[]>(seasons);
  const [visibilityResult, setVisibilityResult] = useState<Result | null>(null);

  async function handleToggleVisible(season: Season) {
    const nextVisible = !season.visible;
    try {
      const res = await fetch("/api/admin/seasons", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
        },
        body: JSON.stringify({ id: season.id, visible: nextVisible }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setSeasonList((prev) => prev.map((s) => (s.id === season.id ? { ...s, visible: nextVisible } : s)));
    } catch (e) {
      setVisibilityResult({ ok: false, message: e instanceof Error ? e.message : String(e) });
    }
  }

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
    <div className="space-y-10">
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

    <div>
      <h3 className="text-xs uppercase tracking-wider text-slate-400 mb-3">Season Visibility</h3>
      <p className="text-xs text-slate-500 mb-3">
        New seasons start hidden from the public site. Publish once ready — e.g. once DartConnect's own export is finished.
      </p>
      <div className="space-y-2">
        {seasonList.map((s) => (
          <div
            key={s.id}
            className={`rounded-lg border px-4 py-3 flex items-center justify-between gap-4 ${
              s.visible ? "border-slate-700 bg-slate-900" : "border-slate-700/50 bg-slate-900/40 opacity-60"
            }`}
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-200 truncate">
                {s.name}{s.isActive ? " (active)" : ""}
              </p>
              {!s.visible && <p className="text-xs text-rose-400 mt-0.5">hidden from public site</p>}
            </div>
            <button
              onClick={() => handleToggleVisible(s)}
              className="px-2.5 py-1 rounded text-xs font-medium border border-slate-600 text-slate-300 hover:border-slate-500 hover:text-white transition-colors shrink-0"
            >
              {s.visible ? "Hide" : "Publish"}
            </button>
          </div>
        ))}
      </div>
      {visibilityResult && <ResultBanner result={visibilityResult} onDismiss={() => setVisibilityResult(null)} />}
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

  // Game 3 / tiebreaker config flags
  const [g3Cfg, setG3Cfg] = useState<Record<string, string>>({});
  const [g3Loading, setG3Loading] = useState(false);
  const [g3Result, setG3Result] = useState<Result | null>(null);

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
    setG3Cfg({
      "g3.include_180":     cfg["g3.include_180"]     ?? "true",
      "g3.include_ro9":     cfg["g3.include_ro9"]     ?? "true",
      "g3.include_hout":    cfg["g3.include_hout"]    ?? "true",
      "g3.include_100plus": cfg["g3.include_100plus"] ?? "false",
      "g3.include_rnds":    cfg["g3.include_rnds"]    ?? "false",
      "g3.include_perfect": cfg["g3.include_perfect"] ?? "false",
    });
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

          {/* Game 3 / Tiebreaker Rules */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <h3 className="text-sm font-semibold text-slate-200">Game 3 (Tiebreaker) Rules</h3>
              <div className="flex-1 h-px bg-slate-800" />
            </div>
            <p className="text-xs text-slate-500 mb-5">
              By default, game 3 (tiebreaker) legs always count toward the individual achievement
              columns (180s, H-Outs, RO9s) but do <em>not</em> contribute to the weekly aggregate
              totals that drive hot-hand calculations (100+, RNDS). Toggle each below.
              Changes take effect on the next data refresh.
            </p>

            {/* Trophy columns */}
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold text-slate-300">Individual achievement columns</span>
                <div className="flex-1 h-px bg-slate-800" />
              </div>
              <p className="text-xs text-slate-500 mb-3">Always recorded in G1 &amp; G2. Check to also record in game 3:</p>
              <div className="space-y-2.5">
                {([
                  { key: "g3.include_180",   label: "180s",                    detail: "recorded in the 180 column",         defaultOn: true },
                  { key: "g3.include_hout",  label: "High Outs (>100 finish)", detail: "recorded in the H-Out column",       defaultOn: true },
                  { key: "g3.include_ro9",   label: "Rounds of 9 (cricket)",   detail: "recorded in the RO9 column",         defaultOn: true },
                  { key: "g3.include_ro6b",  label: "6-bull rounds (cricket)", detail: "recorded in the 6B column",          defaultOn: true },
                ] as const).map(({ key, label, detail, defaultOn }) => {
                  const val = g3Cfg[key] ?? (defaultOn ? "true" : "false");
                  return (
                    <label key={key} className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={val === "true"}
                        onChange={e => setG3Cfg(prev => ({ ...prev, [key]: e.target.checked ? "true" : "false" }))}
                        className="accent-amber-500 w-4 h-4 shrink-0"
                      />
                      <span className="text-sm">
                        <span className="text-slate-200 font-medium">{label}</span>
                        <span className="text-slate-500 ml-1.5">— {detail}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Aggregate totals */}
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold text-slate-300">Aggregate totals</span>
                <span className="text-xs text-slate-600 ml-1">— drive hot hand 🔥</span>
                <div className="flex-1 h-px bg-slate-800" />
              </div>
              <p className="text-xs text-slate-500 mb-3">Always counted in G1 &amp; G2. Check to also count game 3 toward these totals:</p>
              <div className="space-y-2.5">
                {([
                  { key: "g3.include_100plus", label: "100+ scores",         detail: "added to the weekly 100+ running total (01 hot hand)",     defaultOn: false },
                  { key: "g3.include_bulls",   label: "Bull rounds (4B+)",   detail: "added to the weekly RNDS total (cricket hot hand)",         defaultOn: false },
                  { key: "g3.include_rnds",    label: "6+ mark rounds",      detail: "added to the weekly RNDS total (cricket hot hand)",         defaultOn: false },
                ] as const).map(({ key, label, detail, defaultOn }) => {
                  const val = g3Cfg[key] ?? (defaultOn ? "true" : "false");
                  return (
                    <label key={key} className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={val === "true"}
                        onChange={e => setG3Cfg(prev => ({ ...prev, [key]: e.target.checked ? "true" : "false" }))}
                        className="accent-amber-500 w-4 h-4 shrink-0"
                      />
                      <span className="text-sm">
                        <span className="text-slate-200 font-medium">{label}</span>
                        <span className="text-slate-500 ml-1.5">— {detail}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <button
                disabled={g3Loading}
                className={saveBtnCls}
                onClick={() => {
                  setG3Loading(true);
                  setG3Result(null);
                  const saves = Object.entries(g3Cfg).map(([key, value]) =>
                    saveRow(key, value, null, () => {}, () => {})
                  );
                  Promise.all(saves)
                    .then(() => setG3Result({ ok: true, message: "Game 3 rules saved." }))
                    .catch(e => setG3Result({ ok: false, message: e instanceof Error ? e.message : String(e) }))
                    .finally(() => setG3Loading(false));
                }}
              >
                {g3Loading ? "Saving…" : "Save Game 3 Rules"}
              </button>
            </div>
            {g3Result && <ResultBanner result={g3Result} onDismiss={() => setG3Result(null)} />}
          </div>
        </>
      )}
    </div>
  );
}

// ── Documents tab ─────────────────────────────────────────────────────────────

type DocRow = { id: number; title: string; url: string; category: string; description: string | null; sortOrder: number };

function DocumentsTab({ secret }: { secret: string }) {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<Result | null>(null);
  const [form, setForm] = useState({ title: "", url: "", category: "", description: "", sortOrder: "0" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/documents", { headers: { Authorization: `Bearer ${secret}` } })
      .then(r => r.json())
      .then(setDocs)
      .catch(() => setResult({ ok: false, message: "Failed to load documents." }))
      .finally(() => setLoading(false));
  }, [secret]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
        body: JSON.stringify({ ...form, sortOrder: parseInt(form.sortOrder) || 0 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add document");
      setDocs(prev => [...prev, data.doc].sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title)));
      setForm({ title: "", url: "", category: "", description: "", sortOrder: "0" });
      setResult({ ok: true, message: "Document added." });
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number, title: string) {
    if (!confirm(`Delete "${title}"?`)) return;
    try {
      const res = await fetch(`/api/admin/documents?id=${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${secret}` },
      });
      if (!res.ok) throw new Error("Failed to delete");
      setDocs(prev => prev.filter(d => d.id !== id));
      setResult({ ok: true, message: `"${title}" deleted.` });
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : String(e) });
    }
  }

  return (
    <div className="space-y-6">
      {/* Add form */}
      <div>
        <h3 className="text-sm font-semibold text-slate-300 mb-3">Add Document</h3>
        <form onSubmit={handleAdd} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Title *</label>
              <input
                required
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="League Rules 2026"
                className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">URL *</label>
              <input
                required
                type="url"
                value={form.url}
                onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                placeholder="https://drive.google.com/..."
                className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Category</label>
              <input
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                placeholder="Rules, Forms, General…"
                className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Sort order</label>
              <input
                type="number"
                value={form.sortOrder}
                onChange={e => setForm(f => ({ ...f, sortOrder: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Description (optional)</label>
            <input
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Brief note about this document"
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded bg-amber-500 hover:bg-amber-400 text-slate-900 text-sm font-semibold disabled:opacity-50 transition-colors"
          >
            {saving ? "Adding…" : "Add Document"}
          </button>
        </form>
      </div>

      {result && <ResultBanner result={result} onDismiss={() => setResult(null)} />}

      {/* Document list */}
      <div>
        <h3 className="text-sm font-semibold text-slate-300 mb-3">
          Current Documents {!loading && <span className="text-slate-500 font-normal">({docs.length})</span>}
        </h3>
        {loading ? (
          <p className="text-slate-500 text-sm">Loading…</p>
        ) : docs.length === 0 ? (
          <p className="text-slate-500 text-sm italic">No documents yet.</p>
        ) : (
          <div className="divide-y divide-slate-800 rounded-lg border border-slate-800 overflow-hidden">
            {docs.map(doc => (
              <div key={doc.id} className="flex items-start gap-3 px-4 py-3 bg-slate-900 hover:bg-slate-800/50">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-white truncate">{doc.title}</span>
                    <span className="text-[0.65rem] px-1.5 py-0.5 rounded bg-slate-700 text-slate-400 shrink-0">{doc.category}</span>
                  </div>
                  {doc.description && <p className="text-xs text-slate-500 mt-0.5">{doc.description}</p>}
                  <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-xs text-slate-600 hover:text-amber-400 truncate block mt-0.5 transition-colors">{doc.url}</a>
                </div>
                <button
                  onClick={() => handleDelete(doc.id, doc.title)}
                  className="shrink-0 text-xs text-slate-600 hover:text-red-400 transition-colors px-2 py-1"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Site Config tab ───────────────────────────────────────────────────────────

const DEFAULT_ABOUT =
  "We play on Tuesday nights. The Haverhill Dart League sponsors and teams reside in the " +
  "greater Haverhill area. Any team out of a club in a city or town within 9 miles of the " +
  "city center (use 323 Main St as an address) Haverhill, MA is welcome to join. We have " +
  "teams playing out of Haverhill, Plaistow, NH, Merrimack, MA, Methuen, MA and Lawrence, " +
  "MA. While affording short travel times for our players whenever possible, we promote " +
  "sportsmanship, and hope to have our players grow in the sport by advancing through the " +
  "divisions.";

function SiteConfigTab({ secret }: { secret: string }) {
  const [contactEmail, setContactEmail] = useState("");
  const [aboutDescription, setAboutDescription] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const authHeaders = (extra?: Record<string, string>): Record<string, string> => ({
    "Content-Type": "application/json",
    ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
    ...extra,
  });

  useEffect(() => {
    fetch("/api/admin/site-config", { headers: authHeaders({ "Content-Type": "" }) })
      .then((r) => r.json())
      .then((rows: { key: string; value: string }[]) => {
        setContactEmail(rows.find((r) => r.key === "contact.email")?.value ?? "");
        setAboutDescription(rows.find((r) => r.key === "about.description")?.value ?? DEFAULT_ABOUT);
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function save(key: string, value: string) {
    setSavingKey(key);
    setResult(null);
    try {
      const res = await fetch("/api/admin/site-config", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ key, value }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setResult({ ok: true, message: "Saved" });
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div className="space-y-8">
      {/* About description */}
      <div>
        <h3 className="text-sm font-semibold text-slate-200 mb-1">About the League</h3>
        <p className="text-xs text-slate-500 mb-3">
          Paragraph shown in the About section of the About page.
        </p>
        <textarea
          rows={6}
          value={aboutDescription}
          onChange={(e) => setAboutDescription(e.target.value)}
          className="w-full rounded bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500 resize-y"
        />
        <button
          onClick={() => save("about.description", aboutDescription)}
          disabled={savingKey === "about.description"}
          className="mt-2 px-4 py-2 rounded bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
        >
          {savingKey === "about.description" ? "Saving…" : "Save"}
        </button>
      </div>

      {/* Contact email */}
      <div>
        <h3 className="text-sm font-semibold text-slate-200 mb-1">Contact</h3>
        <p className="text-xs text-slate-500 mb-3">
          Email address displayed on the About page as a mailto link. This does{" "}
          <strong className="text-slate-400">not</strong> configure where form submissions are
          delivered — that must be set separately in the{" "}
          <a href="https://app.netlify.com" target="_blank" rel="noopener noreferrer" className="text-amber-500 hover:underline">
            Netlify dashboard
          </a>{" "}
          under <span className="text-slate-300">Forms → contact → Notifications</span>.
        </p>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-xs uppercase tracking-wider text-slate-400 mb-1">
              Contact Email
            </label>
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className="w-full rounded bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
              placeholder="league@example.com"
            />
          </div>
          <button
            onClick={() => save("contact.email", contactEmail)}
            disabled={savingKey === "contact.email"}
            className="px-4 py-2 rounded bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium transition-colors disabled:opacity-50 shrink-0"
          >
            {savingKey === "contact.email" ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {result && <ResultBanner result={result} onDismiss={() => setResult(null)} />}
    </div>
  );
}

// ── Alerts tab ────────────────────────────────────────────────────────────────

type Alert = {
  id: number;
  seasonId: number;
  matchId: number | null;
  type: string;
  message: string;
  resolved: boolean;
  createdAt: string;
  dcGuid: string | null;
  dcGuid2: string | null;
  autoResolvedAt: string | null;
  ignored: boolean;
  ignoredAt: string | null;
  ignoredReason: string | null;
};

/** An issue is in exactly one of three states. Only "ignored" is a human
 *  decision — "fixed" is set by a rescrape confirming the problem is gone. */
type IssueState = "open" | "fixed" | "ignored";
function issueState(a: Alert): IssueState {
  if (a.ignored) return "ignored";
  return a.resolved ? "fixed" : "open";
}

type SetForfeit = {
  id: number;
  matchId: number;
  setNumber: number;
  forfeitedBy: string;
  note: string | null;
  homeTeamName: string | null;
  awayTeamName: string | null;
  schedDate: string | null;
  dcGuid: string | null;
};

type AdjPlayer = { id: number; name: string; teamName: string | null };
type AdjWeek = { weekKey: string; isoDate: string | null };

type Adjustment = {
  id: number;
  playerId: number;
  playerName: string;
  phase: string;
  gameType: string;
  winsDelta: number;
  lossesDelta: number;
  weekKey: string | null;
  note: string | null;
  createdAt: string;
  teamName: string | null;
  matchId: number | null;
  alertId: number | null;
  matchHomeTeam: string | null;
  matchAwayTeam: string | null;
  matchDate: string | null;
  matchDcGuid: string | null;
};

/** Corrections made together for one match are one event, not N events —
 *  six players losing a deleted 601 used to render as six paragraphs. Group
 *  them so the history reads as a list of decisions. Corrections with no match
 *  (recorded from scratch) each stand alone. */
type AdjGroup = {
  key: string;
  matchLabel: string | null;
  matchDate: string | null;
  matchDcGuid: string | null;
  gameTypes: string[];
  note: string | null;
  items: Adjustment[];
};

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
const netDelta = (items: Adjustment[], field: "winsDelta" | "lossesDelta") =>
  items.reduce((sum, i) => sum + i[field], 0);

function groupAdjustments(rows: Adjustment[]): AdjGroup[] {
  const groups: AdjGroup[] = [];
  const byKey = new Map<string, AdjGroup>();
  for (const a of rows) {
    const key = a.matchId != null ? `m${a.matchId}` : `a${a.id}`;
    let g = byKey.get(key);
    if (!g) {
      g = {
        key,
        matchLabel: a.matchHomeTeam && a.matchAwayTeam ? `${a.matchHomeTeam} vs ${a.matchAwayTeam}` : null,
        matchDate: a.matchDate,
        matchDcGuid: a.matchDcGuid,
        gameTypes: [],
        note: a.note,
        items: [],
      };
      byKey.set(key, g);
      groups.push(g);
    }
    if (!g.gameTypes.includes(a.gameType)) g.gameTypes.push(a.gameType);
    // One shared note for the group when they all agree; otherwise per-row.
    if (g.note !== a.note) g.note = null;
    g.items.push(a);
  }
  return groups;
}

const ALERT_TYPE_LABELS: Record<string, string> = {
  forfeit: "Forfeit",
  suspicious_future_result: "Suspicious result",
  match_upsert_error: "Match save error",
  duplicate_history_entry: "Unmerged DC recaps",
  player_both_sides: "Lineup mix-up",
  player_repeat_game_type: "Repeat game-type entry",
  score_mismatch: "Score doesn't add up",
  team_history_fetch_failed: "Team data not refreshed",
};

const GAME_TYPE_LABELS: Record<string, string> = { crkt: "Cricket", "601": "601", "501": "501" };

function AlertsTab({ seasons, secret }: { seasons: Season[]; secret: string }) {
  const [seasonId, setSeasonId] = useState<number | null>(seasons.find(s => s.isActive)?.id ?? seasons[0]?.id ?? null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [showClosed, setShowClosed] = useState(false);
  const [players, setPlayers] = useState<AdjPlayer[]>([]);
  const [weeks, setWeeks] = useState<AdjWeek[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [forfeits, setForfeitRulings] = useState<SetForfeit[]>([]);
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<Result | null>(null);

  // Adjustment form state
  const [formOpen, setFormOpen] = useState(false);
  const [sourceAlert, setSourceAlert] = useState<Alert | null>(null);
  const [playerName, setPlayerName] = useState("");
  const [weekKey, setWeekKey] = useState("");
  const [phase, setPhase] = useState<"REG" | "POST">("REG");
  const [gameType, setGameType] = useState<"crkt" | "601" | "501">("crkt");
  const [winsDelta, setWinsDelta] = useState("1");
  const [lossesDelta, setLossesDelta] = useState("0");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const authHeaders = (extra?: Record<string, string>): Record<string, string> => ({
    "Content-Type": "application/json",
    ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
    ...extra,
  });

  async function load() {
    if (!seasonId) return;
    setLoading(true);
    const [alertsRes, playersRes, weeksRes, adjRes, ffRes] = await Promise.all([
      fetch(`/api/admin/alerts?season=${seasonId}`, { headers: authHeaders({ "Content-Type": "" }) }),
      fetch(`/api/admin/players?season=${seasonId}`, { headers: authHeaders({ "Content-Type": "" }) }),
      fetch(`/api/admin/weeks?season=${seasonId}`, { headers: authHeaders({ "Content-Type": "" }) }),
      fetch(`/api/admin/player-adjustments?season=${seasonId}`, { headers: authHeaders({ "Content-Type": "" }) }),
      fetch(`/api/admin/set-forfeits?season=${seasonId}`, { headers: authHeaders({ "Content-Type": "" }) }),
    ]);
    setAlerts(alertsRes.ok ? await alertsRes.json() : []);
    setPlayers(playersRes.ok ? await playersRes.json() : []);
    setWeeks(weeksRes.ok ? await weeksRes.json() : []);
    setAdjustments(adjRes.ok ? await adjRes.json() : []);
    setForfeitRulings(ffRes.ok ? await ffRes.json() : []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [seasonId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function setIgnored(id: number, ignored: boolean, reason?: string) {
    await fetch("/api/admin/alerts", { method: "PATCH", headers: authHeaders(), body: JSON.stringify({ id, ignored, reason }) });
    setAlerts(prev => prev.map(a => (a.id === id
      ? { ...a, ignored, resolved: ignored, autoResolvedAt: null,
          ignoredAt: ignored ? new Date().toISOString() : null,
          ignoredReason: ignored ? (reason?.trim() || null) : null }
      : a)));
  }

  /** DC writes a forfeit's set number into the alert text as "Set #N" — the
   *  same 1-indexed numbering the ruling uses, so it can be prefilled. */
  function setNumberFromAlert(a: Alert): number | null {
    const m = a.message.match(/Set #(\d+)/i);
    return m ? Number(m[1]) : null;
  }

  async function ruleForfeit(a: Alert) {
    if (!seasonId || a.matchId == null) return;
    const setNumber = setNumberFromAlert(a);
    if (setNumber == null) {
      setResult({ ok: false, message: "Couldn't read a set number from this issue — record the ruling from the list below instead." });
      return;
    }
    const answer = window.prompt(
      `Rule set #${setNumber} a forfeit.

Nothing from this set will count toward any player's stats except the win and the loss — no marks, darts, notables or averages.

Who forfeited? Type home, away, or both:`,
      "both"
    );
    const side = answer?.trim().toLowerCase();
    if (!side) return;
    if (!["home", "away", "both"].includes(side)) {
      setResult({ ok: false, message: `"${answer}" isn't one of home, away or both.` });
      return;
    }
    const res = await fetch("/api/admin/set-forfeits", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ seasonId, matchId: a.matchId, setNumber, forfeitedBy: side, note: a.message }),
    });
    const data = await res.json();
    if (!res.ok) { setResult({ ok: false, message: data.error ?? "Couldn't save the ruling." }); return; }
    setResult({ ok: true, message: `Set #${setNumber} ruled a forfeit. It stops counting toward stats after the next Data Refresh, and this issue won't be flagged again.` });
    load();
  }

  async function deleteForfeitRuling(id: number) {
    if (!confirm("Remove this ruling? The set's darts and notables will count again after the next Data Refresh.")) return;
    await fetch(`/api/admin/set-forfeits?id=${id}`, { method: "DELETE", headers: authHeaders() });
    load();
  }

  const FORFEIT_SIDE_LABEL: Record<string, string> = { home: "Home team", away: "Away team", both: "Both teams" };

  /** Corrections recorded against this issue. Without this the card gave no
   *  sign a fix already existed, so a handled issue looked untouched. */
  function correctionsFor(a: Alert) {
    return adjustments.filter(adj => adj.alertId === a.id);
  }

  function confirmIgnore(a: Alert) {
    const reason = window.prompt(
      `Stop flagging this issue?

It won't come back, even if the next refresh still detects it. Use this only when the underlying data can't be fixed in DartConnect.

Why (optional, shown in the list):`,
      ignorePrefill(a)
    );
    if (reason === null) return; // cancelled
    setIgnored(a.id, true, reason);
  }

  function ignorePrefill(a: Alert) {
    const n = correctionsFor(a).length;
    return n > 0 ? (n === 1 ? "Fixed with a manual correction" : `Fixed with ${n} manual corrections`) : "";
  }

  function startAdjustmentFromAlert(a: Alert) {
    setSourceAlert(a);
    // Deliberately NOT prefilling the note with a.message. That's what made
    // every correction read as a paragraph — the alert text is two or three
    // sentences of explanation, and it's now linked via alertId/matchId
    // anyway. Leave the note for an actual reason.
    setNote("");
    setFormOpen(true);
    requestAnimationFrame(() => document.getElementById("adjustment-form")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function openBlankForm() {
    setSourceAlert(null);
    setFormOpen(true);
  }

  function formatWeekLabel(w: AdjWeek) {
    if (!w.isoDate) return w.weekKey;
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(w.isoDate + "T12:00:00"));
  }

  async function submitAdjustment(e: React.FormEvent) {
    e.preventDefault();
    if (!seasonId) return;
    const player = players.find(p => p.name === playerName);
    if (!player) {
      setResult({ ok: false, message: `No rostered player matches "${playerName}" — pick one from the list.` });
      return;
    }
    setSaving(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/player-adjustments", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          seasonId,
          playerId: player.id,
          phase,
          gameType,
          winsDelta: parseInt(winsDelta) || 0,
          lossesDelta: parseInt(lossesDelta) || 0,
          weekKey: weekKey || null,
          matchId: sourceAlert?.matchId ?? null,
          alertId: sourceAlert?.id ?? null,
          note: note || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Unknown error");

      if (sourceAlert) {
        // A correction can't make DartConnect start reporting the set, so the
        // next refresh would flag this again forever. Recording the fix here
        // is the decision that retires it.
        await setIgnored(sourceAlert.id, true, "Fixed with a manual correction");
        setResult({ ok: true, message: `Correction saved for ${player.name}, and that issue won't be flagged again. It'll show up on the site after the next Data Refresh.` });
      } else {
        setResult({ ok: true, message: `Correction saved for ${player.name}. It'll show up on the site after the next Data Refresh.` });
      }
      setPlayerName(""); setNote(""); setWinsDelta("1"); setLossesDelta("0"); setWeekKey(""); setSourceAlert(null);
      load();
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  }

  async function deleteAdjustment(id: number) {
    await fetch(`/api/admin/player-adjustments?id=${id}`, { method: "DELETE", headers: authHeaders({ "Content-Type": "" }) });
    setAdjustments(prev => prev.filter(a => a.id !== id));
  }

  const visibleAlerts = alerts.filter(a => showClosed || issueState(a) === "open");
  const inputCls = "w-full rounded bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500";
  const labelCls = "block text-xs text-slate-400 mb-1";

  return (
    <div className="space-y-8">
      {/* Season selector */}
      <div>
        <label className={labelCls}>Season</label>
        <select
          value={seasonId ?? ""}
          onChange={e => setSeasonId(e.target.value ? parseInt(e.target.value) : null)}
          className={`${inputCls} max-w-xs`}
        >
          {seasons.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-slate-500 text-sm py-2">Loading…</div>
      ) : (
        <>
          {/* Step 1: Alerts */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-semibold text-slate-200">1. Flagged issues</h3>
              <label className="flex items-center gap-1.5 text-xs text-slate-400">
                <input type="checkbox" checked={showClosed} onChange={e => setShowClosed(e.target.checked)} />
                Show fixed &amp; ignored
              </label>
            </div>
            <p className="text-xs text-slate-500 mb-3">
              Things the last refresh spotted that need a human decision — a forfeit DC won&apos;t attribute to a player, a
              result that doesn&apos;t add up, and so on. An issue clears itself: fix it in DartConnect, run
              <span className="text-slate-400"> Data Refresh</span>, and it moves to <span className="text-emerald-500">Fixed</span> on
              its own. Use <span className="text-slate-400">Fix with a correction</span> when DC can&apos;t record the fix, and
              <span className="text-slate-400"> Stop flagging</span> only when nothing will ever make it go away.
            </p>
            {visibleAlerts.length === 0 ? (
              <p className="text-sm text-slate-500">
                {showClosed ? "Nothing flagged for this season." : "Nothing open for this season."}
              </p>
            ) : (
              <div className="space-y-2">
                {visibleAlerts.map(a => (
                  <div key={a.id} className={`rounded-lg border px-3 py-2.5 ${issueState(a) === "open" ? "border-slate-700 bg-slate-800/40" : "border-slate-800 bg-slate-900/40 opacity-60"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-amber-500">
                            {ALERT_TYPE_LABELS[a.type] ?? a.type}
                          </span>
                          {issueState(a) === "fixed" && (
                            <span className="text-[0.6rem] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-950/50 text-emerald-400">Fixed</span>
                          )}
                          {issueState(a) === "ignored" && (
                            <span className="text-[0.6rem] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">Ignored</span>
                          )}
                        </div>
                        <p className="text-sm text-slate-300 break-words">{a.message}</p>
                        {(a.dcGuid || a.dcGuid2) && (
                          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
                            {a.dcGuid && (
                              <a href={dcRecapUrl(a.dcGuid)} target="_blank" rel="noopener noreferrer" className="text-xs text-amber-500 hover:text-amber-400 transition-colors">
                                {a.dcGuid2 ? "View displayed recap ↗" : "View recap ↗"}
                              </a>
                            )}
                            {a.dcGuid2 && (
                              <a href={dcRecapUrl(a.dcGuid2)} target="_blank" rel="noopener noreferrer" className="text-xs text-amber-500 hover:text-amber-400 transition-colors">
                                View other recap ↗
                              </a>
                            )}
                          </div>
                        )}
                        {correctionsFor(a).length > 0 && (
                          <p className="text-[0.7rem] text-emerald-600/90 mt-1.5">
                            ✓ {correctionsFor(a).length === 1 ? "1 correction recorded" : `${correctionsFor(a).length} corrections recorded`}
                            <span className="text-slate-500"> — {correctionsFor(a).map(c => c.playerName).join(", ")}</span>
                          </p>
                        )}
                        {issueState(a) === "open" && correctionsFor(a).length === 0 && (
                          <p className="text-[0.7rem] text-slate-600 mt-1.5">
                            Fixed it in DartConnect? Just run Data Refresh — this re-checks itself and clears automatically.
                          </p>
                        )}
                        {issueState(a) === "open" && correctionsFor(a).length > 0 && (
                          <p className="text-[0.7rem] text-slate-600 mt-1.5">
                            Still flagged because DartConnect keeps reporting it. If the corrections above cover it, use Stop flagging.
                          </p>
                        )}
                        {issueState(a) === "fixed" && a.autoResolvedAt && (
                          <p className="text-[0.7rem] text-emerald-600 mt-1.5">
                            ✓ No longer detected · {new Date(a.autoResolvedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </p>
                        )}
                        {issueState(a) === "ignored" && (
                          <p className="text-[0.7rem] text-slate-500 mt-1.5">
                            Won&apos;t be flagged again{a.ignoredAt && ` · since ${new Date(a.ignoredAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`}
                            {a.ignoredReason && <span className="text-slate-400"> — {a.ignoredReason}</span>}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {a.type === "forfeit" && issueState(a) === "open" && (
                          <button
                            onClick={() => startAdjustmentFromAlert(a)}
                            title="Opens the correction form below, linked to this issue"
                            className="text-xs px-2 py-1 rounded bg-amber-700/40 text-amber-300 hover:bg-amber-700/60 transition-colors"
                          >
                            Fix with a correction
                          </button>
                        )}
                        {a.ignored ? (
                          <button
                            onClick={() => setIgnored(a.id, false)}
                            title="Start flagging this again — the next refresh decides whether it's still a problem"
                            className="text-xs px-2 py-1 rounded bg-slate-700/60 text-slate-300 hover:bg-slate-700 transition-colors"
                          >
                            Reopen
                          </button>
                        ) : issueState(a) === "open" ? (
                          <button
                            onClick={() => confirmIgnore(a)}
                            title="Never flag this again — for issues nothing can fix, like a set DartConnect deleted"
                            className="text-xs px-2 py-1 rounded bg-slate-700/60 text-slate-300 hover:bg-slate-700 transition-colors"
                          >
                            Stop flagging
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Step 2: Adjustment form */}
          <div id="adjustment-form">
            <h3 className="text-sm font-semibold text-slate-200 mb-1">2. Record a correction</h3>
            <p className="text-xs text-slate-500 mb-3">
              Nudges one player&apos;s win/loss record for a game type DC didn&apos;t capture (e.g. a singles forfeit). It&apos;s
              layered on top of the real scraped data — not a typo fix — and takes effect the next time Data Refresh runs.
            </p>
            {!formOpen ? (
              <button onClick={openBlankForm} className="px-3 py-1.5 rounded border border-dashed border-slate-700 text-sm text-slate-400 hover:text-amber-400 hover:border-amber-500/50 transition-colors">
                + Record a correction
              </button>
            ) : (
              <form onSubmit={submitAdjustment} className="space-y-4 rounded-lg border border-slate-800 p-4">
                {sourceAlert && (
                  <div className="flex items-start justify-between gap-3 rounded bg-amber-900/20 border border-amber-800/40 px-3 py-2 text-xs text-amber-300">
                    <span>Fixing flagged issue: &quot;{sourceAlert.message}&quot;</span>
                    <button type="button" onClick={() => setSourceAlert(null)} className="shrink-0 opacity-70 hover:opacity-100">
                      Unlink ×
                    </button>
                  </div>
                )}

                <div>
                  <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-slate-600 mb-2">Who &amp; when</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Player</label>
                      <input
                        list="adj-player-list"
                        value={playerName}
                        onChange={e => setPlayerName(e.target.value)}
                        placeholder="Start typing a name…"
                        className={inputCls}
                        required
                      />
                      <datalist id="adj-player-list">
                        {players.map(p => (
                          <option key={p.id} value={p.name}>{p.teamName ?? ""}</option>
                        ))}
                      </datalist>
                    </div>
                    <div>
                      <label className={labelCls}>Week (optional)</label>
                      <select value={weekKey} onChange={e => setWeekKey(e.target.value)} className={inputCls}>
                        <option value="">Season total only — no specific week</option>
                        {weeks.map(w => (
                          <option key={w.weekKey} value={w.weekKey}>{formatWeekLabel(w)}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-slate-600 mb-2">What result</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Game type</label>
                      <select value={gameType} onChange={e => setGameType(e.target.value as typeof gameType)} className={inputCls}>
                        <option value="crkt">Cricket</option>
                        <option value="601">601</option>
                        <option value="501">501</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Phase</label>
                      <select value={phase} onChange={e => setPhase(e.target.value as typeof phase)} className={inputCls}>
                        <option value="REG">Regular season</option>
                        <option value="POST">Playoffs</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-slate-600 mb-2">The correction</p>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className={labelCls}>Wins to add</label>
                      <input type="number" value={winsDelta} onChange={e => setWinsDelta(e.target.value)} className={inputCls} />
                      <p className="text-[0.65rem] text-slate-600 mt-1">Negative removes a win instead.</p>
                    </div>
                    <div className="flex-1">
                      <label className={labelCls}>Losses to add</label>
                      <input type="number" value={lossesDelta} onChange={e => setLossesDelta(e.target.value)} className={inputCls} />
                      <p className="text-[0.65rem] text-slate-600 mt-1">Negative removes a loss instead.</p>
                    </div>
                  </div>
                </div>

                <div>
                  <label className={labelCls}>Why (shown in the history list below, for future reference)</label>
                  <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} className={inputCls} placeholder="e.g. Singles 501 forfeit, Set #11 vs The Punishers" />
                </div>

                <div className="flex items-center gap-3">
                  <button type="submit" disabled={saving} className="px-4 py-2 rounded bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium transition-colors disabled:opacity-50">
                    {saving ? "Saving…" : "Save Correction"}
                  </button>
                  <button type="button" onClick={() => setFormOpen(false)} className="text-sm text-slate-500 hover:text-slate-300">
                    Cancel
                  </button>
                </div>
                {result && <ResultBanner result={result} onDismiss={() => setResult(null)} />}
              </form>
            )}
          </div>

          {/* Step 3: History */}
          <div>
            <h3 className="text-sm font-semibold text-slate-200 mb-1">3. Correction history</h3>
            <p className="text-xs text-slate-500 mb-3">Every manual correction applied to this season, most recent first.</p>
            {adjustments.length === 0 ? (
              <p className="text-sm text-slate-500">None yet.</p>
            ) : (
              <div className="space-y-1.5">
                {groupAdjustments(adjustments).map(g => (
                  <details key={g.key} className="group rounded border border-slate-800 open:border-slate-700 open:bg-slate-900/40">
                    <summary className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 cursor-pointer list-none">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 min-w-0">
                        <span className="text-slate-600 text-xs group-open:rotate-90 transition-transform inline-block">▸</span>
                        <span className="font-medium text-slate-200 text-sm">
                          {g.matchLabel ?? g.items[0].playerName}
                        </span>
                        <span className="text-xs text-slate-500">
                          {g.matchDate && `${formatShortDate(g.matchDate)} · `}
                          {g.gameTypes.map(t => GAME_TYPE_LABELS[t] ?? t).join(", ")}
                          {g.items.length > 1 && ` · ${g.items.length} corrections`}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {netDelta(g.items, "winsDelta") !== 0 && (
                          <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-emerald-950/40 text-emerald-400">
                            {signed(netDelta(g.items, "winsDelta"))}W
                          </span>
                        )}
                        {netDelta(g.items, "lossesDelta") !== 0 && (
                          <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-rose-950/40 text-rose-400">
                            {signed(netDelta(g.items, "lossesDelta"))}L
                          </span>
                        )}
                        {g.matchDcGuid && (
                          <a href={dcRecapUrl(g.matchDcGuid)} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-xs text-amber-600 hover:text-amber-400 transition-colors">↗</a>
                        )}
                      </div>
                    </summary>
                    {g.note && <p className="px-3 pb-2 -mt-1 text-xs text-slate-500 leading-snug">{g.note}</p>}
                    <div className="border-t border-slate-800/80 divide-y divide-slate-800/60">
                      {g.items.map(a => (
                        <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5">
                          <div className="flex flex-wrap items-baseline gap-x-2 min-w-0">
                            <span className="text-sm text-slate-300">{a.playerName}</span>
                            {a.teamName && <span className="text-xs text-slate-500">{a.teamName}</span>}
                            <span className="text-[0.7rem] text-slate-600">
                              {GAME_TYPE_LABELS[a.gameType] ?? a.gameType}
                              {a.phase === "POST" && " · Playoffs"}
                              {!g.matchDate && a.weekKey && ` · ${a.weekKey}`}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {a.winsDelta !== 0 && (
                              <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-emerald-950/40 text-emerald-400">{signed(a.winsDelta)}W</span>
                            )}
                            {a.lossesDelta !== 0 && (
                              <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-rose-950/40 text-rose-400">{signed(a.lossesDelta)}L</span>
                            )}
                            <button onClick={() => deleteAdjustment(a.id)} className="text-xs px-2 py-1 rounded bg-slate-800 text-slate-400 hover:text-red-400 hover:bg-red-950/40 transition-colors">
                              Delete
                            </button>
                          </div>
                          {!g.note && a.note && <p className="w-full text-xs text-slate-500 leading-snug">{a.note}</p>}
                        </div>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            )}
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
       tab === "alerts"   ? <AlertsTab seasons={seasons} secret={secret} /> :
       tab === "documents"? <DocumentsTab secret={secret} /> :
                            <SiteConfigTab secret={secret} />}
    </div>
  );
}
