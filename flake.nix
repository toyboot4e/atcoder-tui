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
