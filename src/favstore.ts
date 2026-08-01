import fs from "node:fs";
import path from "node:path";
import { cacheDir } from "./platform.js";

/**
 * Favorites imported from atcoder.jp are a cache of server state (re-fetched
 * daily), so they live in the cache dir — the config file holds only the
 * user's own manual stars.
 */
export interface ServerFavs {
  users: string[];
  syncedAt: number;
}

export function serverFavsPath(): string {
  return path.join(cacheDir(), "favorites.json");
}

export function loadServerFavs(file: string = serverFavsPath()): ServerFavs | null {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
    const raw = parsed as { users?: unknown; syncedAt?: unknown };
    if (!Array.isArray(raw.users) || typeof raw.syncedAt !== "number") return null;
    return {
      users: raw.users.filter((u): u is string => typeof u === "string" && u !== ""),
      syncedAt: raw.syncedAt,
    };
  } catch {
    return null;
  }
}

export function saveServerFavs(favs: ServerFavs, file: string = serverFavsPath()): void {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(favs)}\n`);
  } catch {
    // A failed cache write must never break the app.
  }
}
