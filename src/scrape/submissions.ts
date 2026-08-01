import * as cheerio from "cheerio";

export interface Submission {
  id: string | null;
  /** e.g. "2023-04-29 21:02:32+0900" as shown. */
  timeText: string;
  taskId: string | null;
  taskLabel: string;
  user: string;
  language: string;
  score: string;
  /** Judge verdict: AC, WA, TLE, CE, WJ, ... */
  status: string;
  execTime: string | null;
  memory: string | null;
}

export interface SubmissionsPage {
  submissions: Submission[];
  maxPage: number;
}

/**
 * Parses /contests/{id}/submissions (login-gated). Cells are located by
 * content (links, label span) rather than fixed position where possible,
 * because CE rows collapse the exec-time/memory columns.
 */
export function parseSubmissionsPage(html: string): SubmissionsPage {
  const $ = cheerio.load(html);
  const submissions: Submission[] = [];

  $("tbody tr").each((_, tr) => {
    const tds = $(tr).find("td");
    if (tds.length < 5) return;

    const taskLink = $(tr).find("a[href*='/tasks/']").first();
    const taskHref = taskLink.attr("href") ?? "";
    const detailHref = $(tr)
      .find("a[href*='/submissions/']")
      .toArray()
      .map((a) => $(a).attr("href") ?? "")
      .find((href) => /\/submissions\/\d+$/u.test(href));

    const status = $(tr).find("span.label").first().text().trim();
    // Positional columns: 0 time, 1 task, 2 user, 3 language, 4 score, 5 code
    // size, 6 status; full rows append 7 exec time and 8 memory.
    const full = tds.length >= 9;
    submissions.push({
      id: detailHref !== undefined ? detailHref.split("/submissions/")[1]! : null,
      timeText: tds.eq(0).find("time").text().trim() || tds.eq(0).text().trim(),
      taskId: taskHref.split("/tasks/")[1]?.split(/[/?#]/u)[0] ?? null,
      taskLabel: taskLink.text().trim(),
      user: $(tr).find("a[href^='/users/']").first().text().trim(),
      language: tds.eq(3).text().trim(),
      score: tds.eq(4).text().trim(),
      status,
      execTime: full ? tds.eq(7).text().trim() : null,
      memory: full ? tds.eq(8).text().trim() : null,
    });
  });

  let maxPage = 1;
  $("ul.pagination a[href*='page=']").each((_, a) => {
    const m = /[?&]page=(?<page>\d+)/u.exec($(a).attr("href") ?? "");
    if (m !== null) maxPage = Math.max(maxPage, Number(m.groups!["page"]));
  });
  return { submissions, maxPage };
}
