import chalk from "chalk";
import wrapAnsi from "wrap-ansi";
import type { Block, Inline, Section } from "./ast.js";
import { latexToUnicode } from "./latex.js";

/**
 * Sections → styled, pre-wrapped terminal lines. Plain string[] output keeps
 * scrolling (slice) and testing trivial. `<pre>` blocks are never wrapped so
 * rectangle-copying samples from the terminal stays clean.
 */
export function renderSections(sections: Section[], width: number): string[] {
  const lines: string[] = [];
  for (const section of sections) {
    if (section.title !== "") {
      if (lines.length > 0) lines.push("");
      lines.push(chalk.bold.magenta.underline(section.title));
      lines.push("");
    }
    for (const block of section.blocks) {
      lines.push(...renderBlock(block, width));
    }
  }
  // Collapse accidental double blanks.
  return lines.filter((line, i) => !(line === "" && lines[i - 1] === ""));
}

function renderBlock(block: Block, width: number): string[] {
  switch (block.kind) {
    case "paragraph":
      return [...wrap(renderInlines(block.inlines), width), ""];
    case "pre": {
      const gutter = chalk.gray("│ ");
      const body = renderInlines(block.inlines).replace(/\n$/, "");
      return [...body.split("\n").map((line) => gutter + line), ""];
    }
    case "list": {
      const lines: string[] = [];
      block.items.forEach((item, index) => {
        const marker = block.ordered ? `${index + 1}. ` : "• ";
        const indent = " ".repeat(marker.length);
        const wrapped = wrap(
          renderInlines(item),
          Math.max(10, width - marker.length),
        );
        wrapped.forEach((line, i) =>
          lines.push((i === 0 ? marker : indent) + line),
        );
      });
      lines.push("");
      return lines;
    }
    case "heading":
      return [chalk.bold.underline(block.text), ""];
    case "rule":
      return [chalk.gray("─".repeat(Math.max(1, width))), ""];
  }
}

function wrap(text: string, width: number): string[] {
  return wrapAnsi(text, Math.max(10, width), { trim: false, hard: true })
    .split("\n")
    .map((line) => line.trimEnd());
}

export function renderInlines(inlines: Inline[]): string {
  return inlines
    .map((inline) => {
      switch (inline.kind) {
        case "text":
          return inline.text;
        case "math": {
          const converted = latexToUnicode(inline.latex);
          // Unconvertible math stays raw LaTeX, marked yellow so it is
          // recognizable as source rather than a rendering bug.
          return converted.exact
            ? converted.text
            : chalk.yellow(converted.text);
        }
        case "code":
          return chalk.cyan(inline.text);
        case "strong":
          return chalk.bold(renderInlines(inline.inlines));
        case "em":
          return chalk.italic(renderInlines(inline.inlines));
        case "break":
          return "\n";
      }
    })
    .join("");
}
