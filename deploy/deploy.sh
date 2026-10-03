#!/bin/sh
# Update RealRate on this host to a commit of main (default: the latest) and restart what changed.
#   deploy/deploy.sh [commit]
# Builds first, then swaps the containers (a few seconds of restart); waits until the API is
# healthy, so a broken build fails here instead of going live. Rolling back: run it with the
# previous commit.
#
# The whole script is one function, read before it runs: the checkout below replaces this file.
set -eu

main() {
  cd "$(dirname "$0")/.."
  git fetch --quiet origin main
  git checkout --quiet --detach "${1:-origin/main}"
  echo "Deploying $(git log -1 --format='%h %s')"

  cd deploy
  docker compose build --pull
  docker compose up -d --remove-orphans --wait --wait-timeout 120
  docker image prune -f >/dev/null
  echo "Deployed."
}

main "$@"
exit
