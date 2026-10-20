#!/bin/bash
# Build the release APK (debug-signed, installable). Output: <repo>/dist/ClearplayArcade.apk
# Retries through transient Maven Central 429s, which are common through the session proxy and
# otherwise fail the build with a misleading "could not resolve dependencies".
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCKDIR="${ARCADE_LOCKDIR:-${TMPDIR:-/tmp}}"; mkdir -p "$LOCKDIR"
OUT="$ROOT/android/app/build/outputs/apk/release/app-release.apk"

# Drop any previous artifact: otherwise a failed build leaves the stale one in place and the
# existence check below would happily ship it as if the build had succeeded.
rm -f "$OUT"

for attempt in 1 2 3 4 5; do
  [ "$attempt" -gt 1 ] && echo "apk.sh: retry $attempt after transient failure" && sleep $(( (attempt - 1) * 20 ))
  ( cd "$ROOT/android" && flock "$LOCKDIR/arcade-apk.lock" gradle assembleRelease -q --no-daemon 2>&1 | grep -v JAVA_TOOL_OPTIONS )
  [ -f "$OUT" ] && break
done

if [ ! -f "$OUT" ]; then echo "apk.sh: BUILD FAILED after $attempt attempts" >&2; exit 1; fi
mkdir -p "$ROOT/dist" && cp "$OUT" "$ROOT/dist/ClearplayArcade.apk"
echo "apk.sh: built $(du -h "$ROOT/dist/ClearplayArcade.apk" | cut -f1)"
echo "apk.sh: games bundled:"
unzip -l "$ROOT/dist/ClearplayArcade.apk" 2>/dev/null | grep -oE 'assets/games/[a-z]+/index\.html' | sort -u | sed 's#assets/games/#  - #; s#/index.html##'
