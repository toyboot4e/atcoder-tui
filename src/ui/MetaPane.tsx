import { useMemo, useState } from "react";
import { Text } from "ink";
import chalk from "chalk";
import type { Ttl } from "../cache.js";
import { renderSections } from "../render/lines.js";
import { parseContestTop } from "../scrape/contest.js";
import { parseFragmentSections } from "../scrape/statement.js";
import { useServices } from "../state/services.js";
import { useAppState } from "../state/store.js";
import { useData } from "../state/useData.js";
import { useScrollKeys } from "../keys/useKeys.js";
import { ScrollView, clampScroll } from "./ScrollView.js";
import { t } from "./strings.js";

export function MetaPane({
  contestId,
  ttl,
  width,
  height,
  active,
  onBack,
}: {
  contestId: string;
  ttl: Ttl;
  width: number;
  height: number;
  active: boolean;
  onBack: () => void;
}) {
  const { client } = useServices();
  const { language } = useAppState();
  const [scrollTop, setScrollTop] = useState(0);

  const { state, refresh } = useData(`meta-${contestId}-${language}`, async (bypassCache) => {
    const outcome = await client.fetch(`/contests/${contestId}?lang=${language}`, { ttl, bypassCache });
    return { data: parseContestTop(outcome.body), stale: outcome.stale, fetchedAt: outcome.fetchedAt };
  });

  const lines = useMemo(() => {
    if (state.status !== "ready") return [];
    const meta = state.data;
    const out: string[] = [];
    out.push(chalk.bold.cyan(meta.title));
    if (meta.startText !== null) {
      out.push(`${meta.startText}  →  ${meta.endText ?? "?"}`);
    }
    for (const fact of meta.headerFacts) out.push(fact);
    if (meta.writers.length > 0) out.push(`${chalk.bold("Writer:")} ${meta.writers.join(", ")}`);
    if (meta.testers.length > 0) out.push(`${chalk.bold("Tester:")} ${meta.testers.join(", ")}`);
    out.push("");
    // The contest statement itself often carries writer/announcement info the
    // structured fields miss (e.g. abc300 publishes no writer list at all).
    const html = language === "en" ? (meta.statementHtml.en ?? meta.statementHtml.ja) : meta.statementHtml.ja;
    if (html !== null) {
      out.push(...renderSections(parseFragmentSections(html), width));
    }
    return out;
  }, [state, language, width]);

  const viewHeight = height - (state.status !== "ready" || state.stale ? 1 : 0);
  const clamped = clampScroll(scrollTop, lines.length, viewHeight);

  useScrollKeys(active, lines.length, viewHeight, clamped, setScrollTop, clampScroll, (input, key) => {
    if (input === "r") refresh();
    else if (input === "h" || key.escape) onBack();
  });

  return (
    <>
      {state.status === "loading" && <Text dimColor>{t("loading", language)}</Text>}
      {state.status === "error" && (
        <Text color="red" wrap="truncate">
          {t("error", language)}: {state.error.message} — {t("retryHint", language)}
        </Text>
      )}
      {state.status === "ready" && state.stale && <Text color="yellow">[{t("stale", language)}]</Text>}
      <ScrollView lines={lines} height={viewHeight} scrollTop={clamped} />
    </>
  );
}
