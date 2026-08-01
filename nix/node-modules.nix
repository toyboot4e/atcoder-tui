# Full node_modules (incl. dev deps, so nix flake check can run
# tests/typecheck) as a fixed-output derivation: one hash to bump
# whenever bun.lock changes (the build error prints the new hash).
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
    # deps); checks typecheck with nixpkgs' typescript instead.
    bun install --frozen-lockfile --no-progress --backend=copyfile --omit=optional
  '';
  installPhase = ''
    mkdir -p $out
    cp -R node_modules $out/node_modules
  '';
  outputHashAlgo = "sha256";
  outputHashMode = "recursive";
  outputHash = "sha256-FthzSDFByBjaqezLdHhqBmDQWMGa6Zf3mhs7s4l61oE=";
}
