/**
 * Extracts the user's server-side favorites list embedded in the
 * /settings/fav page (login-gated) as `favs = ["user1", ...]`.
 */
export function parseFavList(html: string): string[] {
  const m = /[^.\w]favs\s*=\s*(?<list>\[[^\]]*\])/u.exec(html);
  if (m === null) return [];
  try {
    const parsed: unknown = JSON.parse(m.groups!["list"]!);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((u): u is string => typeof u === "string" && u !== "");
  } catch {
    return [];
  }
}
