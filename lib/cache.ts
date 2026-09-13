import { unstable_cache } from "next/cache";

// Public pages that read `searchParams` (season/division/phase selectors) are
// forced into fully dynamic rendering by Next.js — `export const revalidate`
// never actually takes effect on them, so every request re-runs every DB
// query from scratch. Wrapping the underlying fetch functions with Next's
// data cache gives them real caching independent of route-level ISR, tagged
// so the existing post-scrape /api/revalidate call can bust it in one shot.
export const PUBLIC_DATA_TAG = "public-data";

// Temporary diagnostic: unstable_cache only ever calls the wrapped function
// on a real cache miss, so logging here — inside the same Netlify Function
// that serves every request — shows exactly which query actually ran and
// how often, right in the Function log you're already watching (unlike
// proxy.ts/middleware, which compiles to a separate Netlify Edge Function
// with its own, differently-located logs). Remove once the invocation
// spikes are explained.
export function cached<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  keyParts: string[]
): (...args: A) => Promise<R> {
  return unstable_cache(async (...args: A) => {
    console.log(`[CACHE MISS] ${keyParts.join(",")} args=${JSON.stringify(args)}`);
    return fn(...args);
  }, keyParts, { tags: [PUBLIC_DATA_TAG], revalidate: 86400 });
}
