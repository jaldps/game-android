# Mob Rush (crowd) — critic round 1

**VERDICT: NOT YET**  ·  Blind A/B: ours preferred 2/4 (50%)

> Archived from the breadth pass. These fixes were NOT applied — the round cap was 1,
> so the loop stopped after the verdict. This is the input for the deep pass.

## Scores (1-10)

- artDirection: 6
- lightingMaterials: 5
- environmentDetail: 4
- charactersAnimation: 2
- uiHud: 7
- juiceFeel: 3
- gameplayControls: 5
- audio: 4
- technical: 6

## Ranked fixes

1. **CROWD BODIES DO NOT RENDER ABOVE ~50 AGENTS. Verified repro: at count=2 (r1_input2-9000.png) the blue leader + follower render correctly as humanoids with crowns and shadows; at count=142/192 (r1_play_s11-2500.png) the entire crowd is nothing but overlapping dark-navy ellipses with zero bodies and zero team colour. A 4x nearest-neighbour crop of Turbo's 192-crowd (scratchpad/crop_turbo.png) shows only blobMaterial discs (color 0x1a2040, opacity 0.32, 0.75u plane) — not one head, torso or purple pixel. Scale is NOT the cause: a street tree crown (1.9u) measures 62px in that frame, so 32.6 px/unit, so a 1.15u person must be 37px tall and would be plainly visible. Instrument people.js updatePeople: log body.geometry.instanceCount vs n, and dump iAnim.z (sc) and A.fade[i] for a sample of followers — `if (A.fade[i] > 0) sc *= 1 - A.fade[i]` collapses the body to zero scale if fade is set on recruit/absorb and never cleared. Also verify the peopleMaterial program actually links (THREE.WebGLProgram errors are not reaching the console).**
   - _This is the entire subject of the game. Every gameplay screenshot shows an empty city with grey stains under floating number pills. Nothing else matters until this is fixed._
2. **Camera is far too wide once the crowd grows. In r1_play_s11-6000.png a 143-strong mob occupies ~110x110px of an 824x1830 frame — about 1% of screen area. The reference (refs/crowd/0mqWoBp8bm0_hq2.jpg) shows a 311-crowd filling roughly 60-70% of the frame with each person ~25-30px tall and individually readable. Cut `want = 11.5 + crowdRadius(P.count)*3.5` in main.js:359 to roughly `9 + crowdRadius*1.8`, and clamp the far end so the mob never drops below ~45% of frame width. Verify by measuring crowd-width-to-frame-width in a fresh shot at warp=75.**
   - _Even with bodies fixed, at this zoom each person is a 5px sliver. The mob must dominate the frame — that is the entire power fantasy of the genre._
3. **Followers carry no team colour in a crowd. The player skin is #2f9bff and Turbo is purple, yet the dense crops contain zero blue or purple. Check that `teams[tm].color` is a linear-space THREE.Color and that the peopleMaterial line `vColor = vec4(color.rgb * iCol.rgb, 1.0)` is not multiplying by a near-black baked vertex colour from geom.js person() (the body parts are built with `k:` brightness keys and no `c:`). Render a 3-person test crowd and confirm the followers match the leader's hue exactly.**
   - _Team colour is how the player reads 'mine vs theirs' at a glance. Grey mobs make the core read impossible._
4. **Near/clip-plane seam slices the frame in half. r1_play_s3-2500.png and -7000.png have a hard horizontal cut across the full width at y≈630 (device px) where foreground buildings are sheared open and you see through them; r1_play_s11-2500.png has the same diagonal cut on the top-left rooftop. Cause is render.js:84 `cam.near = Math.max(0.5, d * 0.08)` — at d≈30 that is near=2.4, which clips tall buildings between camera and target. Pin near to a constant 0.5-1.0 and raise far instead, or cut building height / fade buildings nearer than the target with a dither.**
   - _A straight line slicing geometry open across the whole screen is the single most obvious 'broken build' tell in any screenshot._
5. **Rooftops and plazas are flat untextured planes — the exact failure SPEC calls out. In r1_play_s3-7000.png the bottom 55% of the screen is three blank white/lavender rooftops carrying one grey AC box between them; the plaza in r1_play_s3-2500.png is a beige plane with concentric pink rings, two planters and one tiny gold statue. Add to roofs: vents, skylights, water tanks, parapet shadow, roof-felt tiling texture, AO at the parapet. Add to plazas: paver tiling with grout lines, kiosks, market stalls with awnings, benches, bollards, litter bins, pigeon/manhole decals, planters at the edges.**
   - _Three of four blind composites showed large areas of untextured plane. It reads as unfinished whitebox._
6. **The whole palette is bleached to near-white with no value separation. In r1_input2-9000.png the asphalt, sidewalk, plaza and crosswalks sit within a few percent luminance of each other; the road is #c8ccd6-ish and the sidewalk #dfe2e8-ish. Drop road value to ~0.45 with a cool-grey asphalt noise/grain texture, keep sidewalks light warm, and make curbs a distinct third value with a dark AO line at the kerb. The reference uses saturated blue-violet roads against white sidewalks and reads far more clearly at thumbnail size.**
   - _Zero value contrast means the city reads as fog. It is why p1 and p2 lost — the ref frame has a readable figure/ground, ours does not._
7. **No minimap, despite the brief requiring one. Add a bottom-left circular minimap (~90px) showing the walkable grid bounds, the player as a filled dot in team colour, rivals as coloured dots sized by crowd count, and a neutral-density heat tint so the player can steer toward uncollected pedestrians. Clamp off-screen rivals to the rim.**
   - _The player currently has no way to find rivals or neutral density; markers pile up at the screen edge instead._
8. **Rival markers overlap into illegible stacks and get clipped off-screen. r1_play_s3-7000.png has four pills (73/51/63/51) touching and partly occluding each other in a 160px span; r1_play_s11-2500.png has the '130' pill half-cut by the right edge and '32'/'126'/'161' colliding at the bottom. Add marker declutter: spread overlapping pills along a short arc, merge markers closer than ~40px into a '+N' cluster chip, and inset edge-clamped markers by at least half their width plus safe-area.**
   - _The HUD is the strongest part of this build and these collisions are the only thing dragging it down._
9. **?scene=over still shows an impossible result, contrary to the builder's claim that this was fixed. r1_over-2500.png reads: You #5 with CROWD 0, PEAK 58, RECRUITED 58, KOs 0, yet listed as alive above a KO'd rival, awarded one star and +21 coins, with a silver medal stamped '5'. Give the preview a plausible mid-table finish (e.g. #3 with 180 crowd, peak 210, 2 KOs), mark a 0-crowd team as KO, and restrict medal art to top 3 — use a plain rank badge for 4th and below.**
   - _The results screen is the shot that sells the game in a store listing, and it currently advertises a wipeout with contradictory numbers._
10. **Essentially no juice. Across eight gameplay frames the only feedback visible is one small '+1' chip. Add: a colour-burst particle ring and a brief white flash on each recruit; a screen shake plus a radial shockwave decal and slow-mo hit-stop (~80ms) when absorbing a rival crowd; confetti and a scale-punch on the count pill at milestones (50/100/200); a trailing ground decal in team colour behind the moving mob; and a rising combo popup for rapid consecutive recruits.**
   - _The reference frames show constant popups and markers firing; ours is static. Feel is half the comparison._
11. **The title screen is a depopulated city. r1_menu-2500.png and r1_input2-4000.png show seven rival count pills (43/55/56/58/65/90/134) floating over completely empty streets and an empty park — a game called 'Grow the biggest crowd in town' whose menu contains zero visible people. Once fix #1 lands, re-verify that the menu backdrop sim renders its crowds, and frame the menu camera on an actual mob collision rather than an empty park.**
   - _First impression of the game is an empty city, which directly contradicts the tagline printed on it._
12. **Crowd ceiling is ~3x short of the original. Ours peaks at 143-193 per team; refs/crowd/0mqWoBp8bm0_hq2.jpg shows 311 and the builder cites 699. Raise SIM.NEUTRAL0 and the recruit rate so a competent run reaches 400-600, and verify the instanced path holds it — with bodies fixed, one draw call for N bodies plus one for blobs should scale fine, but confirm updatePeople's per-frame N=5400 loop is not the bottleneck by only iterating live agents.**
   - _Mob size is the one axis where the original visibly beats us; it is the hero stat the genre is built on._
13. **Leaderboard ties all render as rank 1. r1_input2-5500.png shows rows numbered 1,2,3,4,5 but every team at count 1 — then r1_input2-9000.png still numbers Zara/Biscuit/Ace/Ozzy as 2/3/4/5 while all are tied at 1. Break ties deterministically by team id so ordering is stable, and dim the rank number while a team is tied at the starting value instead of implying a hierarchy that does not exist.**
   - _Visible at round start on every single play, which is exactly when a new player is forming an opinion._
14. **No crowd shadows. people.js sets `body.castShadow = false`, so a 200-person mob casts nothing onto the street; the only grounding is the blobMaterial disc. Give the people mesh a custom depth material using the same pose transform (the comment in materials.js already anticipates this) so the mob casts a single soft contact shadow mass, and reduce the blob opacity from 0.32 once real shadows land.**
   - _A mob with no cast shadow floats. Contact shadow is the cheapest single upgrade to perceived lighting quality._
15. **Clear the three.js deprecation warning: every console log contains 'THREE.WebGLShadowMap: PCFSoftShadowMap has been removed. Using PCFShadowMap instead.' Switch renderer.shadowMap.type to THREE.PCFShadowMap (or VSM) explicitly in render.js and compensate softness with a larger shadow bias/radius.**
   - _Not an error, but it is the only noise in an otherwise clean console and it means shadow softness is silently not what the code asks for._

## Evidence

- `/home/user/game-android/shots/crowd/critic/r1_play_s3-2500.png`
- `/home/user/game-android/shots/crowd/critic/r1_play_s3-7000.png`
- `/home/user/game-android/shots/crowd/critic/r1_play_s11-2500.png`
- `/home/user/game-android/shots/crowd/critic/r1_play_s11-6000.png`
- `/home/user/game-android/shots/crowd/critic/r1_menu-2500.png`
- `/home/user/game-android/shots/crowd/critic/r1_over-2500.png`
- `/home/user/game-android/shots/crowd/critic/r1_input2-5500.png`
- `/home/user/game-android/shots/crowd/critic/r1_input2-9000.png`
- `/home/user/game-android/shots/crowd/critic/blind/p1.png`
- `/home/user/game-android/shots/crowd/critic/blind/p2.png`
- `/home/user/game-android/shots/crowd/critic/blind/p3.png`
- `/home/user/game-android/shots/crowd/critic/blind/p4.png`
- `/tmp/claude-0/-home-user/40bd5af7-231b-5bb2-88e4-62bea48e974c/scratchpad/crop_turbo.png`

---

## Applied status (updated after the targeted bug-fix pass)

**Applied:** 1 (invisible crowd), 3 (team colour), 4 (clip-plane seam), 5 (flat untextured
roofs/plazas), 11 (depopulated title screen — resolved once fix 1 landed), 15.

Root cause of fix 1 was not an instance-count or buffer-growth problem as first suspected.
`sim.js step()` computed `sp = Math.hypot(mx,mz) / dt`, and the first rendered frame runs with
`dt === 0`, writing NaN into `A.phase` / `A.run` for every live agent. Those feed `iAnim.x/.y`,
so `sin(ph)` made `gl_Position` NaN and the GPU silently discarded every body instance. Blob
shadow discs survived because that shader only reads `iAnim.z/.w` — hence a grey smudge with no
people. Fixed with an invDt guard plus phase self-heal in sim.js, a floored realDt in main.js,
and a non-finite sanitiser on the per-instance upload in people.js.

**Still outstanding:** 2 (camera too wide — the single biggest remaining blind-A/B loss; an
111-strong mob fills roughly 8% of frame where the reference fills 60-70%), 6 (bleached palette:
road, sidewalk and plaza sit within a few percent luminance so the city reads as fog), 7, 8, 9,
10, 12, 13, 14.

Blind A/B moved from 2/4 (50%) at round 1 to 4/6 (67%) after this pass. Both remaining losses
were lost on crowd presence and framing, not on rendering quality.
