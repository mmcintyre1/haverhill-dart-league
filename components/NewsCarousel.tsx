"use client";

import { useRef, useState } from "react";

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

const SWIPE_THRESHOLD = 40;

export default function NewsCarousel({ posts }: { posts: Post[] }) {
  const [idx, setIdx] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const touchDeltaX = useRef(0);

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

  const goPrev = () => setIdx((i) => (i - 1 + total) % total);
  const goNext = () => setIdx((i) => (i + 1) % total);

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchDeltaX.current = 0;
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    touchDeltaX.current = e.touches[0].clientX - touchStartX.current;
  }

  function handleTouchEnd() {
    if (touchDeltaX.current > SWIPE_THRESHOLD) {
      goPrev();
    } else if (touchDeltaX.current < -SWIPE_THRESHOLD) {
      goNext();
    }
    touchStartX.current = null;
    touchDeltaX.current = 0;
  }

  return (
    <div className="flex flex-col flex-1">
      <div className="relative flex items-center gap-2">
        {total > 1 && (
          <button
            onClick={goPrev}
            aria-label="Previous post"
            className="hidden sm:flex shrink-0 w-11 h-11 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-slate-400 hover:border-amber-500 hover:text-amber-400 active:scale-95 transition-all"
          >
            <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        )}

        <div
          className="rounded-xl border border-slate-800 bg-slate-900 p-5 flex-1 flex flex-col touch-pan-y select-none"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
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
          <button
            onClick={goNext}
            aria-label="Next post"
            className="hidden sm:flex shrink-0 w-11 h-11 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-slate-400 hover:border-amber-500 hover:text-amber-400 active:scale-95 transition-all"
          >
            <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        )}
      </div>

      {total > 1 && (
        <div className="flex items-center justify-center gap-6 mt-3 sm:hidden">
          <button
            onClick={goPrev}
            aria-label="Previous post"
            className="w-11 h-11 flex items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-slate-400 hover:border-amber-500 hover:text-amber-400 active:scale-95 transition-all"
          >
            <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
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
            onClick={goNext}
            aria-label="Next post"
            className="w-11 h-11 flex items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-slate-400 hover:border-amber-500 hover:text-amber-400 active:scale-95 transition-all"
          >
            <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>
      )}

      {total > 1 && (
        <div className="hidden sm:flex justify-center gap-1.5 mt-3">
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
      )}
    </div>
  );
}
