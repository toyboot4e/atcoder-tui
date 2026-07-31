import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFAULT_CONFIG, loadConfig } from "../src/config.js";

function tempConfig(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "atui-config-"));
  const file = path.join(dir, "config.json");
  fs.writeFileSync(file, content);
  return file;
}

describe("loadConfig", () => {
  test("missing file yields defaults without warnings", () => {
    const { config, warnings } = loadConfig("/nonexistent/config.json");
    expect(config).toEqual(DEFAULT_CONFIG);
    expect(warnings).toEqual([]);
  });

  test("full valid config", () => {
    const file = tempConfig(
      JSON.stringify({
        userId: "example_user",
        language: "ja",
        revelSession: "abc123",
        cache: false,
        requestsPerMinute: 10,
      }),
    );
    const { config, warnings } = loadConfig(file);
    expect(config).toEqual({
      userId: "example_user",
      language: "ja",
      revelSession: "abc123",
      cache: false,
      requestsPerMinute: 10,
    });
    expect(warnings).toEqual([]);
  });

  test("invalid JSON warns and falls back", () => {
    const { config, warnings } = loadConfig(tempConfig("{nope"));
    expect(config).toEqual(DEFAULT_CONFIG);
    expect(warnings).toHaveLength(1);
  });

  test("bad language warns, other fields still apply", () => {
    const { config, warnings } = loadConfig(tempConfig(JSON.stringify({ language: "fr", userId: "x" })));
    expect(config.language).toBe("en");
    expect(config.userId).toBe("x");
    expect(warnings).toHaveLength(1);
  });

  test("requestsPerMinute is clamped to a sane ceiling", () => {
    const { config } = loadConfig(tempConfig(JSON.stringify({ requestsPerMinute: 100000 })));
    expect(config.requestsPerMinute).toBe(30);
  });
});
