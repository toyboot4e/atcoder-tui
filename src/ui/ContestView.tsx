import { Box, Text, useInput } from "ink";
import { HttpError, LoginRequiredError } from "../net/http.js";
import { ScrollView, clampScroll } from "./ScrollView.js";
import { contestPhase, formatStartLine } from "../phase.js";
import { useAppDispatch, useAppState } from "../state/store.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { MetaPane } from "./MetaPane.js";
import { RankingPane } from "./RankingPane.js";
import { StatusBar } from "./StatusBar.js";
import { SubmissionsPane } from "./SubmissionsPane.js";
import { openInBrowser } from "../platform.js";
import { parseStatement } from "../scrape/statement.js";
import { parseTasksPage } from "../scrape/tasks.js";
import { renderSections } from "../render/lines.js";
import { t } from "./strings.js";
import { useData } from "../state/useData.js";
import { useServices } from "../state/services.js";
import { useTerminalSize } from "./hooks.js";

const SIDEBAR_WIDTH = 26;
// Narrow: problem letters plus the contest id header ("abc420" — 6 cells
// inside the border; no cursor marker or horizontal padding, selection is
// shown by color alone).
const NARROW_SIDEBAR_WIDTH = 8;
const ACTIVE_TTL_MS = 5 * 60 * 1000;

// Session-wide (not per contest): the preferred width follows you around.
let sidebarNarrowDefault = true;

interface RememberedContest {
  cursor: number;
  tab: ContestTab;
  scrollByTask: Map<string, number>;
}
// Per-contest UI state, so returning from a submission (or relaunching the
// same contest) restores tab/cursor/scroll instead of resetting.
const rememberedContest = new Map<string, RememberedContest>();

// No meta tab: the contest detail lives on cursor row 0 of the statement view.
export type ContestTab = "statement" | "submissions" | "ranking";
const TAB_ORDER: ContestTab[] = ["statement", "submissions", "ranking"];

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

  // One cursor, no focus modes: row 0 = the contest itself (detail pane),
  // rows 1..n = problems; moving the cursor IS navigation. A mutable record
  // backs the setters (React state in closures goes stale when setters run
  // in sequence).
  const mem = useRef<RememberedContest>(
    rememberedContest.get(contestId) ?? {
      cursor: 1, // land on the first problem, ready to read
      scrollByTask: new Map<string, number>(),
      tab: "statement",
    },
  );
  rememberedContest.set(contestId, mem.current);
  const [cursor, setCursorRaw] = useState(mem.current.cursor);
  const [tab, setTabRaw] = useState<ContestTab>(mem.current.tab);
  const scrollByTask = useRef(mem.current.scrollByTask);
  const setCursor = (v: number) => {
    mem.current.cursor = v;
    setCursorRaw(v);
  };
  const setTab = (v: ContestTab) => {
    mem.current.tab = v;
    setTabRaw(v);
  };
  const [scrollTop, setScrollTop] = useState(0);
  const [sidebarNarrow, setSidebarNarrowRaw] = useState(sidebarNarrowDefault);
  const setSidebarNarrow = (v: boolean) => {
    sidebarNarrowDefault = v;
    setSidebarNarrowRaw(v);
  };
  const sidebarWidth = sidebarNarrow ? NARROW_SIDEBAR_WIDTH : SIDEBAR_WIDTH;

  const tasksData = useData(`tasks-${contestId}-${language}-${phase}`, async (bypassCache) => {
    if (phase === "upcoming") return { data: [], fetchedAt: 0, stale: false };
    const outcome = await client.fetch(`/contests/${contestId}/tasks?lang=${language}`, {
      bypassCache,
      ttl,
    });
    return {
      data: parseTasksPage(outcome.body),
      fetchedAt: outcome.fetchedAt,
      stale: outcome.stale,
    };
  });
  const tasks = tasksData.state.status === "ready" ? tasksData.state.data : [];
  // Cursor 0 is the contest detail; problems start at 1.
  const contestSelected = cursor === 0;
  const loadedTask = contestSelected ? undefined : tasks[Math.min(cursor - 1, tasks.length - 1)];

  // Debounce: flipping j-j-j through problems fetches only where you settle.
  // Cache-fresh statements settle instantly — the debounce only exists to
  // avoid fetching intermediate problems, and a cached flip fetches nothing.
  const [settledTaskId, setSettledTaskId] = useState<string | undefined>();
  useEffect(() => {
    const id = loadedTask?.id;
    if (id !== undefined && client.peekFresh(`/contests/${contestId}/tasks/${id}`, ttl)) {
      setSettledTaskId(id);
      return;
    }
    const timer = setTimeout(() => setSettledTaskId(id), 150);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedTask?.id]);
  const settledTask = tasks.find((task) => task.id === settledTaskId);

  // Statement pages embed both languages, so the cache key has no lang.
  const statementData = useData(
    `statement-${contestId}-${settledTask?.id ?? "none"}`,
    async (bypassCache) => {
      if (settledTask === undefined) return { data: null, fetchedAt: 0, stale: false };
      const outcome = await client.fetch(`/contests/${contestId}/tasks/${settledTask.id}`, {
        bypassCache,
        ttl,
      });
      return {
        data: parseStatement(outcome.body),
        fetchedAt: outcome.fetchedAt,
        stale: outcome.stale,
      };
    },
  );

  const contentWidth = columns - sidebarWidth - 3;
  const statement = statementData.state.status === "ready" ? statementData.state.data : null;
  const englishMissing = statement !== null && statement.en === null;
  const { lines, fallbackNotice } = useMemo(() => {
    if (statement === null) return { fallbackNotice: false, lines: [] as string[] };
    const sections = language === "en" ? (statement.en ?? statement.ja) : statement.ja;
    return {
      fallbackNotice: language === "en" && englishMissing,
      lines: renderSections(sections, contentWidth),
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

  /** Move the cursor: content follows immediately (scroll kept per problem). */
  const moveCursor = (index: number) => {
    const clamped = Math.max(0, Math.min(tasks.length, index));
    const task = clamped >= 1 ? tasks[clamped - 1] : undefined;
    setCursor(clamped);
    setScrollTop(task !== undefined ? (scrollByTask.current.get(task.id) ?? 0) : 0);
  };

  // Statement context: j/k (arrows, C-n/C-p, J/K) move the cursor — row 0
  // shows the contest detail, the rest show statements; C-e/C-y, C-d/C-u,
  // C-f/C-b and g/G scroll the statement. No enter, no focus modes.
  useInput(
    (input, key) => {
      const scroll = (delta: number) =>
        setStatementScroll(clampScroll(clampedScroll + delta, lines.length, contentHeight));
      const half = Math.max(1, Math.floor(contentHeight / 2));
      if (key.ctrl) {
        if (input === "n") return moveCursor(cursor + 1);
        if (input === "p") return moveCursor(cursor - 1);
        if (contestSelected) return; // detail pane owns its own scrolling
        if (input === "e") scroll(1);
        else if (input === "y") scroll(-1);
        else if (input === "d") scroll(half);
        else if (input === "u") scroll(-half);
        else if (input === "f") scroll(contentHeight);
        else if (input === "b") scroll(-contentHeight);
        return;
      }
      if (input === "j" || input === "J" || key.downArrow) moveCursor(cursor + 1);
      else if (input === "k" || input === "K" || key.upArrow) moveCursor(cursor - 1);
      else if (!contestSelected) {
        // g/G/r belong to the detail pane while the contest row is selected
        if (input === "G")
          setStatementScroll(clampScroll(lines.length, lines.length, contentHeight));
        else if (input === "g") setStatementScroll(0);
        else if (input === "r") statementData.refresh();
      }
    },
    { isActive: tab === "statement" && !inputActive },
  );

  // h/l walk the tabs: statement ↔ meta ↔ submissions ↔ ranking.
  const cycleTab = (delta: number) => {
    const index = TAB_ORDER.indexOf(tab) + delta;
    if (index < 0 || index >= TAB_ORDER.length) return;
    setTab(TAB_ORDER[index]!);
  };

  // Contest-level keys.
  useInput(
    (input, key) => {
      if (phase === "upcoming") {
        // Lobby: nothing to cycle — h/esc go back like q.
        if (input === "h" || key.leftArrow || key.escape) dispatch({ type: "pop" });
        else if (input === "o") openInBrowser(`https://atcoder.jp${currentPagePath()}`);
        return;
      }
      if (key.tab) cycleTab(key.shift ? -1 : 1);
      else if (input === "1") setTab("statement");
      else if (input === "2") setTab("submissions");
      else if (input === "3") setTab("ranking");
      else if (input === "h" || key.leftArrow) cycleTab(-1);
      else if (input === "l" || key.rightArrow) cycleTab(1);
      else if (key.ctrl && input === "o") dispatch({ type: "pop" });
      else if (input === "o") openInBrowser(`https://atcoder.jp${currentPagePath()}`);
      else if (input === "w") setSidebarNarrow(!sidebarNarrow);
    },
    { isActive: !inputActive },
  );

  function currentPagePath(): string {
    if (phase === "upcoming" || contestSelected) return `/contests/${contestId}`;
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

  const tabHint = `h/l 1/2/3 ${language === "ja" ? "タブ" : "tab"}`;
  const commonHint = `w ${language === "ja" ? "幅" : "width"}   o ${t("open", language)}   t ${t("language", language)}   q ${t("back", language)}`;
  const hints =
    tab === "ranking"
      ? `j/k ${t("move", language)}   * ${language === "ja" ? "お気に入り" : "star"}   f ${language === "ja" ? "お気に入りのみ" : "favs only"}   F ${language === "ja" ? "取込" : "import"}   ${tabHint}   ${commonHint}`
      : tab === "submissions"
        ? `j/k ${t("move", language)}   ⏎ ${t("open", language)}   ${tabHint}   ${commonHint}`
        : `j/k ${language === "ja" ? "前後の問題" : "problem"}   ^e/^y ^d/^u scroll   ${tabHint}   ${commonHint}`;

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
          width={sidebarWidth}
          borderStyle="round"
          borderColor="gray"
          paddingX={sidebarNarrow ? 0 : 1}
        >
          <Text bold {...(contestSelected ? { color: "cyan" } : {})} wrap="truncate">
            {sidebarNarrow ? "" : contestSelected ? "❯ " : "  "}
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
              {...(index + 1 === cursor ? { color: "cyan" } : {})}
              bold={index + 1 === cursor}
              wrap="truncate"
            >
              {sidebarNarrow ? " " : index + 1 === cursor ? "❯ " : "  "}
              {sidebarNarrow ? task.letter : `${task.letter} ${task.title}`}
            </Text>
          ))}
        </Box>
        <Box
          flexDirection="column"
          flexGrow={1}
          borderStyle="round"
          borderColor="cyan"
          paddingX={1}
        >
          {tab === "statement" && !contestSelected && (
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
          {tab === "statement" && contestSelected && (
            <MetaPane
              contestId={contestId}
              ttl={ttl}
              width={contentWidth}
              height={rows - 3}
              active={!inputActive}
              lineMotions={false}
              onBack={() => dispatch({ type: "pop" })}
            />
          )}
          {tab === "ranking" && (
            <RankingPane
              contestId={contestId}
              ended={phase === "ended"}
              height={rows - 3}
              active={!inputActive}
              onBack={() => dispatch({ type: "pop" })}
            />
          )}
          {tab === "submissions" && (
            <SubmissionsPane
              contestId={contestId}
              width={contentWidth}
              height={rows - 3}
              active={!inputActive}
              onBack={() => dispatch({ type: "pop" })}
            />
          )}
        </Box>
      </Box>
      <StatusBar hints={hints} />
    </Box>
  );
}
