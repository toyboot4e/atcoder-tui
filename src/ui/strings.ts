import { type Language } from "../config.js";

/** UI chrome labels; problem/contest content comes localized from the site. */
const STRINGS = {
  back: { en: "back", ja: "戻る" },
  cached: { en: "cached", ja: "キャッシュ" },
  error: { en: "error", ja: "エラー" },
  filter: { en: "filter", ja: "絞り込み" },
  language: { en: "日本語", ja: "English" },
  loading: { en: "loading…", ja: "読み込み中…" },
  loginRequired: {
    en: "login required — paste a fresh REVEL_SESSION into config",
    ja: "ログインが必要です — config に REVEL_SESSION を設定してください",
  },
  move: { en: "move", ja: "移動" },
  open: { en: "open", ja: "開く" },
  quit: { en: "quit", ja: "終了" },
  refresh: { en: "refresh", ja: "再取得" },
  retryHint: { en: "r: retry", ja: "r: 再試行" },
  session: { en: "session", ja: "セッション" },
  stale: { en: "stale", ja: "キャッシュ(古)" },
  today: { en: "today", ja: "今日" },
} as const;

export type StringKey = keyof typeof STRINGS;

export function t(key: StringKey, language: Language): string {
  return STRINGS[key][language];
}
