#!/bin/zsh
set -euo pipefail

repo_root=${0:a:h:h}
stage_root="/Users/fitelson/Library/Application Support/PrSAT31"
service="gui/$(id -u)/org.fitelson.prsat31.web"
maple_service="gui/$(id -u)/org.fitelson.prsat31.maple"

cd "$repo_root"
npm run build

mkdir -p "$stage_root/maple_bridge" "$stage_root/dist"
cp -p "$repo_root/maple_bridge/serve_dist.mjs" "$stage_root/maple_bridge/serve_dist.mjs"
cp -p "$repo_root/maple_bridge/server.mjs" "$stage_root/maple_bridge/server.mjs"
cp -R "$repo_root/dist/." "$stage_root/dist/"

cp -p "$repo_root/scripts/org.fitelson.prsat31.web.zsh" \
  "$HOME/Library/LaunchAgents/org.fitelson.prsat31.web.zsh"
cp -p "$repo_root/scripts/org.fitelson.prsat31.maple.zsh" \
  "$HOME/Library/LaunchAgents/org.fitelson.prsat31.maple.zsh"

launchctl kickstart -k "$service"
launchctl kickstart -k "$maple_service"
for attempt in {1..15}; do
  if curl -fsS --max-time 2 http://127.0.0.1:5317/ >/dev/null \
    && curl -fsS --max-time 2 http://127.0.0.1:31415/ping >/dev/null; then
    print -r -- "PrSAT 3.1 local services updated: http://localhost:5317/"
    exit 0
  fi
  sleep 1
done

print -u2 -r -- "PrSAT 3.1 local services did not become ready"
exit 1
