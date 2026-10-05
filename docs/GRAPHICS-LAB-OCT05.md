# Graphics experiment · 5 October 2026

Branch: `codex/graphics-lab-oct05`  
Base: production `c42d03c09c78f8798f71164a89996c7de526966f`

This is an isolated, incremental art and rendering experiment on the current
game. It does not change scoring, bowling, shot trajectories, grip poses,
animation timing, the camera/layout, or production deployment configuration.
It retains the procedural rig; it is not a finished Blender/GLB character replacement.

## Visual changes

**Production colour grading is retained exactly.** Lighting, sky generation and
base grass/pitch texture code are byte-identical to production `c42d03c`.
The renderer, exposure, fog, environment settings and stadium palette match
production too. The first experiment's cooler palette has been removed.
`production-look-verification.json` records source comparisons and matched-camera
pixel samples: the sampled sky, dry pitch and stadium roof match exactly.
New geometry naturally has different highlights and shadows.

- The batter has a broader shoulder line, fitted waist, less bulky trouser
  joints, tapered thighs, a shaped cricket helmet with ear guards, and five
  pad ribs with a flatter knee roll. White trousers are retained.
- Bowler and fielders share the shaped jersey, collar, chest badge and back
  number; the cap and footwear details remain.
- Grass gains subtle blade relief from a single tiled 256×256 normal map.
  Its production colour texture and mowing pattern remain untouched. Mipmaps
  soften the relief into the distance, keeping it from shimmering.
- The detailed stumps, turned wooden bails and batched seated crowd remain.
- Shot rigs, contact points, camera and game rules are unchanged.

![Matched-camera character comparison](graphics-lab/character-comparison.webp)

| Production | Experiment |
| --- | --- |
| ![Production](graphics-lab/production-phone.webp) | ![Experiment](graphics-lab/experiment-phone.webp) |

## Rendering budget

Same production source base, camera, pose, viewport, antialiasing, shadow maps
and resolution. These measurements come from a deterministic `GameScene` at
time zero, with no UI. They are **not peak gameplay costs or measured phone FPS**.

| Scene | Draw calls: before → after | Triangles: before → after |
| --- | --- | --- |
| Phone, day · 585×1266 buffer | 242 → 182 (−24.8%) | 207,074 → 196,134 (−5.3%) |
| Phone, night · 585×1266 buffer | 245 → 185 (−24.5%) | 207,076 → 196,136 (−5.3%) |
| Desktop, day · 1280×720 buffer | 326 → 227 (−30.4%) | 273,214 → 216,642 (−20.7%) |

The final colour/shape/grass revision retains the preceding preview's draw
counts. The grass normal map adds one texture (8 by day, 10 by night), about
0.33 MiB including mipmaps, and one normal-map sample in the ground shader.
It adds no grass geometry or animation and no postprocessing passes.
This adds no downloaded art assets to gameplay. Geometry object counts
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
