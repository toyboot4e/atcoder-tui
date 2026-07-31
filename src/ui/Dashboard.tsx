import { useMemo, useRef, useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import TextInput from "ink-text-input";
import { openInBrowser } from "../platform.js";
import { parseArchivePage, parseContestsPage, type ContestListItem } from "../scrape/contests.js";
import { useServices } from "../state/services.js";
import { useAppDispatch, useAppState } from "../state/store.js";
import { useData } from "../state/useData.js";
import { useVimNav } from "../keys/useKeys.js";
import { t } from "./strings.js";
import { StatusBar } from "./StatusBar.js";

const FRONT_PAGE_TTL_MS = 30 * 60 * 1000;

type Row =
  | { type: "header"; title: string }
  | { type: "contest"; contest: ContestListItem; index: number };

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

  const [selected, setSelected] = useState(0);
  const [filtering, setFiltering] = useState(false);
  const [filter, setFilter] = useState("");
  // Archive pages are pulled lazily, one page per ctrl-f press.
  const [archive, setArchive] = useState<ContestListItem[]>([]);
  const archivePage = useRef(0);
  const archiveMax = useRef<number | null>(null);
  const archiveLoading = useRef(false);

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

  const { rows, contestCount } = useMemo(() => {
    if (state.status !== "ready") return { rows: [] as Row[], contestCount: 0 };
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
    for (const section of state.data) pushSection(section.title, section.contests);
    if (archive.length > 0) {
      pushSection(
        language === "ja"
          ? `アーカイブ (${archivePage.current}ページ目まで)`
          : `Archive (${archivePage.current} page${archivePage.current > 1 ? "s" : ""} loaded)`,
        archive,
      );
    }
    return { rows, contestCount: index };
  }, [state, filter, archive, language]);

  const clampedSelected = Math.max(0, Math.min(contestCount - 1, selected));

  // Never overflow the terminal: Ink clipping corrupts leading CJK chars.
  const extraRows =
    (state.status === "ready" && state.stale ? 1 : 0) + (filtering ? 1 : 0) + warnings.length;
  const height = (stdout?.rows ?? 24) - 4 - extraRows;
  useVimNav(!filtering && !inputActive, contestCount, clampedSelected, height, {
    onMove: setSelected,
    onSelect: () => {
      const row = rows.find((r) => r.type === "contest" && r.index === clampedSelected);
      if (row?.type === "contest") {
        const { startsAt, durationMin } = row.contest;
        // endsAt lets the contest view choose immutable caching for ended contests.
        const endsAt =
          startsAt !== null && durationMin !== null ? startsAt + durationMin * 60_000 : null;
        dispatch({
          type: "push",
          route: { screen: "contest", contestId: row.contest.id, endsAt },
        });
      }
    },
  });

  const loadNextArchivePage = () => {
    if (archiveLoading.current) return;
    if (archiveMax.current !== null && archivePage.current >= archiveMax.current) return;
    archiveLoading.current = true;
    const page = archivePage.current + 1;
    // Page 1 shifts as contests end; deeper pages are effectively immutable.
    client
      .fetch(`/contests/archive?lang=${language}&page=${page}`, {
        ttl: page === 1 ? 60 * 60 * 1000 : "infinite",
      })
      .then((outcome) => {
        const parsed = parseArchivePage(outcome.body);
        archivePage.current = page;
        archiveMax.current = parsed.maxPage;
        setArchive((prev) => [...prev, ...parsed.contests]);
      })
      .catch(() => {
        // The status-bar meter already shows activity; a failed page load
        // simply leaves the archive as it was.
      })
      .finally(() => {
        archiveLoading.current = false;
      });
  };

  useInput(
    (input, key) => {
      if (input === "/") {
        setFiltering(true);
        dispatch({ type: "setInputActive", value: true });
      } else if (input === "r") {
        refresh();
      } else if (key.ctrl && input === "f") {
        loadNextArchivePage();
      } else if (input === "o") {
        const row = rows.find((r) => r.type === "contest" && r.index === clampedSelected);
        if (row?.type === "contest") openInBrowser(`https://atcoder.jp/contests/${row.contest.id}`);
      }
    },
    { isActive: !filtering && !inputActive },
  );

  // While filtering, esc clears and closes; enter (TextInput onSubmit) keeps
  // the filter; ctrl-f still pulls archive pages so old contests can be found.
  useInput(
    (input, key) => {
      if (key.escape) {
        setFilter("");
        setFiltering(false);
        dispatch({ type: "setInputActive", value: false });
      } else if (key.ctrl && input === "f") {
        loadNextArchivePage();
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

  const hints = `j/k ${t("move", language)} · ⏎ ${t("open", language)} · / ${t("filter", language)} · ^f ${language === "ja" ? "アーカイブ" : "archive"} · t ${t("language", language)} · ? help · q ${t("quit", language)}`;

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
