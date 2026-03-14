import { describe, it, expect } from "vitest";
import { formatShortDate, formatRoundLabel } from "./format";

describe("formatShortDate", () => {
  it("formats a YYYY-MM-DD string as 'Mon D, YYYY'", () => {
    expect(formatShortDate("2026-01-27")).toBe("Jan 27, 2026");
  });

  it("formats end-of-month dates correctly", () => {
    expect(formatShortDate("2026-02-28")).toBe("Feb 28, 2026");
  });

  it("returns empty string for null", () => {
    expect(formatShortDate(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(formatShortDate(undefined)).toBe("");
  });

  it("returns empty string for empty string", () => {
    expect(formatShortDate("")).toBe("");
  });
});

describe("formatRoundLabel", () => {
  it("formats round and date as 'Week N – Mon D, YYYY'", () => {
    expect(formatRoundLabel(6, "2026-02-27")).toBe("Week 6 \u2013 Feb 27, 2026");
  });

  it("returns 'Week N' when date is missing", () => {
    expect(formatRoundLabel(3, null)).toBe("Week 3");
  });

  it("returns formatted date when round is missing", () => {
    expect(formatRoundLabel(null, "2026-03-10")).toBe("Mar 10, 2026");
  });

  it("returns empty string when both are missing", () => {
    expect(formatRoundLabel(null, null)).toBe("");
  });
});
