import { describe, expect, test } from "bun:test";
import { parseFavList } from "../src/scrape/fav.js";

describe("parseFavList", () => {
  test("extracts the embedded favs array", () => {
    const html = `<script>\n\t\t\tvar favs = ["rival_a","rival_b","rival_c"];\n\t\t\tvar favSet = arrayToSet(favs);</script>`;
    expect(parseFavList(html)).toEqual(["rival_a", "rival_b", "rival_c"]);
  });
  test("empty list and absent var", () => {
    expect(parseFavList("var favs = [];")).toEqual([]);
    expect(parseFavList("<html>no favorites here</html>")).toEqual([]);
  });
  test("does not match property access like this.favs", () => {
    expect(parseFavList('this.favs = ["x"]')).toEqual([]);
  });
  test("garbage stays out", () => {
    expect(parseFavList('var favs = ["ok", 42, ""];')).toEqual(["ok"]);
  });
});
