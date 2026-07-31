/** Terminal-renderable statement AST, produced by scrape/statement.ts. */

export type Inline =
  | { kind: "text"; text: string }
  /** Raw KaTeX source from a <var> element; converted by render/latex.ts. */
  | { kind: "math"; latex: string }
  | { kind: "code"; text: string }
  | { kind: "strong"; inlines: Inline[] }
  | { kind: "em"; inlines: Inline[] }
  | { kind: "break" };

export type Block =
  | { kind: "paragraph"; inlines: Inline[] }
  /** Verbatim block (samples, IO format). Never wrapped. May contain math. */
  | { kind: "pre"; inlines: Inline[] }
  | { kind: "list"; ordered: boolean; items: Inline[][] }
  | { kind: "heading"; level: number; text: string }
  | { kind: "rule" };

export interface Section {
  /** Localized h3 text; empty for the leading score pseudo-section. */
  title: string;
  blocks: Block[];
}

export interface Statement {
  ja: Section[];
  /** Null when the problem predates bilingual statements. */
  en: Section[] | null;
}

export function inlineText(inlines: Inline[]): string {
  return inlines
    .map((inline) => {
      switch (inline.kind) {
        case "text":
          return inline.text;
        case "math":
          return inline.latex;
        case "code":
          return inline.text;
        case "strong":
        case "em":
          return inlineText(inline.inlines);
        case "break":
          return "\n";
      }
    })
    .join("");
}
