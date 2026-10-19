# Original game — design notes

Goal: an ADA-tier original next to the arcade's clones (hole.io, Crowd City, Bowmasters, Downhill
Masters, Subway Surfers). No genre overlap, one/two fingers, readable in 2 seconds, deep enough to
master, 1–5 min runs, and art direction in the Alto's Odyssey / Monument Valley / Journey family.

---

## Concept A — TIDEWRIGHT (control the sea, not the boat)
A paper boat drifts along a coast at dusk. You never steer it. You **hold to pull the moon**: the tide
rises while you hold and falls when you let go, with inertia. Raise it to float over reefs and wrecks,
drop it to slip under arches and pier bridges. Pumping the tide quickly makes a swell that throws the
boat into the air.
- Pros: a clear "control the world" twist; you can map the sea level onto one finger; coastal reflections look good.
- Cons: underneath it's a one-button height controller, so it reads as Flappy-like. The depth is mostly
  timing. Only one thing (water) shows the art, and there isn't much to master after 10 minutes.

## Concept B — UMBRA (drag the sun, live in the shade)
A snow sprite walks across a desert on its own. You drag the sun across the sky. Shadow length and
direction follow from real sun elevation, and the sprite melts in direct light. Moving the sun also
sets the time of day, so the palette is the controller.
- Pros: the most novel idea of the three, and it ties the mechanic to time of day nicely.
- Cons: there's a degenerate strategy. A low sun gives near-endless shadows, and every fix
  (auto-advancing day, heat costs, terrain blocking) adds rules a player can't read at a glance.
  Moment to moment it's slow and close to a puzzle game, which works against arcade one-more-try.
  Too risky to tune well in the time available.

## Concept C — MURMUR (you are the flock)  <- CHOSEN
You guide a **murmuration**: a living cloud of 20–120 starlings led by one pale bird with a long red
ribbon. Drag anywhere (relative, so your thumb never covers the action) and the leader follows. The
flock streams after it with real boids behaviour (separation, alignment, cohesion, curl-noise swirl).
**Put a second finger down and the flock splits in two.** Each finger steers its own half, and lifting
it brings them back together. Fly a 5-leg migration from dawn to night across hand-painted layered worlds.
- **Every bird is a life.** Birds hitting rock, water or blades fall away as feathers. Gaps narrower
  than the flock make you thread it tight or split it around the pillar.
- **Strays** perch on arches and spires. Sweep past and they lift off and join, so the flock grows
  back. That's the risk/reward axis: dip low to collect them, then climb back out.
- **Light motes** in arcs and rivers. Each mote plays a note of the current chord, so a good line
  literally plays the music. A streak without losing a bird raises the multiplier (x1–x5) and lengthens
  the leader's ribbon.
- **Hawks** hunt *stragglers*: the most isolated bird. A dense flock confuses them (true murmuration
  defence), so splitting is powerful but leaves exposed halves. That's the mastery tension.
- **Perfect thread**: the whole flock goes through an arch without losses, for a bonus.
- Legs: Dawn Dunes, Amber Canyon, Monsoon Coast (rain, lightning, sea stacks), Lantern Valley
  (dusk, windmills, lantern strings), Moon Peaks (night, aurora, icicles). Then "a new day" loops faster.

Why C wins:
1. **Instantly understandable**: "the birds follow your finger." No rules to read.
2. **Fresh core**: the avatar is a fluid, mortal swarm whose shape you sculpt, and the two-finger split
   is a real, rarely-seen verb. Not a reskin of any game in the arcade.
3. **Depth**: flock shape vs gap width, split vs hawk exposure, greed for strays and motes vs safety,
   multiplier preservation. Easy to play, hard to finish all 5 legs with a big flock.
4. **Art**: a murmuration over layered Alto-style silhouettes with atmospheric perspective, sun
   glow, mist and weather is about as beautiful as mobile gets. The journey from dawn to night *is*
   the time-of-day palette shift.
5. **Audio**: generative chords per leg, with gameplay playing the melody.

Orientation: **landscape** (side-scrolling flight; lots of horizon for layered depth).

### Systems
- World units: screen height = 100. Camera scrolls at 30 -> 48 u/s. Leg = 2000 u (~55 s); 5 legs ≈ 4.5 min.
- Rendering: Canvas2D, about 10 parallax layers generated procedurally per biome with crossfades.
  Per-layer mist gradients, a sun-side rim light on gameplay silhouettes (clip and offset fill), a
  low-res glow buffer composited additively (fake bloom), a low-res foreground layer upscaled (fake
  DOF), film grain, vignette, weather particles.
- Score = distance + motes x 10 x combo multiplier + bonuses. Stars from leg reached and flock saved.
- Progression: legs unlock as you reach them (start from any unlocked leg); four flock species unlock
  with lifetime light (Starlings, Swallows, Paper Cranes, Lantern Moths).
- Settings: sound, music, haptics, quality.
