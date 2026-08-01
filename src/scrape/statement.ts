import * as cheerio from "cheerio";
import { type AnyNode, type Element, isTag, isText } from "domhandler";
import { type Block, type Inline, type Section, type Statement } from "../render/ast.js";

/**
 * Parses `#task-statement` into a bilingual statement AST.
 *
 * Two structural generations exist:
 * - modern (abc042+): span.lang-ja / span.lang-en wrappers, each containing
 *   `<section><h3>Title</h3>...</section>` (h3 inside the section);
 * - abc001-era: no lang wrappers, and `<h3>Title</h3><section>...</section>`
 *   as siblings (h3 outside the section).
 */
export function parseStatement(html: string): Statement {
  const $ = cheerio.load(html);
  const root = $("#task-statement");
  const ja = root.find("span.lang-ja").first();
  const en = root.find("span.lang-en").first();

  if (ja.length === 0 && en.length === 0) {
    return { en: null, ja: parseSections($, root) };
  }
  return {
    en: en.length > 0 ? parseSections($, en) : null,
    ja: ja.length > 0 ? parseSections($, ja) : [],
  };
}

/** Parses a loose HTML fragment (e.g. #contest-statement) into sections. */
export function parseFragmentSections(html: string): Section[] {
  const $ = cheerio.load(`<div id="__fragment_root">${html}</div>`);
  return parseSections($, $("#__fragment_root"));
}

type Cheerio = ReturnType<cheerio.CheerioAPI>;

function parseSections($: cheerio.CheerioAPI, container: Cheerio): Section[] {
  const sections: Section[] = [];
  let current: Section = { blocks: [], title: "" };
  const flush = () => {
    if (current.title !== "" || current.blocks.length > 0) sections.push(current);
  };

  const walk = (nodes: AnyNode[]) => {
    for (const node of nodes) {
      if (!isTag(node)) {
        // Loose top-level text (rare); fold into the current section.
        const text = $(node).text().trim();
        if (text !== "")
          current.blocks.push({
            inlines: [{ kind: "text", text }],
            kind: "paragraph",
          });
        continue;
      }
      const el = node;
      const name = el.tagName.toLowerCase();
      if (name === "h3") {
        // Both generations: an h3 (wherever it sits) starts a new section.
        flush();
        current = { blocks: [], title: $(el).text().trim() };
      } else if (name === "section" || name === "div" || name === "span") {
        walk($(el).contents().toArray());
      } else {
        const block = parseBlock($, el);
        if (block !== null) current.blocks.push(...block);
      }
    }
  };

  walk(container.contents().toArray());
  flush();
  return sections;
}

function parseBlock($: cheerio.CheerioAPI, el: Element): Block[] | null {
  const name = el.tagName.toLowerCase();
  switch (name) {
    case "p": {
      const inlines = parseInlines($, $(el).contents().toArray());
      return inlines.length > 0 ? [{ inlines, kind: "paragraph" }] : null;
    }
    case "pre": {
      return [
        {
          inlines: parseInlines($, $(el).contents().toArray(), true),
          kind: "pre",
        },
      ];
    }
    case "ul":
    case "ol": {
      const items: Inline[][] = [];
      $(el)
        .children("li")
        .each((_, li) => {
          items.push(parseInlines($, $(li).contents().toArray()));
        });
      return [{ items, kind: "list", ordered: name === "ol" }];
    }
    case "h4":
    case "h5": {
      return [
        {
          kind: "heading",
          level: name === "h4" ? 4 : 5,
          text: $(el).text().trim(),
        },
      ];
    }
    case "hr": {
      return [{ kind: "rule" }];
    }
    case "blockquote":
    case "details": {
      const blocks: Block[] = [];
      $(el)
        .children()
        .each((_, child) => {
          const parsed = parseBlock($, child);
          if (parsed !== null) blocks.push(...parsed);
        });
      return blocks;
    }
    case "table": {
      // Rare in statements; degrade to text so nothing is silently dropped.
      return [
        {
          inlines: [{ kind: "text", text: $(el).text().replaceAll(/\s+/gu, " ").trim() }],
          kind: "paragraph",
        },
      ];
    }
    case "script":
    case "style": {
      return null;
    }
    default: {
      const inlines = parseInlines($, [el]);
      return inlines.length > 0 ? [{ inlines, kind: "paragraph" }] : null;
    }
  }
}

/** `verbatim` preserves whitespace/newlines (inside <pre>). */
function parseInlines($: cheerio.CheerioAPI, nodes: AnyNode[], verbatim = false): Inline[] {
  const inlines: Inline[] = [];
  for (const node of nodes) {
    if (isText(node)) {
      const raw = $(node).text();
      const text = verbatim ? raw : raw.replaceAll(/\s+/gu, " ");
      if (text !== "") inlines.push({ kind: "text", text });
      continue;
    }
    if (!isTag(node)) continue;
    const el = node;
    const name = el.tagName.toLowerCase();
    const children = () => parseInlines($, $(el).contents().toArray(), verbatim);
    switch (name) {
      case "var": {
        inlines.push({ kind: "math", latex: $(el).text().trim() });
        break;
      }
      case "code": {
        inlines.push({ kind: "code", text: $(el).text() });
        break;
      }
      case "strong":
      case "b": {
        inlines.push({ inlines: children(), kind: "strong" });
        break;
      }
      case "em":
      case "i": {
        inlines.push({ inlines: children(), kind: "em" });
        break;
      }
      case "br": {
        inlines.push({ kind: "break" });
        break;
      }
      case "img": {
        // Terminals can't show the image: fall back to alt text plus the
        // URL so it can be opened in a browser.
        const alt = $(el).attr("alt");
        const src = $(el).attr("src") ?? "";
        const url = src.startsWith("//") ? `https:${src}` : src;
        const label = alt !== undefined && alt !== "" ? `[img: ${alt}]` : "[img]";
        inlines.push({ kind: "text", text: url !== "" ? `${label} <${url}>` : label });
        break;
      }
      default: {
        inlines.push(...children());
      }
    }
  }
  // Trim leading/trailing pure-whitespace runs in prose context.
  if (!verbatim) {
    while (
      inlines.length > 0 &&
      inlines[0]!.kind === "text" &&
      (inlines[0] as { text: string }).text.trim() === ""
    ) {
      inlines.shift();
    }
    while (
      inlines.length > 0 &&
      inlines.at(-1)!.kind === "text" &&
      (inlines.at(-1) as { text: string }).text.trim() === ""
    ) {
      inlines.pop();
    }
  }
  return inlines;
}
