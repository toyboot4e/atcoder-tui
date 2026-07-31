import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import { renderSections } from "../render/lines.js";
import { parseStatement } from "../scrape/statement.js";
import { parseTasksPage } from "../scrape/tasks.js";
import { HttpError, LoginRequiredError } from "../net/http.js";
import { contestPhase, formatStartLine } from "../phase.js";
import { useServices } from "../state/services.js";
import { useAppDispatch, useAppState } from "../state/store.js";
import { useData } from "../state/useData.js";
import { useVimNav } from "../keys/useKeys.js";
import { openInBrowser } from "../platform.js";
import { useTerminalSize } from "./hooks.js";
import { MetaPane } from "./MetaPane.js";
import { RankingPane } from "./RankingPane.js";
import { ScrollView, clampScroll } from "./ScrollView.js";
import { StatusBar } from "./StatusBar.js";
import { SubmissionsPane } from "./SubmissionsPane.js";
import { t } from "./strings.js";

const SIDEBAR_WIDTH = 26;
const ACTIVE_TTL_MS = 5 * 60 * 1000;

interface RememberedContest {
  cursor: number;
  loadedIndex: number;
  focus: "sidebar" | "content";
  tab: ContestTab;
  scrollByTask: Map<string, number>;
}
// Per-contest UI state, so returning from a submission (or relaunching the
// same contest) restores tab/cursor/scroll instead of resetting.
const rememberedContest = new Map<string, RememberedContest>();

export type ContestTab = "statement" | "meta" | "submissions" | "ranking";
const TAB_ORDER: ContestTab[] = ["statement", "meta", "submissions", "ranking"];

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

  const saved = rememberedContest.get(contestId);
  const [cursor, setCursorRaw] = useState(saved?.cursor ?? 0);
  const [loadedIndex, setLoadedIndexRaw] = useState(saved?.loadedIndex ?? 0);
  const [focus, setFocusRaw] = useState<"sidebar" | "content">(saved?.focus ?? "sidebar");
  const [tab, setTabRaw] = useState<ContestTab>(saved?.tab ?? "statement");
  // Per-problem scroll positions, restored when flipping back to a problem.
  const scrollByTask = useRef(saved?.scrollByTask ?? new Map<string, number>());
  const remember = (patch: Partial<RememberedContest>) => {
    rememberedContest.set(contestId, {
      cursor,
      loadedIndex,
      focus,
      tab,
      scrollByTask: scrollByTask.current,
      ...patch,
    });
  };
  const setCursor = (v: number) => {
    remember({ cursor: v });
    setCursorRaw(v);
  };
  const setLoadedIndex = (v: number) => {
    remember({ loadedIndex: v });
    setLoadedIndexRaw(v);
  };
  const setFocus = (v: "sidebar" | "content") => {
    remember({ focus: v });
    setFocusRaw(v);
  };
  const setTab = (v: ContestTab) => {
    remember({ tab: v });
    setTabRaw(v);
  };
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

  // Debounce: flipping j-j-j through problems fetches only where you settle.
  const [settledTaskId, setSettledTaskId] = useState<string | undefined>(undefined);
  useEffect(() => {
    const id = loadedTask?.id;
    const timer = setTimeout(() => setSettledTaskId(id), 150);
    return () => clearTimeout(timer);
  }, [loadedTask?.id]);
  const settledTask = tasks.find((task) => task.id === settledTaskId);

  // Statement pages embed both languages, so the cache key has no lang.
  const statementData = useData(
    `statement-${contestId}-${settledTask?.id ?? "none"}`,
    async (bypassCache) => {
      if (settledTask === undefined) return { data: null, stale: false, fetchedAt: 0 };
      const outcome = await client.fetch(`/contests/${contestId}/tasks/${settledTask.id}`, {
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
    (loadedTask !== undefined ? 1 : 0) + // title header row
    (tasksData.state.status === "error" ? 2 : 0) + // full-width error text
    (tasksData.state.status === "ready" && tasks.length === 0 ? 2 : 0) + // empty-tasks notice
    (fallbackNotice ? 1 : 0) +
    (statementData.state.status === "loading" || statementData.state.status === "error" ? 1 : 0) +
    (statementData.state.status === "ready" && statementData.state.stale ? 1 : 0);
  const contentHeight = rows - 3 - noticeRows;
  const clampedScroll = clampScroll(scrollTop, lines.length, contentHeight);

  const setStatementScroll = (next: number) => {
    if (loadedTask !== undefined) scrollByTask.current.set(loadedTask.id, next);
    setScrollTop(next);
  };

  const switchTask = (index: number, focusContent: boolean) => {
    const clamped = Math.max(0, Math.min(tasks.length - 1, index));
    const task = tasks[clamped];
    setLoadedIndex(clamped);
    setCursor(clamped);
    setScrollTop(task !== undefined ? (scrollByTask.current.get(task.id) ?? 0) : 0);
    if (focusContent) {
      setFocus("content");
      setTab("statement");
    }
  };

  useVimNav(focus === "sidebar" && !inputActive, tasks.length, cursor, contentHeight, {
    onMove: setCursor,
    onSelect: () => switchTask(cursor, true),
    onBack: () => dispatch({ type: "pop" }),
  });

  // Statement pane: j/k flip problems (scroll preserved per problem);
  // C-e/C-y line, C-d/C-u half page, C-f/C-b full page scroll the statement.
  useInput(
    (input, key) => {
      const scroll = (delta: number) =>
        setStatementScroll(clampScroll(clampedScroll + delta, lines.length, contentHeight));
      const half = Math.max(1, Math.floor(contentHeight / 2));
      if (key.ctrl) {
        if (input === "e") scroll(1);
        else if (input === "y") scroll(-1);
        else if (input === "d") scroll(half);
        else if (input === "u") scroll(-half);
        else if (input === "f") scroll(contentHeight);
        else if (input === "b") scroll(-contentHeight);
        else if (input === "n") switchTask(loadedIndex + 1, false);
        else if (input === "p") switchTask(loadedIndex - 1, false);
        return;
      }
      if (input === "j" || input === "J" || key.downArrow) switchTask(loadedIndex + 1, false);
      else if (input === "k" || input === "K" || key.upArrow) switchTask(loadedIndex - 1, false);
      else if (input === "G")
        setStatementScroll(clampScroll(lines.length, lines.length, contentHeight));
      else if (input === "g") setStatementScroll(0);
      else if (input === "r") statementData.refresh();
      else if (key.escape) setFocus("sidebar");
    },
    { isActive: focus === "content" && tab === "statement" && !inputActive },
  );

  // Spatial h/l: sidebar ← statement ↔ meta ↔ submissions ↔ ranking.
  const cycleTab = (delta: number) => {
    const index = TAB_ORDER.indexOf(tab) + delta;
    if (index < 0) {
      setFocus("sidebar");
      return;
    }
    if (index >= TAB_ORDER.length) return;
    setTab(TAB_ORDER[index]!);
    setFocus("content");
  };

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
      } else if (input === "4") {
        setTab("ranking");
        setFocus("content");
      } else if (focus === "content" && (input === "h" || key.leftArrow)) {
        cycleTab(-1);
      } else if (focus === "content" && (input === "l" || key.rightArrow)) {
        cycleTab(1);
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
    if (tab === "ranking") return `/contests/${contestId}/standings`;
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
      : `j/k ${language === "ja" ? "前後の問題" : "problem"}   ^e/^y ^d/^u scroll   h/l tab   t ${t("language", language)}   q ${t("back", language)}`;

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
              {t("error", language)} →
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
              {tasksData.state.status === "error" && (
                <Text color="red">
                  {describeError(tasksData.state.error, phase, language)} —{" "}
                  {t("retryHint", language)}
                </Text>
              )}
              {tasksData.state.status === "ready" && tasks.length === 0 && (
                <Text color="yellow">
                  {language === "ja"
                    ? "問題が見つかりません — 未登録の開催中コンテストの可能性があります（o でブラウザ表示、r で再試行）"
                    : "no visible tasks — you may not be registered for this running contest (o opens the browser, r retries)"}
                </Text>
              )}
              {loadedTask !== undefined && (
                <Text bold color="cyan" wrap="truncate">
                  {loadedTask.letter} — {loadedTask.title}
                  <Text dimColor>
                    {"  "}
                    {loadedTask.timeLimit} / {loadedTask.memoryLimit}
                  </Text>
                </Text>
              )}
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
          {tab === "ranking" && (
            <RankingPane
              contestId={contestId}
              ended={phase === "ended"}
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
