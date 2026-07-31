// Dev-only: fetch a page once and pin it as an offline test fixture.
// Usage: bun run scripts/record-fixture.ts <url> <name>
import fs from "node:fs";
import path from "node:path";

const [url, name] = process.argv.slice(2);
if (url === undefined || name === undefined) {
  console.error("usage: bun run scripts/record-fixture.ts <url> <name>");
  process.exit(1);
}

const response = await fetch(url, {
  headers: { "User-Agent": "atcoder-tui-fixture-recorder/0.1 (read-only terminal viewer, dev)" },
});
if (!response.ok) {
  console.error(`HTTP ${response.status} for ${url}`);
  process.exit(1);
}
const body = await response.text();
const dir = path.join(import.meta.dir, "..", "test", "fixtures");
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `${name}.html`);
fs.writeFileSync(file, body);
console.log(`${file} (${body.length} chars) <- ${url}`);
