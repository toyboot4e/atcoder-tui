# atcoder-tui

> **Unofficial.** This is a community-made viewer with no affiliation with or
> endorsement by AtCoder Inc. Problem statements and contest data belong to
> AtCoder and the respective contest writers.

A read-only [AtCoder](https://atcoder.jp) viewer for the terminal, built with
React + [Ink](https://github.com/vadimdemedes/ink) on [Bun](https://bun.sh).
Browse contests, read problem statements (with LaTeX rendered as Unicode),
check contest info and your submissions — without leaving the terminal and
without hammering AtCoder.

- **Bilingual**: one key (`t`) toggles English ⇄ 日本語 everywhere, including
  statements (AtCoder pages embed both languages; old ja-only problems degrade
  gracefully).
- **Vim keys**: `j`/`k`, `gg`/`G`, `ctrl-d`/`ctrl-u`, `/` to filter, `?` for help.
- **Polite by construction**: every request goes through one rate-limited
  chokepoint (≥1s spacing, ≤20 req/min, budget survives restarts), ended
  contests are cached forever, and the status bar always shows what the
  session actually cost AtCoder (`net 3req/43KB · today 6req/104KB · cache 40%`).

## Quick start

```sh
nix run github:example_user/atcoder-tui   # or: nix run . from a checkout
```

or without Nix (Linux/macOS/Windows):

```sh
bun install
bun run dev
```

## Development

```sh
nix develop        # bun, tsc, node, just
just dev           # run the TUI
just check         # typecheck + tests
just fixture <url> <name>   # record an HTML fixture for tests
```

Tests run offline against recorded fixtures in `test/fixtures/`.

If Bun's tty raw mode ever misbehaves on your platform, run under Node
instead: `just dev-node` (uses `tsx`; no code changes).

## Configuration

`~/.config/atcoder-tui/config.json` (Windows: `%APPDATA%\atcoder-tui\`):

```json
{
  "userId": "your_atcoder_id",
  "language": "en",
  "revelSession": "<REVEL_SESSION cookie value>",
  "cache": true,
  "requestsPerMinute": 20
}
```

Everything is optional; missing pieces degrade to a status-bar hint.

- `userId` — enables the submissions tab.
- `revelSession` — AtCoder now gates submission listings (and problems of
  running contests) behind login. **You usually don't have to do anything**:
  on startup, if no session is configured, the app looks for one in
  [oj](https://github.com/online-judge-tools/oj) /
  [acc](https://github.com/Tatamo/atcoder-cli) cookie stores, verifies it
  against atcoder.jp, adopts it, and reports the result in the status bar
  (expired sessions are reported too, never silently dropped).

  To (re)establish a session, the devShell bundles
  [aclogin](https://github.com/key-moon/aclogin) (packaged in this flake):

  ```sh
  just login            # aclogin: paste REVEL_SESSION once → saved to oj/acc
  just run              # atcoder-tui picks it up automatically
  ```

  Manual alternatives: `just session-set` (paste directly into the app
  config), `just session-status` / `atcoder-tui session check`. Cookie
  values are verified before saving and only ever displayed masked. The
  cookie comes from browser DevTools → Application/Storage → Cookies →
  `https://atcoder.jp` → `REVEL_SESSION`.
- `cache` — set `false` to disable the disk cache (`~/.cache/atcoder-tui/`);
  rate limiting still applies.

## Keys

Press `?` in the app for the full list. Highlights: `enter`/`l` open,
`h`/`esc`/`q` back (`q` quits at the dashboard), `t` language,
`1`/`2`/`3`/`4` statement/meta/submissions/ranking tabs, `enter` on a
submission opens its source code, `J`/`K` next/previous problem,
`o` open the current page in your browser,
`a`/`A` load one/all archive pages into the dashboard (every past contest,
filterable with `/`; "all" is ~18 requests once, then cached forever),
`r` force-refresh.

## Etiquette toward AtCoder

This project tries to be a well-behaved guest (no official API exists):

- **Rate-limited by construction** — every request flows through one
  chokepoint: serialized, ≥1s apart, ≤20 req/min on a rolling window that
  persists across restarts. Enforced by unit tests, not convention.
- **Cached aggressively** — ended contests are fetched once, ever
  (immutable cache); everything else has conservative TTLs.
- **No unnecessary requests** — fetches happen only on explicit
  navigation; there are no timers, polls, prefetches, or retries. An idle
  app produces zero traffic.
- **Observable** — the status bar shows live request/byte counters, and
  `~/.cache/atcoder-tui/requests.jsonl` is a complete audit log of every
  request the app has ever sent.
- **Descriptive User-Agent** — identifies the tool as unofficial and links
  here.
- **No unfair advantage** — this is a viewer: no submitting, no contest
  automation, no assistance features. It shows only what atcoder.jp already
  shows you in a browser with your own session, subject to the same
  login/registration gates.
- Test fixtures are small page snapshots used only for offline parser
  tests; their content is © AtCoder / the respective writers.

If AtCoder publishes guidance that conflicts with any of this, their rules
win — please open an issue.
