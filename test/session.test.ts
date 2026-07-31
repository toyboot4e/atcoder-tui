import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findSessionCandidates, maskSession, saveSession } from "../src/session.js";

const OJ_JAR = `#LWP-Cookies-2.0
Set-Cookie3: REVEL_SESSION="0123456789abcdef%00fake%3Dvalue"; path="/"; domain="atcoder.jp"; path_spec; domain_dot; secure; expires="2026-12-31 00:00:00Z"; version=0
`;

const ACC_JSON = `{"cookies":["REVEL_SESSION=fedcba9876543210fakevalue; Path=/; Secure; HttpOnly"]}`;

function tempHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "atui-home-"));
}

describe("findSessionCandidates", () => {
  test("empty home finds nothing", () => {
    expect(findSessionCandidates(tempHome())).toEqual([]);
  });

  test("parses oj LWP jar with expiry", () => {
    const home = tempHome();
    const jarDir = path.join(home, ".local", "share", "online-judge-tools");
    fs.mkdirSync(jarDir, { recursive: true });
    fs.writeFileSync(path.join(jarDir, "cookie.jar"), OJ_JAR);
    const found = findSessionCandidates(home);
    expect(found).toHaveLength(1);
    expect(found[0]!.source).toContain("oj");
    expect(found[0]!.value).toBe("0123456789abcdef%00fake%3Dvalue");
    expect(found[0]!.expires).toBe("2026-12-31 00:00:00Z");
  });

  test("parses acc session.json", () => {
    const home = tempHome();
    const accDir = path.join(home, ".config", "atcoder-cli-nodejs");
    fs.mkdirSync(accDir, { recursive: true });
    fs.writeFileSync(path.join(accDir, "session.json"), ACC_JSON);
    const found = findSessionCandidates(home);
    expect(found).toHaveLength(1);
    expect(found[0]!.source).toContain("acc");
    expect(found[0]!.value).toBe("fedcba9876543210fakevalue");
  });

  test("oj is preferred (listed first) when both exist", () => {
    const home = tempHome();
    fs.mkdirSync(path.join(home, ".local", "share", "online-judge-tools"), { recursive: true });
    fs.writeFileSync(path.join(home, ".local", "share", "online-judge-tools", "cookie.jar"), OJ_JAR);
    fs.mkdirSync(path.join(home, ".config", "atcoder-cli-nodejs"), { recursive: true });
    fs.writeFileSync(path.join(home, ".config", "atcoder-cli-nodejs", "session.json"), ACC_JSON);
    const found = findSessionCandidates(home);
    expect(found).toHaveLength(2);
    expect(found[0]!.source).toContain("oj");
  });
});

describe("saveSession", () => {
  test("creates config preserving nothing (fresh)", () => {
    const file = path.join(tempHome(), "config.json");
    saveSession("abc", file);
    expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual({ revelSession: "abc" });
  });

  test("preserves existing fields", () => {
    const file = path.join(tempHome(), "config.json");
    fs.writeFileSync(file, JSON.stringify({ userId: "example_user", language: "ja" }));
    saveSession("abc", file);
    expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual({
      userId: "example_user",
      language: "ja",
      revelSession: "abc",
    });
  });
});

describe("maskSession", () => {
  test("never reveals the middle", () => {
    const masked = maskSession("0123456789abcdefghij");
    expect(masked).toBe("012345…ghij (20 chars)");
    expect(maskSession("short")).toBe("…");
  });
});
