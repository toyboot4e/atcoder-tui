import { useMemo, useState } from "react";
import { Text } from "ink";
import chalk from "chalk";
import { LoginRequiredError } from "../net/http.js";
import { formatElapsed, parseStandingsJson, ratingColor } from "../scrape/standings.js";
import { useServices } from "../state/services.js";
import { useAppState } from "../state/store.js";
import { useData } from "../state/useData.js";
import { useScrollKeys } from "../keys/useKeys.js";
import { ScrollView, clampScroll } from "./ScrollView.js";
import { t } from "./strings.js";

const ACTIVE_STANDINGS_TTL_MS = 2 * 60 * 1000;

export function RankingPane({
  contestId,
  ended,
  width,
  height,
  active,
  onBack,
}: {
  contestId: string;
  ended: boolean;
  width: number;
  height: number;
  active: boolean;
  onBack: () => void;
}) {
  const { client, config } = useServices();
  const { language } = useAppState();
  const [scrollTop, setScrollTop] = useState(0);

  const { state, refresh } = useData(`standings-${contestId}`, async (bypassCache) => {
    const outcome = await client.fetch(`/contests/${contestId}/standings/json`, {
      ttl: ended ? "infinite" : ACTIVE_STANDINGS_TTL_MS,
      bypassCache,
    });
    return {
      data: parseStandingsJson(outcome.body),
      stale: outcome.stale,
      fetchedAt: outcome.fetchedAt,
    };
  });

  const lines = useMemo(() => {
    if (state.status !== "ready") return [];
    const out: string[] = [];
    for (const row of state.data.rows) {
      const color = ratingColor(row.rating);
      const user = row.user.length > 18 ? `${row.user.slice(0, 17)}…` : row.user.padEnd(18);
      const styledUser = color !== null ? chalk.hex(color)(user) : user;
      const elapsed =
        row.elapsedSec !== null ? formatElapsed(row.elapsedSec).padStart(8) : "       -";
      const penalty = row.penalty > 0 ? chalk.red(`(${row.penalty})`) : "   ";
      const line = `${String(row.rank).padStart(6)}  ${styledUser} ${String(row.score).padStart(6)} ${penalty} ${elapsed}`;
      // The user's own row stands out.
      out.push(
        config.userId !== undefined && row.user === config.userId ? chalk.bold.inverse(line) : line,
      );
    }
    return out;
  }, [state, config.userId, width]);

  const me =
    state.status === "ready" && config.userId !== undefined
      ? state.data.rows.find((r) => r.user === config.userId)
      : undefined;

  const viewHeight = height - 2; // header + notice budget
  const clamped = clampScroll(scrollTop, lines.length, viewHeight);

  useScrollKeys(
    active,
    lines.length,
    viewHeight,
    clamped,
    setScrollTop,
    clampScroll,
    (input, key) => {
      if (input === "r") refresh();
      else if (input === "h" || key.escape) onBack();
    },
  );

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
        <Text bold dimColor wrap="truncate">
          {`  rank  ${"user".padEnd(18)}  score pen     time`}
          {me !== undefined ? `   —   ${language === "ja" ? "自分" : "you"}: #${me.rank}` : ""}
          {state.stale ? chalk.yellow(`  [${t("stale", language)}]`) : ""}
        </Text>
      )}
      <ScrollView lines={lines} height={viewHeight} scrollTop={clamped} />
    </>
  );
}
