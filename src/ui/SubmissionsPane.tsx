import { ScrollView, clampScroll } from "./ScrollView.js";
import { type Submission, parseSubmissionsPage } from "../scrape/submissions.js";
import { Text, useInput } from "ink";
import { useAppDispatch, useAppState } from "../state/store.js";
import { useMemo, useState } from "react";
import { LoginRequiredError } from "../net/http.js";
import chalk from "chalk";
import { t } from "./strings.js";
import { useData } from "../state/useData.js";
import { useServices } from "../state/services.js";
import { useVimNav } from "../keys/useKeys.js";

const SUBMISSIONS_TTL_MS = 60 * 1000;

// Cursor per contest, so returning from a submission restores the position.
const rememberedCursor = new Map<string, number>();

function statusColor(status: string): (s: string) => string {
  if (status === "AC") return chalk.green.bold;
  if (status === "WJ" || /^\d+\/\d+$/u.test(status)) return chalk.blue;
  if (status === "CE" || status === "IE") return chalk.gray.bold;
  return chalk.yellow.bold;
}

function formatRow(s: Submission, width: number): string {
  const time = s.timeText.replace(/\+\d{4}$/u, "").slice(5, 16); // "MM-DD HH:MM"
  const status = statusColor(s.status)(s.status.padEnd(3));
  const score = s.score.padStart(5);
  const task = s.taskLabel.length > 28 ? `${s.taskLabel.slice(0, 27)}…` : s.taskLabel.padEnd(28);
  const exec = (s.execTime ?? "").padStart(9); // "12345 ms" and beyond
  const lang = s.language;
  const row = `${chalk.dim(time)}  ${status} ${score}  ${task}  ${exec}  ${lang}`;
  return width > 0 ? row : row;
}

export function SubmissionsPane({
  contestId,
  width,
  height,
  active,
  onBack,
}: {
  contestId: string;
  /** Unused for now (rows are truncated by Ink) but kept for symmetry. */
  width: number;
  height: number;
  active: boolean;
  onBack: () => void;
}) {
  const { client, config } = useServices();
  const { language } = useAppState();
  const dispatch = useAppDispatch();
  const [cursor, setCursorRaw] = useState(rememberedCursor.get(contestId) ?? 0);
  const setCursor = (i: number) => {
    rememberedCursor.set(contestId, i);
    setCursorRaw(i);
  };
  const { userId } = config;

  const { state, refresh } = useData(
    `submissions-${contestId}-${userId ?? "anon"}`,
    async (bypassCache) => {
      if (userId === undefined) return { data: null, fetchedAt: 0, stale: false };
      const outcome = await client.fetch(
        `/contests/${contestId}/submissions?f.User=${encodeURIComponent(userId)}`,
        { bypassCache, ttl: SUBMISSIONS_TTL_MS },
      );
      return {
        data: parseSubmissionsPage(outcome.body),
        fetchedAt: outcome.fetchedAt,
        stale: outcome.stale,
      };
    },
  );

  const submissions = state.status === "ready" && state.data !== null ? state.data.submissions : [];
  const clampedCursor = Math.max(0, Math.min(submissions.length - 1, cursor));

  const lines = useMemo(() => {
    if (state.status !== "ready" || state.data === null) return [];
    if (state.data.submissions.length === 0) {
      return [chalk.dim(language === "ja" ? "提出はありません" : "no submissions")];
    }
    return state.data.submissions.map(
      (s, i) => `${i === clampedCursor ? chalk.cyan("❯ ") : "  "}${formatRow(s, width)}`,
    );
  }, [state, width, language, clampedCursor]);

  const viewHeight = height - 1; // header/notice row
  // Keep the selected row in view.
  const scrollTop = clampScroll(
    clampedCursor - Math.floor(viewHeight / 2),
    lines.length,
    viewHeight,
  );

  useVimNav(active, submissions.length, clampedCursor, viewHeight, {
    handleHorizontal: false, // h/l cycle tabs at the contest level
    onBack,
    onMove: setCursor,
    onSelect: () => {
      const submission = submissions[clampedCursor];
      if (submission !== undefined && submission.id !== null) {
        dispatch({
          route: {
            contestId,
            screen: "submission",
            submissionId: submission.id,
            summary: submission,
          },
          type: "push",
        });
      }
    },
  });
  useInput(
    (input) => {
      if (input === "r") refresh();
    },
    { isActive: active },
  );

  if (userId === undefined) {
    return (
      <Text color="yellow">
        {language === "ja"
          ? "config に userId を設定すると提出一覧が表示されます"
          : "set userId in config to see your submissions"}
      </Text>
    );
  }

  return (
    <>
      {state.status === "loading" && <Text dimColor>{t("loading", language)}</Text>}
      {state.status === "error" && (
        <Text color="red" wrap="truncate">
          {state.error instanceof LoginRequiredError
            ? t("loginRequired", language)
            : `${t("error", language)}: ${state.error.message}`}{" "}
          — {t("retryHint", language)}
        </Text>
      )}
      {state.status === "ready" && (
        <Text bold dimColor>
          {userId} · {contestId}
          {state.stale ? chalk.yellow(`  [${t("stale", language)}]`) : ""}
        </Text>
      )}
      <ScrollView lines={lines} height={viewHeight} scrollTop={scrollTop} />
    </>
  );
}
