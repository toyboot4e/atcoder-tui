import { describe, expect, test } from "bun:test";
import { latexToUnicode } from "../src/render/latex.js";

const exact = (input: string, expected: string) => {
  const result = latexToUnicode(input);
  expect(result.exact).toBe(true);
  expect(result.text).toBe(expected);
};

describe("latexToUnicode", () => {
  test("constraint staples", () => {
    exact("1 \\le N \\le 2\\times 10^5", "1 ≤ N ≤ 2 × 10⁵");
    exact("1 \\le N \\le 2\\times10^5", "1 ≤ N ≤ 2 × 10⁵");
    exact("1 \\leq A_i \\leq 10^9", "1 ≤ Aᵢ ≤ 10⁹");
    exact("N \\ge 1", "N ≥ 1");
    exact("a \\neq b", "a ≠ b");
  });

  test("sequences and dots", () => {
    exact("A = (A_1, A_2, \\dots, A_N)", "A = (A₁, A₂, …, A_N)");
    exact("S_1, \\ldots, S_M", "S₁, …, S_M");
  });

  test("scripts", () => {
    exact("2^{64}", "2⁶⁴");
    exact("x_{12}", "x₁₂");
    exact("10^{18}", "10¹⁸");
    exact("a^b", "aᵇ");
    // Unmappable script chars stay legible as plain notation.
    exact("A_Q", "A_Q");
    exact("x_{i,j}", "x_{i,j}");
  });

  test("operators and functions", () => {
    exact("\\min(a, b)", "min(a, b)");
    exact("a \\bmod m", "a mod m");
    exact("x \\equiv y \\pmod{m}", "x ≡ y (mod m)");
    exact("\\gcd(x, y)", "gcd(x, y)");
  });

  test("fractions and roots", () => {
    exact("\\frac{1}{2}", "1/2");
    exact("\\frac{a+b}{2}", "(a+b)/2");
    exact("\\sqrt{2}", "√2");
    exact("\\sqrt{a+b}", "√(a+b)");
    exact("\\dfrac{N}{2}", "N/2");
  });

  test("wrappers pass through", () => {
    exact("\\mathrm{ans}", "ans");
    exact("\\text{Yes}", "Yes");
    exact("\\displaystyle \\sum_{i=1}^{N} A_i", "Σᵢ₌₁^N Aᵢ");
    exact("\\mathbb{Z}", "ℤ");
  });

  test("escapes and spacing", () => {
    exact("\\{1, 2\\}", "{1, 2}");
    exact("a\\,b", "a b");
    exact("100\\%", "100%");
    exact("x~y", "x y");
  });

  test("sets and arrows", () => {
    exact("x \\in S", "x ∈ S");
    exact("A \\cup B", "A ∪ B");
    exact("p \\to q", "p → q");
    exact("\\lfloor x \\rfloor", "⌊ x ⌋");
  });

  test("unknown command falls back verbatim", () => {
    const result = latexToUnicode("\\begin{matrix} a & b \\end{matrix}");
    expect(result.exact).toBe(false);
    expect(result.text).toBe("\\begin{matrix} a & b \\end{matrix}");
  });

  test("unbalanced braces fall back verbatim", () => {
    const result = latexToUnicode("a_{i");
    expect(result.exact).toBe(false);
    expect(result.text).toBe("a_{i");
  });

  test("never half-converts", () => {
    const result = latexToUnicode("N \\le \\unknowncmd{3}");
    expect(result.exact).toBe(false);
    expect(result.text).toContain("\\le"); // original, untouched
  });
});
