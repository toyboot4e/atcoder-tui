import { homedir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

export type Platform = NodeJS.Platform;

export function configDir(platform: Platform = process.platform, env: NodeJS.ProcessEnv = process.env): string {
  if (platform === "win32") {
    const base = env["APPDATA"] ?? path.join(homedir(), "AppData", "Roaming");
    return path.join(base, "atcoder-tui");
  }
  const base = env["XDG_CONFIG_HOME"] ?? path.join(homedir(), ".config");
  return path.join(base, "atcoder-tui");
}

export function cacheDir(platform: Platform = process.platform, env: NodeJS.ProcessEnv = process.env): string {
  if (platform === "win32") {
    const base = env["LOCALAPPDATA"] ?? path.join(homedir(), "AppData", "Local");
    return path.join(base, "atcoder-tui", "cache");
  }
  const base = env["XDG_CACHE_HOME"] ?? path.join(homedir(), ".cache");
  return path.join(base, "atcoder-tui");
}

export function browserCommand(url: string, platform: Platform = process.platform): [string, string[]] {
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
