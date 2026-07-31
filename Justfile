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

# Build and run the compiled binary
run: build
    ./dist/atcoder-tui

# Run the TUI from source, restarting automatically on file changes
dev:
    bun --watch run src/index.tsx

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

# Compile a standalone single-file binary (embeds the Bun runtime) into dist/
build:
    bun build --compile src/index.tsx --outfile dist/atcoder-tui

# Full repo gate: formatting, build, typecheck, tests
flake-check:
    nix flake check

# Update ALL dependencies to the latest: npm packages (incl. majors), flake inputs, pinned GitHub Actions — then refresh the node_modules FOD hash
update:
    bun update --latest
    nix flake update
    pinact run --update
    ./scripts/update-node-modules-hash.sh
    @echo "review with: git diff — then run: just check && just flake-check"

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
