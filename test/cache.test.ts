import { describe, expect, test } from "bun:test";
import { DiskCache } from "../src/cache.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "atui-cache-"));
}

describe("DiskCache", () => {
  test("miss on empty cache", () => {
    const cache = new DiskCache(tempDir());
    expect(cache.get("https://x/a", 1000)).toBeNull();
  });

  test("fresh entry within ttl", () => {
    let now = 1000;
    const cache = new DiskCache(tempDir(), () => now);
    cache.put("https://x/a", "body");
    now = 1500;
    expect(cache.get("https://x/a", 1000)?.body).toBe("body");
  });

  test("expired entry misses but getStale still serves it", () => {
    let now = 1000;
    const cache = new DiskCache(tempDir(), () => now);
    cache.put("https://x/a", "body");
    now = 5000;
    expect(cache.get("https://x/a", 1000)).toBeNull();
    expect(cache.getStale("https://x/a")?.body).toBe("body");
  });

  test("infinite ttl never expires", () => {
    let now = 0;
    const cache = new DiskCache(tempDir(), () => now);
    cache.put("https://x/a", "body");
    now = Number.MAX_SAFE_INTEGER;
    expect(cache.get("https://x/a", "infinite")?.body).toBe("body");
  });

  test("urls do not collide", () => {
    const cache = new DiskCache(tempDir());
    cache.put("https://x/a", "A");
    cache.put("https://x/b", "B");
    expect(cache.get("https://x/a", "infinite")?.body).toBe("A");
    expect(cache.get("https://x/b", "infinite")?.body).toBe("B");
  });

  test("corrupt file is a miss", () => {
    const dir = tempDir();
    const cache = new DiskCache(dir);
    cache.put("https://x/a", "A");
    for (const f of fs.readdirSync(dir)) fs.writeFileSync(path.join(dir, f), "garbage");
    expect(cache.get("https://x/a", "infinite")).toBeNull();
  });
});
