# atcoder-tui — human entry points

# List recipes
default:
    @just --list

# Run the TUI with Bun
dev:
    bun run src/index.tsx

# Run the TUI under Node (fallback if Bun tty raw mode misbehaves)
dev-node:
    node --import tsx src/index.tsx

# Run unit tests
test:
    bun test

# Type-check only
typecheck:
    bunx tsc --noEmit

# Type-check and test
check: typecheck test

# Record an HTML fixture: just fixture https://atcoder.jp/contests/abc300/tasks/abc300_a abc300_a
fixture url name:
    bun run scripts/record-fixture.ts {{url}} {{name}}

# Run the packaged app via Nix
run:
    nix run .
