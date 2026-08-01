import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { configFilePath, updateConfigField } from "./config.js";

export interface SessionCandidate {
  /** Human-readable origin, e.g. "oj (~/.local/share/…/cookie.jar)". */
  source: string;
  value: string;
  expires?: string;
}

/**
 * Looks for an existing AtCoder REVEL_SESSION in the cookie stores of
 * common CLI tools (online-judge-tools, atcoder-cli). Read-only.
 */
export function findSessionCandidates(home: string = os.homedir()): SessionCandidate[] {
  const candidates: SessionCandidate[] = [];

  // oj (online-judge-tools): LWP cookie jar.
  for (const jar of [
    path.join(home, ".local", "share", "online-judge-tools", "cookie.jar"),
    path.join(home, "AppData", "Local", "online-judge-tools", "online-judge-tools", "cookie.jar"),
  ]) {
    try {
      const text = fs.readFileSync(jar, "utf8");
      const m = /REVEL_SESSION="(?<value>(?:\\.|[^"\\])*)"/u.exec(text);
      if (m !== null) {
        const expires = /REVEL_SESSION="[^\n]*?expires="(?<date>[^"]*)"/u.exec(text)?.groups![
          "date"
        ];
        candidates.push({
          source: `oj (${jar})`,
          value: m.groups!["value"]!.replaceAll(/\\(?<esc>.)/gu, "$<esc>"),
          ...(expires !== undefined ? { expires } : {}),
        });
      }
    } catch {
      // absent or unreadable — skip
    }
  }

  // acc (atcoder-cli): session.json holding cookie strings.
  for (const file of [
    path.join(home, ".config", "atcoder-cli-nodejs", "session.json"),
    path.join(home, "AppData", "Roaming", "atcoder-cli-nodejs", "session.json"),
  ]) {
    try {
      const text = fs.readFileSync(file, "utf8");
      const m = /REVEL_SESSION=(?<value>[^;"\\\s]+)/u.exec(text);
      if (m !== null) {
        candidates.push({ source: `acc (${file})`, value: m.groups!["value"]! });
      }
    } catch {
      // absent or unreadable — skip
    }
  }

  return candidates;
}

/** Writes revelSession into the config file, preserving comments and fields. */
export function saveSession(value: string, filePath: string = configFilePath()): string {
  updateConfigField("revelSession", value, filePath);
  return filePath;
}

export function maskSession(value: string): string {
  if (value.length <= 10) return "…";
  return `${value.slice(0, 6)}…${value.slice(-4)} (${value.length} chars)`;
}

/**
 * One polite request to a login-gated page: 200 means the session works,
 * a redirect to /login means it is missing/expired.
 */
export async function checkSession(value: string): Promise<boolean> {
  const response = await fetch("https://atcoder.jp/settings", {
    headers: {
      "User-Agent":
        "atcoder-tui/0.1 (unofficial read-only viewer; +https://github.com/toyboot4e/atcoder-tui)",
      Cookie: `REVEL_SESSION=${value}`,
    },
    redirect: "manual",
  });
  await response.text();
  return response.status === 200;
}
