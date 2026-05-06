import { describe, it, expect } from "vitest";
import { filterLeaderboardByName } from "./leaderboard-filter";

const rows = [
  { playerName: "John Smith" },
  { playerName: "Jane Doe" },
  { playerName: "Bob Johnson" },
  { playerName: "Alice O'Brien" },
];

describe("filterLeaderboardByName", () => {
  it("returns all rows when query is empty", () => {
    expect(filterLeaderboardByName(rows, "")).toHaveLength(4);
  });

  it("returns all rows when query is whitespace only", () => {
    expect(filterLeaderboardByName(rows, "   ")).toHaveLength(4);
  });

  it("matches by substring case-insensitively", () => {
    expect(filterLeaderboardByName(rows, "john")).toEqual([
      { playerName: "John Smith" },
      { playerName: "Bob Johnson" },
    ]);
  });

  it("matches first name only", () => {
    expect(filterLeaderboardByName(rows, "jane")).toEqual([{ playerName: "Jane Doe" }]);
  });

  it("matches last name only", () => {
    expect(filterLeaderboardByName(rows, "doe")).toEqual([{ playerName: "Jane Doe" }]);
  });

  it("returns empty array when nothing matches", () => {
    expect(filterLeaderboardByName(rows, "zzz")).toHaveLength(0);
  });

  it("handles apostrophes in names", () => {
    expect(filterLeaderboardByName(rows, "o'brien")).toEqual([{ playerName: "Alice O'Brien" }]);
  });

  it("preserves the original row shape", () => {
    const withExtra = [{ playerName: "John Smith", pts: 42, pos: 1 }];
    const result = filterLeaderboardByName(withExtra, "john");
    expect(result[0]).toEqual({ playerName: "John Smith", pts: 42, pos: 1 });
  });
});
