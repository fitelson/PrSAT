#!/bin/zsh
set -euo pipefail

cd /
exec /opt/homebrew/bin/node "$HOME/Library/Application Support/PrSAT31/maple_bridge/server.mjs"
