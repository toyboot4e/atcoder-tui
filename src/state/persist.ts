import { type Language } from "../config.js";
import { type Route } from "./store.js";
import fs from "node:fs";
import path from "node:path";
import { stateFilePath } from "../platform.js";

export interface PersistedState {
  routes: Route[];
  language?: Language;
}

/**
 * The route stack is persisted on every navigation so quitting anywhere and
 * relaunching lands on the same screen. Invalid/corrupt state falls back to
 * the dashboard — restore must never be able to break startup.
 */
export function loadState(file: string = stateFilePath()): PersistedState | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
  const { routes } = parsed as { routes?: unknown };
  if (!Array.isArray(routes) || routes.length === 0) return null;

  const valid = routes.every((route: unknown) => {
    if (typeof route !== "object" || route === null) return false;
    const r = route as Record<string, unknown>;
    switch (r["screen"]) {
      case "dashboard": {
        return true;
      }
      case "contest": {
        return (
          typeof r["contestId"] === "string" &&
          (r["startsAt"] === null || typeof r["startsAt"] === "number") &&
          (r["endsAt"] === null || typeof r["endsAt"] === "number")
        );
      }
      case "submission": {
        return (
          typeof r["contestId"] === "string" &&
          typeof r["submissionId"] === "string" &&
          (r["summary"] === undefined || typeof r["summary"] === "object")
        );
      }
      default: {
        return false;
      }
    }
  });
  if (!valid || (routes[0] as { screen?: unknown }).screen !== "dashboard") return null;
  const { language } = parsed as { language?: unknown };
  return {
    routes: routes as Route[],
    ...(language === "en" || language === "ja" ? { language } : {}),
  };
}

export function saveState(state: PersistedState, file: string = stateFilePath()): void {
  try {
    // Set ATCODER_TUI_DEBUG_STATE=/path to trace every state write with a
    // stack — kept for hunting a rare unexplained dashboard-reset.
    const debugPath = process.env["ATCODER_TUI_DEBUG_STATE"];
    if (debugPath !== undefined && debugPath !== "") {
      fs.appendFileSync(
        debugPath,
        `${JSON.stringify({ routes: state.routes.map((r) => r.screen), t: Date.now() })}\n${new Error("trace").stack}\n`,
      );
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(state)}\n`);
  } catch {
    // State persistence must never break the app.
  }
}
