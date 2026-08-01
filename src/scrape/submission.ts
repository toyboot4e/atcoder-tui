import * as cheerio from "cheerio";

export interface SubmissionDetail {
  /** Source code, exactly as submitted. */
  code: string;
  /** Label/value pairs from the info table (time, task, language, status...). */
  facts: [string, string][];
  compileError: string | null;
}

/** Parses /contests/{id}/submissions/{sid} (login-gated). */
export function parseSubmissionDetail(html: string): SubmissionDetail {
  const $ = cheerio.load(html);

  const code = $("#submission-code").text();

  const facts: [string, string][] = [];
  $("table tr").each((_, tr) => {
    const th = $(tr).find("th").first().text().replaceAll(/\s+/gu, " ").trim();
    const td = $(tr).find("td").first().text().replaceAll(/\s+/gu, " ").trim();
    if (th !== "" && td !== "") facts.push([th, td]);
  });

  let compileError: string | null = null;
  $("h4").each((_, h4) => {
    if (/compile error|コンパイルエラー/iu.test($(h4).text())) {
      const pre = $(h4).nextAll("pre").first();
      if (pre.length > 0) compileError = pre.text();
    }
  });

  return { code, facts, compileError };
}
