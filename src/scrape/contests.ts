import * as cheerio from "cheerio";
import { type AnyNode } from "domhandler";

export interface ContestListItem {
  id: string;
  title: string;
  /** Epoch ms, null for permanent contests. */
  startsAt: number | null;
  /** As shown on the site, e.g. "01:40" or "240:00" (hours can exceed 24). */
  durationText: string | null;
  durationMin: number | null;
  /** As shown, e.g. "All", " - 1999", "1200 - 2799", "-". */
  ratedRange: string;
  kind: "algorithm" | "heuristic" | null;
}

export interface ContestSection {
  /** Suffix of the div id, e.g. "upcoming" | "recent" | "permanent" | "daily" | "action". */
  id: string;
  /** Localized heading from the page. */
  title: string;
  contests: ContestListItem[];
}

function parseStart(text: string): number | null {
  // "2026-07-31 19:00:00+0900" -> ISO 8601
  const iso = text
    .trim()
    .replace(" ", "T")
    .replace(/(?<hh>[+-]\d{2})(?<mm>\d{2})$/u, "$<hh>:$<mm>");
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

function parseDuration(text: string): number | null {
  const m = /^(?<hours>\d+):(?<minutes>\d{2})$/u.exec(text.trim());
  if (m === null) return null;
  return Number(m.groups!["hours"]) * 60 + Number(m.groups!["minutes"]);
}

function parseRow($: cheerio.CheerioAPI, tr: AnyNode): ContestListItem | null {
  const tds = $(tr).find("td");
  if (tds.length < 2) return null;
  // Full rows: [start, name, duration, rated]; permanent rows: [name, rated].
  const hasTime = tds.length >= 4;
  const nameTd = hasTime ? tds.eq(1) : tds.eq(0);
  const link = nameTd.find("a[href^='/contests/']").first();
  const href = link.attr("href");
  if (href === undefined) return null;
  const contestId = href.replace("/contests/", "").split(/[/?#]/u)[0]!;

  const marker = nameTd.find("span[data-toggle='tooltip']").attr("title") ?? "";
  const kind = marker === "Algorithm" ? "algorithm" : marker === "Heuristic" ? "heuristic" : null;

  const durationText = hasTime ? tds.eq(2).text().trim() : null;
  return {
    id: contestId,
    title: link.text().trim(),
    startsAt: hasTime ? parseStart(tds.eq(0).find("time").text()) : null,
    durationText,
    durationMin: durationText === null ? null : parseDuration(durationText),
    ratedRange: tds
      .eq(hasTime ? 3 : 1)
      .text()
      .trim(),
    kind,
  };
}

/**
 * Parses https://atcoder.jp/contests/ — every `div[id^="contest-table-"]`
 * section in document order, so the section set can drift (e.g. an "action"
 * section appearing while a contest runs) without breaking us.
 */
export function parseContestsPage(html: string): ContestSection[] {
  const $ = cheerio.load(html);
  const sections: ContestSection[] = [];

  $("div[id^='contest-table-']").each((_, div) => {
    const $div = $(div);
    const id = ($div.attr("id") ?? "").replace("contest-table-", "");
    const title = $div.find("h3").first().text().trim();
    const contests: ContestListItem[] = [];
    $div.find("tbody tr").each((_row, tr) => {
      const item = parseRow($, tr);
      if (item !== null) contests.push(item);
    });
    sections.push({ id, title, contests });
  });

  return sections;
}

export interface ArchivePage {
  contests: ContestListItem[];
  /** Highest page number visible in the pagination bar. */
  maxPage: number;
}

/** Parses /contests/archive?page=N — one plain table + pagination. */
export function parseArchivePage(html: string): ArchivePage {
  const $ = cheerio.load(html);
  const contests: ContestListItem[] = [];
  $("tbody tr").each((_, tr) => {
    const item = parseRow($, tr);
    if (item !== null) contests.push(item);
  });

  let maxPage = 1;
  $("ul.pagination a[href*='page=']").each((_, a) => {
    const m = /[?&]page=(?<page>\d+)/u.exec($(a).attr("href") ?? "");
    if (m !== null) maxPage = Math.max(maxPage, Number(m.groups!["page"]));
  });
  return { contests, maxPage };
}
