#!/bin/bash
# Serialized screenshot runner: only ONE headless Chromium at a time across all agents.
# Usage: tools/shot.sh "games/<id>/index.html?autoplay=1&warp=8" shots/<id>/v1_play [--landscape] [--times 3000,8000] [--tap x,y@ms] [--swipe x1,y1,x2,y2@ms] [--eval "js"]
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCKDIR="${ARCADE_LOCKDIR:-${TMPDIR:-/tmp}}"; mkdir -p "$LOCKDIR"
cd "$ROOT" && exec flock "$LOCKDIR/arcade-shot.lock" timeout 420 node tools/shot.mjs "$@"
