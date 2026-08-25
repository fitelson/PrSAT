#!/bin/zsh
set -euo pipefail

repo_root=${0:a:h:h}
stage_root="/Users/fitelson/Library/Application Support/PrSAT31"
service="gui/$(id -u)/org.fitelson.prsat31.web"

cd "$repo_root"
npm run build

mkdir -p "$stage_root/maple_bridge" "$stage_root/dist"
cp -p "$repo_root/maple_bridge/serve_dist.mjs" "$stage_root/maple_bridge/serve_dist.mjs"
cp -R "$repo_root/dist/." "$stage_root/dist/"

launchctl kickstart -k "$service"
for attempt in {1..15}; do
  if curl -fsS --max-time 2 http://127.0.0.1:5317/ >/dev/null; then
    print -r -- "PrSAT 3.1 local web service updated: http://localhost:5317/"
    exit 0
  fi
  sleep 1
done

print -u2 -r -- "PrSAT 3.1 local web service did not become ready"
exit 1
