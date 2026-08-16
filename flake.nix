{
  description = "PubliBike Locator is progressive web-app to show nearby PubliBike / Velospot (Switzerland) stations & battery levels";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs?ref=nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs {
          inherit system;
          config = {
            allowUnfree = true;
            android_sdk.accept_license = true;
          };
        };
      in
      rec {
        packages.publibike-locator = pkgs.stdenv.mkDerivation (finalAttrs: {
          pname = "publibike-locator";
          version = "2.0.0";

          src = ./.;

          nativeBuildInputs = [
            pkgs.nodejs
            pkgs.pnpm
            pkgs.pnpmConfigHook
          ];

          pnpmDeps = pkgs.fetchPnpmDeps {
            inherit (finalAttrs) pname version src;
            hash = "sha256-/Pcht6UjDR+ykSwOaVC9vYKGX4A+OBPAEZVBFLmcIBo=";
            fetcherVersion = 4;
          };

          buildPhase = ''
            pnpm build
          '';

          installPhase = ''
            cp -r dist $out
          '';

          meta = with pkgs.lib; {
            homepage = "https://delroth.net/publibike/";
            license = with licenses; [ mit ];
            maintainers = with maintainers; [ delroth ];
          };
        });

        packages.default = packages.publibike-locator;
        defaultPackage = packages.publibike-locator;

        devShells.default =
          with pkgs;
          mkShell {
            packages = [
              gnumake
              inkscape
              nodejs_latest
              apktool
              apkeditor
              android-tools
              apksigner
              objection
              pnpm
              mpv
              uv
            ];
            inputsFrom = [ packages.default ];
          };
      }
    );
}
