// Daily CI canary: fetch a handful of live AtCoder pages and assert the
// parsers still understand them. Load is minimal by construction — four
// requests, serialized >=1s apart through the same rate-limited client the
// app uses, no retries, run once a day.
import { AtcoderClient } from "../src/net/http.js";
import { LoadMeter } from "../src/net/load.js";
import { inlineText } from "../src/render/ast.js";
import { parseContestTop } from "../src/scrape/contest.js";
import { parseContestsPage } from "../src/scrape/contests.js";
import { parseStatement } from "../src/scrape/statement.js";
import { parseTasksPage } from "../src/scrape/tasks.js";

const meter = new LoadMeter(null);
const client = new AtcoderClient({
  meter,
  cache: null,
  userAgent:
    "atcoder-tui-live-check/0.1 (unofficial daily parser canary, 4 requests/day; +https://github.com/toyboot4e/atcoder-tui)",
});

let failures = 0;
function check(name: string, ok: boolean): void {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) failures += 1;
}

{
  const { body } = await client.fetch("/contests/?lang=en", { ttl: 0 });
  const sections = parseContestsPage(body);
  const ids = sections.map((s) => s.id);
  check(
    "front page: upcoming and recent sections found",
    ids.includes("upcoming") && ids.includes("recent"),
  );
  const recent = sections.find((s) => s.id === "recent")?.contests[0];
  check(
    "front page: recent row has id/start/duration/rated",
    recent !== undefined &&
      recent.id !== "" &&
      recent.startsAt !== null &&
      recent.durationMin !== null,
  );
}

{
  const { body } = await client.fetch("/contests/abc300/tasks?lang=en", { ttl: 0 });
  const tasks = parseTasksPage(body);
  check(
    "tasks page: abc300 lists 8 tasks with limits",
    tasks.length === 8 && tasks[0]?.id === "abc300_a" && tasks[0].timeLimit.includes("sec"),
  );
}

{
  const { body } = await client.fetch("/contests/abc300/tasks/abc300_a", { ttl: 0 });
  const statement = parseStatement(body);
  check(
    "statement: bilingual sections parsed",
    statement.en !== null &&
      statement.en.some((s) => s.title === "Problem Statement") &&
      statement.ja.some((s) => s.title === "問題文"),
  );
  const sample = statement.en?.find((s) => s.title === "Sample Input 1");
  const pre = sample?.blocks.find((b) => b.kind === "pre");
  check(
    "statement: sample input survives verbatim",
    pre !== undefined && inlineText(pre.inlines).includes("3 125 175"),
  );
}

{
  const { body } = await client.fetch("/contests/abc300?lang=en", { ttl: 0 });
  const meta = parseContestTop(body);
  check(
    "contest top: title and header facts parsed",
    meta.title.includes("300") && meta.headerFacts.some((f) => f.includes("Rated Range")),
  );
}

const stats = meter.stats();
console.log(
  `\n${stats.sessionRequests} requests, ${(stats.sessionBytes / 1024).toFixed(1)} KiB total`,
);
process.exit(failures > 0 ? 1 : 0);
