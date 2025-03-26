{
  description = "A simple JavaScript page to locate bikes at close-by publibike.ch stations in Switzerland";

  inputs = {
    flake-utils.url = "github:numtide/flake-utils";
    nixpkgs.url = "github:NixOS/nixpkgs?ref=f60a759ae7003b321e7ff0c835fc03fa685b91e1";
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
      packages.publibike-locator = with pkgs; stdenv.mkDerivation {
        pname = "publibike-locator";
        inherit version;

        src = lib.cleanSource ./.;

        nativeBuildInputs = [ nodePackages.typescript closurecompiler ];

        installPhase = ''
          mkdir $out
          cp manifest.json index.html app.min.js worker.js favicon512.png favicon192.png favicon.svg $out
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
