# atcoder-tui — human entry points

alias r := run
alias t := test
alias c := check
alias f := fmt
alias l := login
alias s := session-status

# List recipes
default:
    @just --list

# Run the TUI with Bun (no Nix involved)
run:
    bun run src/index.tsx

# Alias of run, for muscle memory
dev: run

# Run unit tests
test:
    bun test

# Type-check only
typecheck:
    bunx tsc --noEmit

# Lint with oxlint
lint:
    oxlint --deny-warnings .

# Lint, type-check and test
check: lint typecheck test

# Format the whole tree (treefmt: nixfmt + prettier)
fmt:
    nix fmt

# Full repo gate: formatting, build, typecheck, tests
flake-check:
    nix flake check

# Record an HTML fixture: just fixture https://atcoder.jp/contests/abc300/tasks/abc300_a abc300_a
fixture url name:
    bun run scripts/record-fixture.ts {{url}} {{name}}

# Paste REVEL_SESSION once into oj/acc stores (atcoder-tui auto-imports on next launch)
login:
    aclogin

# Show login-session status (configured? importable from oj/acc?)
session-status:
    bun run src/index.tsx session status

# Paste and verify a REVEL_SESSION value directly into the app config
session-set:
    bun run src/index.tsx session set
