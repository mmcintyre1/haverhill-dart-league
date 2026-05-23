"use client";

import { useState } from "react";

type Status = "idle" | "sending" | "success" | "error";

export default function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    try {
      const res = await fetch("/netlify-forms.html", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          "form-name": "contact",
          name,
          email,
          message,
        }).toString(),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setStatus("success");
      setName(""); setEmail(""); setMessage("");
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="rounded-xl border border-emerald-800 bg-emerald-900/20 px-6 py-8 text-center">
        <p className="text-emerald-300 font-medium mb-1">Message sent!</p>
        <p className="text-slate-400 text-sm">We&apos;ll get back to you as soon as we can.</p>
        <button
          onClick={() => setStatus("idle")}
          className="mt-4 text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Honeypot — hidden from real users, bots fill it in */}
      <input type="text" name="bot-field" className="hidden" aria-hidden="true" tabIndex={-1} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs uppercase tracking-wider text-slate-400 mb-1">Name</label>
          <input
            required
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
            placeholder="Your name"
          />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wider text-slate-400 mb-1">Email</label>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
            placeholder="you@example.com"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs uppercase tracking-wider text-slate-400 mb-1">Message</label>
        <textarea
          required
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full rounded bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500 resize-y"
          placeholder="Questions, inquiries, or feedback…"
        />
      </div>

      {status === "error" && (
        <p className="text-sm text-rose-400">Something went wrong — please try again.</p>
      )}

      <button
        type="submit"
        disabled={status === "sending"}
        className="px-5 py-2 rounded bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
      >
        {status === "sending" ? "Sending…" : "Send Message"}
      </button>
    </form>
  );
}
