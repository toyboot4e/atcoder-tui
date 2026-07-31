import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadServerFavs, saveServerFavs } from "../src/favstore.js";

const tempFile = () =>
  path.join(fs.mkdtempSync(path.join(os.tmpdir(), "atui-favs-")), "favorites.json");

describe("server favs cache", () => {
  test("round-trips", () => {
    const file = tempFile();
    saveServerFavs({ users: ["rival_a", "rival_b"], syncedAt: 1234 }, file);
    expect(loadServerFavs(file)).toEqual({ users: ["rival_a", "rival_b"], syncedAt: 1234 });
  });
  test("missing or corrupt yields null", () => {
    expect(loadServerFavs("/nonexistent/favorites.json")).toBeNull();
    const file = tempFile();
    fs.writeFileSync(file, "{nope");
    expect(loadServerFavs(file)).toBeNull();
    fs.writeFileSync(file, JSON.stringify({ users: "not-array", syncedAt: 1 }));
    expect(loadServerFavs(file)).toBeNull();
  });
});
