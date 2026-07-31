import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { parseArchivePage } from "../src/scrape/contests.js";
import { parseContestTop } from "../src/scrape/contest.js";
import { parseSubmissionsPage } from "../src/scrape/submissions.js";
import { parseTasksPage } from "../src/scrape/tasks.js";

const fixture = (name: string) => fs.readFileSync(path.join(import.meta.dir, "fixtures", `${name}.html`), "utf8");

describe("parseTasksPage", () => {
  const tasks = parseTasksPage(fixture("abc300_tasks"));

  test("all abc300 tasks with limits", () => {
    expect(tasks).toHaveLength(8);
    expect(tasks[0]).toEqual({
      id: "abc300_a",
      letter: "A",
      title: "N-choice question",
      timeLimit: "2 sec",
      memoryLimit: "1024 MiB",
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
  const page = parseSubmissionsPage(fixture("submissions_synthetic"));

  test("full AC row", () => {
    expect(page.submissions).toHaveLength(3);
    const ac = page.submissions[0]!;
    expect(ac).toEqual({
      id: "41039290",
      timeText: "2023-04-29 21:02:32+0900",
      taskId: "abc300_a",
      taskLabel: "A - N-choice question",
      user: "example_user",
      language: "Haskell (GHC 9.4.5)",
      score: "100",
      status: "AC",
      execTime: "2 ms",
      memory: "4380 KB",
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
