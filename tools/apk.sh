#!/bin/bash
# Build the release APK (debug-signed, installable). Output: /home/claude/arcade/dist/ClearplayArcade.apk
cd /home/claude/arcade/android && flock /tmp/claude-0/apk.lock gradle assembleRelease -q --no-daemon 2>&1 | grep -v JAVA_TOOL_OPTIONS
mkdir -p /home/claude/arcade/dist && cp app/build/outputs/apk/release/app-release.apk /home/claude/arcade/dist/ClearplayArcade.apk && ls -la /home/claude/arcade/dist
