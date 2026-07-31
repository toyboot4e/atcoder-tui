# AGENTS.md

Rules for AI agents (and humans) working on this repo. Every rule below was
earned from a real incident in this project's history — none is theoretical.

## Never commit secrets or identity

- **Never read or copy credential stores** (`oj`'s cookie.jar, `acc`'s
  session.json, browser cookies) except through the user-facing session
  tools (`src/session.ts`, `atcoder-tui session …`). The user runs those,
  not you.
- The `REVEL_SESSION` cookie lives only in the user config, is only ever
  displayed masked, and is sent only to atcoder.jp.
- **Logged-in page captures go to `test/fixtures/private/`** (gitignored).
  Record fixtures only with `scripts/record-fixture.ts` — it scrubs csrf
  tokens and force-routes logged-in content to the private dir. Never
  hand-copy a fetched page into `test/fixtures/`.
- Committed fixtures must be anonymous (`userScreenName = ""`) and
  csrf-scrubbed; synthetic fixtures use fabricated users (`sample_user`),
  never a real handle.

## Staging and committing
_Incidents: the app's cache dir and Bun's cache dir were both committed._

- **Never `git add -A` or `git add .`** — stage explicit paths. Nix flakes
  need files tracked before building; add exactly the files you changed.
- Before committing, read `git status --short` and account for every line.
- Run the gates and check their exit codes directly — do not pipe a check
  through `grep` and trust the pipeline status (a formatting failure once
  slipped through exactly that way): `just check && nix flake check`.

## Tests must not pollute
_Incidents: `XDG_CACHE_HOME=""` made both this app and Bun itself write
their caches into the repo root._

- Never set env vars to the **empty string** for isolation — point them at
  real temp dirs (`XDG_CACHE_HOME=$(mktemp -d)`), and run throwaway
  processes from a temp cwd, never from the repo root.
- `src/platform.ts` must keep rejecting empty/relative env dir values.

## Network discipline toward atcoder.jp

- **All application traffic goes through `AtcoderClient`** (`src/net/http.ts`).
  Never add another `fetch` call site that talks to atcoder.jp (current
  exceptions, each rate-limited or one-shot: `session.ts` verification,
  dev-only `scripts/record-fixture.ts` and `scripts/live-check.ts`).
- Keep the limits: serialized requests, ≥1s spacing, ≤20/min persisted
  budget. Never add polling, prefetching, or automatic retries. Every fetch
  must trace back to a user keypress (or the 4-request daily CI canary).
- Ad-hoc probes during development: space them ≥1.2s, use a descriptive
  unofficial User-Agent, and prefer reading the existing cache
  (`~/.cache/atcoder-tui/`) over re-fetching.
- This is a **viewer**: no submitting, no contest automation, nothing the
  website doesn't already show the logged-in user.

## History rewrites
_Incident: a global `--replace-text` mangled the scrubber's own regex._

- Restrict `git filter-repo --replace-text` to the intended paths; after
  any rewrite, run the full gates before declaring success.
- The repo has a remote now: prefer forward-fix commits over rewrites.

## Codebase invariants

- **Ink overflow corrupts leading CJK characters.** Every pane must budget
  all of its rows (headers, notices, percent indicator) into its height so
  content never exceeds the box. See `ScrollView.viewportSize`.
- `node_modules` is a fixed-output derivation: after any `bun.lock` change
  run `scripts/update-node-modules-hash.sh` (it also defeats Nix's
  FOD stale-reuse trap — never trust a FOD build that "succeeds" right
  after a lockfile change without a hash bump).
- Statement math conversion is all-or-nothing (`render/latex.ts`): never
  ship half-converted LaTeX.
- Fixture whitespace is load-bearing for parser tests — formatters must
  exclude `test/fixtures/` (enforced in `flake.nix`; keep it that way).

## Verification habits

- `just check` (oxlint + tsc + bun test) and `nix flake check` before every
  commit; `nix fmt` first.
- UI changes: verify in a real pty (`script -qec … | pyte`), and remember
  keystrokes sent in one chunk arrive as one Ink input — space test
  keypresses out.
- When debugging network behavior, read `requests.jsonl` before adding
  instrumentation — it usually already has the answer.
