{
  description = "atcoder-tui — a read-only AtCoder terminal viewer";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { self, nixpkgs }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});

      packagesFor =
        pkgs:
        let
          # Runtime node_modules as a fixed-output derivation: one hash to bump
          # whenever bun.lock changes (the build error prints the new hash).
          nodeModules = pkgs.stdenvNoCC.mkDerivation {
            pname = "atcoder-tui-node-modules";
            version = "0.1.0";
            src = pkgs.lib.cleanSourceWith {
              src = ./.;
              filter = path: _type: builtins.elem (baseNameOf path) [ "package.json" "bun.lock" ];
            };
            nativeBuildInputs = [ pkgs.bun ];
            dontConfigure = true;
            dontFixup = true;
            buildPhase = ''
              export HOME=$TMPDIR
              export BUN_INSTALL_CACHE_DIR=$TMPDIR/bun-cache
              bun install --frozen-lockfile --production --no-progress --backend=copyfile
            '';
            installPhase = ''
              mkdir -p $out
              cp -R node_modules $out/node_modules
            '';
            outputHashAlgo = "sha256";
            outputHashMode = "recursive";
            outputHash = "sha256-LD4+mspqYQ3AnHAJhw3oFO6iXEls+qda6bFx8ApiCuA=";
          };

          atcoder-tui = pkgs.stdenvNoCC.mkDerivation {
            pname = "atcoder-tui";
            version = "0.1.0";
            src = ./.;
            dontConfigure = true;
            dontBuild = true;
            installPhase = ''
              mkdir -p $out/lib/atcoder-tui $out/bin
              cp -R src package.json tsconfig.json $out/lib/atcoder-tui/
              ln -s ${nodeModules}/node_modules $out/lib/atcoder-tui/node_modules
              cat > $out/bin/atcoder-tui <<WRAPPER
              #!${pkgs.runtimeShell}
              cd $out/lib/atcoder-tui
              exec ${pkgs.bun}/bin/bun run src/index.tsx "\$@"
              WRAPPER
              chmod +x $out/bin/atcoder-tui
            '';
          };
        in
        {
          inherit nodeModules;
          inherit atcoder-tui;
          default = atcoder-tui;
        };
    in
    {
      packages = forAllSystems packagesFor;

      apps = forAllSystems (pkgs: {
        default = {
          type = "app";
          program = "${(packagesFor pkgs).atcoder-tui}/bin/atcoder-tui";
        };
      });

      devShells = forAllSystems (pkgs: {
        default = pkgs.mkShell {
          packages = with pkgs; [
            bun
            typescript
            nodejs_22
            just
            typescript-language-server
          ];
        };
      });
    };
}
