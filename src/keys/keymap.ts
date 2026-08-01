import { type Language } from "../config.js";

export interface KeyBinding {
  keys: string;
  context: "global" | "dashboard" | "contest";
  en: string;
  ja: string;
}

/** Single source of truth for bindings; the help overlay renders this. */
export const KEYMAP: KeyBinding[] = [
  {
    context: "global",
    en: "move / scroll",
    ja: "移動・スクロール",
    keys: "j / k",
  },
  {
    context: "global",
    en: "top / bottom (g in panes)",
    ja: "先頭 / 末尾",
    keys: "gg / G",
  },
  {
    context: "global",
    en: "half page down / up",
    ja: "半ページ移動",
    keys: "ctrl-d / ctrl-u",
  },
  {
    context: "global",
    en: "full page down / up",
    ja: "1ページ移動",
    keys: "ctrl-f / ctrl-b",
  },
  {
    context: "global",
    en: "line down / up (emacs)",
    ja: "1行移動 (emacs)",
    keys: "ctrl-n / ctrl-p",
  },
  {
    context: "global",
    en: "open selection",
    ja: "選択を開く",
    keys: "enter / l",
  },
  { context: "global", en: "back / unfocus", ja: "戻る", keys: "h / esc" },
  {
    context: "global",
    en: "toggle English ⇄ 日本語",
    ja: "言語切替 (English ⇄ 日本語)",
    keys: "t",
  },
  {
    context: "global",
    en: "refresh (bypass cache)",
    ja: "再取得（キャッシュ無視）",
    keys: "r",
  },
  {
    context: "global",
    en: "open current page in browser",
    ja: "ブラウザで開く",
    keys: "o",
  },
  { context: "global", en: "toggle this help", ja: "このヘルプ", keys: "?" },
  { context: "global", en: "quit", ja: "終了", keys: "q / ctrl-c" },
  {
    context: "dashboard",
    en: "filter contests",
    ja: "コンテスト絞り込み",
    keys: "/",
  },
  {
    context: "dashboard",
    en: "category view (ABC/ARC/AGC/AHC/AWC/PAST/learning/JOI)",
    ja: "カテゴリ表示 (ABC/ARC/AGC/AHC/AWC/PAST/学習/JOI)",
    keys: "c",
  },
  {
    context: "dashboard",
    en: "load next / all archive pages",
    ja: "アーカイブを1ページ / 全て読み込む",
    keys: "a / A",
  },
  {
    context: "contest",
    en: "focus sidebar ⇄ content",
    ja: "フォーカス切替",
    keys: "tab",
  },
  {
    context: "contest",
    en: "previous / next tab",
    ja: "前 / 次のタブ",
    keys: "h / l",
  },
  {
    context: "contest",
    en: "statement / submissions / ranking (contest detail = cursor row 0)",
    ja: "問題文 / 提出 / 順位表（コンテスト詳細はカーソル先頭行）",
    keys: "1 / 2 / 3",
  },
  {
    context: "contest",
    en: "previous / next problem (scroll kept per problem)",
    ja: "前後の問題（スクロール位置は問題ごとに保持）",
    keys: "j / k",
  },
  {
    context: "contest",
    en: "scroll statement by line",
    ja: "問題文を1行スクロール",
    keys: "ctrl-e / ctrl-y",
  },
  {
    context: "contest",
    en: "narrow ⇄ wide problem list (narrow by default)",
    ja: "問題リストの幅切替（既定は縮小表示）",
    keys: "w",
  },
  {
    context: "contest",
    en: "star/unstar the user under the cursor (saved to config)",
    ja: "カーソル行のユーザーをお気に入り登録／解除（config に保存）",
    keys: "* (ranking)",
  },
  {
    context: "contest",
    en: "toggle favorites-only standings",
    ja: "お気に入りユーザーのみ表示",
    keys: "f (ranking)",
  },
  {
    context: "contest",
    en: "re-import atcoder.jp favorites now (auto-syncs daily)",
    ja: "AtCoder のお気に入りを今すぐ取込（毎日自動同期）",
    keys: "F (ranking)",
  },
  {
    context: "contest",
    en: "open submission source",
    ja: "提出コードを表示",
    keys: "enter (submissions)",
  },
  {
    context: "contest",
    en: "next / previous problem",
    ja: "次 / 前の問題",
    keys: "J / K",
  },
];

export const CONTEXT_LABELS: Record<KeyBinding["context"], Record<Language, string>> = {
  contest: { en: "Contest view", ja: "コンテスト画面" },
  dashboard: { en: "Dashboard", ja: "ダッシュボード" },
  global: { en: "Everywhere", ja: "全画面" },
};
