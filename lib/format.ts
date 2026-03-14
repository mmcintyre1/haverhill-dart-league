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
 * Convert a DartConnect weekKey ("27 Jan 2026") to ISO date ("2026-01-27").
 * Returns null if the input is missing or malformed.
 */
export function weekKeyToISODate(weekKey: string): string | null {
  const M: Record<string, string> = {
    Jan:"01",Feb:"02",Mar:"03",Apr:"04",May:"05",Jun:"06",
    Jul:"07",Aug:"08",Sep:"09",Oct:"10",Nov:"11",Dec:"12",
  };
  const [d, m, y] = weekKey.split(" ");
  const mn = M[m];
  if (!mn || !d || !y) return null;
  return `${y}-${mn}-${d.padStart(2, "0")}`;
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
