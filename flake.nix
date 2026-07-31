{
  description = "atcoder-tui — a read-only AtCoder terminal viewer";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    # x86_64/aarch64 × linux/darwin — exactly Bun's supported platforms,
    # and overridable via --override-input systems.
    systems.url = "github:nix-systems/default";
    treefmt-nix = {
      url = "github:numtide/treefmt-nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    {
      self,
      nixpkgs,
      systems,
      treefmt-nix,
    }:
    let
      forAllSystems =
        f: nixpkgs.lib.genAttrs (import systems) (system: f nixpkgs.legacyPackages.${system});

      treefmtFor =
        pkgs:
        treefmt-nix.lib.evalModule pkgs {
          projectRootFile = "flake.nix";
          programs.nixfmt.enable = true;
          programs.prettier.enable = true;
          settings.global.excludes = [
            "test/fixtures/*"
            "bun.lock"
            "*.md"
          ];
        };

      packagesFor =
        pkgs:
        let
          # https://github.com/key-moon/aclogin — paste REVEL_SESSION once,
          # distribute it to oj/acc cookie stores (which atcoder-tui imports).
          aclogin = pkgs.python3Packages.buildPythonApplication rec {
            pname = "aclogin";
            version = "0.2.1";
            pyproject = true;
            src = pkgs.fetchPypi {
              inherit pname version;
              hash = "sha256-zUbkSnwDmu1Pz//Zs/vzAYmNhFPzTL78PeXV9CJfdVQ=";
            };
            build-system = [ pkgs.python3Packages.setuptools ];
            dependencies = [ pkgs.python3Packages.appdirs ];
            doCheck = false;
            meta = {
              description = "Distribute an AtCoder REVEL_SESSION cookie to competitive-programming CLI tools";
              homepage = "https://github.com/key-moon/aclogin";
              license = pkgs.lib.licenses.mit;
              mainProgram = "aclogin";
            };
          };

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
              bun install --frozen-lockfile --no-progress --backend=copyfile
            '';
            installPhase = ''
              mkdir -p $out
              cp -R node_modules $out/node_modules
            '';
            outputHashAlgo = "sha256";
            outputHashMode = "recursive";
            outputHash = "sha256-MZXotalyCcwprzC1ramo9SlpKoquWFdeFLxaMdkcLFs=";
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
            ];
            dontConfigure = true;
            buildPhase = ''
              export HOME=$TMPDIR
              ln -s ${packages.nodeModules}/node_modules node_modules
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
            nodejs_22
            just
            typescript-language-server
            (packagesFor pkgs).aclogin
          ];
        };
      });
    };
}
