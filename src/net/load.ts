import fs from "node:fs";
import path from "node:path";

/** One real HTTP request sent to atcoder.jp. */
export interface LoadEvent {
  ts: number;
  url: string;
  bytes: number;
}

export interface LoadStats {
  sessionRequests: number;
  sessionBytes: number;
  todayRequests: number;
  todayBytes: number;
  cacheHits: number;
  /** Requests avoided by cache, as a fraction of all lookups this session. */
  cacheHitRatio: number;
  inFlight: boolean;
  queued: number;
}

const JOURNAL_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * Records every real request in a JSONL journal (persisted across sessions)
 * so the app's load on AtCoder is observable, not just claimed.
 */
export class LoadMeter {
  private history: LoadEvent[] = [];
  private sessionRequests = 0;
  private sessionBytes = 0;
  private cacheHits = 0;
  private inFlight = false;
  private queued = 0;
  private listeners = new Set<() => void>();

  constructor(
    private readonly journalPath: string | null,
    private readonly clock: () => number = Date.now,
  ) {
    if (journalPath !== null) {
      this.history = this.loadJournal();
    }
  }

  private loadJournal(): LoadEvent[] {
    let raw: string;
    try {
      raw = fs.readFileSync(this.journalPath!, "utf8");
    } catch {
      return [];
    }
    const cutoff = this.clock() - JOURNAL_RETENTION_MS;
    const events: LoadEvent[] = [];
    for (const line of raw.split("\n")) {
      if (line.trim() === "") continue;
      try {
        const e = JSON.parse(line) as LoadEvent;
        if (typeof e.ts === "number" && e.ts >= cutoff) events.push(e);
      } catch {
        // Skip corrupt lines rather than losing the journal.
      }
    }
    // Compact the journal to the retained window while we have it parsed.
    try {
      fs.mkdirSync(path.dirname(this.journalPath!), { recursive: true });
      fs.writeFileSync(
        this.journalPath!,
        events.map((e) => JSON.stringify(e)).join("\n") + (events.length > 0 ? "\n" : ""),
      );
    } catch {
      // Metering must never break the app.
    }
    return events;
  }

  recordRequest(url: string, bytes: number): void {
    const event: LoadEvent = { ts: this.clock(), url, bytes };
    this.history.push(event);
    this.sessionRequests += 1;
    this.sessionBytes += bytes;
    if (this.journalPath !== null) {
      try {
        fs.mkdirSync(path.dirname(this.journalPath), { recursive: true });
        fs.appendFileSync(this.journalPath, JSON.stringify(event) + "\n");
      } catch {
        // Metering must never break the app.
      }
    }
    this.notify();
  }

  recordCacheHit(): void {
    this.cacheHits += 1;
    this.notify();
  }

  setActivity(inFlight: boolean, queued: number): void {
    this.inFlight = inFlight;
    this.queued = queued;
    this.notify();
  }

  /** Timestamps of requests in the trailing window — used by the rate limiter. */
  requestsSince(since: number): number[] {
    return this.history.filter((e) => e.ts >= since).map((e) => e.ts);
  }

  stats(): LoadStats {
    const today = dayKey(this.clock());
    let todayRequests = 0;
    let todayBytes = 0;
    for (const e of this.history) {
      if (dayKey(e.ts) === today) {
        todayRequests += 1;
        todayBytes += e.bytes;
      }
    }
    const lookups = this.sessionRequests + this.cacheHits;
    return {
      sessionRequests: this.sessionRequests,
      sessionBytes: this.sessionBytes,
      todayRequests,
      todayBytes,
      cacheHits: this.cacheHits,
      cacheHitRatio: lookups === 0 ? 0 : this.cacheHits / lookups,
      inFlight: this.inFlight,
      queued: this.queued,
    };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
