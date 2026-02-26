/**
 * Format a YYYY-MM-DD date string as "Feb 27, 2026".
 * Uses noon UTC to avoid timezone-boundary off-by-one issues.
 */
export function formatShortDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T12:00:00");
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

/**
 * Format a round/date pair as "Week 6 – Feb 27, 2026".
 * Falls back gracefully when either value is missing.
 */
export function formatRoundLabel(
  round: number | null | undefined,
  schedDate: string | null | undefined
): string {
  const date = formatShortDate(schedDate);
  if (round != null && date) return `Week ${round} \u2013 ${date}`;
  if (round != null) return `Week ${round}`;
  return date;
}
