import * as cheerio from "cheerio";

export interface ContestMeta {
  title: string;
  /** Start/end as shown in the page header, e.g. "2023-04-29 21:00:00+0900". */
  startText: string | null;
  endText: string | null;
  /** Raw localized facts from the header, e.g. "Rated Range: - 1999". */
  headerFacts: string[];
  writers: string[];
  testers: string[];
  /** Inner HTML of #contest-statement per language, for the meta fallback. */
  statementHtml: { ja: string | null; en: string | null };
}

/** Parses a contest top page (/contests/{id}). */
export function parseContestTop(html: string): ContestMeta {
  const $ = cheerio.load(html);

  const times = $("small.contest-duration time")
    .toArray()
    .map((el) => $(el).text().trim());

  const headerFacts = $("p.small span.mr-2")
    .toArray()
    .map((el) => $(el).text().replace(/\s+/g, " ").trim())
    .filter((fact) => fact !== "");

  const statement = $("#contest-statement");
  const ja = statement.find("span.lang-ja").first();
  const en = statement.find("span.lang-en").first();
  const statementHtml = {
    ja:
      ja.length > 0
        ? ja.html()
        : statement.length > 0
          ? statement.html()
          : null,
    en: en.length > 0 ? en.html() : null,
  };

  // Writers/testers appear (when published) as list items like
  // "writer: <a href=/users/maroonrk>...</a>"; casing and language vary.
  const writers = new Set<string>();
  const testers = new Set<string>();
  statement.find("li").each((_, li) => {
    const text = $(li).text().toLowerCase();
    const isWriter = text.includes("writer");
    const isTester = text.includes("tester");
    if (!isWriter && !isTester) return;
    $(li)
      .find("a[href^='/users/']")
      .each((_, a) => {
        const name = $(a).text().trim();
        if (name === "") return;
        if (isTester && !isWriter) testers.add(name);
        else writers.add(name);
      });
  });

  return {
    title: $(".contest-title").first().text().trim(),
    startText: times[0] ?? null,
    endText: times[1] ?? null,
    headerFacts,
    writers: [...writers],
    testers: [...testers],
    statementHtml,
  };
}
