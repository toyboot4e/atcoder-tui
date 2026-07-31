import { useMemo, useState } from "react";
import { Text } from "ink";
import chalk from "chalk";
import type { Ttl } from "../cache.js";
import { LoginRequiredError } from "../net/http.js";
import { parseSubmissionsPage, type Submission } from "../scrape/submissions.js";
import { useServices } from "../state/services.js";
import { useAppState } from "../state/store.js";
import { useData } from "../state/useData.js";
import { useScrollKeys } from "../keys/useKeys.js";
import { ScrollView, clampScroll } from "./ScrollView.js";
import { t } from "./strings.js";

const SUBMISSIONS_TTL_MS = 60 * 1000;

function statusColor(status: string): (s: string) => string {
  if (status === "AC") return chalk.green.bold;
  if (status === "WJ" || /^\d+\/\d+$/.test(status)) return chalk.blue;
  if (status === "CE" || status === "IE") return chalk.gray.bold;
  return chalk.yellow.bold;
}

function formatRow(s: Submission, width: number): string {
  const time = s.timeText.replace(/\+\d{4}$/, "").slice(5, 16); // "MM-DD HH:MM"
  const status = statusColor(s.status)(s.status.padEnd(3));
  const score = s.score.padStart(5);
  const task = s.taskLabel.length > 28 ? `${s.taskLabel.slice(0, 27)}…` : s.taskLabel.padEnd(28);
  const exec = (s.execTime ?? "").padStart(7);
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
  const [scrollTop, setScrollTop] = useState(0);
  const userId = config.userId;

  const { state, refresh } = useData(`submissions-${contestId}-${userId ?? "anon"}`, async (bypassCache) => {
    if (userId === undefined) return { data: null, stale: false, fetchedAt: 0 };
    const outcome = await client.fetch(
      `/contests/${contestId}/submissions?f.User=${encodeURIComponent(userId)}`,
      { ttl: SUBMISSIONS_TTL_MS, bypassCache },
    );
    return { data: parseSubmissionsPage(outcome.body), stale: outcome.stale, fetchedAt: outcome.fetchedAt };
  });

  const lines = useMemo(() => {
    if (state.status !== "ready" || state.data === null) return [];
    if (state.data.submissions.length === 0) {
      return [chalk.dim(language === "ja" ? "提出はありません" : "no submissions")];
    }
    return state.data.submissions.map((s) => formatRow(s, width));
  }, [state, width, language]);

  const viewHeight = height - 1; // header/notice row
  const clamped = clampScroll(scrollTop, lines.length, viewHeight);

  useScrollKeys(active, lines.length, viewHeight, clamped, setScrollTop, clampScroll, (input, key) => {
    if (input === "r") refresh();
    else if (input === "h" || key.escape) onBack();
  });

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
      <ScrollView lines={lines} height={viewHeight} scrollTop={clamped} />
    </>
  );
}
