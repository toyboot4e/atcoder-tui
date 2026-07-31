import fs from "node:fs";
import path from "node:path";
import { configDir } from "./platform.js";

export type Language = "en" | "ja";

export interface Config {
  /** AtCoder user ID for the submissions view. */
  userId?: string;
  language: Language;
  /** REVEL_SESSION cookie value pasted from a logged-in browser. */
  revelSession?: string;
  /** Disk cache toggle; rate limiting applies regardless. */
  cache: boolean;
  /** Rolling-window request budget toward atcoder.jp. */
  requestsPerMinute: number;
}

export const DEFAULT_CONFIG: Config = {
  language: "en",
  cache: true,
  requestsPerMinute: 20,
};

export interface LoadedConfig {
  config: Config;
  /** Human-readable problems found while loading, for the status bar. */
  warnings: string[];
  path: string;
}

export function configFilePath(): string {
  return path.join(configDir(), "config.json");
}

export function loadConfig(filePath: string = configFilePath()): LoadedConfig {
  const warnings: string[] = [];
  const config: Config = { ...DEFAULT_CONFIG };

  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    return { config, warnings, path: filePath };
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    warnings.push(`config: invalid JSON in ${filePath}, using defaults`);
    return { config, warnings, path: filePath };
  }
  if (typeof data !== "object" || data === null) {
    warnings.push(`config: expected an object in ${filePath}, using defaults`);
    return { config, warnings, path: filePath };
  }

  const obj = data as Record<string, unknown>;
  if (typeof obj["userId"] === "string" && obj["userId"] !== "") {
    config.userId = obj["userId"];
  }
  if (obj["language"] === "en" || obj["language"] === "ja") {
    config.language = obj["language"];
  } else if (obj["language"] !== undefined) {
    warnings.push(`config: language must be "en" or "ja"`);
  }
  if (typeof obj["revelSession"] === "string" && obj["revelSession"] !== "") {
    config.revelSession = obj["revelSession"];
  }
  if (typeof obj["cache"] === "boolean") {
    config.cache = obj["cache"];
  }
  if (typeof obj["requestsPerMinute"] === "number" && obj["requestsPerMinute"] >= 1) {
    // Never allow a config mistake to raise the budget above sanity.
    config.requestsPerMinute = Math.min(30, Math.floor(obj["requestsPerMinute"]));
  }

  return { config, warnings, path: filePath };
}
