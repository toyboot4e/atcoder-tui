import fs from "node:fs";
import path from "node:path";
import { stateFilePath } from "../platform.js";
import type { Route } from "./store.js";

/**
 * The route stack is persisted on every navigation so quitting anywhere and
 * relaunching lands on the same screen. Invalid/corrupt state falls back to
 * the dashboard — restore must never be able to break startup.
 */
export function loadRoutes(file: string = stateFilePath()): Route[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
  const routes = (parsed as { routes?: unknown }).routes;
  if (!Array.isArray(routes) || routes.length === 0) return null;

  const valid = routes.every((route: unknown) => {
    if (typeof route !== "object" || route === null) return false;
    const r = route as Record<string, unknown>;
    switch (r["screen"]) {
      case "dashboard":
        return true;
      case "contest":
        return (
          typeof r["contestId"] === "string" &&
          (r["startsAt"] === null || typeof r["startsAt"] === "number") &&
          (r["endsAt"] === null || typeof r["endsAt"] === "number")
        );
      case "submission":
        return typeof r["contestId"] === "string" && typeof r["submissionId"] === "string";
      default:
        return false;
    }
  });
  if (!valid || (routes[0] as { screen?: unknown }).screen !== "dashboard") return null;
  return routes as Route[];
}

export function saveRoutes(routes: Route[], file: string = stateFilePath()): void {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ routes }) + "\n");
  } catch {
    // State persistence must never break the app.
  }
}
