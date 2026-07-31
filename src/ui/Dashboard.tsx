import { useMemo, useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import TextInput from "ink-text-input";
import { parseContestsPage, type ContestListItem } from "../scrape/contests.js";
import { useServices } from "../state/services.js";
import { useAppDispatch, useAppState } from "../state/store.js";
import { useData } from "../state/useData.js";
import { useVimNav } from "../keys/useKeys.js";
import { t } from "./strings.js";
import { StatusBar } from "./StatusBar.js";

const FRONT_PAGE_TTL_MS = 30 * 60 * 1000;

type Row = { type: "header"; title: string } | { type: "contest"; contest: ContestListItem; index: number };

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

  const { state, refresh } = useData(`contests-${language}`, async (bypassCache) => {
    const outcome = await client.fetch(`/contests/?lang=${language}`, {
      ttl: FRONT_PAGE_TTL_MS,
      bypassCache,
    });
    return { data: parseContestsPage(outcome.body), stale: outcome.stale, fetchedAt: outcome.fetchedAt };
  });

  const { rows, contestCount } = useMemo(() => {
    if (state.status !== "ready") return { rows: [] as Row[], contestCount: 0 };
    const needle = filter.trim().toLowerCase();
    const rows: Row[] = [];
    let index = 0;
    for (const section of state.data) {
      const contests =
        needle === ""
          ? section.contests
          : section.contests.filter(
              (c) => c.id.toLowerCase().includes(needle) || c.title.toLowerCase().includes(needle),
            );
      if (contests.length === 0) continue;
      rows.push({ type: "header", title: section.title });
      for (const contest of contests) {
        rows.push({ type: "contest", contest, index });
        index += 1;
      }
    }
    return { rows, contestCount: index };
  }, [state, filter]);

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
        const endsAt = startsAt !== null && durationMin !== null ? startsAt + durationMin * 60_000 : null;
        dispatch({ type: "push", route: { screen: "contest", contestId: row.contest.id, endsAt } });
      }
    },
  });

  useInput(
    (input) => {
      if (input === "/") {
        setFiltering(true);
        dispatch({ type: "setInputActive", value: true });
      } else if (input === "r") {
        refresh();
      }
    },
    { isActive: !filtering && !inputActive },
  );

  // While filtering, esc clears and closes; enter (TextInput onSubmit) keeps the filter.
  useInput(
    (_input, key) => {
      if (key.escape) {
        setFilter("");
        setFiltering(false);
        dispatch({ type: "setInputActive", value: false });
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

  const hints = `j/k ${t("move", language)} · ⏎ ${t("open", language)} · / ${t("filter", language)} · t ${t("language", language)} · r ${t("refresh", language)} · q ${t("quit", language)}`;

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
                <Text dimColor={row.index !== clampedSelected}>{formatStart(row.contest.startsAt)}</Text>{" "}
                {row.contest.kind === "heuristic" ? "Ⓗ" : row.contest.kind === "algorithm" ? "Ⓐ" : "·"}{" "}
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
