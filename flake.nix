{
  description = "A simple JavaScript page to locate bikes at close-by publibike.ch stations in Switzerland";

  inputs = {
    flake-utils.url = "github:numtide/flake-utils";
    nixpkgs.url = "github:nixos/nixpkgs?ref=nixos-unstable";
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
      packages.publibike-locator = with pkgs; mkYarnPackage {
        name = "publibike-locator";
        version = "1.0.0";

        src = ./.;
        packageJson = ./package.json;
        yarnLock = ./yarn.lock;

        buildPhase = ''
          yarn --offline run build
        '';

        installPhase = ''
          mv deps/publibike-locator/dist $out
        '';

        doDist = false;

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
