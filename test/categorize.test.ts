import { describe, expect, test } from "bun:test";
import { categorize } from "../src/categorize.js";
import fs from "node:fs";
import { parseContestsPage } from "../src/scrape/contests.js";
import path from "node:path";

const c = (id: string, title = "") => categorize({ id, title });

describe("categorize", () => {
  test("numbered series by id prefix", () => {
    expect(c("abc300", "UNIQUE VISION Programming Contest (ABC 300)")).toBe("abc");
    expect(c("arc225")).toBe("arc");
    expect(c("agc060")).toBe("agc");
    expect(c("ahc069", "RECRUIT Half Marathon (AHC 069)")).toBe("ahc");
  });

  test("weekday contests are awc, world tour finals are NOT", () => {
    expect(c("awc0125", "AtCoder Weekday Contest 0125 Beta")).toBe("awc");
    expect(c("awtf2026algo", "World Tour Finals 2026 Algorithm")).toBe("other");
    expect(c("awtf2026heuristic")).toBe("other");
  });

  test("PAST", () => {
    expect(c("past202112-open")).toBe("past");
    expect(c("past15-open")).toBe("past");
  });

  test("learning contests", () => {
    expect(c("dp", "Educational DP Contest")).toBe("learning");
    expect(c("typical90", "競プロ典型 90 問")).toBe("learning");
    expect(c("tessoku-book")).toBe("learning");
    expect(c("practice2", "AtCoder Library Practice Contest")).toBe("learning");
    expect(c("abs", "AtCoder Beginners Selection")).toBe("learning");
  });

  test("joi", () => {
    expect(c("joi2024yo1a", "JOI 2024 予選")).toBe("joi");
    expect(c("joig2023-open")).toBe("joi");
  });

  test("everything else is other, never lost", () => {
    expect(c("masters2026-qual")).toBe("other");
    expect(c("ndpc")).toBe("other");
    expect(c("wtf22")).toBe("other");
  });

  test("every contest in the real fixtures gets a bucket", () => {
    for (const fixture of ["contests_front_en", "contests_archive_p1"]) {
      const html = fs.readFileSync(
        path.join(import.meta.dir, "fixtures", `${fixture}.html`),
        "utf8",
      );
      for (const section of parseContestsPage(html)) {
        for (const contest of section.contests) {
          expect(typeof categorize(contest)).toBe("string");
        }
      }
    }
  });
});
