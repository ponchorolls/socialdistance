{
  description = "Social Distance (sd) Development Environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, utils }:
    utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            # Docker:
            docker          # The CLI client
            docker-compose  # The orchestration tool

            # Backend Runtime
            nodejs_20
            
            # Databases (The Engines)
            redis
            postgresql_15
            
            # Tools
            git
            nodePackages.typescript-language-server
          ];

          shellHook = ''
            echo "--- Social Distance (sd) Dev Environment ---"
            echo "Redis and Postgres are available in your path."
            echo "Run 'redis-server' to start the leaderboard engine."
          '';
        };
      });
}
