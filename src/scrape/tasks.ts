import * as cheerio from "cheerio";

export interface TaskListItem {
  /** e.g. "abc300_a" */
  id: string;
  /** e.g. "A" */
  letter: string;
  title: string;
  timeLimit: string;
  memoryLimit: string;
}

/** Parses /contests/{id}/tasks — a plain 4-column table. */
export function parseTasksPage(html: string): TaskListItem[] {
  const $ = cheerio.load(html);
  const tasks: TaskListItem[] = [];
  $("tbody tr").each((_, tr) => {
    const tds = $(tr).find("td");
    if (tds.length < 2) return;
    const letterLink = tds.eq(0).find("a").first();
    const titleLink = tds.eq(1).find("a").first();
    const href = titleLink.attr("href") ?? letterLink.attr("href");
    if (href === undefined) return;
    const id = href.split("/tasks/")[1]?.split(/[/?#]/u)[0];
    if (id === undefined) return;
    tasks.push({
      id,
      letter: letterLink.text().trim(),
      title: titleLink.text().trim(),
      timeLimit: tds.eq(2).text().trim(),
      memoryLimit: tds.eq(3).text().trim(),
    });
  });
  return tasks;
}
