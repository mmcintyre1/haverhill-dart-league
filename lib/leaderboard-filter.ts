export function filterLeaderboardByName<T extends { playerName: string }>(
  rows: T[],
  query: string
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => r.playerName.toLowerCase().includes(q));
}
