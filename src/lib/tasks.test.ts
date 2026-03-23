import { describe, expect, it } from "vitest";
import {
  addDays,
  formatDisplayDate,
  formatISODate,
  formatWorkDaysSummary,
  parseISODate,
  startOfWeek,
} from "./tasks";

describe("parseISODate", () => {
  it("parses a valid ISO date string", () => {
    const date = parseISODate("2024-03-15");
    expect(date).not.toBeNull();
    expect(date?.getFullYear()).toBe(2024);
    expect(date?.getMonth()).toBe(2); // March = 2
    expect(date?.getDate()).toBe(15);
  });

  it("returns null for empty string", () => {
    expect(parseISODate("")).toBeNull();
  });

  it("returns null for non-ISO format", () => {
    expect(parseISODate("15/03/2024")).toBeNull();
    expect(parseISODate("March 15 2024")).toBeNull();
  });

  it("returns null for invalid date like Feb 30", () => {
    expect(parseISODate("2024-02-30")).toBeNull();
  });

  it("parses Jan 1", () => {
    const date = parseISODate("2024-01-01");
    expect(date?.getFullYear()).toBe(2024);
    expect(date?.getMonth()).toBe(0);
    expect(date?.getDate()).toBe(1);
  });
});

describe("formatISODate", () => {
  it("formats a Date to YYYY-MM-DD", () => {
    expect(formatISODate(new Date(2024, 2, 5))).toBe("2024-03-05");
  });

  it("pads month and day with zeros", () => {
    expect(formatISODate(new Date(2024, 0, 1))).toBe("2024-01-01");
  });

  it("round-trips with parseISODate", () => {
    const original = "2024-11-30";
    const date = parseISODate(original);
    expect(date).not.toBeNull();
    expect(formatISODate(date!)).toBe(original);
  });
});

describe("addDays", () => {
  it("adds positive days", () => {
    const base = new Date(2024, 2, 1); // March 1
    const result = addDays(base, 5);
    expect(result.getDate()).toBe(6);
    expect(result.getMonth()).toBe(2);
  });

  it("adds days crossing month boundary", () => {
    const base = new Date(2024, 0, 29); // Jan 29
    const result = addDays(base, 3);
    expect(result.getMonth()).toBe(1); // February
    expect(result.getDate()).toBe(1);
  });

  it("subtracts days with negative value", () => {
    const base = new Date(2024, 2, 5); // March 5
    const result = addDays(base, -4);
    expect(result.getDate()).toBe(1);
  });

  it("does not mutate the original date", () => {
    const base = new Date(2024, 2, 1);
    addDays(base, 10);
    expect(base.getDate()).toBe(1);
  });
});

describe("startOfWeek", () => {
  it("returns Monday for a Wednesday", () => {
    const wednesday = new Date(2024, 2, 20); // March 20, 2024 = Wednesday
    const result = startOfWeek(wednesday);
    expect(result.getDay()).toBe(1); // Monday
    expect(result.getDate()).toBe(18);
  });

  it("returns Monday for a Monday", () => {
    const monday = new Date(2024, 2, 18); // March 18, 2024 = Monday
    const result = startOfWeek(monday);
    expect(result.getDate()).toBe(18);
    expect(result.getDay()).toBe(1);
  });

  it("returns previous Monday for a Sunday", () => {
    const sunday = new Date(2024, 2, 17); // March 17, 2024 = Sunday
    const result = startOfWeek(sunday);
    expect(result.getDay()).toBe(1); // Monday
    expect(result.getDate()).toBe(11);
  });

  it("resets time to midnight", () => {
    const date = new Date(2024, 2, 20, 15, 30, 45);
    const result = startOfWeek(date);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
  });
});

describe("formatWorkDaysSummary", () => {
  it("returns empty string for empty array", () => {
    expect(formatWorkDaysSummary([])).toBe("");
  });

  it("returns single date formatted", () => {
    const result = formatWorkDaysSummary(["2024-03-15"]);
    expect(result).toBeTruthy();
    expect(result).toContain("15");
  });

  it("returns two non-consecutive dates joined with comma", () => {
    const result = formatWorkDaysSummary(["2024-03-15", "2024-03-20"]);
    expect(result).toContain(",");
  });

  it("formats consecutive days as range within same month", () => {
    const result = formatWorkDaysSummary(["2024-03-04", "2024-03-05", "2024-03-06"]);
    // Should be like "04-06 mar"
    expect(result).toMatch(/04.+06/);
  });

  it("deduplicates repeated dates", () => {
    const result = formatWorkDaysSummary(["2024-03-15", "2024-03-15"]);
    // Single date — no comma
    expect(result).not.toContain(",");
  });

  it("truncates more than 2 non-consecutive dates with +N", () => {
    const result = formatWorkDaysSummary([
      "2024-03-01",
      "2024-03-05",
      "2024-03-10",
    ]);
    expect(result).toContain("+1");
  });
});
