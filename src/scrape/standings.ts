export interface StandingsTask {
  id: string;
  /** e.g. "A" */
  label: string;
}

export interface StandingsRow {
  rank: number;
  user: string;
  rating: number;
  /** Points (AtCoder serves score ×100). */
  score: number;
  penalty: number;
  /** Seconds from contest start to last scoring submission; null if none. */
  elapsedSec: number | null;
}

export interface Standings {
  tasks: StandingsTask[];
  rows: StandingsRow[];
}

interface RawStandings {
  TaskInfo?: Array<{ Assignment?: string; TaskScreenName?: string }>;
  StandingsData?: Array<{
    Rank?: number;
    UserScreenName?: string;
    Rating?: number;
    TotalResult?: { Score?: number; Penalty?: number; Elapsed?: number; Count?: number };
  }>;
}

/** Parses /contests/{id}/standings/json (login-gated). */
export function parseStandingsJson(json: string): Standings {
  const raw = JSON.parse(json) as RawStandings;
  const tasks: StandingsTask[] = (raw.TaskInfo ?? []).map((t) => ({
    id: t.TaskScreenName ?? "",
    label: t.Assignment ?? "?",
  }));
  const rows: StandingsRow[] = (raw.StandingsData ?? []).map((entry) => {
    const total = entry.TotalResult ?? {};
    const elapsedNs = total.Elapsed ?? 0;
    return {
      rank: entry.Rank ?? 0,
      user: entry.UserScreenName ?? "?",
      rating: entry.Rating ?? 0,
      score: (total.Score ?? 0) / 100,
      penalty: total.Penalty ?? 0,
      elapsedSec: elapsedNs > 0 ? Math.floor(elapsedNs / 1e9) : null,
    };
  });
  return { tasks, rows };
}

export function formatElapsed(sec: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** AtCoder rating tier colors (hex for truecolor terminals). */
export function ratingColor(rating: number): string | null {
  if (rating <= 0) return null;
  if (rating < 400) return "#808080";
  if (rating < 800) return "#804000";
  if (rating < 1200) return "#008000";
  if (rating < 1600) return "#00C0C0";
  if (rating < 2000) return "#0000FF";
  if (rating < 2400) return "#C0C000";
  if (rating < 2800) return "#FF8000";
  return "#FF0000";
}
