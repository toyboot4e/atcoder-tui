import { describe, expect, test } from "bun:test";
import path from "node:path";
import { browserCommand, cacheDir, configDir } from "../src/platform.js";

describe("configDir", () => {
  test("honors XDG_CONFIG_HOME on linux", () => {
    expect(configDir("linux", { XDG_CONFIG_HOME: "/xdg/config" })).toBe(
      path.join("/xdg/config", "atcoder-tui"),
    );
  });
  test("falls back to ~/.config", () => {
    expect(configDir("linux", {})).toContain(
      path.join(".config", "atcoder-tui"),
    );
  });
  test("uses APPDATA on windows", () => {
    expect(
      configDir("win32", { APPDATA: "C:\\Users\\x\\AppData\\Roaming" }),
    ).toBe(path.join("C:\\Users\\x\\AppData\\Roaming", "atcoder-tui"));
  });
});

describe("cacheDir", () => {
  test("honors XDG_CACHE_HOME", () => {
    expect(cacheDir("linux", { XDG_CACHE_HOME: "/xdg/cache" })).toBe(
      path.join("/xdg/cache", "atcoder-tui"),
    );
  });
  test("uses LOCALAPPDATA on windows", () => {
    expect(
      cacheDir("win32", { LOCALAPPDATA: "C:\\Users\\x\\AppData\\Local" }),
    ).toBe(path.join("C:\\Users\\x\\AppData\\Local", "atcoder-tui", "cache"));
  });
});

describe("browserCommand", () => {
  test("per platform", () => {
    expect(browserCommand("https://atcoder.jp", "linux")).toEqual([
      "xdg-open",
      ["https://atcoder.jp"],
    ]);
    expect(browserCommand("https://atcoder.jp", "darwin")).toEqual([
      "open",
      ["https://atcoder.jp"],
    ]);
    expect(browserCommand("https://atcoder.jp", "win32")).toEqual([
      "cmd",
      ["/c", "start", "", "https://atcoder.jp"],
    ]);
  });
});
