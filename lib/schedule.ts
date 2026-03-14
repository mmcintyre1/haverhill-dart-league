export type ScheduleMatch = {
  id: number;
  schedDate: string | null;
  roundSeq: number | null;
  homeTeamId: number | null;
  awayTeamId: number | null;
  homeTeamName: string | null;
  awayTeamName: string | null;
  homeScore: number;
  awayScore: number;
  status: string;
  dcGuid: string | null;
  homeVenueName: string | null;
};

export type GroupedSchedule = {
  past: ScheduleMatch[];
  upcoming: ScheduleMatch[];
};

/**
 * Split matches for a team into past (before today) and upcoming (today or after).
 * Matches with no schedDate are treated as upcoming.
 * Past is sorted descending (most recent first).
 * Upcoming is sorted ascending (soonest first).
 *
 * @param matches - flat list of matches for this team
 * @param today   - ISO date string "YYYY-MM-DD" representing today
 */
export function groupTeamSchedule(
  matches: ScheduleMatch[],
  today: string
): GroupedSchedule {
  const past: ScheduleMatch[] = [];
  const upcoming: ScheduleMatch[] = [];

  for (const m of matches) {
    if (m.schedDate && m.schedDate < today) {
      past.push(m);
    } else {
      upcoming.push(m);
    }
  }

  past.sort((a, b) => (b.schedDate ?? "").localeCompare(a.schedDate ?? ""));
  upcoming.sort((a, b) => (a.schedDate ?? "").localeCompare(b.schedDate ?? ""));

  return { past, upcoming };
}
