import { Buffer } from "node:buffer";
import type { DiskCache, Ttl } from "../cache.js";
import type { LoadMeter } from "./load.js";

export class LoginRequiredError extends Error {
  constructor(url: string) {
    super(`login required: ${url}`);
    this.name = "LoginRequiredError";
  }
}

export class HttpError extends Error {
  constructor(
    url: string,
    readonly status: number,
  ) {
    super(`HTTP ${status}: ${url}`);
    this.name = "HttpError";
  }
}

export interface FetchOptions {
  ttl: Ttl;
  /** `r` key: skip the fresh-cache lookup (the result is still stored). */
  bypassCache?: boolean;
  /** Never write this response to the disk cache (e.g. personal pages). */
  noStore?: boolean;
}

export interface FetchOutcome {
  body: string;
  fromCache: boolean;
  /** True when a fetch failed and an expired cache entry was served instead. */
  stale: boolean;
  fetchedAt: number;
}

export type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;

export interface ClientOptions {
  meter: LoadMeter;
  cache: DiskCache | null;
  baseUrl?: string;
  cookie?: string;
  userAgent?: string;
  minIntervalMs?: number;
  requestsPerMinute?: number;
  fetchImpl?: FetchImpl;
  clock?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const BUDGET_WINDOW_MS = 60_000;

/**
 * The single chokepoint for atcoder.jp traffic. Every byte the app pulls from
 * AtCoder goes through {@link AtcoderClient.fetch}: requests are serialized,
 * spaced at least `minIntervalMs` apart, and capped at `requestsPerMinute`
 * over a rolling window that survives restarts (it is derived from the
 * persisted request journal). The limiter does not depend on caching.
 */
export class AtcoderClient {
  private readonly meter: LoadMeter;
  private readonly cache: DiskCache | null;
  private readonly baseUrl: string;
  private cookie: string | undefined;
  private readonly userAgent: string;
  private readonly minIntervalMs: number;
  private readonly requestsPerMinute: number;
  private readonly fetchImpl: FetchImpl;
  private readonly clock: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  private tail: Promise<void> = Promise.resolve();
  private lastRequestAt = Number.NEGATIVE_INFINITY;
  private queued = 0;

  constructor(opts: ClientOptions) {
    this.meter = opts.meter;
    this.cache = opts.cache;
    this.baseUrl = opts.baseUrl ?? "https://atcoder.jp";
    this.cookie = opts.cookie;
    this.userAgent =
      opts.userAgent ?? "atcoder-tui/0.1 (read-only terminal viewer)";
    this.minIntervalMs = opts.minIntervalMs ?? 1000;
    this.requestsPerMinute = opts.requestsPerMinute ?? 20;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.clock = opts.clock ?? Date.now;
    this.sleep =
      opts.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  /** Swap the session cookie at runtime (auto-import, expiry recovery). */
  setCookie(value: string | undefined): void {
    this.cookie = value;
  }

  getCookie(): string | undefined {
    return this.cookie;
  }

  /** `pathname` is site-relative, e.g. `/contests/abc300/tasks/abc300_a`. */
  fetch(pathname: string, opts: FetchOptions): Promise<FetchOutcome> {
    const url = this.baseUrl + pathname;

    if (
      this.cache !== null &&
      opts.bypassCache !== true &&
      opts.noStore !== true
    ) {
      const hit = this.cache.get(url, opts.ttl);
      if (hit !== null) {
        this.meter.recordCacheHit();
        return Promise.resolve({
          body: hit.body,
          fromCache: true,
          stale: false,
          fetchedAt: hit.fetchedAt,
        });
      }
    }

    this.queued += 1;
    this.meter.setActivity(true, this.queued);
    const result = this.tail.then(() =>
      this.performFetch(url, opts.noStore === true),
    );
    // The chain must survive failures, or one error would wedge the queue.
    this.tail = result.then(
      () => {},
      () => {},
    );
    return result.finally(() => {
      this.queued -= 1;
      this.meter.setActivity(this.queued > 0, this.queued);
    });
  }

  private async waitForBudget(): Promise<void> {
    for (;;) {
      const now = this.clock();
      let wait = Math.max(0, this.lastRequestAt + this.minIntervalMs - now);
      const window = this.meter.requestsSince(now - BUDGET_WINDOW_MS);
      if (window.length >= this.requestsPerMinute) {
        const oldest = Math.min(...window);
        wait = Math.max(wait, oldest + BUDGET_WINDOW_MS - now);
      }
      if (wait <= 0) return;
      await this.sleep(wait);
    }
  }

  private async performFetch(
    url: string,
    noStore: boolean,
  ): Promise<FetchOutcome> {
    await this.waitForBudget();
    this.lastRequestAt = this.clock();

    let response: Response;
    let body: string;
    try {
      const headers: Record<string, string> = { "User-Agent": this.userAgent };
      if (this.cookie !== undefined) {
        headers["Cookie"] = `REVEL_SESSION=${this.cookie}`;
      }
      response = await this.fetchImpl(url, { headers, redirect: "manual" });
      body = await response.text();
    } catch (error) {
      const stale = this.staleFallback(url);
      if (stale !== null) return stale;
      throw error;
    }

    this.meter.recordRequest(url, Buffer.byteLength(body, "utf8"));

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location") ?? "";
      if (location.includes("/login")) {
        // User-actionable (paste a fresh REVEL_SESSION); never masked by stale data.
        throw new LoginRequiredError(url);
      }
      const stale = this.staleFallback(url);
      if (stale !== null) return stale;
      throw new HttpError(url, response.status);
    }
    if (response.status !== 200) {
      const stale = this.staleFallback(url);
      if (stale !== null) return stale;
      throw new HttpError(url, response.status);
    }

    if (!noStore) this.cache?.put(url, body);
    return { body, fromCache: false, stale: false, fetchedAt: this.clock() };
  }

  private staleFallback(url: string): FetchOutcome | null {
    const entry = this.cache?.getStale(url) ?? null;
    if (entry === null) return null;
    return {
      body: entry.body,
      fromCache: true,
      stale: true,
      fetchedAt: entry.fetchedAt,
    };
  }
}
