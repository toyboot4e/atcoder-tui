import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadRoutes, saveRoutes } from "../src/state/persist.js";
import type { Route } from "../src/state/store.js";

const tempFile = () =>
  path.join(fs.mkdtempSync(path.join(os.tmpdir(), "atui-state-")), "state.json");

describe("route persistence", () => {
  test("round-trips a stack", () => {
    const file = tempFile();
    const routes: Route[] = [
      { screen: "dashboard" },
      { screen: "contest", contestId: "abc300", startsAt: 1, endsAt: 2 },
      { screen: "submission", contestId: "abc300", submissionId: "41039290" },
    ];
    saveRoutes(routes, file);
    expect(loadRoutes(file)).toEqual(routes);
  });

  test("missing file yields null", () => {
    expect(loadRoutes("/nonexistent/state.json")).toBeNull();
  });

  test("corrupt or foreign shapes yield null", () => {
    const file = tempFile();
    fs.writeFileSync(file, "{nope");
    expect(loadRoutes(file)).toBeNull();
    fs.writeFileSync(file, JSON.stringify({ routes: [{ screen: "evil" }] }));
    expect(loadRoutes(file)).toBeNull();
    fs.writeFileSync(
      file,
      JSON.stringify({
        routes: [{ screen: "contest", contestId: "x", startsAt: null, endsAt: null }],
      }),
    );
    expect(loadRoutes(file)).toBeNull(); // stack must be rooted at the dashboard
  });
});
