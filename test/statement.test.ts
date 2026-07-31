import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { inlineText, type Block } from "../src/render/ast.js";
import { parseStatement } from "../src/scrape/statement.js";

const fixture = (name: string) =>
  fs.readFileSync(
    path.join(import.meta.dir, "fixtures", `${name}.html`),
    "utf8",
  );

const blockText = (block: Block): string => {
  switch (block.kind) {
    case "paragraph":
    case "pre":
      return inlineText(block.inlines);
    case "list":
      return block.items.map(inlineText).join("\n");
    case "heading":
      return block.text;
    case "rule":
      return "";
  }
};

describe("parseStatement: abc300_a (modern bilingual)", () => {
  const statement = parseStatement(fixture("abc300_a"));

  test("section titles in both languages", () => {
    expect(statement.en).not.toBeNull();
    expect(statement.en!.map((s) => s.title)).toEqual([
      "",
      "Problem Statement",
      "Constraints",
      "Input",
      "Output",
      "Sample Input 1",
      "Sample Output 1",
      "Sample Input 2",
      "Sample Output 2",
      "Sample Input 3",
      "Sample Output 3",
    ]);
    expect(statement.ja.map((s) => s.title)).toContain("問題文");
    expect(statement.ja.map((s) => s.title)).toContain("入力例 1");
  });

  test("leading score pseudo-section", () => {
    expect(statement.en![0]!.title).toBe("");
    expect(blockText(statement.en![0]!.blocks[0]!)).toContain("100");
  });

  test("problem statement contains math inlines", () => {
    const problem = statement.en!.find((s) => s.title === "Problem Statement")!;
    const para = problem.blocks[0]!;
    expect(para.kind).toBe("paragraph");
    expect(
      para.kind === "paragraph" && para.inlines.some((i) => i.kind === "math"),
    ).toBe(true);
  });

  test("sample input is a verbatim pre block", () => {
    const sample = statement.en!.find((s) => s.title === "Sample Input 1")!;
    const pre = sample.blocks[0]!;
    expect(pre.kind).toBe("pre");
    expect(blockText(pre)).toBe("3 125 175\n200 300 400\n");
  });

  test("input format pre keeps embedded math", () => {
    const input = statement.en!.find((s) => s.title === "Input")!;
    const pre = input.blocks.find((b) => b.kind === "pre")!;
    expect(
      pre.kind === "pre" && pre.inlines.some((i) => i.kind === "math"),
    ).toBe(true);
  });
});

describe("parseStatement: abc042_a (early bilingual)", () => {
  const statement = parseStatement(fixture("abc042_a"));
  test("both languages parsed", () => {
    expect(statement.ja.map((s) => s.title)).toContain("問題文");
    expect(statement.en!.map((s) => s.title)).toContain("Problem Statement");
  });
});

describe("parseStatement: abc001_1 (no lang spans, h3 outside section)", () => {
  const statement = parseStatement(fixture("abc001_1"));

  test("english is unavailable", () => {
    expect(statement.en).toBeNull();
  });

  test("japanese sections are found despite the inverted structure", () => {
    const titles = statement.ja.map((s) => s.title);
    expect(titles).toContain("問題文");
    expect(titles).toContain("入力");
    expect(titles).toContain("入力例 1");
    const problem = statement.ja.find((s) => s.title === "問題文")!;
    expect(problem.blocks.length).toBeGreaterThan(0);
    expect(problem.blocks.map(blockText).join(" ")).toContain("積雪深差");
  });

  test("sample pre content survives verbatim", () => {
    const sample = statement.ja.find((s) => s.title === "入力例 1")!;
    expect(blockText(sample.blocks[0]!)).toContain("15");
  });
});
