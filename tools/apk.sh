#!/bin/bash
# Build the release APK (debug-signed, installable). Output: <repo>/dist/ClearplayArcade.apk
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCKDIR="${ARCADE_LOCKDIR:-${TMPDIR:-/tmp}}"; mkdir -p "$LOCKDIR"
cd "$ROOT/android" && flock "$LOCKDIR/arcade-apk.lock" gradle assembleRelease -q --no-daemon 2>&1 | grep -v JAVA_TOOL_OPTIONS
mkdir -p "$ROOT/dist" && cp app/build/outputs/apk/release/app-release.apk "$ROOT/dist/ClearplayArcade.apk" && ls -la "$ROOT/dist"
