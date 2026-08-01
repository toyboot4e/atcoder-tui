import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import stringWidth from "string-width";
import { renderSections } from "../src/render/lines.js";
import { parseStatement } from "../src/scrape/statement.js";
import { type Section } from "../src/render/ast.js";

// Intentional control character: strips ANSI SGR sequences from chalk output.
// eslint-disable-next-line no-control-regex
const strip = (line: string) => line.replaceAll(/\u001B\[[0-9;]*m/gu, "");

describe("renderSections", () => {
  test("wraps prose to width", () => {
    const sections: Section[] = [
      {
        title: "Problem",
        blocks: [
          {
            kind: "paragraph",
            inlines: [{ kind: "text", text: "word ".repeat(20).trim() }],
          },
        ],
      },
    ];
    const lines = renderSections(sections, 30);
    for (const line of lines) {
      expect(stringWidth(strip(line))).toBeLessThanOrEqual(30);
    }
    expect(lines.filter((l) => strip(l).includes("word")).length).toBeGreaterThan(1);
  });

  test("wraps CJK full-width text correctly", () => {
    const sections: Section[] = [
      {
        title: "問題文",
        blocks: [
          {
            kind: "paragraph",
            inlines: [{ kind: "text", text: "高橋君は".repeat(20) }],
          },
        ],
      },
    ];
    const lines = renderSections(sections, 20);
    for (const line of lines) {
      expect(stringWidth(strip(line))).toBeLessThanOrEqual(20);
    }
  });

  test("pre blocks are never wrapped and keep a gutter", () => {
    const long = "1 ".repeat(40).trim();
    const sections: Section[] = [
      {
        title: "Sample Input 1",
        blocks: [{ kind: "pre", inlines: [{ kind: "text", text: `${long}\n2 3\n` }] }],
      },
    ];
    const lines = renderSections(sections, 20).map((line) => strip(line));
    const preLines = lines.filter((l) => l.startsWith("│ "));
    expect(preLines).toHaveLength(2);
    expect(preLines[0]).toBe(`│ ${long}`); // untouched, even though it overflows
    expect(preLines[1]).toBe("│ 2 3");
  });

  test("math inside pre is converted in place", () => {
    const sections: Section[] = [
      {
        title: "Input",
        blocks: [
          {
            kind: "pre",
            inlines: [
              { kind: "math", latex: "A_1" },
              { kind: "text", text: " " },
              { kind: "math", latex: "A_2" },
            ],
          },
        ],
      },
    ];
    const lines = renderSections(sections, 40).map((line) => strip(line));
    expect(lines.find((l) => l.startsWith("│ "))).toBe("│ A₁ A₂");
  });

  test("ordered list markers with hanging indent", () => {
    const sections: Section[] = [
      {
        title: "",
        blocks: [
          {
            kind: "list",
            ordered: true,
            items: [
              [{ kind: "text", text: "short" }],
              [{ kind: "text", text: "long ".repeat(10).trim() }],
            ],
          },
        ],
      },
    ];
    const lines = renderSections(sections, 24).map((line) => strip(line));
    expect(lines[0]).toBe("1. short");
    expect(lines[1]!.startsWith("2. ")).toBe(true);
    expect(lines[2]!.startsWith("   ")).toBe(true);
  });

  test("renders a real statement end to end", () => {
    const html = fs.readFileSync(path.join(import.meta.dir, "fixtures", "abc300_a.html"), "utf8");
    const statement = parseStatement(html);
    const lines = renderSections(statement.en!, 78).map((line) => strip(line));
    const text = lines.join("\n");
    expect(text).toContain("Problem Statement");
    expect(text).toContain("≤"); // constraints got unicode math
    expect(text).toContain("│ 3 125 175");
    expect(lines.length).toBeGreaterThan(20);
  });
});
