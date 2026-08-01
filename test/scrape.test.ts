import { describe, expect, test } from "bun:test";
import { formatElapsed, parseStandingsJson, ratingColor } from "../src/scrape/standings.js";
import fs from "node:fs";
import { parseArchivePage } from "../src/scrape/contests.js";
import { parseContestTop } from "../src/scrape/contest.js";
import { parseSubmissionDetail } from "../src/scrape/submission.js";
import { parseSubmissionsPage } from "../src/scrape/submissions.js";
import { parseTasksPage } from "../src/scrape/tasks.js";
import path from "node:path";

const fixture2 = (name: string) =>
  fs.readFileSync(path.join(import.meta.dir, "fixtures", name), "utf8");
const fixture = (name: string) =>
  fs.readFileSync(path.join(import.meta.dir, "fixtures", `${name}.html`), "utf8");

describe("parseTasksPage", () => {
  const tasks = parseTasksPage(fixture("abc300_tasks"));

  test("all abc300 tasks with limits", () => {
    expect(tasks).toHaveLength(8);
    expect(tasks[0]).toEqual({
      id: "abc300_a",
      letter: "A",
      memoryLimit: "1024 MiB",
      timeLimit: "2 sec",
      title: "N-choice question",
    });
    expect(tasks[7]!.letter).toBe("Ex");
  });
});

describe("parseContestTop", () => {
  test("abc300: header facts, no published writers", () => {
    const meta = parseContestTop(fixture("abc300_top"));
    expect(meta.title).toContain("AtCoder Beginner Contest 300");
    expect(meta.startText).toBe("2023-04-29 21:00:00+0900");
    expect(meta.endText).toBe("2023-04-29 22:40:00+0900");
    expect(meta.headerFacts).toContain("Rated Range: - 1999");
    expect(meta.headerFacts).toContain("Penalty: 5 minutes");
    expect(meta.writers).toEqual([]);
    expect(meta.statementHtml.ja).not.toBeNull();
  });

  test("agc060: writer list is published", () => {
    const meta = parseContestTop(fixture("agc060_top"));
    expect(meta.title).toContain("AtCoder Grand Contest 060");
    expect(meta.writers).toContain("maroonrk");
  });
});

describe("parseArchivePage", () => {
  const page = parseArchivePage(fixture("contests_archive_p1"));

  test("50 contests per page, pagination bound", () => {
    expect(page.contests).toHaveLength(50);
    expect(page.maxPage).toBeGreaterThanOrEqual(18);
    expect(page.contests[0]!.id).toBe("abc468");
    expect(page.contests[0]!.durationMin).toBe(100);
  });
});

describe("parseSubmissionsPage", () => {
  const page = parseSubmissionsPage(fixture("submissions_sample"));

  test("full AC row", () => {
    expect(page.submissions).toHaveLength(3);
    const ac = page.submissions[0]!;
    expect(ac).toEqual({
      execTime: "2 ms",
      id: "41039290",
      language: "Haskell (GHC 9.4.5)",
      memory: "4380 KB",
      score: "100",
      status: "AC",
      taskId: "abc300_a",
      taskLabel: "A - N-choice question",
      timeText: "2023-04-29 21:02:32+0900",
      user: "sample_user",
    });
  });

  test("CE row with collapsed columns", () => {
    const ce = page.submissions[2]!;
    expect(ce.status).toBe("CE");
    expect(ce.execTime).toBeNull();
    expect(ce.memory).toBeNull();
    expect(ce.id).toBe("41062333");
  });

  test("pagination", () => {
    expect(page.maxPage).toBe(3);
  });
});

// Logged-in recordings live in test/fixtures/private/ (gitignored, recorded
// via `just fixture-private`); when present, every submissions_*.html there
// is parsed and sanity-checked. CI has none — these run only for the user.
describe("parseSubmissionsPage: private recordings", () => {
  const privateDir = path.join(import.meta.dir, "fixtures", "private");
  const files = fs.existsSync(privateDir)
    ? fs.readdirSync(privateDir).filter((f) => f.startsWith("submissions_") && f.endsWith(".html"))
    : [];
  test.skipIf(files.length === 0)("all private submissions fixtures parse", () => {
    for (const file of files) {
      const page = parseSubmissionsPage(fs.readFileSync(path.join(privateDir, file), "utf8"));
      expect(page.submissions.length).toBeGreaterThan(0);
      for (const s of page.submissions) {
        expect(s.timeText).not.toBe("");
        expect(s.taskId).not.toBeNull();
        expect(s.status).not.toBe("");
        expect(s.user).not.toBe("");
      }
    }
  });
});

describe("parseStandingsJson", () => {
  const standings = parseStandingsJson(fixture2("standings_sample.json"));

  test("tasks and ranked rows", () => {
    expect(standings.tasks.map((t) => t.label)).toEqual(["A", "B"]);
    expect(standings.rows).toHaveLength(3);
    expect(standings.rows[0]).toEqual({
      elapsedSec: 754,
      penalty: 0,
      rank: 1,
      rating: 3800,
      score: 600,
      user: "tourist_sample",
    });
  });

  test("no scoring submission yields null elapsed", () => {
    expect(standings.rows[2]!.elapsedSec).toBeNull();
    expect(standings.rows[2]!.score).toBe(0);
  });

  test("elapsed formatting", () => {
    expect(formatElapsed(754)).toBe("12:34");
    expect(formatElapsed(3541)).toBe("59:01");
    expect(formatElapsed(3661)).toBe("1:01:01");
  });

  test("rating tiers", () => {
    expect(ratingColor(0)).toBeNull();
    expect(ratingColor(399)).toBe("#808080");
    expect(ratingColor(1234)).toBe("#00C0C0");
    expect(ratingColor(3800)).toBe("#FF0000");
  });
});

describe("parseSubmissionDetail", () => {
  const detail = parseSubmissionDetail(fixture2("submission_sample.html"));

  test("source code is extracted verbatim", () => {
    expect(detail.code).toContain("main :: IO ()");
    expect(detail.code).toContain("map read . words <$> getLine");
  });

  test("facts table", () => {
    const facts = Object.fromEntries(detail.facts);
    expect(facts["Task"]).toBe("A - Sample Problem A");
    expect(facts["Status"]).toBe("AC");
    expect(facts["Exec Time"]).toBe("2 ms");
  });

  test("no compile error section", () => {
    expect(detail.compileError).toBeNull();
  });
});
