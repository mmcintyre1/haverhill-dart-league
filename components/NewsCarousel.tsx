"use client";

import { useState } from "react";

type Post = {
  id: number;
  title: string;
  body: string;
  author: string | null;
  publishedAt: Date;
};

function formatDate(d: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

export default function NewsCarousel({ posts }: { posts: Post[] }) {
  const [idx, setIdx] = useState(0);

  if (posts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-700 py-14 text-center text-slate-500 flex-1 flex flex-col items-center justify-center">
        <p className="text-3xl mb-3 select-none">◎</p>
        <p className="font-medium text-slate-400">Stay tuned for announcements</p>
        <p className="text-sm mt-1">League news and updates will appear here throughout the season.</p>
      </div>
    );
  }

  const post = posts[idx];
  const total = posts.length;

  return (
    <div className="flex flex-col flex-1">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-4 mb-2">
          <h3 className="text-base font-semibold text-white leading-snug">{post.title}</h3>
          <time className="text-xs text-slate-500 shrink-0 mt-0.5">
            {formatDate(post.publishedAt)}
          </time>
        </div>
        <p className="text-slate-400 text-sm leading-relaxed whitespace-pre-wrap flex-1">{post.body}</p>
        {post.author && (
          <p className="mt-3 text-xs text-slate-600">— {post.author}</p>
        )}
      </div>

      {total > 1 && (
        <div className="flex items-center justify-between mt-3 px-1">
          <button
            onClick={() => setIdx((i) => (i - 1 + total) % total)}
            className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-30"
            aria-label="Previous post"
          >
            ‹
          </button>

          <div className="flex gap-1.5">
            {posts.map((_, i) => (
              <button
                key={i}
                onClick={() => setIdx(i)}
                aria-label={`Post ${i + 1}`}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  i === idx ? "bg-amber-400" : "bg-slate-700 hover:bg-slate-500"
                }`}
              />
            ))}
          </div>

          <button
            onClick={() => setIdx((i) => (i + 1) % total)}
            className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="Next post"
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}
