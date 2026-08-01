import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DiskCache } from "../src/cache.js";
import {
  AtcoderClient,
  HttpError,
  LoginRequiredError,
  type ClientOptions,
} from "../src/net/http.js";
import { LoadMeter } from "../src/net/load.js";

interface Recorded {
  url: string;
  at: number;
  cookie: string | null;
}

/** Virtual-time harness: sleep() advances the clock instantly. */
function makeHarness(
  respond: (url: string) => Response | Promise<Response>,
  overrides: Partial<ClientOptions> = {},
) {
  let now = 1_000_000;
  const calls: Recorded[] = [];
  const clock = () => now;
  const meter = overrides.meter ?? new LoadMeter(null, clock);
  const client = new AtcoderClient({
    meter,
    cache: null,
    baseUrl: "https://atcoder.jp",
    clock,
    sleep: async (ms) => {
      now += ms;
    },
    fetchImpl: async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      calls.push({ url, at: now, cookie: headers.get("cookie") });
      return respond(url);
    },
    ...overrides,
    ...(overrides.meter === undefined ? { meter } : {}),
  });
  return { client, calls, meter, clock: () => now };
}

const ok = (body: string) => new Response(body, { status: 200 });

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "atui-http-"));
}

describe("AtcoderClient", () => {
  test("fetches with UA and no cookie by default", async () => {
    const { client, calls } = makeHarness(() => ok("hi"));
    const outcome = await client.fetch("/contests/", { ttl: 0 });
    expect(outcome.body).toBe("hi");
    expect(outcome.fromCache).toBe(false);
    expect(calls[0]!.url).toBe("https://atcoder.jp/contests/");
    expect(calls[0]!.cookie).toBeNull();
  });

  test("attaches REVEL_SESSION cookie", async () => {
    const { client, calls } = makeHarness(() => ok("hi"), { cookie: "s3cret" });
    await client.fetch("/", { ttl: 0 });
    expect(calls[0]!.cookie).toBe("REVEL_SESSION=s3cret");
  });

  test("serializes requests with 1s min spacing", async () => {
    const { client, calls } = makeHarness(() => ok("x"));
    await Promise.all([
      client.fetch("/a", { ttl: 0 }),
      client.fetch("/b", { ttl: 0 }),
      client.fetch("/c", { ttl: 0 }),
    ]);
    expect(calls.map((c) => c.at)).toEqual([1_000_000, 1_001_000, 1_002_000]);
  });

  test("rolling-window budget delays past the window", async () => {
    const { client, calls } = makeHarness(() => ok("x"), {
      requestsPerMinute: 3,
      minIntervalMs: 0,
    });
    for (let i = 0; i < 4; i++) {
      await client.fetch(`/p${i}`, { ttl: 0 });
    }
    // First three go immediately; the fourth waits for the window to roll.
    expect(calls[3]!.at - calls[0]!.at).toBeGreaterThanOrEqual(60_000);
  });

  test("budget window survives restarts via the journal", async () => {
    const journal = path.join(tempDir(), "requests.jsonl");
    let now = 1_000_000;
    const clock = () => now;
    const sleep = async (ms: number) => {
      now += ms;
    };
    const fetchImpl = async () => ok("x");

    const first = new AtcoderClient({
      meter: new LoadMeter(journal, clock),
      cache: null,
      requestsPerMinute: 2,
      minIntervalMs: 0,
      clock,
      sleep,
      fetchImpl,
    });
    await first.fetch("/a", { ttl: 0 });
    await first.fetch("/b", { ttl: 0 });

    // New client, same journal: the budget is already spent.
    const calls: number[] = [];
    const second = new AtcoderClient({
      meter: new LoadMeter(journal, clock),
      cache: null,
      requestsPerMinute: 2,
      minIntervalMs: 0,
      clock,
      sleep,
      fetchImpl: async () => {
        calls.push(now);
        return ok("x");
      },
    });
    await second.fetch("/c", { ttl: 0 });
    expect(calls[0]! - 1_000_000).toBeGreaterThanOrEqual(60_000);
  });

  test("cache hit avoids network entirely", async () => {
    const cache = new DiskCache(tempDir());
    const { client, calls, meter } = makeHarness(() => ok("fresh"), { cache });
    await client.fetch("/a", { ttl: "infinite" });
    const second = await client.fetch("/a", { ttl: "infinite" });
    expect(second.fromCache).toBe(true);
    expect(calls).toHaveLength(1);
    expect(meter.stats().cacheHits).toBe(1);
  });

  test("concurrent fetches of one URL coalesce into a single request", async () => {
    const { client, calls } = makeHarness(() => ok("x"));
    const outcomes = await Promise.all([
      client.fetch("/a", { ttl: 0 }),
      client.fetch("/a", { ttl: 0 }),
      client.fetch("/b", { ttl: 0 }),
      client.fetch("/a", { ttl: 0 }),
    ]);
    expect(calls.map((c) => c.url)).toEqual(["https://atcoder.jp/a", "https://atcoder.jp/b"]);
    for (const outcome of outcomes) expect(outcome.body).toBe("x");
  });

  test("coalesced rejection reaches every caller without wedging the queue", async () => {
    let n = 0;
    const { client } = makeHarness(() =>
      n++ === 0 ? new Response("boom", { status: 500 }) : ok("fine"),
    );
    const results = await Promise.allSettled([
      client.fetch("/a", { ttl: 0 }),
      client.fetch("/a", { ttl: 0 }),
    ]);
    expect(results.map((r) => r.status)).toEqual(["rejected", "rejected"]);
    const after = await client.fetch("/b", { ttl: 0 });
    expect(after.body).toBe("fine");
  });

  test("peekFresh probes the cache without any request or metering", async () => {
    let cacheNow = 5_000_000;
    const cache = new DiskCache(tempDir(), () => cacheNow);
    const { client, calls, meter } = makeHarness(() => ok("x"), { cache });
    expect(client.peekFresh("/a", "infinite")).toBe(false);
    await client.fetch("/a", { ttl: "infinite" });
    const hitsBefore = meter.stats().cacheHits;
    expect(client.peekFresh("/a", "infinite")).toBe(true);
    cacheNow += 1_000;
    expect(client.peekFresh("/a", 999)).toBe(false); // older than the ttl
    expect(calls).toHaveLength(1);
    expect(meter.stats().cacheHits).toBe(hitsBefore);
  });

  test("bypassCache refetches but still stores", async () => {
    const cache = new DiskCache(tempDir());
    let n = 0;
    const { client, calls } = makeHarness(() => ok(`v${n++}`), { cache });
    await client.fetch("/a", { ttl: "infinite" });
    const refreshed = await client.fetch("/a", {
      ttl: "infinite",
      bypassCache: true,
    });
    expect(refreshed.body).toBe("v1");
    expect(calls).toHaveLength(2);
    const cached = await client.fetch("/a", { ttl: "infinite" });
    expect(cached.body).toBe("v1");
  });

  test("302 to /login raises LoginRequiredError", async () => {
    const { client } = makeHarness(
      () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://atcoder.jp/login" },
        }),
    );
    expect(client.fetch("/contests/x/tasks", { ttl: 0 })).rejects.toBeInstanceOf(
      LoginRequiredError,
    );
  });

  test("server error with stale cache serves stale", async () => {
    let cacheNow = 0;
    const cache = new DiskCache(tempDir(), () => cacheNow);
    cache.put("https://atcoder.jp/a", "old");
    cacheNow = 1_000_000;
    const { client } = makeHarness(() => new Response("boom", { status: 500 }), { cache });
    const outcome = await client.fetch("/a", { ttl: 0 });
    expect(outcome.stale).toBe(true);
    expect(outcome.body).toBe("old");
  });

  test("server error without cache raises HttpError", async () => {
    const { client } = makeHarness(() => new Response("boom", { status: 500 }));
    expect(client.fetch("/a", { ttl: 0 })).rejects.toBeInstanceOf(HttpError);
  });

  test("network error with stale cache serves stale", async () => {
    let cacheNow = 0;
    const cache = new DiskCache(tempDir(), () => cacheNow);
    cache.put("https://atcoder.jp/a", "old");
    cacheNow = 1_000_000;
    const { client } = makeHarness(
      () => {
        throw new Error("offline");
      },
      { cache },
    );
    const outcome = await client.fetch("/a", { ttl: 0 });
    expect(outcome.stale).toBe(true);
  });

  test("a failing request does not wedge the queue", async () => {
    let fail = true;
    const { client } = makeHarness(() => {
      if (fail) throw new Error("offline");
      return ok("recovered");
    });
    expect(client.fetch("/a", { ttl: 0 })).rejects.toThrow("offline");
    fail = false;
    const outcome = await client.fetch("/b", { ttl: 0 });
    expect(outcome.body).toBe("recovered");
  });

  test("meter records real requests with byte counts", async () => {
    const { client, meter } = makeHarness(() => ok("12345"));
    await client.fetch("/a", { ttl: 0 });
    const stats = meter.stats();
    expect(stats.sessionRequests).toBe(1);
    expect(stats.sessionBytes).toBe(5);
  });
});
