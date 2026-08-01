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
          nodeModules = pkgs.callPackage ./nix/node-modules.nix { src = ./.; };
          atcoder-tui = pkgs.callPackage ./nix/atcoder-tui.nix {
            src = ./.;
            inherit nodeModules;
          };
          emacs-demo = pkgs.callPackage ./nix/emacs-demo.nix { inherit atcoder-tui; };
        in
        {
          inherit nodeModules;
          inherit atcoder-tui;
          inherit aclogin;
          inherit emacs-demo;
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
        emacs = {
          type = "app";
          program = "${(packagesFor pkgs).emacs-demo}/bin/atcoder-tui-emacs";
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
              pkgs.typescript-go
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
            # Native TS7: provides tsc and tsgo, incl. the LSP (tsgo --lsp --stdio)
            typescript-go
            nodejs
            just
            oxlint
            pinact
            (packagesFor pkgs).aclogin
          ];
        };
      });
    };
}
