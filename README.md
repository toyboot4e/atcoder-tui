# atcoder-tui

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
`h`/`esc` back, `t` language, `1`/`2`/`3` statement/meta/submissions tabs,
`J`/`K` next/previous problem, `o` open the current page in your browser,
`a` load an archive page into the dashboard (for contests older than the
front page shows), `r` force-refresh.

## Load on AtCoder

This app is deliberately conservative toward atcoder.jp (no official API
exists): it fetches only on explicit navigation, never polls or prefetches,
serializes requests with ≥1s spacing under a 20 req/min rolling budget that
persists across restarts, and caches ended contests indefinitely. The status
bar shows live counters (requests/bytes for the session and the day, cache
hit ratio) so the actual load is always visible. A request journal lives in
`~/.cache/atcoder-tui/requests.jsonl`.
