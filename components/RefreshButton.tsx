"use client";

import { useState } from "react";

export default function RefreshButton() {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleRefresh() {
    const secret = prompt("Enter refresh secret:");
    if (!secret) return;

    setStatus("loading");
    setMessage("");

    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}` },
      });
      const data = await res.json();
      if (res.ok) {
        setStatus("done");
        setMessage(
          `Updated: ${data.playersUpdated ?? 0} players, ${data.matchesUpdated ?? 0} matches`
        );
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setStatus("error");
        setMessage(data.error ?? "Unknown error");
      }
    } catch (e) {
      setStatus("error");
      setMessage(e instanceof Error ? e.message : "Request failed");
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleRefresh}
        disabled={status === "loading"}
        className="rounded border border-slate-600 bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-sky-500 hover:bg-slate-600 hover:text-sky-300 disabled:opacity-50 transition-colors"
      >
        {status === "loading" ? "Refreshing…" : "Refresh Data"}
      </button>
      {message && (
        <span
          className={`text-xs ${
            status === "error" ? "text-red-400" : "text-emerald-400"
          }`}
        >
          {message}
        </span>
      )}
    </div>
  );
}
