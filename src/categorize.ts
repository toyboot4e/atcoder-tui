import type { Language } from "./config.js";

/** Content-type buckets for the dashboard category view. */
export type Category =
  | "abc"
  | "arc"
  | "agc"
  | "ahc"
  | "awc"
  | "past"
  | "learning"
  | "joi"
  | "other";

export const CATEGORY_ORDER: Category[] = [
  "abc",
  "arc",
  "agc",
  "ahc",
  "awc",
  "past",
  "learning",
  "joi",
  "other",
];

export const CATEGORY_LABELS: Record<Category, Record<Language, string>> = {
  abc: { en: "Beginner (ABC)", ja: "Beginner (ABC)" },
  arc: { en: "Regular (ARC)", ja: "Regular (ARC)" },
  agc: { en: "Grand (AGC)", ja: "Grand (AGC)" },
  ahc: { en: "Heuristic (AHC)", ja: "Heuristic (AHC)" },
  awc: { en: "Weekday (AWC)", ja: "平日コンテスト (AWC)" },
  past: { en: "PAST", ja: "PAST（実用アルゴリズム検定）" },
  learning: { en: "Learning (EDPC, Typical 90, …)", ja: "学習用 (EDPC・競プロ典型90…)" },
  joi: { en: "JOI", ja: "JOI（情報オリンピック）" },
  other: { en: "Other", ja: "その他" },
};

/** Ids of curated learning/educational contests (exact matches). */
const LEARNING_IDS = new Set([
  "dp", // Educational DP Contest
  "tdpc", // Typical DP Contest
  "typical90", // 競プロ典型 90 問
  "math-and-algorithm",
  "tessoku-book",
  "practice",
  "practice2", // ACL Practice
  "abs", // AtCoder Beginners Selection
  "apg4b",
  "apg4bpython",
]);

/**
 * Buckets a contest by id (titles localize; ids don't). Sponsored rounds
 * that are numbered ABC/ARC/... keep those ids, so they bucket correctly.
 * Note: AWC (weekday) is `awc\d`; `awtf…` is World Tour Finals → other.
 */
export function categorize(contest: { id: string; title: string }): Category {
  const id = contest.id.toLowerCase();
  if (/^abc\d/.test(id)) return "abc";
  if (/^arc\d/.test(id)) return "arc";
  if (/^agc\d/.test(id)) return "agc";
  if (/^ahc\d/.test(id)) return "ahc";
  if (/^awc\d/.test(id)) return "awc";
  if (id.startsWith("past")) return "past";
  if (LEARNING_IDS.has(id) || /educational/i.test(contest.title)) return "learning";
  if (id.startsWith("joi") || /\bJOI\b/.test(contest.title)) return "joi";
  return "other";
}
