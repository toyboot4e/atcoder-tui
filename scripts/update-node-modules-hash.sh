#!/usr/bin/env bash
# Refresh the node_modules fixed-output-derivation hash in flake.nix after a
# lockfile change. Uses the fake-hash -> build -> real-hash dance, which also
# defeats Nix's FOD staleness trap (a stale store path matching the declared
# hash is silently reused instead of rebuilt).
set -euo pipefail
cd "$(dirname "$0")/.."

fake="sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
current=$(grep 'outputHash = "' flake.nix | sed 's/.*"\(sha256-[^"]*\)".*/\1/')
if [ -z "$current" ]; then
  echo "error: outputHash not found in flake.nix" >&2
  exit 1
fi

sed -i.bak "s|$current|$fake|" flake.nix && rm -f flake.nix.bak
# nix only sees tracked/staged files in a git repo
git add flake.nix package.json bun.lock 2>/dev/null || true

# The build is EXPECTED to fail (hash mismatch) — that failure carries the
# real hash. `|| true` keeps set -e from killing the script here.
new=$(nix build .#nodeModules 2>&1 | sed -n 's/.*got: *\(sha256-[A-Za-z0-9+/=]*\).*/\1/p' | head -1 || true)
if [ -z "$new" ]; then
  echo "error: could not extract the new hash; restoring $current" >&2
  sed -i.bak "s|$fake|$current|" flake.nix && rm -f flake.nix.bak
  exit 1
fi

sed -i.bak "s|$fake|$new|" flake.nix && rm -f flake.nix.bak
git add flake.nix 2>/dev/null || true
if [ "$new" = "$current" ]; then
  echo "node_modules FOD hash unchanged ($current)"
else
  echo "node_modules FOD hash: $current -> $new"
fi
