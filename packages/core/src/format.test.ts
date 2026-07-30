import { describe, expect, test } from "bun:test";
import { formatRelativeTime, formatSegmentCount } from "./format";

const NOW = new Date("2026-07-28T12:00:00Z");

function ago(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString();
}

describe("formatRelativeTime", () => {
  test.each([
    [0, "just now"],
    [30 * 1000, "just now"],
    [60 * 1000, "1 minute ago"],
    [12 * 60 * 1000, "12 minutes ago"],
    [60 * 60 * 1000, "1 hour ago"],
    [5 * 60 * 60 * 1000, "5 hours ago"],
    [24 * 60 * 60 * 1000, "yesterday"],
    [3 * 24 * 60 * 60 * 1000, "3 days ago"],
    [7 * 24 * 60 * 60 * 1000, "1 week ago"],
    [21 * 24 * 60 * 60 * 1000, "3 weeks ago"],
  ])("renders %ims ago as %s", (elapsed, expected) => {
    expect(formatRelativeTime(ago(elapsed), NOW)).toBe(expected);
  });

  test("falls back to a date past a month", () => {
    const result = formatRelativeTime(ago(90 * 24 * 60 * 60 * 1000), NOW);
    expect(result).not.toContain("ago");
    expect(result.length).toBeGreaterThan(0);
  });

  test("a clock skewed into the future reads as just now, not negative", () => {
    expect(formatRelativeTime(ago(-60_000), NOW)).toBe("just now");
  });

  test("an unparseable timestamp renders as empty rather than NaN", () => {
    expect(formatRelativeTime("not a date", NOW)).toBe("");
  });
});

describe("formatSegmentCount", () => {
  test.each([
    [0, "0 shots"],
    [1, "1 shot"],
    [6, "6 shots"],
  ])("renders %i as %s", (count, expected) => {
    expect(formatSegmentCount(count)).toBe(expected);
  });
});
