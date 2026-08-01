# Runs straight from source under bun (no bundling); node_modules is a
# symlink into the fixed-output derivation from node-modules.nix.
{
  stdenvNoCC,
  bun,
  runtimeShell,
  src,
  nodeModules,
}:
stdenvNoCC.mkDerivation {
  pname = "atcoder-tui";
  version = "0.1.0";
  inherit src;
  dontConfigure = true;
  dontBuild = true;
  installPhase = ''
    mkdir -p $out/lib/atcoder-tui $out/bin
    cp -R src package.json tsconfig.json $out/lib/atcoder-tui/
    ln -s ${nodeModules}/node_modules $out/lib/atcoder-tui/node_modules
    cat > $out/bin/atcoder-tui <<WRAPPER
    #!${runtimeShell}
    cd $out/lib/atcoder-tui
    exec ${bun}/bin/bun run src/index.tsx "\$@"
    WRAPPER
    chmod +x $out/bin/atcoder-tui
  '';
}
