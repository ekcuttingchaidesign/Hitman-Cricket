# Graphics experiment · 5 October 2026

Branch: `codex/graphics-lab-oct05`  
Base: production `c42d03c09c78f8798f71164a89996c7de526966f`

This is an isolated, incremental art and rendering experiment on the current
game. It does not change scoring, bowling, shot trajectories, grip poses,
animation timing, the camera/layout, or production deployment configuration.
It retains the procedural rig; it is not a finished Blender/GLB character replacement.

## Visual changes

- A continuous shaped jersey replaces the ellipsoid torso, with a real neckline
  and collar, repositioned back number and white Blast trousers.
  Test whites and the Rivals kit choices remain available.
- Neutral daylight removes some yellow from white equipment. Richer green,
  broader mowing bands and quieter grain make the ground less noisy.
- The pitch is less golden; Test modes keep their greener surface.
- Cooler stadium concrete and steel, smaller clouds, and seated crowd bodies
  with separate heads replace the audience's plain boxes.
- Bowler and fielders share the batter's shaped jersey and collar, with chest
  badges, back numbers, rounded faces, cap badges and fuller shoes with laces.
  Their joint positions and bowling/fielding animations are retained.
- Stumps now have turned crowns, painted rings and maker marks. Wooden bails
  have barrels, grooves and narrow spigots; their animation origins are retained.
- Small markings use simple box geometry, rigid details remain merged, and
  distant jerseys sample the same profile with fewer vertices.
- Night remains available, using the existing floodlight treatment.

| Production | Experiment |
| --- | --- |
| ![Production](graphics-lab/production-phone.webp) | ![Experiment](graphics-lab/experiment-phone.webp) |

## Rendering budget

Same production source base, camera, pose, viewport, antialiasing, shadow maps
and resolution. These measurements come from a deterministic `GameScene` at
time zero, with no UI. They are **not peak gameplay costs or measured phone FPS**.

| Scene | Draw calls: before → after | Triangles: before → after |
| --- | --- | --- |
| Phone, day · 585×1266 buffer | 242 → 182 (−24.8%) | 207,074 → 195,430 (−5.6%) |
| Phone, night · 585×1266 buffer | 245 → 185 (−24.5%) | 207,076 → 195,432 (−5.6%) |
| Desktop, day · 1280×720 buffer | 326 → 227 (−30.4%) | 273,214 → 215,938 (−21.0%) |

The character and wicket detail revision adds one phone draw and three desktop
draws over the first experiment; triangles rise about 4%. Both measures remain
below the production baseline.

Texture counts are unchanged (7 by day, 9 by night). This adds no downloaded
art assets to gameplay and no postprocessing passes. Geometry object counts
increase because rigid details are merged into private geometry buffers;
that trades some buffer storage for fewer draws. It is not a claim of lower
GPU memory use. Limb instances update a few local matrices each frame.

The attached JSON includes JS submission timings from headless Chromium with
SwiftShader. Those timings are noisy, exclude some asynchronous GPU work,
and must not be interpreted as device frame times or a speedup claim.

Reproduce against a Vite dev server:

```sh
node scripts/graphics-benchmark.mjs http://127.0.0.1:5201 experiment
```

Or set `BENCH_SERVE=1` to start a local Vite child automatically. Set
`CHROMIUM_PATH` if Playwright's default browser is unavailable. Raw outputs
go to `test-results/`; the comparison data is retained in `docs/graphics-lab/`.

## Try it on a phone

Use the **branch preview**, with `?lights=day&perf=1` for daylight and
`?lights=night&perf=1` for floodlights. The readout shows observed render-loop
FPS, P95 frame intervals, draw calls, triangles and pixel ratio once a second.
It performs no network requests. Without `perf=1`, it is not constructed.

Check several innings, special shots, mode changes and sustained play on an
iPhone and Android device before considering a merge. The acceptance goal is
no regression in sustained frame times or batting responsiveness at the same
resolution. Reduced draw counts alone cannot establish that.

Preview Vercel hosts and `perf=1` runs are excluded from analytics. The branch
continues using the repository's existing preview database namespace.

## Validation

- TypeScript and production build, including serverless function import checks.
- 238 targeted batter, bowler, fielder, grounds, lighting, analytics and new geometry tests passed.
- Deterministic day/night/desktop captures with no shader or browser errors.
- Full-game scene checks exercise the actual cover → mode → innings flow.
  All stadium cases remain within the 500-call regression budget, lowered
  from production's 680 calls per frame.

No production branch was pushed, merged or redeployed for this experiment.
