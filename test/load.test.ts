import { describe, expect, test } from "bun:test";
import { LoadMeter } from "../src/net/load.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function tempJournal(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "atui-load-"));
  return path.join(dir, "requests.jsonl");
}

const DAY = 24 * 60 * 60 * 1000;

describe("LoadMeter", () => {
  test("counts session requests and bytes", () => {
    const meter = new LoadMeter(null);
    meter.recordRequest("https://x/a", 100);
    meter.recordRequest("https://x/b", 50);
    const stats = meter.stats();
    expect(stats.sessionRequests).toBe(2);
    expect(stats.sessionBytes).toBe(150);
  });

  test("cache hit ratio", () => {
    const meter = new LoadMeter(null);
    meter.recordRequest("https://x/a", 1);
    meter.recordCacheHit();
    meter.recordCacheHit();
    meter.recordCacheHit();
    expect(meter.stats().cacheHitRatio).toBeCloseTo(0.75);
  });

  test("journal persists across instances; today counts include past sessions", () => {
    const journal = tempJournal();
    const base = Date.UTC(2026, 6, 31, 12, 0, 0);
    const first = new LoadMeter(journal, () => base);
    first.recordRequest("https://x/a", 100);

    const second = new LoadMeter(journal, () => base + 60_000);
    second.recordRequest("https://x/b", 10);
    const stats = second.stats();
    expect(stats.sessionRequests).toBe(1);
    expect(stats.todayRequests).toBe(2);
    expect(stats.todayBytes).toBe(110);
  });

  test("old journal entries are pruned on load", () => {
    const journal = tempJournal();
    const base = Date.UTC(2026, 6, 31);
    const first = new LoadMeter(journal, () => base);
    first.recordRequest("https://x/old", 100);

    const later = new LoadMeter(journal, () => base + 8 * DAY);
    expect(later.requestsSince(0)).toHaveLength(0);
    // And the file itself was compacted.
    expect(fs.readFileSync(journal, "utf8")).not.toContain("old");
  });

  test("requestsSince returns timestamps in window", () => {
    let now = 0;
    const meter = new LoadMeter(null, () => now);
    meter.recordRequest("https://x/a", 1);
    now = 30_000;
    meter.recordRequest("https://x/b", 1);
    now = 70_000;
    expect(meter.requestsSince(now - 60_000)).toEqual([30_000]);
  });

  test("subscribe notifies on records", () => {
    const meter = new LoadMeter(null);
    let calls = 0;
    const unsubscribe = meter.subscribe(() => {
      calls += 1;
    });
    meter.recordRequest("https://x/a", 1);
    meter.recordCacheHit();
    unsubscribe();
    meter.recordRequest("https://x/b", 1);
    expect(calls).toBe(2);
  });
});
