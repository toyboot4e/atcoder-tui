{
  description = "atcoder-tui — a read-only AtCoder terminal viewer";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    treefmt-nix = {
      url = "github:numtide/treefmt-nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    {
      self,
      nixpkgs,
      treefmt-nix,
    }:
    let
      forAllSystems =
        f:
        nixpkgs.lib.genAttrs nixpkgs.lib.systems.flakeExposed (system: f nixpkgs.legacyPackages.${system});

      treefmtFor =
        pkgs:
        treefmt-nix.lib.evalModule pkgs {
          projectRootFile = "flake.nix";
          programs.nixfmt.enable = true;
          programs.oxfmt.enable = true;
          programs.yamlfmt.enable = true;
          # Tracked files oxfmt would otherwise match (gitignored paths are
          # already skipped by the git walker): fixture whitespace is
          # load-bearing for parser tests; prose stays hand-formatted.
          settings.formatter.oxfmt.excludes = [
            "test/fixtures/*"
            "*.md"
            "*.org"
          ];
        };

      packagesFor =
        pkgs:
        let
          aclogin = pkgs.callPackage ./nix/aclogin.nix { };

          # Full node_modules (incl. dev deps, so nix flake check can run
          # tests/typecheck) as a fixed-output derivation: one hash to bump
          # whenever bun.lock changes (the build error prints the new hash).
          nodeModules = pkgs.stdenvNoCC.mkDerivation {
            pname = "atcoder-tui-node-modules";
            version = "0.1.0";
            src = pkgs.lib.cleanSourceWith {
              src = ./.;
              filter =
                path: _type:
                builtins.elem (baseNameOf path) [
                  "package.json"
                  "bun.lock"
                ];
            };
            nativeBuildInputs = [ pkgs.bun ];
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
          inherit aclogin;
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

      formatter = forAllSystems (pkgs: (treefmtFor pkgs).config.build.wrapper);

      checks = forAllSystems (
        pkgs:
        let
          packages = packagesFor pkgs;
        in
        {
          formatting = (treefmtFor pkgs).config.build.check self;
          build = packages.atcoder-tui;
          # Offline by construction: tests run against committed fixtures.
          tests = pkgs.stdenvNoCC.mkDerivation {
            name = "atcoder-tui-tests";
            src = ./.;
            nativeBuildInputs = [
              pkgs.bun
              pkgs.typescript
              pkgs.oxlint
            ];
            dontConfigure = true;
            buildPhase = ''
              export HOME=$TMPDIR
              ln -s ${packages.nodeModules}/node_modules node_modules
              oxlint --deny-warnings .
              tsc --noEmit
              bun test
            '';
            installPhase = "touch $out";
          };
        }
      );

      devShells = forAllSystems (pkgs: {
        default = pkgs.mkShell {
          packages = with pkgs; [
            bun
            typescript
            nodejs
            just
            oxlint
            pinact
            typescript-language-server
            (packagesFor pkgs).aclogin
          ];
        };
      });
    };
}
