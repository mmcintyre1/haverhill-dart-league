import { describe, it, expect } from "vitest";
import {
  parseCricketNotable,
  gameType,
  setWinner,
  weekKeyToISODate,
  guidToFakeId,
} from "./scrape-utils";

describe("parseCricketNotable", () => {
  it("parses mark notables like '6M'", () => {
    expect(parseCricketNotable("6M")).toEqual({ marks: 6, bulls: 0 });
    expect(parseCricketNotable("3M")).toEqual({ marks: 3, bulls: 0 });
  });

  it("parses bull notables like '4B'", () => {
    expect(parseCricketNotable("4B")).toEqual({ marks: 0, bulls: 4 });
    expect(parseCricketNotable("6B")).toEqual({ marks: 0, bulls: 6 });
  });

  it("returns zeros for unrecognised notables", () => {
    expect(parseCricketNotable("RO9")).toEqual({ marks: 0, bulls: 0 });
    expect(parseCricketNotable("")).toEqual({ marks: 0, bulls: 0 });
  });

  it("returns zeros for null/undefined", () => {
    expect(parseCricketNotable(null)).toEqual({ marks: 0, bulls: 0 });
    expect(parseCricketNotable(undefined)).toEqual({ marks: 0, bulls: 0 });
  });
});

describe("gameType", () => {
  it("identifies 601 games", () => {
    expect(gameType("Cricket 601")).toBe("601");
  });

  it("identifies 501 games", () => {
    expect(gameType("501 Double Out")).toBe("501");
  });

  it("identifies cricket games", () => {
    expect(gameType("Cricket")).toBe("crkt");
    expect(gameType("American Cricket")).toBe("crkt");
  });

  it("returns 'other' for unknown game names", () => {
    expect(gameType("Unknown Game")).toBe("other");
  });

  it("is case-insensitive", () => {
    expect(gameType("CRICKET")).toBe("crkt");
    expect(gameType("601 STANDARD")).toBe("601");
  });
});

describe("setWinner", () => {
  it("returns 0 when home wins more legs", () => {
    const legs = [
      { winner_index: 0 },
      { winner_index: 0 },
      { winner_index: 1 },
    ];
    expect(setWinner(legs as never)).toBe(0);
  });

  it("returns 1 when away wins more legs", () => {
    const legs = [
      { winner_index: 1 },
      { winner_index: 1 },
      { winner_index: 0 },
    ];
    expect(setWinner(legs as never)).toBe(1);
  });

  it("returns null on a tie", () => {
    const legs = [{ winner_index: 0 }, { winner_index: 1 }];
    expect(setWinner(legs as never)).toBeNull();
  });

  it("returns null for empty legs array", () => {
    expect(setWinner([])).toBeNull();
  });
});

describe("weekKeyToISODate", () => {
  it("converts DC weekKey '27 Jan 2026' to '2026-01-27'", () => {
    expect(weekKeyToISODate("27 Jan 2026")).toBe("2026-01-27");
  });

  it("zero-pads single-digit days", () => {
    expect(weekKeyToISODate("3 Mar 2026")).toBe("2026-03-03");
  });

  it("handles all months", () => {
    expect(weekKeyToISODate("1 Feb 2026")).toBe("2026-02-01");
    expect(weekKeyToISODate("15 Dec 2025")).toBe("2025-12-15");
  });

  it("returns null for malformed input", () => {
    expect(weekKeyToISODate("bad input")).toBeNull();
    expect(weekKeyToISODate("")).toBeNull();
  });
});

describe("guidToFakeId", () => {
  it("returns a negative integer for any guid", () => {
    const id = guidToFakeId("abc123");
    expect(id).toBeLessThan(0);
    expect(Number.isInteger(id)).toBe(true);
  });

  it("is deterministic — same input gives same output", () => {
    const guid = "a1b2c3d4e5f6";
    expect(guidToFakeId(guid)).toBe(guidToFakeId(guid));
  });

  it("produces different values for different guids", () => {
    expect(guidToFakeId("guid-one")).not.toBe(guidToFakeId("guid-two"));
  });
});
