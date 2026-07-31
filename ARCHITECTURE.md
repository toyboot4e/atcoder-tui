# ARCHITECTURE

An unofficial, read-only AtCoder viewer for the terminal. React + Ink render
the UI; Bun runs everything; Nix pins the world. There is no server, no
database, and no official AtCoder API — the app politely scrapes atcoder.jp
and renders it.

## Project Structure

```
src/
  index.tsx          entry: CLI dispatch (session subcommands) or TUI render
  app.tsx            providers, screen router, session auto-import, q/t/? keys
  config.ts          ~/.config/atcoder-tui/config.json (all fields optional)
  cache.ts           disk cache with TTL/infinite entries
  platform.ts        OS-specific dirs (XDG-safe) and browser opener
  session.ts         REVEL_SESSION discovery (oj/acc stores), verify, save
  autoSession.ts     startup auto-import of a stored session, with notices
  cli.ts             `atcoder-tui session status|import|set|check`
  phase.ts           upcoming/active/ended classification, countdowns
  categorize.ts      contest → category buckets (abc/arc/…/past/learning)
  unlisted.ts        curated seed of contests atcoder.jp lists nowhere
  net/
    http.ts          THE chokepoint: rate-limited AtcoderClient (see below)
    load.ts          LoadMeter: request journal + live counters
  scrape/            HTML/JSON → typed data (cheerio; one file per page kind)
  render/            statement AST → LaTeX→Unicode → wrapped terminal lines
  state/             store (route stack), services, useData, persistence
  keys/              vim/emacs motion hooks and the declarative keymap
  ui/                one component per screen/pane
scripts/             dev-only: fixture recorder, live canary, FOD hash bump
test/                bun test; fixtures/ are committed page snapshots
nix/                 extracted derivations (aclogin)
flake.nix            devShell, packages, checks (fmt/lint/tsc/tests), formatter
```

## High-Level Flow

```
keypress ──► ui/* ──► useData(key, fetcher)
                          │
                          ▼
              net/http.ts AtcoderClient          ◄── the ONLY fetch path
              serialize · ≥1s spacing · 20/min   ──► atcoder.jp
              cache lookup / stale fallback
                          │                      ──► net/load.ts journal
                          ▼                          (status-bar meter)
              scrape/* parsers ──► typed data
                          ▼
              render/* (statements) ──► string[] ──► ScrollView slices
```

Screens form a stack (`state/store.tsx`): dashboard → contest → submission.
The stack is persisted per navigation (`state/persist.ts`) so a relaunch
resumes where the user quit.

## Core Components

- **AtcoderClient (`net/http.ts`)** — every byte to/from atcoder.jp flows
  through this one class: a serial queue with ≥1s spacing and a 20 req/min
  rolling budget derived from the persisted journal (restart-proof), cookie
  injection, login-redirect detection, cache integration, stale-on-error.
- **LoadMeter (`net/load.ts`)** — append-only JSONL journal of every real
  request; feeds both the rate limiter and the always-visible status-bar
  counters. Politeness is observable, not claimed.
- **Statement pipeline (`scrape/statement.ts` → `render/`)** — HTML →
  bilingual section AST (two structural generations of AtCoder markup) →
  LaTeX→Unicode conversion (all-or-nothing fallback, never half-converted)
  → pre-wrapped ANSI lines. Plain `string[]` output makes scrolling a
  `slice()` and testing trivial.
- **UI (`ui/`)** — thin components over pure functions. Ink has no native
  scrolling (ScrollView slices lines) and, critically, **overflowing an Ink
  box corrupts leading CJK characters** — every pane budgets notice/header
  rows into its height. Preserve this invariant.

## Data Stores

| Path | Purpose |
|---|---|
| `~/.config/atcoder-tui/config.json` | user id, language, session cookie |
| `~/.cache/atcoder-tui/*.json` | page cache (sha256(url) envelopes) |
| `~/.cache/atcoder-tui/requests.jsonl` | request journal (audit + budget) |
| `~/.local/state/atcoder-tui/state.json` | route stack for session restore |

## External Integrations

- **atcoder.jp** — the only network dependency; scraped HTML plus the
  standings JSON endpoint. Login-gated pages use the user's own
  `REVEL_SESSION`. No official API exists; parsers pin both known HTML
  generations and a daily CI canary detects drift.
- **oj / acc cookie stores** — read-only, for session auto-import.
- Deliberately **no** kenkoooo/AtCoder-Problems API (staleness).

## Security Considerations

- The session cookie is a real credential: config-file only, never logged,
  only ever displayed masked, sent solely to atcoder.jp.
- Logged-in page captures are structurally uncommittable
  (`test/fixtures/private/` is gitignored; the recorder force-routes
  logged-in content there and scrubs csrf tokens everywhere).
- See AGENTS.md for the incident-derived rules that keep it this way.

## Development & Testing

- `just` is the entry point (`just -l`); `nix develop` provides the tools.
- `nix flake check` gates formatting (treefmt: nixfmt/oxfmt/yamlfmt),
  oxlint, tsc, and the offline test suite; CI runs exactly this.
- Tests run against committed fixtures — no network. The daily `live-check`
  workflow fetches 4 real pages to catch AtCoder HTML drift.
- `node_modules` is a fixed-output derivation keyed by `bun.lock`
  (`--omit=optional` keeps it platform-independent);
  `scripts/update-node-modules-hash.sh` re-pins it (also defeats the FOD
  stale-reuse trap).

## Future Considerations

- PAST #13/#14 open-contest ids are unknown (seed gap in `unlisted.ts`).
- `bun build --compile` binary is local-only (`just run`); not yet a Nix
  package output (patchelf work).
- Per-problem standings columns and in-statement search are unimplemented.

## Glossary

- **AWC** — AtCoder Weekday Contest (`awc\d`); distinct from **AWTF**
  (World Tour Finals).
- **PAST** — AtCoder's practical algorithm certification; its "open"
  past-problem contests are unlisted on the site.
- **REVEL_SESSION** — AtCoder's session cookie (the site runs Revel).
- **FOD** — Nix fixed-output derivation (network allowed, output hashed).
- **Statement AST** — the typed section/block/inline tree between scraping
  and terminal rendering.
