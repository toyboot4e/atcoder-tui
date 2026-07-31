import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadState, saveState } from "../src/state/persist.js";
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
    saveState({ routes, language: "ja" }, file);
    expect(loadState(file)).toEqual({ routes, language: "ja" });
  });

  test("missing file yields null", () => {
    expect(loadState("/nonexistent/state.json")).toBeNull();
  });

  test("corrupt or foreign shapes yield null", () => {
    const file = tempFile();
    fs.writeFileSync(file, "{nope");
    expect(loadState(file)).toBeNull();
    fs.writeFileSync(file, JSON.stringify({ routes: [{ screen: "evil" }] }));
    expect(loadState(file)).toBeNull();
    fs.writeFileSync(
      file,
      JSON.stringify({
        routes: [{ screen: "contest", contestId: "x", startsAt: null, endsAt: null }],
      }),
    );
    expect(loadState(file)).toBeNull(); // stack must be rooted at the dashboard
  });
});
