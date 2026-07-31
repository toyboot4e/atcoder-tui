/**
 * KaTeX-source → Unicode plain text for terminal display.
 *
 * All-or-nothing: if any construct is unknown the original LaTeX is returned
 * verbatim (`exact: false`) — a half-converted formula is worse than raw TeX.
 */

export interface ConvertedMath {
  text: string;
  exact: boolean;
}

/**
 * Relations and binary operators get their own padding (TeX ignores source
 * whitespace in math mode, so "2\times 10^5" and "2 \times 10^5" must render
 * identically); duplicate spaces are collapsed at the end.
 */
const PADDED = new Set([
  "≤", "≥", "≠", "≡", "∼", "≃", "≈", "∝", "≅", "<", ">",
  "∈", "∉", "∋", "⊂", "⊆", "⊃", "⊇", "∪", "∩", "∖",
  "×", "⋅", "÷", "±", "∓", "∧", "∨", "⊕", "⊗",
  "→", "←", "⇒", "⇐", "⇔", "↔", "↦",
]);

const SYMBOLS: Record<string, string> = {
  le: "≤", leq: "≤", ge: "≥", geq: "≥", ne: "≠", neq: "≠", lt: "<", gt: ">",
  times: "×", cdot: "⋅", div: "÷", pm: "±", mp: "∓",
  dots: "…", ldots: "…", cdots: "…", dotsc: "…", dotsb: "…", vdots: "⋮", ddots: "⋱",
  sum: "Σ", prod: "Π", infty: "∞", partial: "∂", nabla: "∇",
  equiv: "≡", sim: "∼", simeq: "≃", approx: "≈", propto: "∝", cong: "≅",
  in: "∈", notin: "∉", ni: "∋", subset: "⊂", subseteq: "⊆", supset: "⊃", supseteq: "⊇",
  cup: "∪", cap: "∩", setminus: "∖", emptyset: "∅", varnothing: "∅",
  forall: "∀", exists: "∃", neg: "¬", land: "∧", lor: "∨", oplus: "⊕", otimes: "⊗",
  to: "→", rightarrow: "→", leftarrow: "←", gets: "←", mapsto: "↦",
  Rightarrow: "⇒", Leftarrow: "⇐", Leftrightarrow: "⇔", leftrightarrow: "↔",
  uparrow: "↑", downarrow: "↓",
  mid: "∣", parallel: "∥", perp: "⊥", angle: "∠",
  lfloor: "⌊", rfloor: "⌋", lceil: "⌈", rceil: "⌉",
  langle: "⟨", rangle: "⟩",
  prime: "′", circ: "∘", degree: "°", bullet: "•", star: "⋆", ast: "∗",
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε",
  zeta: "ζ", eta: "η", theta: "θ", vartheta: "θ", iota: "ι", kappa: "κ",
  lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π", rho: "ρ", sigma: "σ",
  tau: "τ", upsilon: "υ", phi: "φ", varphi: "φ", chi: "χ", psi: "ψ", omega: "ω",
  Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π",
  Sigma: "Σ", Upsilon: "Υ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
  "{": "{", "}": "}", "%": "%", "&": "&", "#": "#", $: "$", _: "_",
  backslash: "\\", "|": "∥",
};

/** Commands rendered as their bare name (operators). */
const NAMED_OPERATORS = new Set([
  "min", "max", "gcd", "lcm", "log", "ln", "exp", "sin", "cos", "tan", "arg",
  "det", "dim", "inf", "sup", "lim", "mod",
]);

/** Commands that pass their argument through unchanged. */
const TRANSPARENT = new Set(["mathrm", "text", "textrm", "mathit", "mathsf", "mathtt", "operatorname", "mathopen", "mathclose"]);

/** Zero-argument commands that vanish. */
const IGNORED = new Set(["displaystyle", "textstyle", "scriptstyle", "left", "right", "big", "Big", "bigg", "Bigg", "limits", "nolimits", "quad", "qquad", "kern", "strut"]);

const MATHBB: Record<string, string> = { N: "ℕ", Z: "ℤ", Q: "ℚ", R: "ℝ", C: "ℂ" };

const SUPERSCRIPTS: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "-": "⁻", "−": "⁻", "=": "⁼", "(": "⁽", ")": "⁾",
  a: "ᵃ", b: "ᵇ", c: "ᶜ", d: "ᵈ", e: "ᵉ", f: "ᶠ", g: "ᵍ", h: "ʰ", i: "ⁱ", j: "ʲ",
  k: "ᵏ", l: "ˡ", m: "ᵐ", n: "ⁿ", o: "ᵒ", p: "ᵖ", r: "ʳ", s: "ˢ", t: "ᵗ", u: "ᵘ",
  v: "ᵛ", w: "ʷ", x: "ˣ", y: "ʸ", z: "ᶻ", T: "ᵀ",
};

const SUBSCRIPTS: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
  "+": "₊", "-": "₋", "−": "₋", "=": "₌", "(": "₍", ")": "₎",
  a: "ₐ", e: "ₑ", h: "ₕ", i: "ᵢ", j: "ⱼ", k: "ₖ", l: "ₗ", m: "ₘ", n: "ₙ",
  o: "ₒ", p: "ₚ", r: "ᵣ", s: "ₛ", t: "ₜ", u: "ᵤ", v: "ᵥ", x: "ₓ",
};

class Unsupported extends Error {}

class Parser {
  private pos = 0;
  constructor(private readonly src: string) {}

  parse(): string {
    const out = this.sequence(null);
    if (this.pos < this.src.length) throw new Unsupported("trailing input");
    return out;
  }

  /** Parses until `until` (exclusive) or end of input. */
  private sequence(until: string | null): string {
    let out = "";
    while (this.pos < this.src.length) {
      const ch = this.src[this.pos]!;
      if (ch === until) {
        this.pos += 1;
        return out;
      }
      if (ch === "}") throw new Unsupported("unbalanced brace");
      out += this.atomWithScripts();
    }
    if (until !== null) throw new Unsupported("unterminated group");
    return out;
  }

  /** One atom plus any ^/_ scripts attached to it. */
  private atomWithScripts(): string {
    let base = this.atom();
    for (;;) {
      const ch = this.src[this.pos];
      if (ch === "^") {
        this.pos += 1;
        const script = this.scriptGroup();
        base += mapScript(script, SUPERSCRIPTS, "^");
      } else if (ch === "_") {
        this.pos += 1;
        const script = this.scriptGroup();
        base += mapScript(script, SUBSCRIPTS, "_");
      } else {
        return base;
      }
    }
  }

  private atom(): string {
    const ch = this.src[this.pos]!;
    if (ch === "{") {
      this.pos += 1;
      return this.sequence("}");
    }
    if (ch === "\\") return this.command();
    this.pos += 1;
    if (ch === "~") return " ";
    return ch;
  }

  /** The (already converted) content of a ^/_ argument. */
  private scriptGroup(): string {
    if (this.pos >= this.src.length) throw new Unsupported("dangling script");
    if (this.src[this.pos] === "{") {
      this.pos += 1;
      return this.sequence("}");
    }
    return this.atom();
  }

  private argument(): string {
    while (this.src[this.pos] === " ") this.pos += 1;
    if (this.pos >= this.src.length) throw new Unsupported("missing argument");
    return this.atom();
  }

  private command(): string {
    this.pos += 1; // consume backslash
    let name = "";
    if (this.pos < this.src.length && !/[a-zA-Z]/.test(this.src[this.pos]!)) {
      // Single-character command like \{ or \,
      name = this.src[this.pos]!;
      this.pos += 1;
    } else {
      while (this.pos < this.src.length && /[a-zA-Z]/.test(this.src[this.pos]!)) {
        name += this.src[this.pos]!;
        this.pos += 1;
      }
    }
    if (name === "") throw new Unsupported("lone backslash");

    if (name === "," || name === ";" || name === ":" || name === "!" || name === " ") return name === "!" ? "" : " ";
    if (IGNORED.has(name)) return "";
    if (name in SYMBOLS) {
      const symbol = SYMBOLS[name]!;
      return PADDED.has(symbol) ? ` ${symbol} ` : symbol;
    }
    if (NAMED_OPERATORS.has(name) || name === "bmod" || name === "pmod") {
      if (name === "bmod") return " mod ";
      if (name === "pmod") {
        const arg = this.argument();
        return ` (mod ${arg})`;
      }
      return name;
    }
    if (TRANSPARENT.has(name)) return this.argument();
    if (name === "mathbb") {
      const arg = this.argument();
      return MATHBB[arg] ?? arg;
    }
    if (name === "sqrt") {
      const arg = this.argument();
      return `√${maybeParenthesize(arg)}`;
    }
    if (name === "frac" || name === "dfrac" || name === "tfrac") {
      const numerator = this.argument();
      const denominator = this.argument();
      return `${maybeParenthesize(numerator)}/${maybeParenthesize(denominator)}`;
    }
    throw new Unsupported(`\\${name}`);
  }
}

function mapScript(content: string, table: Record<string, string>, sigil: "^" | "_"): string {
  const mapped = [...content].map((ch) => table[ch]);
  if (content.length > 0 && mapped.every((ch) => ch !== undefined)) {
    return mapped.join("");
  }
  // Not fully mappable: keep it legible as plain ^x / _{long} notation.
  return content.length === 1 ? `${sigil}${content}` : `${sigil}{${content}}`;
}

/** Wraps compound operands so a/b and √n stay unambiguous. */
function maybeParenthesize(operand: string): string {
  if (/^[\p{L}\p{N}₀-₉⁰-⁹ᵢⱼₖₙ]+$/u.test(operand)) return operand;
  return `(${operand})`;
}

export function latexToUnicode(latex: string): ConvertedMath {
  try {
    const text = new Parser(latex).parse().replace(/ {2,}/g, " ").trim();
    return { text, exact: true };
  } catch {
    return { text: latex, exact: false };
  }
}
