import { describe, it, expect } from "vitest";
import { groupTeamSchedule, type ScheduleMatch } from "./schedule";

const base: ScheduleMatch = {
  id: 1,
  schedDate: "2026-01-27",
  roundSeq: 1,
  homeTeamId: 10,
  awayTeamId: 20,
  homeTeamName: "Team A",
  awayTeamName: "Team B",
  homeScore: 0,
  awayScore: 0,
  status: "P",
  dcGuid: null,
  homeVenueName: "The Tap Room",
};

describe("groupTeamSchedule", () => {
  it("puts matches before today in past, on/after in upcoming", () => {
    const past = { ...base, id: 1, schedDate: "2026-02-01", status: "C", homeScore: 6, awayScore: 2 };
    const upcoming = { ...base, id: 2, schedDate: "2026-04-01", status: "P" };
    const result = groupTeamSchedule([past, upcoming], "2026-03-14");
    expect(result.past).toHaveLength(1);
    expect(result.past[0].id).toBe(1);
    expect(result.upcoming).toHaveLength(1);
    expect(result.upcoming[0].id).toBe(2);
  });

  it("sorts past matches descending (most recent first)", () => {
    const m1 = { ...base, id: 1, schedDate: "2026-01-13", status: "C" };
    const m2 = { ...base, id: 2, schedDate: "2026-02-03", status: "C" };
    const result = groupTeamSchedule([m1, m2], "2026-03-14");
    expect(result.past.map((m) => m.id)).toEqual([2, 1]);
  });

  it("sorts upcoming matches ascending (soonest first)", () => {
    const m1 = { ...base, id: 1, schedDate: "2026-04-07", status: "P" };
    const m2 = { ...base, id: 2, schedDate: "2026-03-17", status: "P" };
    const result = groupTeamSchedule([m1, m2], "2026-03-14");
    expect(result.upcoming.map((m) => m.id)).toEqual([2, 1]);
  });

  it("handles null schedDate by placing in upcoming", () => {
    const noDate = { ...base, id: 99, schedDate: null, status: "P" };
    const result = groupTeamSchedule([noDate], "2026-03-14");
    expect(result.upcoming).toHaveLength(1);
    expect(result.past).toHaveLength(0);
  });

  it("returns empty arrays when no matches", () => {
    const result = groupTeamSchedule([], "2026-03-14");
    expect(result.past).toHaveLength(0);
    expect(result.upcoming).toHaveLength(0);
  });

  it("sorts multiple null-date upcoming matches stably", () => {
    const m1 = { ...base, id: 1, schedDate: null, status: "P" };
    const m2 = { ...base, id: 2, schedDate: null, status: "P" };
    const result = groupTeamSchedule([m1, m2], "2026-03-14");
    expect(result.upcoming).toHaveLength(2);
    expect(result.past).toHaveLength(0);
  });

  it("sorts multiple null-date past matches stably", () => {
    const m1 = { ...base, id: 1, schedDate: null, status: "C", homeScore: 6, awayScore: 2 };
    const m2 = { ...base, id: 2, schedDate: null, status: "C", homeScore: 4, awayScore: 4 };
    // null dates are treated as upcoming, so past stays empty
    const result = groupTeamSchedule([m1, m2], "2026-03-14");
    expect(result.upcoming).toHaveLength(2);
    expect(result.past).toHaveLength(0);
  });
});
