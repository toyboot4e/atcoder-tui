import { useMemo, useRef, useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import TextInput from "ink-text-input";
import { CATEGORY_LABELS, CATEGORY_ORDER, categorize, type Category } from "../categorize.js";
import { openInBrowser } from "../platform.js";
import { parseArchivePage, parseContestsPage, type ContestListItem } from "../scrape/contests.js";
import { UNLISTED_CONTESTS } from "../unlisted.js";
import { useServices } from "../state/services.js";
import { useAppDispatch, useAppState } from "../state/store.js";
import { useData } from "../state/useData.js";
import { useVimNav } from "../keys/useKeys.js";
import { t } from "./strings.js";
import { StatusBar } from "./StatusBar.js";

const FRONT_PAGE_TTL_MS = 30 * 60 * 1000;

export type DashView =
  | { kind: "sections" }
  | { kind: "categories" }
  | { kind: "category"; category: Category };

// Survives unmount so returning from a contest restores the cursor, filter,
// view and any loaded archive pages (module-level: only one dashboard).
const remembered = {
  selected: 0,
  filter: "",
  view: { kind: "sections" } as DashView,
  archive: [] as ContestListItem[],
  archivePage: 0,
  archiveMax: null as number | null,
};

type Row =
  | { type: "header"; title: string }
  | { type: "contest"; contest: ContestListItem; index: number }
  | { type: "category"; category: Category; count: number; index: number };

function formatStart(startsAt: number | null): string {
  if (startsAt === null) return "           ";
  const d = new Date(startsAt);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function Dashboard() {
  const { client, warnings } = useServices();
  const { language, inputActive } = useAppState();
  const dispatch = useAppDispatch();
  const { stdout } = useStdout();

  const [selected, setSelectedRaw] = useState(remembered.selected);
  const setSelected = (i: number) => {
    remembered.selected = i;
    setSelectedRaw(i);
  };
  const [view, setViewRaw] = useState<DashView>(remembered.view);
  const setView = (v: DashView) => {
    remembered.view = v;
    setViewRaw(v);
    setSelected(0);
  };
  const [filtering, setFiltering] = useState(false);
  const [filter, setFilterRaw] = useState(remembered.filter);
  const setFilter = (f: string) => {
    remembered.filter = f;
    setFilterRaw(f);
  };
  // Archive pages are pulled lazily (a: one page, A: all).
  const [archive, setArchiveRaw] = useState<ContestListItem[]>(remembered.archive);
  const archivePage = useRef(remembered.archivePage);
  const archiveMax = useRef(remembered.archiveMax);
  const archiveLoading = useRef(false);
  const atArchiveEnd = () =>
    archiveMax.current !== null && archivePage.current >= archiveMax.current;

  const { state, refresh } = useData(`contests-${language}`, async (bypassCache) => {
    const outcome = await client.fetch(`/contests/?lang=${language}`, {
      ttl: FRONT_PAGE_TTL_MS,
      bypassCache,
    });
    return {
      data: parseContestsPage(outcome.body),
      stale: outcome.stale,
      fetchedAt: outcome.fetchedAt,
    };
  });

  const { rows, selectableCount } = useMemo(() => {
    if (state.status !== "ready") return { rows: [] as Row[], selectableCount: 0 };
    const needle = filter.trim().toLowerCase();
    const matches = (c: ContestListItem) =>
      needle === "" ||
      c.id.toLowerCase().includes(needle) ||
      c.title.toLowerCase().includes(needle);
    const rows: Row[] = [];
    let index = 0;
    const pushSection = (title: string, contests: ContestListItem[]) => {
      const filtered = contests.filter(matches);
      if (filtered.length === 0) return;
      rows.push({ type: "header", title });
      for (const contest of filtered) {
        rows.push({ type: "contest", contest, index });
        index += 1;
      }
    };

    // One deduped pool across front-page sections and the archive.
    const pool = new Map<string, ContestListItem>();
    for (const section of state.data) {
      for (const contest of section.contests) pool.set(contest.id, contest);
    }
    for (const contest of archive) {
      if (!pool.has(contest.id)) pool.set(contest.id, contest);
    }
    // Contests atcoder.jp lists nowhere (PAST opens, older weekday
    // contests) — only reachable through the curated seed.
    for (const contest of UNLISTED_CONTESTS) {
      if (!pool.has(contest.id)) pool.set(contest.id, contest);
    }

    if (view.kind === "categories") {
      const counts = new Map<Category, number>();
      for (const contest of pool.values()) {
        const cat = categorize(contest);
        counts.set(cat, (counts.get(cat) ?? 0) + 1);
      }
      const note = atArchiveEnd()
        ? `${pool.size}`
        : `${pool.size}${language === "ja" ? "（アーカイブ取得中…）" : " (loading archive…)"}`;
      rows.push({
        type: "header",
        title:
          language === "ja" ? `カテゴリ — 全${note}件` : `Categories — ${note} contests indexed`,
      });
      for (const category of CATEGORY_ORDER) {
        const count = counts.get(category) ?? 0;
        if (count === 0) continue;
        rows.push({ type: "category", category, count, index });
        index += 1;
      }
    } else if (view.kind === "category") {
      const contests = [...pool.values()]
        .filter((contest) => categorize(contest) === view.category)
        .sort((a, b) => (b.startsAt ?? -1) - (a.startsAt ?? -1));
      pushSection(CATEGORY_LABELS[view.category][language], contests);
    } else {
      for (const section of state.data) pushSection(section.title, section.contests);
      if (archive.length > 0) {
        pushSection(
          language === "ja"
            ? `アーカイブ (${archivePage.current}ページ目まで)`
            : `Archive (${archivePage.current} page${archivePage.current > 1 ? "s" : ""} loaded)`,
          archive,
        );
      }
    }
    return { rows, selectableCount: index };
  }, [state, filter, archive, language, view]);

  const clampedSelected = Math.max(0, Math.min(selectableCount - 1, selected));

  // Never overflow the terminal: Ink clipping corrupts leading CJK chars.
  const extraRows =
    (state.status === "ready" && state.stale ? 1 : 0) + (filtering ? 1 : 0) + warnings.length;
  const height = (stdout?.rows ?? 24) - 4 - extraRows;
  useVimNav(!filtering && !inputActive, selectableCount, clampedSelected, height, {
    onMove: setSelected,
    onSelect: () => {
      const row = rows.find((r) => r.type !== "header" && r.index === clampedSelected);
      if (row?.type === "category") {
        setView({ kind: "category", category: row.category });
      } else if (row?.type === "contest") {
        const { startsAt, durationMin } = row.contest;
        // endsAt lets the contest view choose immutable caching for ended contests.
        const endsAt =
          startsAt !== null && durationMin !== null ? startsAt + durationMin * 60_000 : null;
        dispatch({
          type: "push",
          route: { screen: "contest", contestId: row.contest.id, startsAt, endsAt },
        });
      }
    },
    onBack: () => {
      if (view.kind === "category") setView({ kind: "categories" });
      else if (view.kind === "categories") setView({ kind: "sections" });
    },
  });

  const fetchArchivePage = async () => {
    const page = archivePage.current + 1;
    // Page 1 shifts as contests end; deeper pages are effectively immutable.
    const outcome = await client.fetch(`/contests/archive?lang=${language}&page=${page}`, {
      ttl: page === 1 ? 60 * 60 * 1000 : "infinite",
    });
    const parsed = parseArchivePage(outcome.body);
    archivePage.current = page;
    archiveMax.current = parsed.maxPage;
    remembered.archivePage = page;
    remembered.archiveMax = parsed.maxPage;
    setArchiveRaw((prev) => {
      const next = [...prev, ...parsed.contests];
      remembered.archive = next;
      return next;
    });
  };

  /** a: one page; A: everything — the requests still queue >=1s apart, and
   *  pages beyond the first are cached forever, so "all" costs ~18 requests
   *  exactly once per machine. */
  const loadArchive = (all: boolean) => {
    if (archiveLoading.current || atArchiveEnd()) return;
    archiveLoading.current = true;
    (async () => {
      try {
        do {
          await fetchArchivePage();
        } while (all && !atArchiveEnd());
      } catch {
        // The status-bar meter already shows activity; a failed page load
        // simply leaves the archive as it was.
      } finally {
        archiveLoading.current = false;
      }
    })();
  };

  useInput(
    (input) => {
      if (input === "/") {
        setFiltering(true);
        dispatch({ type: "setInputActive", value: true });
      } else if (input === "r") {
        refresh();
      } else if (input === "a" || input === "A") {
        loadArchive(input === "A");
      } else if (input === "c") {
        if (view.kind === "sections") {
          // The category index is only as complete as the archive: pull it
          // all (one-time cost, cached forever afterwards).
          loadArchive(true);
          setView({ kind: "categories" });
        } else {
          setView(view.kind === "category" ? { kind: "categories" } : { kind: "sections" });
        }
      } else if (input === "o") {
        const row = rows.find((r) => r.type === "contest" && r.index === clampedSelected);
        if (row?.type === "contest") openInBrowser(`https://atcoder.jp/contests/${row.contest.id}`);
      }
    },
    { isActive: !filtering && !inputActive },
  );

  // While filtering, esc clears and closes; enter (TextInput onSubmit) keeps
  // the filter — press a afterwards to pull archive pages into the results.
  useInput(
    (input, key) => {
      if (key.escape) {
        setFilter("");
        setFiltering(false);
        dispatch({ type: "setInputActive", value: false });
      }
    },
    { isActive: filtering },
  );

  const closeFilter = () => {
    setFiltering(false);
    dispatch({ type: "setInputActive", value: false });
  };

  // Keep the selected row in view.
  const selectedRowIdx = rows.findIndex((r) => r.type === "contest" && r.index === clampedSelected);
  const top = Math.max(0, Math.min(selectedRowIdx - Math.floor(height / 2), rows.length - height));
  const visible = rows.slice(top, top + height);

  const hints =
    view.kind === "sections"
      ? `j/k ${t("move", language)}   ⏎ ${t("open", language)}   / ${t("filter", language)}   c ${language === "ja" ? "カテゴリ" : "categories"}   a ${language === "ja" ? "アーカイブ" : "archive"}   t ${t("language", language)}   ? help   q ${t("quit", language)}`
      : `j/k ${t("move", language)}   ⏎ ${t("open", language)}   / ${t("filter", language)}   esc/c ${t("back", language)}   t ${t("language", language)}   q ${t("quit", language)}`;

  return (
    <Box flexDirection="column" height={stdout?.rows ?? 24}>
      <Box flexDirection="column" flexGrow={1}>
        {state.status === "loading" && <Text dimColor>{t("loading", language)}</Text>}
        {state.status === "error" && (
          <Text color="red">
            {t("error", language)}: {state.error.message} — {t("retryHint", language)}
          </Text>
        )}
        {state.status === "ready" &&
          visible.map((row, i) =>
            row.type === "header" ? (
              <Text key={`h-${row.title}-${i}`} bold color="magenta">
                {row.title}
              </Text>
            ) : row.type === "category" ? (
              <Text
                key={row.category}
                color={row.index === clampedSelected ? "cyan" : undefined}
                bold={row.index === clampedSelected}
                wrap="truncate"
              >
                {row.index === clampedSelected ? "❯ " : "  "}
                {CATEGORY_LABELS[row.category][language].padEnd(36)}
                <Text dimColor>{String(row.count).padStart(5)}</Text>
              </Text>
            ) : (
              <Text
                key={row.contest.id}
                color={row.index === clampedSelected ? "cyan" : undefined}
                bold={row.index === clampedSelected}
                wrap="truncate"
              >
                {row.index === clampedSelected ? "❯ " : "  "}
                <Text dimColor={row.index !== clampedSelected}>
                  {formatStart(row.contest.startsAt)}
                </Text>{" "}
                {row.contest.kind === "heuristic"
                  ? "Ⓗ"
                  : row.contest.kind === "algorithm"
                    ? "Ⓐ"
                    : "·"}{" "}
                {row.contest.title}
                <Text dimColor>
                  {row.contest.durationText !== null ? `  ${row.contest.durationText}` : ""}
                  {row.contest.ratedRange !== "" ? `  [${row.contest.ratedRange}]` : ""}
                </Text>
              </Text>
            ),
          )}
        {state.status === "ready" && state.stale && (
          <Text color="yellow">[{t("stale", language)}]</Text>
        )}
      </Box>
      {filtering && (
        <Box>
          <Text color="cyan">/</Text>
          <TextInput value={filter} onChange={setFilter} onSubmit={closeFilter} />
        </Box>
      )}
      <StatusBar hints={hints} />
    </Box>
  );
}
