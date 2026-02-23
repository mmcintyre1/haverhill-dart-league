"use client";

import { useState } from "react";

type Season = {
  id: number;
  name: string;
  isActive: boolean;
  lastScrapedAt: Date | null;
};

type TabId = "posts" | "refresh";

// ── Tab bar ──────────────────────────────────────────────────────────────────

function TabBar({ active, onChange }: { active: TabId; onChange: (t: TabId) => void }) {
  const tabs: { id: TabId; label: string }[] = [
    { id: "posts", label: "News Posts" },
    { id: "refresh", label: "Data Refresh" },
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

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (secret) headers["Authorization"] = `Bearer ${secret}`;
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Unknown error");
      const msg = `Scraped ${data.seasonsScraped} season(s) — ${data.playersUpdated} players, ${data.matchesUpdated} matches updated.`;
      setResult({ ok: true, message: msg, detail: JSON.stringify(data.debug ?? {}, null, 2) });
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
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

// ── Main panel ────────────────────────────────────────────────────────────────

export default function AdminPanel({ seasons, secret }: { seasons: Season[]; secret: string }) {
  const [tab, setTab] = useState<TabId>("posts");

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-6">
      <TabBar active={tab} onChange={setTab} />
      {tab === "posts" ? <PostsTab secret={secret} /> : <RefreshTab seasons={seasons} secret={secret} />}
    </div>
  );
}
