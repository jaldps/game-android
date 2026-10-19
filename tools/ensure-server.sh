#!/bin/bash
# Starts the static server on :8080 if not already running.
curl -s -o /dev/null http://127.0.0.1:8080/index.html || (cd /home/claude/arcade && nohup node tools/serve.mjs 8080 >/dev/null 2>&1 &) ; sleep 0.5
