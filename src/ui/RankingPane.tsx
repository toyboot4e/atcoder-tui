import { useEffect, useMemo, useRef, useState } from "react";
import { Text, useInput } from "ink";
import chalk from "chalk";
import { LoginRequiredError } from "../net/http.js";
import { formatElapsed, parseStandingsJson, ratingColor } from "../scrape/standings.js";
import { saveFavorites } from "../config.js";
import { parseFavList } from "../scrape/fav.js";
import { useServices } from "../state/services.js";
import { useAppState } from "../state/store.js";
import { useData } from "../state/useData.js";
import { useVimNav } from "../keys/useKeys.js";
import { ScrollView, clampScroll } from "./ScrollView.js";
import { t } from "./strings.js";

const ACTIVE_STANDINGS_TTL_MS = 2 * 60 * 1000;
const FAV_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;
// One auto-sync attempt at a time, shared across pane instances.
let favSyncInFlight = false;

// Cursor per contest, consistent with the rest of the modeless UI.
const rememberedCursor = new Map<string, number>();
// f toggles favorites-only; sticky across panes for the session.
let favoritesOnly = false;

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
  const { client, config, notices } = useServices();
  const { language } = useAppState();
  const [cursor, setCursorRaw] = useState(rememberedCursor.get(contestId) ?? 0);
  const setCursor = (i: number) => {
    rememberedCursor.set(contestId, i);
    setCursorRaw(i);
  };

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

  const [favOnly, setFavOnly] = useState(favoritesOnly);
  // Local copy so starring re-renders; kept in sync with the shared config
  // object and persisted to config.json on every change.
  const [favList, setFavList] = useState(config.favorites);
  const toggleStar = (user: string) => {
    const next = favList.some((f) => f.toLowerCase() === user.toLowerCase())
      ? favList.filter((f) => f.toLowerCase() !== user.toLowerCase())
      : [...favList, user];
    setFavList(next);
    config.favorites = next;
    saveFavorites(next);
  };
  const starred = useMemo(() => new Set(favList.map((f) => f.toLowerCase())), [favList]);
  // Your own row always stays as the reference point.
  const isFavRow = (user: string) => starred.has(user.toLowerCase()) || user === config.userId;
  const visibleRows = useMemo(() => {
    if (state.status !== "ready") return [];
    if (!favOnly) return state.data.rows;
    return state.data.rows.filter((row) => isFavRow(row.user));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, favOnly, starred, config.userId]);

  /** F (or the daily auto-sync): pull the favorites registered on atcoder.jp. */
  const importFavorites = async (announce: boolean) => {
    try {
      // Personal page: never cached to disk.
      const { body } = await client.fetch("/settings/fav", {
        ttl: 0,
        bypassCache: true,
        noStore: true,
      });
      const imported = parseFavList(body);
      const known = new Set(favList.map((f) => f.toLowerCase()));
      const added = imported.filter((u) => !known.has(u.toLowerCase()));
      const merged = [...favList, ...added];
      setFavList(merged);
      config.favorites = merged;
      config.favoritesSyncedAt = Date.now();
      saveFavorites(merged, config.favoritesSyncedAt);
      if (announce || added.length > 0) {
        notices.push(
          language === "ja"
            ? `お気に入り: AtCoder から ${added.length} 人追加（計 ${merged.length} 人）`
            : `favorites: imported ${added.length} from AtCoder (${merged.length} total)`,
        );
      }
    } catch (error) {
      // The auto-sync stays quiet on failure; F reports what went wrong.
      if (announce) {
        notices.push(
          error instanceof LoginRequiredError
            ? t("loginRequired", language)
            : `${t("error", language)}: ${(error as Error).message}`,
        );
      }
    }
  };

  // Automatic import: opening a ranking is a keypress, so syncing here (at
  // most once per day, only with a session configured) respects the
  // no-idle-traffic rule while keeping browser-starred rivals fresh.
  useEffect(() => {
    if (favSyncInFlight || config.revelSession === undefined) return;
    const last = config.favoritesSyncedAt ?? 0;
    if (Date.now() - last < FAV_SYNC_INTERVAL_MS) return;
    favSyncInFlight = true;
    void importFavorites(false).finally(() => {
      favSyncInFlight = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rowCount = visibleRows.length;
  const clampedCursor = Math.max(0, Math.min(rowCount - 1, cursor));

  const lines = useMemo(() => {
    const out: string[] = [];
    for (const row of visibleRows) {
      const color = ratingColor(row.rating);
      const user = row.user.length > 18 ? `${row.user.slice(0, 17)}…` : row.user.padEnd(18);
      const styledUser = color !== null ? chalk.hex(color)(user) : user;
      const elapsed =
        row.elapsedSec !== null ? formatElapsed(row.elapsedSec).padStart(8) : "       -";
      const penalty = row.penalty > 0 ? chalk.red(`(${row.penalty})`) : "   ";
      const marker = out.length === clampedCursor ? chalk.cyan("❯ ") : "  ";
      const star = starred.has(row.user.toLowerCase()) ? chalk.yellow("★") : " ";
      const line = `${marker}${star}${String(row.rank).padStart(5)}  ${styledUser} ${String(row.score).padStart(6)} ${penalty} ${elapsed}`;
      // The user's own row stands out.
      out.push(
        config.userId !== undefined && row.user === config.userId ? chalk.bold.inverse(line) : line,
      );
    }
    return out;
  }, [visibleRows, config.userId, width, clampedCursor, starred]);

  const me =
    state.status === "ready" && config.userId !== undefined
      ? state.data.rows.find((r) => r.user === config.userId)
      : undefined;

  const viewHeight = height - 2; // header + notice budget

  // On first load, land on your own row instead of rank 1: standings come
  // as one document, so this is pure local movement — no extra requests.
  const centered = useRef(false);
  useEffect(() => {
    if (centered.current || state.status !== "ready" || config.userId === undefined) return;
    const index = visibleRows.findIndex((r) => r.user === config.userId);
    if (index >= 0) setCursor(index);
    centered.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, config.userId]);

  // The view follows the cursor.
  const scrollTop = clampScroll(
    clampedCursor - Math.floor(viewHeight / 2),
    lines.length,
    viewHeight,
  );

  useVimNav(active, rowCount, clampedCursor, viewHeight, {
    handleHorizontal: false, // h/l cycle tabs at the contest level
    onMove: setCursor,
    onBack,
  });
  useInput(
    (input) => {
      if (input === "r") refresh();
      else if (input === "*") {
        const row = visibleRows[clampedCursor];
        if (row !== undefined && row.user !== config.userId) toggleStar(row.user);
      } else if (input === "f") {
        // Keep the same user under the cursor across the toggle when
        // possible; otherwise land on your own row.
        const nextOn = !favOnly;
        const rows = state.status === "ready" ? state.data.rows : [];
        const nextRows = nextOn ? rows.filter((row) => isFavRow(row.user)) : rows;
        const current = visibleRows[clampedCursor]?.user;
        let index = current !== undefined ? nextRows.findIndex((r) => r.user === current) : -1;
        if (index < 0 && config.userId !== undefined) {
          index = nextRows.findIndex((r) => r.user === config.userId);
        }
        favoritesOnly = nextOn;
        setFavOnly(nextOn);
        setCursor(Math.max(0, index));
      } else if (input === "F") {
        void importFavorites(true);
      }
    },
    { isActive: active },
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
          {favOnly
            ? chalk.cyan(
                favList.length === 0
                  ? `  [${language === "ja" ? "お気に入り未登録 — * で追加" : "no favorites yet — * stars a row"}]`
                  : `  [${language === "ja" ? "お気に入りのみ" : "favorites only"} (${rowCount})]  f ${language === "ja" ? "解除" : "off"}`,
              )
            : ""}
          {state.stale ? chalk.yellow(`  [${t("stale", language)}]`) : ""}
        </Text>
      )}
      <ScrollView lines={lines} height={viewHeight} scrollTop={scrollTop} />
    </>
  );
}
