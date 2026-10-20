# Clearplay Arcade — working rules

One Android APK = a native WebView shell + a hub + 6 ad-free HTML5/WebGL games.
Repo root is this directory. `SPEC.md` is the binding build contract, `CRITIC.md` the review
procedure, `docs/NEXT_STEPS.md` the remaining work.

## Rebuild the APK and push whenever a game is finished

**Before moving from one game to the next: rebuild the APK, commit it, and push to GitHub.**
The APK is the actual deliverable; a game that is not in it does not exist as far as the user is
concerned, and work that is not pushed does not survive this ephemeral container.

```bash
tools/apk.sh                 # retries through transient Maven 429s, copies to dist/
```

Then verify the games you expect are really bundled — a game with no `index.html` is silently
omitted from the build:

```bash
unzip -l dist/ClearplayArcade.apk | grep -oE 'assets/games/[a-z]+/index\.html' | sort -u
```

Then commit `dist/ClearplayArcade.apk` with a message naming which games it contains, and push:

```bash
git add -A && git commit && git push origin HEAD
```

Never leave a finished game only on local disk.

## Per-game loop

builder → independent harsh critic (blind A/B vs `refs/<id>/`) → fix → critic → …
A critic may only return `SHIP` at ≥75% blind win rate with zero console errors.
Round cap is set per run; keep it low on breadth passes, raise it for depth passes.

Archive every critic verdict to `docs/reports/<id>-critic-rN.md`, including the ranked fixes,
and state in that file whether the fixes were applied. Unapplied fix lists are the input to the
next pass and must not be lost.

## Verify, do not trust reports

Builder agents have twice reported success on rendering bugs that were not fixed. Before accepting
a game as done, take your own screenshot and **look at it**, at both low and high load
(e.g. `?warp=45`, `?warp=70`), and check the `-console.txt` the run writes.

## Environment

- Android SDK at `/home/user/android-sdk` (platform 35, build-tools 35.0.0); `android/local.properties`
  points at it and is gitignored.
- `tools/*.sh` resolve the repo root themselves; override the lock dir with `ARCADE_LOCKDIR`.
- Screenshots are lock-serialized and take ~30-60s each. Keep runs to ≤3 time marks.
- `refs/<id>/` holds copyrighted reference frames, gitignored by design. Rebuild them from the
  YouTube IDs in `refs/SOURCES.md` if the checkout is fresh.
- Agent concurrency is capped around 2 here, so parallel fan-out buys little; prefer one game at a time.

## Branches

`main` stays clean and buildable. In-flight, unreviewed agent work goes on a `wip/` branch and is
merged to `main` only once a critic has passed it or the state is verified good.
