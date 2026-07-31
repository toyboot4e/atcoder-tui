import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

export type Ttl = number | "infinite";

export interface CacheEntry {
  url: string;
  fetchedAt: number;
  body: string;
}

export class DiskCache {
  constructor(
    private readonly dir: string,
    private readonly clock: () => number = Date.now,
  ) {}

  private filePath(url: string): string {
    const hash = createHash("sha256").update(url).digest("hex").slice(0, 32);
    return path.join(this.dir, `${hash}.json`);
  }

  private read(url: string): CacheEntry | null {
    let raw: string;
    try {
      raw = fs.readFileSync(this.filePath(url), "utf8");
    } catch {
      return null;
    }
    try {
      const entry = JSON.parse(raw) as CacheEntry;
      if (typeof entry.fetchedAt !== "number" || typeof entry.body !== "string") return null;
      return entry;
    } catch {
      return null;
    }
  }

  /** Entry younger than `ttl`, or null. */
  get(url: string, ttl: Ttl): CacheEntry | null {
    const entry = this.read(url);
    if (entry === null) return null;
    if (ttl !== "infinite" && this.clock() - entry.fetchedAt > ttl) return null;
    return entry;
  }

  /** Entry of any age — the offline/stale fallback. */
  getStale(url: string): CacheEntry | null {
    return this.read(url);
  }

  put(url: string, body: string): void {
    fs.mkdirSync(this.dir, { recursive: true });
    const entry: CacheEntry = { url, fetchedAt: this.clock(), body };
    fs.writeFileSync(this.filePath(url), JSON.stringify(entry));
  }
}
