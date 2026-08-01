import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import { parseContestsPage } from "../src/scrape/contests.js";
import path from "node:path";

const fixture = (name: string) =>
  fs.readFileSync(path.join(import.meta.dir, "fixtures", `${name}.html`), "utf8");

describe("parseContestsPage", () => {
  const sections = parseContestsPage(fixture("contests_front_en"));
  const byId = Object.fromEntries(sections.map((s) => [s.id, s]));

  test("finds the standard sections in document order", () => {
    const ids = sections.map((s) => s.id);
    expect(ids).toContain("upcoming");
    expect(ids).toContain("recent");
    expect(ids).toContain("permanent");
    expect(ids.indexOf("upcoming")).toBeLessThan(ids.indexOf("recent"));
  });

  test("parses a full upcoming row", () => {
    const ahc = byId["upcoming"]!.contests.find((c) => c.id === "ahc069");
    expect(ahc).toBeDefined();
    expect(ahc!.title).toContain("RECRUIT");
    expect(ahc!.kind).toBe("heuristic");
    expect(ahc!.durationText).toBe("240:00");
    expect(ahc!.durationMin).toBe(240 * 60);
    expect(ahc!.ratedRange).toBe("All");
    // 2026-07-31 19:00 JST
    expect(ahc!.startsAt).toBe(Date.UTC(2026, 6, 31, 10, 0, 0));
  });

  test("parses an algorithm contest with rated range", () => {
    const abc = byId["upcoming"]!.contests.find((c) => c.id === "abc469");
    expect(abc!.kind).toBe("algorithm");
    expect(abc!.ratedRange).toBe("- 1999");
    expect(abc!.durationMin).toBe(100);
  });

  test("permanent contests have no start or duration", () => {
    const permanent = byId["permanent"]!.contests;
    expect(permanent.length).toBeGreaterThan(0);
    expect(permanent[0]!.startsAt).toBeNull();
    expect(permanent[0]!.durationText).toBeNull();
  });

  test("recent section is populated", () => {
    expect(byId["recent"]!.contests.length).toBeGreaterThan(0);
  });

  test("japanese page yields localized titles for the same ids", () => {
    const ja = parseContestsPage(fixture("contests_front_ja"));
    const jaUpcoming = ja.find((s) => s.id === "upcoming")!;
    const abcJa = jaUpcoming.contests.find((c) => c.id === "abc469");
    expect(abcJa).toBeDefined();
    expect(abcJa!.title).toContain("469");
  });
});
