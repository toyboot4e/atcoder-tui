import { describe, expect, test } from "bun:test";
import { loadServerFavs, saveServerFavs } from "../src/favstore.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tempFile = () =>
  path.join(fs.mkdtempSync(path.join(os.tmpdir(), "atui-favs-")), "favorites.json");

describe("server favs cache", () => {
  test("round-trips", () => {
    const file = tempFile();
    saveServerFavs({ syncedAt: 1234, users: ["rival_a", "rival_b"] }, file);
    expect(loadServerFavs(file)).toEqual({ syncedAt: 1234, users: ["rival_a", "rival_b"] });
  });
  test("missing or corrupt yields null", () => {
    expect(loadServerFavs("/nonexistent/favorites.json")).toBeNull();
    const file = tempFile();
    fs.writeFileSync(file, "{nope");
    expect(loadServerFavs(file)).toBeNull();
    fs.writeFileSync(file, JSON.stringify({ syncedAt: 1, users: "not-array" }));
    expect(loadServerFavs(file)).toBeNull();
  });
});
