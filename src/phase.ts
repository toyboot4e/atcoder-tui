import type { Language } from "./config.js";

export type ContestPhase = "upcoming" | "active" | "ended" | "unknown";

/**
 * AtCoder serves 404 for task pages of contests that have not started, so
 * the UI must not fetch them; active contests are login/registration-gated.
 */
export function contestPhase(
  startsAt: number | null,
  endsAt: number | null,
  now: number,
): ContestPhase {
  if (startsAt === null) return "unknown"; // permanent contests etc.
  if (now < startsAt) return "upcoming";
  if (endsAt !== null && now >= endsAt) return "ended";
  return "active";
}

/** "2d 3h" / "1h 05m" / "12m 30s" — coarse on purpose; it's a lobby screen. */
export function formatCountdown(untilMs: number): string {
  const total = Math.max(0, Math.floor(untilMs / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

export function formatStartLine(startsAt: number, now: number, language: Language): string {
  const start = new Date(startsAt);
  const pad = (n: number) => String(n).padStart(2, "0");
  const when = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())} ${pad(start.getHours())}:${pad(start.getMinutes())}`;
  const countdown = formatCountdown(startsAt - now);
  return language === "ja"
    ? `${when} 開始（あと ${countdown}）`
    : `starts ${when} (in ${countdown})`;
}
