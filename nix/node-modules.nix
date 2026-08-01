# Full node_modules (incl. dev deps, so nix flake check can run
# tests/typecheck) as a fixed-output derivation: one hash to bump
# whenever bun.lock changes. Set outputHash to a fake value and the
# build error prints the real one — a merely stale hash reuses the old
# store output silently instead of failing.
{
  lib,
  stdenvNoCC,
  bun,
  src,
}:
stdenvNoCC.mkDerivation {
  pname = "atcoder-tui-node-modules";
  version = "0.1.0";
  src = lib.cleanSourceWith {
    inherit src;
    filter =
      path: _type:
      builtins.elem (baseNameOf path) [
        "package.json"
        "bun.lock"
      ];
  };
  nativeBuildInputs = [ bun ];
  dontConfigure = true;
  dontFixup = true;
  buildPhase = ''
    export HOME=$TMPDIR
    export BUN_INSTALL_CACHE_DIR=$TMPDIR/bun-cache
    # --omit=optional keeps node_modules platform-independent
    # (typescript 7 ships per-platform native binaries as optional
    # deps); checks typecheck with nixpkgs' typescript-go instead.
    bun install --frozen-lockfile --no-progress --backend=copyfile --omit=optional
  '';
  installPhase = ''
    mkdir -p $out
    # Drop the tsgolint npm shim: its native binary is an optional dep that
    # --omit=optional excludes, and a broken shim would shadow the PATH
    # tsgolint that nixpkgs' oxlint wrapper provides in checks.
    rm -f node_modules/.bin/tsgolint
    cp -R node_modules $out/node_modules
  '';
  outputHashAlgo = "sha256";
  outputHashMode = "recursive";
  outputHash = "sha256-Y+VvOZrgOfqf3bK8zPGsud7zAkz7awT6uvHc6HYjb+s=";
}
