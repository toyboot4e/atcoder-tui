import * as cheerio from "cheerio";

export interface SubmissionDetail {
  /** Source code, exactly as submitted. */
  code: string;
  /** Label/value pairs from the info table (time, task, language, status...). */
  facts: Array<[string, string]>;
  compileError: string | null;
}

/** Parses /contests/{id}/submissions/{sid} (login-gated). */
export function parseSubmissionDetail(html: string): SubmissionDetail {
  const $ = cheerio.load(html);

  const code = $("#submission-code").text();

  const facts: Array<[string, string]> = [];
  $("table tr").each((_, tr) => {
    const th = $(tr).find("th").first().text().replace(/\s+/g, " ").trim();
    const td = $(tr).find("td").first().text().replace(/\s+/g, " ").trim();
    if (th !== "" && td !== "") facts.push([th, td]);
  });

  let compileError: string | null = null;
  $("h4").each((_, h4) => {
    if (/compile error|コンパイルエラー/i.test($(h4).text())) {
      const pre = $(h4).nextAll("pre").first();
      if (pre.length > 0) compileError = pre.text();
    }
  });

  return { code, facts, compileError };
}
