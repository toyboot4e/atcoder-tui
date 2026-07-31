import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { autoImportSession } from "../src/autoSession.js";
import { AtcoderClient } from "../src/net/http.js";
import { LoadMeter } from "../src/net/load.js";
import { Notices } from "../src/state/notices.js";

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function homeWithAccSession(value: string): string {
  const home = tempDir("atui-auto-home-");
  const accDir = path.join(home, ".config", "atcoder-cli-nodejs");
  fs.mkdirSync(accDir, { recursive: true });
  fs.writeFileSync(accDir + "/session.json", `{"cookies":["REVEL_SESSION=${value}; Path=/; Secure"]}`);
  return home;
}

function makeClient(validCookie: string | null) {
  let now = 1_000_000;
  const seen: Array<string | null> = [];
  const client = new AtcoderClient({
    meter: new LoadMeter(null, () => now),
    cache: null,
    clock: () => now,
    sleep: async (ms) => {
      now += ms;
    },
    fetchImpl: async (_url, init) => {
      const cookie = new Headers(init?.headers).get("cookie");
      seen.push(cookie);
      if (validCookie !== null && cookie === `REVEL_SESSION=${validCookie}`) {
        return new Response("settings page", { status: 200 });
      }
      return new Response(null, { status: 302, headers: { location: "https://atcoder.jp/login" } });
    },
  });
  return { client, seen };
}

describe("autoImportSession", () => {
  test("adopts and saves a valid stored session, notifies", async () => {
    const home = homeWithAccSession("goodcookie123");
    const configPath = path.join(tempDir("atui-auto-cfg-"), "config.json");
    const { client } = makeClient("goodcookie123");
    const notices = new Notices();
    const messages: string[] = [];
    notices.subscribe((m) => messages.push(m));

    await autoImportSession({ client, notices, configuredSession: undefined, home, configPath });

    expect(client.getCookie()).toBe("goodcookie123");
    expect(JSON.parse(fs.readFileSync(configPath, "utf8"))).toEqual({ revelSession: "goodcookie123" });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("imported from acc");
  });

  test("expired stored session notifies without saving", async () => {
    const home = homeWithAccSession("stalecookie");
    const configPath = path.join(tempDir("atui-auto-cfg-"), "config.json");
    const { client } = makeClient(null);
    const notices = new Notices();

    await autoImportSession({ client, notices, configuredSession: undefined, home, configPath });

    expect(client.getCookie()).toBeUndefined(); // reverted
    expect(fs.existsSync(configPath)).toBe(false);
    expect(notices.latest).toContain("expired");
  });

  test("no-op when a session is already configured", async () => {
    const home = homeWithAccSession("whatever");
    const { client, seen } = makeClient(null);
    const notices = new Notices();

    await autoImportSession({ client, notices, configuredSession: "configured", home });

    expect(seen).toHaveLength(0); // no network traffic at all
    expect(notices.latest).toBeNull();
  });

  test("network failure stays silent (no false expiry claim)", async () => {
    const home = homeWithAccSession("unknowable");
    const configPath = path.join(tempDir("atui-auto-cfg-"), "config.json");
    let now = 0;
    const client = new AtcoderClient({
      meter: new LoadMeter(null, () => now),
      cache: null,
      clock: () => now,
      sleep: async (ms) => {
        now += ms;
      },
      fetchImpl: async () => {
        throw new Error("offline");
      },
    });
    const notices = new Notices();

    await autoImportSession({ client, notices, configuredSession: undefined, home, configPath });

    expect(notices.latest).toBeNull();
    expect(fs.existsSync(configPath)).toBe(false);
  });

  test("silent when nothing is importable", async () => {
    const { client, seen } = makeClient(null);
    const notices = new Notices();
    await autoImportSession({ client, notices, configuredSession: undefined, home: tempDir("atui-empty-") });
    expect(seen).toHaveLength(0);
    expect(notices.latest).toBeNull();
  });
});
