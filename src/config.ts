import fs from "node:fs";
import path from "node:path";
import { applyEdits, modify, parse as parseJsonc, type ParseError } from "jsonc-parser";
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
  /** Manually starred user ids (imported atcoder.jp favs live in the cache). */
  favorites: string[];
}

export const DEFAULT_CONFIG: Config = {
  language: "en",
  cache: true,
  requestsPerMinute: 20,
  favorites: [],
};

export interface LoadedConfig {
  config: Config;
  /** Human-readable problems found while loading, for the status bar. */
  warnings: string[];
  path: string;
}

/** The config is JSONC only: comments and trailing commas welcome. */
export function configFilePath(): string {
  return path.join(configDir(), "config.jsonc");
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

  const errors: ParseError[] = [];
  const data: unknown = parseJsonc(raw, errors, { allowTrailingComma: true });
  if (errors.length > 0) {
    // jsonc-parser recovers what it can; say so rather than failing silently.
    warnings.push(`config: ${errors.length} syntax issue(s) in ${filePath}`);
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
  if (Array.isArray(obj["favorites"])) {
    config.favorites = obj["favorites"].filter(
      (name): name is string => typeof name === "string" && name !== "",
    );
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

/**
 * Surgically updates one top-level config field, preserving the user's
 * comments and formatting (the file is theirs; the app is only a guest).
 */
export function updateConfigField(
  key: string,
  value: unknown,
  filePath: string = configFilePath(),
): void {
  let raw = "";
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    raw = "{}\n";
  }
  if (raw.trim() === "") raw = "{}\n";
  const edits = modify(raw, [key], value, {
    formattingOptions: { insertSpaces: true, tabSize: 2 },
  });
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, applyEdits(raw, edits));
}

/** Persists the manual favorites list, preserving comments and fields. */
export function saveFavorites(favorites: string[], filePath: string = configFilePath()): void {
  updateConfigField("favorites", favorites, filePath);
}
