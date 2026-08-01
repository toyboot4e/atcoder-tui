import { describe, expect, test } from "bun:test";
import { UNLISTED_CONTESTS } from "../src/unlisted.js";
import { categorize } from "../src/categorize.js";

describe("UNLISTED_CONTESTS seed", () => {
  test("ids are unique", () => {
    const ids = UNLISTED_CONTESTS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every seed lands in the bucket it exists to fill", () => {
    for (const contest of UNLISTED_CONTESTS) {
      const category = categorize(contest);
      expect(["past", "awc"]).toContain(category);
    }
    expect(UNLISTED_CONTESTS.filter((c) => categorize(c) === "past")).toHaveLength(15);
    expect(UNLISTED_CONTESTS.filter((c) => categorize(c) === "awc")).toHaveLength(125);
  });

  test("awc series is newest-first and zero-padded", () => {
    const awc = UNLISTED_CONTESTS.filter((c) => c.id.startsWith("awc"));
    expect(awc[0]!.id).toBe("awc0125");
    expect(awc.at(-1)!.id).toBe("awc0001");
  });
});
