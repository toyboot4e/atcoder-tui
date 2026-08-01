import { describe, expect, test } from "bun:test";
import { loadState, saveState } from "../src/state/persist.js";
import { type Route } from "../src/state/store.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tempFile = () =>
  path.join(fs.mkdtempSync(path.join(os.tmpdir(), "atui-state-")), "state.json");

describe("route persistence", () => {
  test("round-trips a stack", () => {
    const file = tempFile();
    const routes: Route[] = [
      { screen: "dashboard" },
      { contestId: "abc300", endsAt: 2, screen: "contest", startsAt: 1 },
      { contestId: "abc300", screen: "submission", submissionId: "41039290" },
    ];
    saveState({ language: "ja", routes }, file);
    expect(loadState(file)).toEqual({ language: "ja", routes });
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
        routes: [{ contestId: "x", endsAt: null, screen: "contest", startsAt: null }],
      }),
    );
    expect(loadState(file)).toBeNull(); // stack must be rooted at the dashboard
  });
});
