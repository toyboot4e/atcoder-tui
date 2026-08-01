// Dev-only: fetch a page once and pin it as an offline test fixture.
//
// Usage:
//   bun run scripts/record-fixture.ts <url> <name>              # anonymous, committed dir
//   bun run scripts/record-fixture.ts --session <url> <name>    # logged-in, PRIVATE dir
//
// Logged-in recordings are forced into test/fixtures/private/ (gitignored) and
// can never land in the committed fixture set — enforced here, not by care.
import fs from "node:fs";
import { loadConfig } from "../src/config.js";
import path from "node:path";

const args = process.argv.slice(2);
const useSession = args.includes("--session");
const positional = args.filter((a) => !a.startsWith("--"));
const [url, name] = positional;
if (url === undefined || name === undefined) {
  console.error("usage: bun run scripts/record-fixture.ts [--session] <url> <name>");
  process.exit(1);
}

const headers: Record<string, string> = {
  "User-Agent":
    "atcoder-tui-fixture-recorder/0.1 (unofficial, dev-only; +https://github.com/toyboot4e/atcoder-tui)",
};
if (useSession) {
  const { config } = loadConfig();
  if (config.revelSession === undefined) {
    console.error("--session requires revelSession in the app config");
    process.exit(1);
  }
  headers["Cookie"] = `REVEL_SESSION=${config.revelSession}`;
}

const response = await fetch(url, { headers });
if (!response.ok) {
  console.error(`HTTP ${response.status} for ${url}`);
  process.exit(1);
}
let body = await response.text();

// Scrub session-adjacent tokens regardless of destination.
body = body.replaceAll(/(?<pre>var csrfToken = ")[^"]*(?<post>")/gu, "$<pre>SCRUBBED$<post>");
body = body.replaceAll(
  /(?<pre>name="csrf_token"\s+value=")[^"]*(?<post>")/gu,
  "$<pre>SCRUBBED$<post>",
);

const loggedIn = /userScreenName = "[^"]/u.test(body);
const isPrivate = useSession || loggedIn;
if (loggedIn && !useSession) {
  console.error("note: page shows a logged-in session — routing to the private dir");
}

const base = path.join(import.meta.dir, "..", "test", "fixtures");
const dir = isPrivate ? path.join(base, "private") : base;
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `${name}.html`);
fs.writeFileSync(file, body);
console.log(
  `${file} (${body.length} chars) <- ${url}${isPrivate ? "  [private, gitignored]" : ""}`,
);
