{
  description = "PubliBike Locator is progressive web-app to show nearby PubliBike / Velospot (Switzerland) stations & battery levels";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs?ref=nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }: flake-utils.lib.eachDefaultSystem (system:
    let
      pkgs = nixpkgs.legacyPackages.${system};
      version =
        if self ? rev then
          self.rev
        else
          builtins.substring 0 8 self.lastModifiedDate;
    in
    rec {
      packages.publibike-locator = with pkgs; stdenvNoCC.mkDerivation {
        name = "publibike-locator";
        version = "1.0.0";

        src = ./.;

        offlineCache = fetchYarnDeps {
          yarnLock = ./yarn.lock;
          hash = "sha256-6UkuCNP0lqImxYox8oL4AvR0mKpDqWHI7CPC7XhUdzw=";
        };

        nativeBuildInputs = [
          nodejs
          yarnConfigHook
          yarnInstallHook
        ];

        postInstall = ''
          rm -rf $out
          mv dist $out
        '';

        meta = with lib; {
          homepage = "https://delroth.net/publibike/";
          license = with licenses; [ mit ];
          maintainers = with maintainers; [ delroth ];
        };
      };

      defaultPackage = packages.publibike-locator;

      devShells.default = with pkgs; mkShell {
        packages = [ gnumake inkscape ];
        inputsFrom = [ defaultPackage ];
      };
    });
}
