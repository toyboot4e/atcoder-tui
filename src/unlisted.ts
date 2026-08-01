import { type ContestListItem } from "./scrape/contests.js";

const entry = (id: string, title: string): ContestListItem => ({
  id,
  title,
  startsAt: null,
  durationText: null,
  durationMin: null,
  ratedRange: "",
  kind: null,
});

/**
 * Contests that exist on atcoder.jp but appear in no listing the site serves
 * (verified live 2026-07-31: /contests/ and the archive contain none of
 * these, yet each id returns 200). Without this seed the category view could
 * never surface them. Newest first — they carry no start time, so seed order
 * is display order. PAST #13/#14 exist somewhere but their ids don't follow
 * either naming scheme; they are the known gap.
 */
export const UNLISTED_CONTESTS: ContestListItem[] = [
  // PAST (実用アルゴリズム検定) open (past-problem) contests.
  entry("past17-open", "PAST #17 (open)"),
  entry("past16-open", "PAST #16 (open)"),
  entry("past15-open", "PAST #15 (open)"),
  entry("past202303-open", "PAST #12 (2023-03, open)"),
  entry("past202212-open", "PAST #11 (2022-12, open)"),
  entry("past202209-open", "PAST #10 (2022-09, open)"),
  entry("past202206-open", "PAST #9 (2022-06, open)"),
  entry("past202203-open", "PAST #8 (2022-03, open)"),
  entry("past202112-open", "PAST #7 (2021-12, open)"),
  entry("past202107-open", "PAST #6 (2021-07, open)"),
  entry("past202104-open", "PAST #5 (2021-04, open)"),
  entry("past202012-open", "PAST #4 (2020-12, open)"),
  entry("past202010-open", "PAST #3 (2020-10, open)"),
  entry("past202004-open", "PAST #2 (2020-04, open)"),
  entry("past201912-open", "PAST #1 (2019-12, open)"),
  // AtCoder Weekday Contests: sequential ids, awc0001 verified to exist.
  // The current one arrives from the front page with real metadata and
  // wins the dedupe; older ones are reachable only through this seed.
  ...Array.from({ length: 125 }, (_, i) => {
    const n = String(125 - i).padStart(4, "0");
    return entry(`awc${n}`, `AtCoder Weekday Contest ${n}`);
  }),
];
