import { useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import { renderSections } from "../render/lines.js";
import { parseStatement } from "../scrape/statement.js";
import { parseTasksPage } from "../scrape/tasks.js";
import { HttpError, LoginRequiredError } from "../net/http.js";
import { contestPhase, formatStartLine } from "../phase.js";
import { useServices } from "../state/services.js";
import { useAppDispatch, useAppState } from "../state/store.js";
import { useData } from "../state/useData.js";
import { useScrollKeys, useVimNav } from "../keys/useKeys.js";
import { openInBrowser } from "../platform.js";
import { useTerminalSize } from "./hooks.js";
import { MetaPane } from "./MetaPane.js";
import { ScrollView, clampScroll } from "./ScrollView.js";
import { StatusBar } from "./StatusBar.js";
import { SubmissionsPane } from "./SubmissionsPane.js";
import { t } from "./strings.js";

const SIDEBAR_WIDTH = 26;
const ACTIVE_TTL_MS = 5 * 60 * 1000;

export type ContestTab = "statement" | "meta" | "submissions";

function describeError(error: Error, phase: string, language: "en" | "ja"): string {
  if (error instanceof LoginRequiredError) return t("loginRequired", language);
  if (error instanceof HttpError && error.status === 404) {
    if (phase === "active") {
      return language === "ja"
        ? "参加登録者のみ閲覧できます — o でブラウザ表示"
        : "visible to registered participants only — o opens the browser";
    }
    return language === "ja" ? "ページが見つかりません (404)" : "page not found (404)";
  }
  return `${t("error", language)}: ${error.message}`;
}

export function ContestView({
  contestId,
  startsAt,
  endsAt,
}: {
  contestId: string;
  startsAt: number | null;
  endsAt: number | null;
}) {
  const { client, config } = useServices();
  const { language, inputActive } = useAppState();
  const dispatch = useAppDispatch();
  const { columns, rows } = useTerminalSize();

  // Task pages of not-yet-started contests 404 server-side: never fetch them.
  const phase = contestPhase(startsAt, endsAt, Date.now());
  // Ended contests are immutable: fetched once, cached forever (r bypasses).
  const ttl = phase === "ended" ? ("infinite" as const) : ACTIVE_TTL_MS;

  const [cursor, setCursor] = useState(0);
  const [loadedIndex, setLoadedIndex] = useState(0);
  const [focus, setFocus] = useState<"sidebar" | "content">("sidebar");
  const [tab, setTab] = useState<ContestTab>("statement");
  const [scrollTop, setScrollTop] = useState(0);

  const tasksData = useData(`tasks-${contestId}-${language}-${phase}`, async (bypassCache) => {
    if (phase === "upcoming") return { data: [], stale: false, fetchedAt: 0 };
    const outcome = await client.fetch(`/contests/${contestId}/tasks?lang=${language}`, {
      ttl,
      bypassCache,
    });
    return {
      data: parseTasksPage(outcome.body),
      stale: outcome.stale,
      fetchedAt: outcome.fetchedAt,
    };
  });
  const tasks = tasksData.state.status === "ready" ? tasksData.state.data : [];
  const loadedTask = tasks[Math.min(loadedIndex, Math.max(0, tasks.length - 1))];

  // Statement pages embed both languages, so the cache key has no lang.
  const statementData = useData(
    `statement-${contestId}-${loadedTask?.id ?? "none"}`,
    async (bypassCache) => {
      if (loadedTask === undefined) return { data: null, stale: false, fetchedAt: 0 };
      const outcome = await client.fetch(`/contests/${contestId}/tasks/${loadedTask.id}`, {
        ttl,
        bypassCache,
      });
      return {
        data: parseStatement(outcome.body),
        stale: outcome.stale,
        fetchedAt: outcome.fetchedAt,
      };
    },
  );

  const contentWidth = columns - SIDEBAR_WIDTH - 3;
  const statement = statementData.state.status === "ready" ? statementData.state.data : null;
  const englishMissing = statement !== null && statement.en === null;
  const { lines, fallbackNotice } = useMemo(() => {
    if (statement === null) return { lines: [] as string[], fallbackNotice: false };
    const sections = language === "en" ? (statement.en ?? statement.ja) : statement.ja;
    return {
      lines: renderSections(sections, contentWidth),
      fallbackNotice: language === "en" && englishMissing,
    };
  }, [statement, language, contentWidth, englishMissing]);

  // Notice rows shrink the scroll viewport so the pane content never
  // overflows its box (Ink clipping corrupts leading CJK characters).
  const noticeRows =
    (fallbackNotice ? 1 : 0) +
    (statementData.state.status === "loading" || statementData.state.status === "error" ? 1 : 0) +
    (statementData.state.status === "ready" && statementData.state.stale ? 1 : 0);
  const contentHeight = rows - 3 - noticeRows;
  const clampedScroll = clampScroll(scrollTop, lines.length, contentHeight);

  const openTask = (index: number) => {
    setLoadedIndex(index);
    setCursor(index);
    setScrollTop(0);
    setFocus("content");
    setTab("statement");
  };

  useVimNav(focus === "sidebar" && !inputActive, tasks.length, cursor, contentHeight, {
    onMove: setCursor,
    onSelect: () => openTask(cursor),
    onBack: () => dispatch({ type: "pop" }),
  });

  // Statement-pane keys: scrolling plus J/K to flip through problems.
  useScrollKeys(
    focus === "content" && tab === "statement" && !inputActive,
    lines.length,
    contentHeight,
    clampedScroll,
    setScrollTop,
    clampScroll,
    (input, key) => {
      if (input === "J") openTask(Math.min(tasks.length - 1, loadedIndex + 1));
      else if (input === "K") openTask(Math.max(0, loadedIndex - 1));
      else if (input === "r") statementData.refresh();
      else if (input === "h" || key.escape) setFocus("sidebar");
    },
  );

  // Contest-level keys, active regardless of focus.
  useInput(
    (input, key) => {
      if (key.tab) setFocus(focus === "sidebar" ? "content" : "sidebar");
      else if (input === "1") setTab("statement");
      else if (input === "2") {
        setTab("meta");
        setFocus("content");
      } else if (input === "3") {
        setTab("submissions");
        setFocus("content");
      } else if (key.ctrl && input === "o") {
        dispatch({ type: "pop" });
      } else if (input === "o") {
        openInBrowser(`https://atcoder.jp${currentPagePath()}`);
      }
    },
    { isActive: !inputActive },
  );

  function currentPagePath(): string {
    if (phase === "upcoming" || tab === "meta") return `/contests/${contestId}`;
    if (tab === "submissions") {
      const user =
        config.userId !== undefined ? `?f.User=${encodeURIComponent(config.userId)}` : "";
      return `/contests/${contestId}/submissions${user}`;
    }
    return loadedTask !== undefined
      ? `/contests/${contestId}/tasks/${loadedTask.id}`
      : `/contests/${contestId}/tasks`;
  }

  const hints =
    focus === "sidebar"
      ? `j/k ${t("move", language)}   ⏎ ${t("open", language)}   h ${t("back", language)}   t ${t("language", language)}   q ${t("quit", language)}`
      : `j/k scroll   J/K ${language === "ja" ? "前後の問題" : "prev/next problem"}   1/2/3 tab   t ${t("language", language)}   q ${t("quit", language)}`;

  if (phase === "upcoming") {
    // Lobby: the contest exists but its pages don't yet — zero requests.
    return (
      <Box flexDirection="column" height={rows}>
        <Box
          flexDirection="column"
          flexGrow={1}
          borderStyle="round"
          justifyContent="center"
          alignItems="center"
        >
          <Text bold color="cyan">
            {contestId}
          </Text>
          <Text>{formatStartLine(startsAt ?? 0, Date.now(), language)}</Text>
          <Text dimColor>
            {language === "ja"
              ? "開始前のため何も取得しません — o でコンテストページを開けます"
              : "not started yet; nothing is fetched — o opens the contest page"}
          </Text>
        </Box>
        <StatusBar
          hints={`o ${t("open", language)}   h ${t("back", language)}   t ${t("language", language)}   q ${t("quit", language)}`}
        />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" height={rows}>
      <Box flexGrow={1}>
        <Box
          flexDirection="column"
          width={SIDEBAR_WIDTH}
          borderStyle="round"
          borderColor={focus === "sidebar" ? "cyan" : "gray"}
          paddingX={1}
        >
          <Text bold wrap="truncate">
            {contestId}
          </Text>
          {tasksData.state.status === "loading" && <Text dimColor>{t("loading", language)}</Text>}
          {tasksData.state.status === "error" && (
            <Text color="red" wrap="truncate">
              {describeError(tasksData.state.error, phase, language)}
            </Text>
          )}
          {tasks.map((task, index) => (
            <Text
              key={task.id}
              color={index === cursor && focus === "sidebar" ? "cyan" : undefined}
              bold={index === loadedIndex}
              wrap="truncate"
            >
              {index === cursor && focus === "sidebar" ? "❯" : " "}
              {index === loadedIndex ? "•" : " "}
              {task.letter} {task.title}
            </Text>
          ))}
        </Box>
        <Box
          flexDirection="column"
          flexGrow={1}
          borderStyle="round"
          borderColor={focus === "content" ? "cyan" : "gray"}
          paddingX={1}
        >
          {tab === "statement" && (
            <>
              {fallbackNotice && (
                <Text color="yellow">
                  {language === "en" ? "English not available — showing Japanese" : ""}
                </Text>
              )}
              {statementData.state.status === "loading" && (
                <Text dimColor>{t("loading", language)}</Text>
              )}
              {statementData.state.status === "error" && (
                <Text color="red">
                  {describeError(statementData.state.error, phase, language)} —{" "}
                  {t("retryHint", language)}
                </Text>
              )}
              {statementData.state.status === "ready" && statementData.state.stale && (
                <Text color="yellow">[{t("stale", language)}]</Text>
              )}
              <ScrollView lines={lines} height={contentHeight} scrollTop={clampedScroll} />
            </>
          )}
          {tab === "meta" && (
            <MetaPane
              contestId={contestId}
              ttl={ttl}
              width={contentWidth}
              height={rows - 3}
              active={focus === "content" && !inputActive}
              onBack={() => setFocus("sidebar")}
            />
          )}
          {tab === "submissions" && (
            <SubmissionsPane
              contestId={contestId}
              width={contentWidth}
              height={rows - 3}
              active={focus === "content" && !inputActive}
              onBack={() => setFocus("sidebar")}
            />
          )}
        </Box>
      </Box>
      <StatusBar hints={hints} />
    </Box>
  );
}
