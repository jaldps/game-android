#!/bin/bash
# Starts the static server on :8080 if not already running.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
curl -s -o /dev/null http://127.0.0.1:8080/index.html || (cd "$ROOT" && nohup node tools/serve.mjs 8080 >/dev/null 2>&1 &) ; sleep 0.5
