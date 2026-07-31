import { describe, expect, test } from "bun:test";
import { contestPhase, formatCountdown, formatStartLine } from "../src/phase.js";

const HOUR = 3600_000;

describe("contestPhase", () => {
  const start = 100 * HOUR;
  const end = 102 * HOUR;

  test("before start is upcoming — the app must not fetch task pages", () => {
    expect(contestPhase(start, end, start - 1)).toBe("upcoming");
  });
  test("between start and end is active", () => {
    expect(contestPhase(start, end, start)).toBe("active");
    expect(contestPhase(start, end, end - 1)).toBe("active");
  });
  test("from end onward is ended", () => {
    expect(contestPhase(start, end, end)).toBe("ended");
  });
  test("unknown start (permanent contests) is unknown", () => {
    expect(contestPhase(null, null, 0)).toBe("unknown");
  });
  test("known start with unknown end stays active after start", () => {
    expect(contestPhase(start, null, start + 1000 * HOUR)).toBe("active");
  });
});

describe("formatCountdown", () => {
  test("granularity by magnitude", () => {
    expect(formatCountdown(2 * 24 * HOUR + 3 * HOUR)).toBe("2d 3h");
    expect(formatCountdown(HOUR + 5 * 60_000)).toBe("1h 05m");
    expect(formatCountdown(12 * 60_000 + 30_000)).toBe("12m 30s");
    expect(formatCountdown(-5000)).toBe("0m 00s");
  });
});

describe("formatStartLine", () => {
  const start = Date.UTC(2026, 7, 1, 12, 0, 0);
  test("localized with countdown", () => {
    expect(formatStartLine(start, start - HOUR, "en")).toContain("in 1h 00m");
    expect(formatStartLine(start, start - HOUR, "ja")).toContain("あと 1h 00m");
  });
});
