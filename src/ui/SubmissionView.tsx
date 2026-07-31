import { useMemo, useState } from "react";
import { Box, Text } from "ink";
import chalk from "chalk";
import { LoginRequiredError } from "../net/http.js";
import { parseSubmissionDetail } from "../scrape/submission.js";
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

/** Full-screen source viewer for one submission (login-gated page). */
export function SubmissionView({
  contestId,
  submissionId,
}: {
  contestId: string;
  submissionId: string;
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

  const lines = useMemo(() => {
    if (state.status !== "ready") return [];
    const out: string[] = [];
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
  }, [state]);

  const height = rows - 4 - (state.status !== "ready" || state.stale ? 1 : 0);
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
        {state.status === "error" && (
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
