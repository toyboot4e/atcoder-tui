import { homedir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

export type Platform = NodeJS.Platform;

/**
 * Empty or relative env values are ignored (per the XDG spec, and so a
 * stray `XDG_CACHE_HOME=` can never make us write into the CWD).
 */
function envDir(env: NodeJS.ProcessEnv, name: string, platform: Platform): string | undefined {
  const value = env[name];
  const isAbsolute = platform === "win32" ? path.win32.isAbsolute : path.posix.isAbsolute;
  if (value === undefined || value === "" || !isAbsolute(value)) return undefined;
  return value;
}

export function configDir(
  platform: Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (platform === "win32") {
    const base = envDir(env, "APPDATA", platform) ?? path.join(homedir(), "AppData", "Roaming");
    return path.join(base, "atcoder-tui");
  }
  const base = envDir(env, "XDG_CONFIG_HOME", platform) ?? path.join(homedir(), ".config");
  return path.join(base, "atcoder-tui");
}

export function cacheDir(
  platform: Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (platform === "win32") {
    const base = envDir(env, "LOCALAPPDATA", platform) ?? path.join(homedir(), "AppData", "Local");
    return path.join(base, "atcoder-tui", "cache");
  }
  const base = envDir(env, "XDG_CACHE_HOME", platform) ?? path.join(homedir(), ".cache");
  return path.join(base, "atcoder-tui");
}

export function browserCommand(
  url: string,
  platform: Platform = process.platform,
): [string, string[]] {
  if (platform === "darwin") return ["open", [url]];
  // `start` treats the first quoted argument as a window title, hence the "".
  if (platform === "win32") return ["cmd", ["/c", "start", "", url]];
  return ["xdg-open", [url]];
}

export function openInBrowser(url: string): void {
  const [cmd, args] = browserCommand(url);
  const child = spawn(cmd, args, { detached: true, stdio: "ignore" });
  child.on("error", () => {});
  child.unref();
}
