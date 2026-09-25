# How the game is drawn — and where it could look better

This covers everything you see on screen: the ground, the stadium, the pitch,
the batter, the bowler and fielders, the ball, and the 2D layer on top. Part 2
is a costed list of improvements, ordered by how much they would change the
picture for how much work they take. Part 3 is about the players alone: how
their shapes differ from a real body, and how to make them look more human.
Part 4 sets a target image and maps out how to reach it.

The short version: **every 3D object in the game is built from code.** There
are no model files, no textures and no image maps anywhere in the 3D scene.
The ground, the crowd and the cricketers are all made of primitive shapes —
boxes, spheres, cylinders and lathed profiles — that three.js creates at
start-up, scales and colours. The painted images you see (the phone cover,
the title, the result screens, the avatars) are flat WebP pictures in the 2D
layer, not part of the 3D world.

---

## Part 1 — How it is built

### The stack

| Layer | What it is | Where |
|---|---|---|
| 3D renderer | three.js `WebGLRenderer` (three 0.180) | `src/scene/GameScene.ts` |
| Ground, stadium, pitch, ball, wickets | Primitive meshes created in code | `GameScene.ts` → `createGround`, `createStadium`, `wicket` |
| Batter | Articulated figure driven by keyframed poses and IK | `src/entities/Batter.ts`, `batGeometry.ts` |
| Bowler | The shared figure, driven by a procedural bowling action | `src/entities/Bowler.ts` |
| Fielders and the catcher | The shared figure (`Cricketer`) | `src/entities/Cricketer.ts` |
| Joint maths | Two-bone IK solver and limb placement | `src/entities/rig.ts` |
| Ball flight after the bat | A pure function with no three.js in it | `src/scene/flight.ts` |
| HUD, menus, scoreboard | HTML and CSS over the canvas, with inline SVG | `src/ui/HUD.ts`, `src/styles.css` |
| Share card and stats card | Drawn with the 2D canvas API | `src/game/ShareCard.ts`, `src/game/StatsCard.ts` |
| Cover and result art | Pre-made WebP images | `src/assets/*.webp`, `public/` |

`Game.ts` owns the frame loop. Every `requestAnimationFrame` it moves the
game's clock forward, updates game state, and calls `GameScene.render(elapsed)`,
which poses the figures, moves the ball and draws the frame. When the tab is
hidden it skips drawing.

### Renderer, camera and light

Set up in the `GameScene` constructor:

- **Antialiasing** is on (hardware MSAA). **Pixel ratio** is capped at 2 on
  desktop and 1.5 on touch devices, so a 3× phone screen isn't asked to render
  nine times the pixels.
- **Shadows:** one `DirectionalLight` (the sun, warm white, high and to one
  side) casts soft PCF shadows. Its shadow map is 2048² on desktop and 1024² on
  phones, and its box covers the square and the inner field only.
- **Fill light:** a `HemisphereLight`, pale blue sky over olive ground, lights
  everything else. There is no environment map, so nothing in the scene
  reflects its surroundings.
- **Sky:** there is no sky object. The clear colour is a flat pale teal
  (`0xa9cbd0`), and linear fog of nearly the same colour (48 m to 125 m) fades
  the far stadium into it.
- **Colour:** output is sRGB. No tone mapping is applied (three's default,
  `NoToneMapping`) and there is no post-processing pass.
- **Camera:** a 50° perspective camera sits 2.9 m up and 5 m behind the
  batter, looking down the pitch. On screens narrower than 16:9 the field of
  view widens (up to 67°) and the aim drops, so a tall phone sees the whole
  pitch rather than the batter's shoulders. It shakes briefly on big hits
  (most on the charge), and never when the player has asked for reduced
  motion.
- **Mirroring:** the whole world group is scaled `x = -1` so the batter's leg
  side reads left on screen.

### Two material styles

`GameScene.ts` has two material helpers, and they give the game its look:

- `mat(color)` — `MeshStandardMaterial` with **flat shading**, roughness 0.85.
  Used for scenery (grass, stands, pavilion, pitch), so the ground keeps a
  faceted, low-poly look.
- `soft(color)` — the same material with smooth shading. Used for anything
  sculpted: the ball, the stumps, the figures.

Materials are cached by colour, so every navy panel in the stadium shares one
material. Colour is the only thing that changes between surfaces. There are no
textures, normal maps or roughness maps.

### The ground and the pitch (`createGround`)

- **Outfield:** a 70 m flat disc of grass green, with ten lighter concentric
  rings laid over it to suggest mowing.
- **Pitch:** two thin boxes (the strip and a slightly darker worn centre).
- **Wear:** 95 tiny boxes in two sand tones scattered down the strip. They are
  placed with `sin()` of their index rather than randomly, so the pitch looks
  the same every time.
- **Creases:** white boxes for the popping and return creases, 1.2 m in front
  of each set of stumps.
- **Boundary rope:** a thin white torus at `GAME.boundaryRadius`.
- **Wickets:** three 16-sided cylinders for the stumps and two small boxes for
  the bails at each end. The striker's bails are kept so they can fly off when
  the ball hits them (`breakBails`).

### The stadium (`createStadium`)

- **28 stand sections** in a ring 39 m from the centre. Each has a front board
  (navy, with every third one orange), four stepped concrete tiers, and on
  three sections in four a sloping roof on two poles.
- **The crowd** is a single `InstancedMesh` of **1,344 coloured boxes** — 28
  sections × 4 rows × 12 seats — each given one of six colours from a fixed
  pattern. Read as seats or as spectators, they are one draw call. They don't
  move.
- **Four floodlight towers:** a pole, a dark panel and ten pale lamp squares.
  The lamps are just light-coloured boxes. They don't glow.
- **Pavilion** at the bowler's end: a cream block with a navy roof, a
  navy panel, five windows and three flagpoles with flags.

All of it sits beyond the shadow box and is softened by the fog, which is
what makes the distant ground read as "far away".

### The ball

A red sphere (24×16 segments) with a slight emissive glow, so it holds its
colour in shadow, and a cream torus for the seam. Around it:

- a **ground shadow** — a dark disc that grows and fades as the ball rises, so
  a skied ball's flight stays readable;
- a **bounce ring** that spreads from where the ball pitches;
- a **catch ring** under whoever is waiting for a skied ball;
- a **charge ring**, the shockwave under a charged hit;
- a **trail** of nine fading, shrinking copies of the ball placed at earlier
  moments of the flight.

On the way in, the ball follows `ballPosition` from
`game/DeliveryTrajectory.ts`. After the bat it follows `flightOf` from
`scene/flight.ts`: distance, height, time, and where it bounces, is taken or
is dropped. `GameScene.struckAt` turns that into one arc, or two with a bounce
between them — the second arc is what makes a four look different from a six.

### The cricketers — how the 3D people are built

None of the figures are imported models. Each one is a **skeleton of points
with primitive shapes stretched between them**. Posing is done by moving a
handful of points (hips, chest, hands, feet); arms and legs are then solved
to reach those points.

**The shared maths (`rig.ts`):**

- `solveJoint(start, end, upper, lower, pole)` is a **two-bone IK solver**.
  Give it a shoulder and a hand (or a hip and a foot), two bone lengths and a
  hint for which way the joint bends, and it returns the elbow or knee. Limbs
  never stretch — if the hand is out of reach the arm straightens.
- `segment(mesh, start, end, width)` stretches a unit-tall mesh between two
  points. Every upper arm, forearm, thigh and shin is one of these.
- `ease`, `settle` and `span` are the easing curves every animation is timed
  with.

**Bowler and fielders (`Cricketer.ts`):**

- The **trunk, pelvis and head** are each one `LatheGeometry`: a side profile
  of heights and radii spun into a solid and flattened front to back. One
  unbroken surface covers shoulders, ribs, waist and neck, so the body has no
  seams. The trunk tucks inside the wider pelvis so the waist join is hidden.
- **Limbs** are tapered cylinders, thickest at the shoulder or hip, with a
  sphere at each joint sized to fill the gap exactly.
- **Hands, feet, cap, peak, collar and placket** are small spheres and
  rounded boxes.
- Every figure is about **41 meshes**, sharing one set of geometries and
  cached materials.
- **Kits** can be changed on the fly: each mesh records whether it is shirt,
  trousers, skin, trim, cap or shoe, and `dress(kit)` swaps materials by that
  role. That is how Survive puts everyone in whites without rebuilding the
  scene.
- Poses are plain objects (`Figure`: hip, chest, feet, hands, yaw, lean, head
  angle). `stand()`, `rest()` and `catchAt(reach)` build them, and `apply()`
  solves them.

**The bowler (`Bowler.ts`)** uses that same body and animates it
procedurally from a single clock that starts at the top of the run-up. The
action is laid out as a real one is: accelerating run-in, bound, gather
side-on, back foot, braced front leg, release just past vertical, then
falling away. How far he has run at any moment comes from `advance()`, not a
constant speed. **The bowling arm is driven by angle on a circle rather than
by IK**, so it can never bend into a throw. The spinner is the same action
with a much shorter approach. Nothing in the action depends on the delivery,
which is what hides a slower ball.

**The batter (`Batter.ts`)** is the most detailed figure and the only one
with its own construction:

- The body is built from spheres, tubes and rounded boxes: an ellipsoid
  torso and hips, a head with helmet, peak and a four-bar metallic grille,
  pads with three rolls and straps, boots, and gloves with padded knuckles,
  curled fingertips and a thumb (modelled from a photo reference).
- **The bat** is custom geometry (`batGeometry.ts`). The blade is lofted from
  ten cross-sections of a real bat's profile — face, edges and the raised
  spine on the back — and the grip is a lathed rubber sleeve with ribs.
- **Strokes are hand-keyed poses**, not motion capture. Each stroke (drive,
  cut, pull, sweep, scoop, reverse scoop, charge and the rest) is a list of
  timed keys — backlift, contact, follow-through, finish, recovery — authored
  in metres and radians and judged against broadcast footage.
  `docs/batting-rig-review.md` records how several of them were made.
- Between keys, `flowing()` interpolates with a time-aware cubic curve and
  `shoulderDriven()` pivots follow-throughs about the shoulder. The bat's
  orientation is a quaternion blended separately, so it takes the short way
  round. Arms and legs are solved with the same IK as everyone else.
- The batter owns his materials outright, so going into whites is three
  colour changes.

**Tools for looking at the figures** (run under `npx vite`):

| Page | What it shows |
|---|---|
| `/tools/pose-lab.html` | Every stroke at guard, backlift, contact, follow-through and recovery, from five camera angles |
| `/tools/bowler-lab.html` | The bowling action from four sides, plus the fielder figure |
| `/shot-preview.html` | One stroke at a time with orbit controls |
| `/rig-sheet.html?shot=…&view=…` | A contact sheet of one stroke sampled across its clock (`scripts/rig-sheet.mjs` saves them) |

Unit tests don't look at pixels. They call each figure's `inspect()`, which
reports joint positions, limb lengths and how far each limb is stretched as
a fraction of its length. Any change to the figures has to keep `inspect()`
answering truthfully.

### The 2D layer

Everything that isn't the ground is HTML over the WebGL canvas: the
dot-matrix scoreboard, the confidence meter, the buttons, the sheets and
boards. Icons and the touch **swipe guide** (glowing streaks for each
direction) are inline SVG. The **share card** and **career stats card** are
painted into a 2D `<canvas>`, so the image a player shares is exactly the one
they saw. The **cover, title and result screens** are pre-drawn WebP artwork.
The What's New pictures are real screenshots, retaken by
`scripts/whatsnew-art.mjs`.

### What a frame costs today

Measured on this branch: the dev server with `VITE_SHOW_SURVIVE=1`, headless
Chromium on SwiftShader, counting WebGL draw calls over one second of a ball
in flight.

| Viewport | Draw calls per frame | Triangles per frame |
|---|---|---|
| Desktop 1280×720 | ~1,060 | ~520,000 |
| Phone 390×844 @2× | ~950 | ~450,000 |

Those totals include the shadow pass, which draws every shadow-casting mesh a
second time. Where the load comes from:

- **Scenery is about 380 separate meshes.** Each `box()` call makes its own
  geometry and mesh: 95 wear marks, 11 grass discs and rings, about 200 stand
  pieces, 48 floodlight pieces and 14 pavilion pieces. Only the crowd is
  instanced.
- **Figures are about 290 meshes for seven people** (41 each), plus the
  batter's 80 or so. Their shapes are dense: a joint sphere is 1,064
  triangles and a rounded box 1,452. So a fielder about 40 pixels tall on a
  phone still costs about 30,000 triangles.

Desktop GPUs handle this easily. A mid-range phone will mostly be limited by
draw calls. This matters for Part 2: **most of the visual upgrades below can be
paid for by cutting this first.**

---

## Part 2 — Room to improve

Yes, there is plenty. The animation is already the game's strongest visual
asset: the strokes and bowling action are carefully keyed and physically
honest. What holds the picture back is **surface and atmosphere**. There are no
textures, no sky, no tone mapping, no reflections and no ambient occlusion,
and the crowd is a still grid of boxes. Those are exactly the things
three.js makes cheap to add.

The list is in order of impact for effort. Each item says what it changes, how
to do it in this codebase, and what to watch for.

### Tier 1 — Cheap, low risk, clearly visible (a day or two each)

**1. Tone mapping and exposure.**
One line in the constructor:
`renderer.toneMapping = THREE.ACESFilmicToneMapping` (or `AgXToneMapping`),
plus `toneMappingExposure` around 1.0–1.2. Highlights roll off softly
instead of clipping, and the sunlit side of a figure gets real contrast
against its shadow side. *Watch for:* every colour shifts slightly, including
the kits, the scoreboard-matched orange and the WHITES palette. Retune the
light intensities after turning it on, and compare screenshots before and
after.

**2. An environment map.**
Build one PMREM from `RoomEnvironment` (or a small outdoor HDR) at start-up
and set `scene.environment`. Every `MeshStandardMaterial` then picks up soft
image-based light: the helmet grille looks metallic, the helmet shell has a
sheen, and shadowed sides stop looking flat. It costs one texture and no extra
draw calls. The hemisphere light can then be turned down.

**3. A real sky.**
Replace the flat clear colour with a gradient sky dome: a large inverted
sphere with a two-colour vertex or fragment gradient, or three's `Sky`
shader from `examples/jsm/objects/Sky.js`, with a few flat cloud sprites.
Set the fog colour to the horizon colour so the stadium still melts into it.
The top of the phone screen is mostly sky, so this is a big change there.

**4. Mowing stripes and grass texture.**
Real grounds are mown in **straight parallel bands**, not rings. Paint a
`CanvasTexture` at start-up — alternating light and dark bands along the
pitch, with a little low-contrast noise — and put it on the outfield disc.
That replaces 11 meshes with one and looks far more like a broadcast. No image
files are needed, so the "no external art" rule in the README still holds.

**5. The pitch as a painted texture.**
Paint the strip's colour, footmarks at both ends, fine cracks and the creases
onto one `CanvasTexture`, instead of 95 wear boxes and six crease boxes. It
looks better (cracks and scuffs instead of confetti), and it removes about
100 meshes — about 200 draw calls counting the shadow pass.

**6. Fix the duplicate charge ring.**
`GameScene.ts` builds `chargeRing` twice (lines 120–125). The first ring is
added to the world and never used again. Delete the first block.

### Tier 2 — Performance headroom (pays for Tiers 3 and 4)

**7. Merge static scenery.**
Everything in `createStadium` and `createGround` that never moves can go
through `BufferGeometryUtils.mergeGeometries`, grouped by material. About 380
meshes become about 10, which cuts draw calls by roughly a third before
anything else is touched. Stadium pieces also don't need `castShadow`: they
sit outside the sun's shadow box.

**8. Cheaper distant figures.**
Five fielders and the catcher are small on screen but built at full detail.
Build `Cricketer` with lower-segment shapes (a 12×8 sphere instead of 28×20,
and rounded boxes with 2 segments) for anyone more than ~15 m from the camera,
or wrap them in `THREE.LOD`. They share geometry already, so this is one
extra set of shapes. That removes about 150,000 triangles per frame.

**9. A quality setting.**
The constructor already detects touch devices. Make that a small tier table
(pixel ratio, shadow map size, which of the effects below are on) and let
players override it in settings. Add a frame-time watchdog that drops a tier
when a phone keeps missing frames.

### Tier 3 — Visibly richer scene (a week or so each)

**10. A living crowd.**
The biggest single change to how the ground feels. Replace the 1,344 boxes
with **instanced billboards**: a small texture atlas of seated and standing
spectators in several shirt colours, drawn by one `InstancedMesh` of quads
facing the camera. Give each instance a random phase and bob it in the vertex
shader, then raise the whole crowd (arms up, bigger bob) for a few seconds
after a four, a six or a wicket. It stays one draw call. The atlas can be
painted procedurally at start-up if bundled art is to be avoided.

**11. Cricket-ground furniture.**
Things a cricket fan notices are missing:

- **sightscreens** behind both wickets;
- **advertising hoardings** or LED boards inside the rope, which could scroll
  a `CanvasTexture` and flash on a boundary;
- a **big screen** on the pavilion showing the score or a replay frame;
- **boundary cushions** instead of a thin rope;
- **umpires** at both ends — the `Cricketer` figure in a different kit, with
  a signal pose for four, six and out.

Each is cheap once static meshes are merged.

**12. Better ball effects.**
- Replace the nine-dot trail with a **ribbon trail**: a short triangle strip
  through the last few positions, fading along its length. It reads smoother
  at high speed and is one draw call instead of nine.
- A **puff of dust** at the bounce (a few instanced quads, fading).
- **Grass spray** as a ground shot crosses the rope.
- A small **bail and stump flash** when the wicket is hit.

**13. Contact shadows and ambient occlusion.**
The feet can look like they float on the pitch because nothing darkens where
the body meets the ground. Cheapest fix: a soft radial-gradient decal under
each figure (the same trick as the ball's shadow disc). Higher quality: an
SSAO or GTAO pass on desktop only, behind the quality setting.

**14. Light post-processing (desktop, or high tier).**
Using `EffectComposer`: a subtle **vignette** and colour grade for a broadcast
feel, **bloom** on the floodlight lamps and the charge ring, and SMAA if MSAA
is dropped. Keep it off on low-end phones. Post-processing costs a full-screen
pass per effect.

### Tier 4 — Big steps (multi-week projects)

**15. A night match.**
Floodlit evening innings: a dark gradient sky, emissive lamp heads with bloom,
four spotlights (or one shadowing key light plus baked light pools on the
grass texture) and a lit crowd. This fits Survive or a special mode well, and
most of it builds on Tier 1 and Tier 3 work.

**16. Broadcast camera cuts.**
For a six or a charge, cut briefly to a second camera that follows the ball
into the stands, then cut back. Add a replay of the stroke from side-on after
a wicket, reusing the clock the charge's slow motion already stretches.
*Watch for:* the README is firm that the camera must not give an outcome away
before it is shown — a skied ball shakes the camera the same whether it is
caught or not. A replay after the call is fine; a cut that begins before the
catch is decided is not.

**17. Skinned character models.**
The biggest jump in fidelity: a proper modelled cricketer (made in Blender, or
licensed) exported as glTF with a skeleton, bones and weights. The figures
would gain real shoulders, creased clothing, faces and shirt numbers. **The
way to do this without losing the animation work** is to keep every existing
pose, key and `solveJoint` call exactly as it is, and change only the last
step. Today `apply()` stretches primitives between the solved joints. A skinned
version would write those joints into bone rotations. `inspect()` keeps
reporting the same joint positions, so the existing tests still hold. *Watch
for:* the README's "no external art" claim would need updating, glTF loading
adds bundle weight (use Draco or meshopt compression), and each model's bone
lengths must match `BUILD` or the IK will pull its limbs out of shape.

**18. Bring the batter onto the newer body.**
A smaller step toward the same goal. The fielders were rebuilt with lathed
trunks and tapered limbs (see the long comment at the top of
`Cricketer.ts`), but the batter still uses the older ellipsoid torso and
straight tubes. He is the largest thing on screen, so giving him the lathed
trunk, tapered limbs and flush joints would be the most visible figure
improvement short of skinned models. *Watch for:* the batting rig is heavily
tuned and tested; check every stroke in `pose-lab` and on the rig sheets
before and after.

Part 3 breaks both of these down into smaller steps.

### Suggested order

If you only do one round, do this:

1. **Merge static scenery** (7) and **cheaper distant figures** (8). This makes
   room for everything else.
2. **Tone mapping** (1), **environment map** (2) and **sky** (3). These give
   the most visible change for the least code.
3. **Striped outfield** (4) and **painted pitch** (5), which also cut meshes.
4. **Living crowd** (10) and **sightscreens and hoardings** (11). The ground
   starts to feel like a venue.
5. Then choose between the **night match** (15) and **more human players**
   (Part 3), depending on whether the priority is a new mode or better-looking
   players.

---

## Part 3 — Making the players look more human

Items 17 and 18 touch on this. This part goes further: what, measured, makes
the batter, bowler and fielders read as figures rather than people, and how to
close that gap step by step. Everything up to step 8 can be done in code, with
no model files, so the README's "no external art" rule still holds.

### Where they differ from a real body

Measured from the figures themselves (bounding boxes of the built meshes, and
the geometry and `BUILD` numbers in `Cricketer.ts`), against approximate
averages for an adult man about 1.80 m tall:

| Measure | In the game | A real person |
|---|---|---|
| Height, standing (fielder) | 1.94 m | 1.75–1.85 m |
| Head, chin to crown (fielder) | 0.32 m | about 0.23 m |
| Head width (fielder, without cap) | 0.28 m | about 0.155 m |
| Height in head-lengths | about 6 | about 7.5 |
| Batter's helmet, width × height | 0.39 × 0.46 m | about 0.23 × 0.25 m |
| Shoulder width, joint to joint | 0.35 m | about 0.38–0.40 m |
| Upper arm thickness at the shoulder | 0.16 m | about 0.11 m, sleeve included |
| Wrist thickness | 0.11 m | about 0.06 m |
| Ankle thickness as a share of knee thickness | about 80% | about 50% |

The big head is a style choice, not a defect. The target look in Part 4 is a
stylised figure with a large head and helmet, and that reads well when a
fielder is 40 pixels tall and the batter is seen from behind. So the head
stays as it is. What makes the figures look like toys rather than stylised
people is everything else: narrow shoulders under a big head, and the shapes
below.

The shapes add to it:

1. **Limbs are straight cones.** Every arm and leg segment is one tapered
   cylinder: no calf, no curve of the thigh, no forearm swelling near the
   elbow. Wrists and ankles are nearly as thick as elbows and knees.
2. **Joints are balls.** A sphere sits in every elbow and knee to hide the
   seam. At a sharp bend (a crouching fielder, the batter's front knee) the
   ball shows, and the figure looks like a jointed doll.
3. **The trunk is two rigid pieces.** Chest and pelvis can turn against each
   other, but neither can bend. A batter leaning into a drive tilts like a
   plank instead of curving through the spine, and shoulders don't rise when
   the arms go up.
4. **The batter uses the older build** (item 18): an egg-shaped torso and
   straight tubes of the same width at both ends.
5. **Hands are mittens.** On the fielders a hand is an ellipsoid with a thumb
   blob, so there is no open hand for a catch and no fingers round the ball in
   the bowler's grip.
6. **No faces.** Ears and a cap, but no nose, brow or eyes, and no hair below
   the cap or helmet.
7. **Everyone is the same person.** `BUILD` and `SPINE` are shared constants,
   so all seven figures have the same height, build and skin tone. A real
   side never looks like that.

### How to close the gap, step by step

**Step 1 — Fix the body proportions (1 day).**
Keep the head and helmet at their current size; that is the style Part 4
aims for. Widen the shoulders (`BUILD.shoulderX` from .175 to about .19) so
the body carries the big head, and bring wrist and ankle radii down so arms and
legs taper as they do on a person. This is editing numbers that already exist.
*Watch for:* check every stroke on the rig sheets afterwards. The `inspect()`
tests measure joints, so they catch a limb out of reach but not a wider
shoulder clipping the bat.

**Step 2 — Give the limbs muscle shapes (2–3 days).**
Replace the single `limb` cone with four lathed profiles, one each for the
upper arm, forearm, thigh and shin, built the same way as the trunk. Nothing
else changes: `segment()` still places and stretches each one between two
joints, and only the shape inside it is new. A sketch of a shin:

```ts
// Unit-tall, knee at y = -0.5 and ankle at +0.5 (segment() points +Y at the
// far joint). Radii are fractions of the limb width.
shin: lathe([
  [-.50, .50], [-.40, .58], [-.22, .60],   // the calf, high on the leg
  [-.02, .48], [.22, .36], [.42, .28], [.50, .27], // down to a narrow ankle
], .88, 24),
```

Similar profiles give the thigh its sweep from hip to knee, and the forearm its
swell below the elbow and narrow wrist. The triangle count is about the same
as the cones, so this costs nothing to draw.

**Step 3 — Put the batter on the same body (about a week).**
This is item 18: the lathed trunk and pelvis, and the step 2 limbs, in place
of the ellipsoid torso and plain tubes. He is the figure on screen the most
and the largest, so this is where the gain shows most. Keep his pads, gloves,
helmet and bat exactly as they are: they are the most detailed parts of the
game.

**Step 4 — Bend the spine, lift the shoulders (3–4 days).**
Split the trunk into an abdomen and a chest (or skin it over two or three
spine bones), so bending forward curves the back instead of tilting it whole.
Let the shoulder joint rise and come forward when the arm goes above the
shoulder, as the collarbone does. The batter already has a `shoulderLift`
setting in his poses; the shared figure needs the same. The bowler's
delivery, with the arm straight up over the head, is where this is most
visible.

**Step 5 — Replace the joint balls with bending limbs (1–2 weeks).**
Make each arm and each leg a single continuous mesh that bends, instead of two
segments and a ball: one lathed tube from shoulder to wrist (or hip to ankle),
turned into a `SkinnedMesh` with two bones. Vertices near the elbow or knee
are shared between both bones, so the joint folds smoothly. The bones are
placed from the same solved joint positions `apply()` computes today, so no
pose or animation changes. This is also the natural time to blend the upper
arm into the shoulder and the thigh into the hip. It is built entirely in code
and removes the jointed-doll look for good.

**Step 6 — Hands (2–3 days).**
A palm block, a four-finger block that can curl, and a thumb, with three poses:
relaxed, open to take a catch, and closed round the ball for the bowler. The
catcher's hands closing on a skied ball is one of the moments the camera
dwells on.

**Step 7 — Faces and hair (2–3 days).**
A nose and brow ridge sculpted into the head profile, small dark eyes, and hair
showing at the back of the neck and over the ears. This is low priority,
because the batter faces away and the bowler's face is about 20 pixels tall.
Do it after the proportions are right, or it will only draw attention to how
large the heads are.

**Step 8 — Make them different people (2–3 days).**
Give each figure its own build: height ±6%, a shoulder and limb width factor,
and a skin tone from a small palette. `solveJoint` already takes bone lengths
as arguments, so the change is making `BUILD` per figure instead of a module
constant. *Watch for:* the bowler's release point is tuned to his arm length
(`RELEASE_HIP_Z` in `Bowler.ts`: the hand has to arrive where the ball
trajectory starts). Keep the two bowlers' builds fixed, or recompute that
figure from the build.

**Step 9 — Real modelled players (multi-week).**
Item 17: modelled glTF cricketers driven by the existing pose system. After
steps 1–8 this is a much smaller jump, and some teams might decide the
procedural figures are good enough by then.

Throughout, clothing shape carries a lot of what reads as "person" at a
distance. A trouser hem that flares over the boot, a shirt that hangs loose at
the waist, and a sleeve end cost a few meshes each and are worth adding
whenever a step touches that part of the body.

### Recommended order

Do **steps 1 and 2 first**: under a week together, and the biggest improvement
in how human the players look for the time. Part 4 explains when to use a
modelled batter instead of building him in code. Then **step 3**, so the batter
matches everyone else, then **step 5**, which is the one that removes the doll
look completely. Steps 4 and 6–8 can be done in any order after that.

---

## Part 4 — The target look

![The look the game is aiming for: the same ground, camera and HUD, rendered
with warm light, a cloudy sky, trees, a crowd of people, a striped outfield
and a smooth stylised batter](images/target-look.webp)

This is the look the game is aiming for. **It is achievable in the browser,
on phones, with three.js.** It is also closer to the current game than it
first looks. The camera, the ground's layout, the pavilion, flags, stands, the
navy and orange colours, the scoreboard and the whole HUD are already the
same. The difference is how the scene is rendered, not what is in it, which
makes this an upgrade to the renderer rather than a redesign.

### Element by element

| Element | Now | In the target | How (item numbers from Part 2 or Part 3) | Rough effort |
|---|---|---|---|---|
| Light and colour | Flat, even lighting, no tone mapping | Warm sun, rich colour, soft shading where surfaces meet | Tone mapping (1), environment light (2), a warmer sun, ambient occlusion (13) | 2–3 days |
| Sky | Flat pale teal | Blue gradient with soft clouds | Sky dome plus a few cloud billboards (3) | 1 day |
| Behind the stands | Nothing | A line of trees | A ring of instanced tree clumps or billboards between the stands and the fog | 1 day |
| Outfield | Ten flat rings | Straight mowing bands, the circles, and grass grain | One painted `CanvasTexture` combining both patterns with fine noise (4) | 1–2 days |
| Pitch | A box with 95 wear boxes | Soft-edged strip, darker worn centre, footmarks | One painted `CanvasTexture` (5) | 1–2 days |
| Boundary | Thin white rope | Navy and white striped boundary boards | A striped band of cushions or hoardings (11) | 1 day |
| Crowd | 1,344 coloured boxes | Seated people with heads and coloured shirts | Instanced little people, still one draw call (10) | 3–5 days |
| Floodlights | Panel of pale boxes | Towers topped with clusters of round lamps | Instanced round emissive lamp heads | 1 day |
| Stands | Faceted boxes | The same shapes, softly lit, with a roof on every stand | Mostly the lighting above, plus smooth materials and a roof on each section | 2–3 days |
| Bowler and fielders | Primitive figures | Small but clearly human | Part 3 steps 1–5, at their scale | 1–2 weeks |
| Batter | Primitive figure, plain shirt | Smooth stylised figure, shirt number 11, sculpted helmet and grille, branded bat, striped shoes | See below | 3–6 weeks |

### How close a real-time game can get

The image looks like a pre-rendered picture: light bounces softly everywhere,
every crease is shaded, and each surface is hand-finished. A game that has to
draw 60 frames a second on a phone can't do all of that live, but the usual
tricks get most of the way:

- tone mapping and environment light for the overall mood;
- **baked** occlusion for anything that never moves (the stadium, the pitch,
  the trees), worked out once rather than every frame;
- soft contact shadows under the figures;
- an extra occlusion pass on desktops only.

Expect roughly 80–90% of the image on a phone. The hardest part to match is
the soft shading inside the batter's folds and under his arms, and that comes
with a modelled character, below.

### The players: two routes

**A. Keep building them in code.** Part 3 steps 1–5, with the big head kept,
plus painted textures for the shirt number, the bat sticker and the stripes on
the boots. The result is a clean, smooth toy-figure look: a silhouette close
to the image, with plainer surfaces (no shirt folds, a simpler face). No art
files.

**B. A modelled stylised batter.** Made in Blender, by you or a commissioned 3D
artist, in the image's style and proportions: big helmet, stocky body, jersey
number. Export it as a skinned glTF and drive it with the game's existing poses
(item 17), so every stroke that exists today is kept exactly. This is the only
route to the image's detail on the batter.

**Recommended: route B for the batter and route A for the bowler and
fielders.** The batter fills about a third of a phone screen and is on it for
every ball, so he is where the detail shows. The fielders are 40 pixels tall,
and route A is more than enough there. The bowler can move to the modelled
figure later if the batter works out.

Route B changes two things: the README's "no external art" line, and the
download. A compressed glTF character with textures is roughly 0.5–1.5 MB,
against the game's current 665 kB. Those are the owner's calls, not technical
blockers.

### A plan to get there

1. **The world (about 2 weeks).** Merge static scenery first (7, 8) to make
   room. Then tone mapping, environment light, sky and clouds, trees, the
   striped outfield, the painted pitch, boundary boards and floodlight lamps.
   After this the background matches the image closely, and nothing about
   gameplay has changed.
2. **Crowd and finish (about 1 week).** Crowd of people, contact shadows,
   baked occlusion on the stadium.
3. **The players (3–6 weeks).** Route A for the fielders and bowler, route B
   for the batter. Most of the uncertainty in the whole plan is here: it depends
   on who models the batter, and how much tuning the strokes need on a new
   body.

That is about **6–9 weeks for one developer** in total. Phase 1 alone takes the
game a long way toward the picture, so it is worth doing and shipping on its
own before committing to phase 3.

---

## Checking a graphics change

- `npx vitest run` and `npx tsc --noEmit -p .` must stay green. Figure changes
  are caught by the `inspect()`-based tests.
- Run the dev server with `VITE_SHOW_SURVIVE=1` (see `CLAUDE.md`) so the
  whites and both modes are exercised, then open `pose-lab`, `bowler-lab` and
  the game itself on a real phone.
- Compare draw calls and triangles before and after. Adding
  `renderer.info.render` to the `?debug=1` overlay would make this a one-glance
  check.
- Any camera or effect change must respect `prefers-reduced-motion`, as the
  camera shake already does.
