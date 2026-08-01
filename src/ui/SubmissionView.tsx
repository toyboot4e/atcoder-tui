import { useMemo, useState } from "react";
import { Box, Text } from "ink";
import chalk from "chalk";
import { HttpError, LoginRequiredError } from "../net/http.js";
import { parseSubmissionDetail } from "../scrape/submission.js";
import type { Submission } from "../scrape/submissions.js";
import { useServices } from "../state/services.js";
import { useAppDispatch, useAppState } from "../state/store.js";
import { useData } from "../state/useData.js";
import { useScrollKeys } from "../keys/useKeys.js";
import { openInBrowser } from "../platform.js";
import { useTerminalSize } from "./hooks.js";
import { ScrollView, clampScroll } from "./ScrollView.js";
import { StatusBar } from "./StatusBar.js";
import { t } from "./strings.js";

const SUBMISSION_TTL_MS = 5 * 60 * 1000;

/**
 * Submission screen. The facts come from the list row (always available);
 * the source code needs /submissions/{id}, which AtCoder shields behind an
 * AWS-WAF JS challenge (403 for any non-browser client) — when that
 * happens we say so instead of pretending it's a bug.
 */
export function SubmissionView({
  contestId,
  submissionId,
  summary,
}: {
  contestId: string;
  submissionId: string;
  summary?: Submission | undefined;
}) {
  const { client } = useServices();
  const { language, inputActive } = useAppState();
  const dispatch = useAppDispatch();
  const { rows } = useTerminalSize();
  const [scrollTop, setScrollTop] = useState(0);

  const path = `/contests/${contestId}/submissions/${submissionId}`;
  const { state, refresh } = useData(
    `submission-${contestId}-${submissionId}`,
    async (bypassCache) => {
      const outcome = await client.fetch(path, { ttl: SUBMISSION_TTL_MS, bypassCache });
      return {
        data: parseSubmissionDetail(outcome.body),
        stale: outcome.stale,
        fetchedAt: outcome.fetchedAt,
      };
    },
  );

  const summaryLines = useMemo(() => {
    if (summary === undefined) return [];
    const pairs: Array<[string, string]> = [
      [language === "ja" ? "提出時刻" : "Time", summary.timeText],
      [language === "ja" ? "問題" : "Task", summary.taskLabel],
      [language === "ja" ? "言語" : "Language", summary.language],
      [language === "ja" ? "結果" : "Status", summary.status],
      [language === "ja" ? "得点" : "Score", summary.score],
    ];
    if (summary.execTime !== null) pairs.push(["Exec", summary.execTime]);
    if (summary.memory !== null) pairs.push(["Memory", summary.memory]);
    return pairs.map(([label, value]) => `${chalk.bold(label.padEnd(10))} ${value}`);
  }, [summary, language]);

  const lines = useMemo(() => {
    const out: string[] = [...summaryLines];
    if (state.status !== "ready") return out;
    if (out.length > 0) out.push("");
    // Detail facts the summary lacks (code size etc.), then the code.
    for (const [label, value] of state.data.facts) {
      out.push(`${chalk.bold(label.padEnd(16))} ${value}`);
    }
    out.push("");
    const codeLines = state.data.code.replace(/\n$/, "").split("\n");
    const gutterWidth = String(codeLines.length).length;
    codeLines.forEach((line, i) => {
      out.push(`${chalk.dim(String(i + 1).padStart(gutterWidth))} ${line}`);
    });
    if (state.data.compileError !== null) {
      out.push("", chalk.bold.red("Compile Error"), ...state.data.compileError.split("\n"));
    }
    return out;
  }, [state, summaryLines]);

  const wafBlocked =
    state.status === "error" && state.error instanceof HttpError && state.error.status === 403;
  const height = rows - 4 - (state.status !== "ready" || state.stale ? (wafBlocked ? 2 : 1) : 0);
  const clamped = clampScroll(scrollTop, lines.length, height);

  useScrollKeys(
    !inputActive,
    lines.length,
    height,
    clamped,
    setScrollTop,
    clampScroll,
    (input, key) => {
      if (input === "r") refresh();
      else if (input === "o") openInBrowser(`https://atcoder.jp${path}`);
      else if (input === "h" || key.escape) dispatch({ type: "pop" });
    },
  );

  return (
    <Box flexDirection="column" height={rows}>
      <Box flexDirection="column" flexGrow={1} borderStyle="round" borderColor="cyan" paddingX={1}>
        <Text bold color="cyan" wrap="truncate">
          {language === "ja" ? "提出" : "submission"} #{submissionId}
        </Text>
        {state.status === "loading" && <Text dimColor>{t("loading", language)}</Text>}
        {wafBlocked && (
          <Text color="yellow">
            {language === "ja"
              ? "ソースコードはブラウザ限定です（AtCoder の WAF 保護のためツールからは取得できません）— o でブラウザ表示"
              : "source code is browser-only (AtCoder's WAF challenge blocks tools) — press o to open it in the browser"}
          </Text>
        )}
        {state.status === "error" && !wafBlocked && (
          <Text color="red" wrap="truncate">
            {state.error instanceof LoginRequiredError
              ? t("loginRequired", language)
              : `${t("error", language)}: ${state.error.message}`}{" "}
            — {t("retryHint", language)}
          </Text>
        )}
        {state.status === "ready" && state.stale && (
          <Text color="yellow">[{t("stale", language)}]</Text>
        )}
        <ScrollView lines={lines} height={height} scrollTop={clamped} />
      </Box>
      <StatusBar
        hints={`j/k scroll   o ${t("open", language)}   q/h ${t("back", language)}   r ${t("refresh", language)}`}
      />
    </Box>
  );
}
