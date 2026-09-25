# Graphics review screen

The first graphics-upgrade milestone: a repeatable review environment. It deliberately retains the current graphics as the baseline; no new body, lighting or turf has been introduced yet.

## Open it

```sh
npm ci
VITE_SHOW_SURVIVE=1 npm run dev -- --port 5201
```

Open `http://localhost:5201/graphics-review.html`.

For a built preview:

```sh
npm run build:graphics
npm run preview -- --port 5202
```

Open `http://localhost:5202/graphics-review.html`.

Vercel builds include the page only on `codex/graphics-upgrade`. Ordinary `npm run build` and builds on the production branch omit it. `GRAPHICS_REVIEW=1` explicitly opts a local build in. No game navigation links to the page.

## Use it

- Pick Guard, Straight drive, Pull or Advance charge. Changing action freezes it at its start.
- Pick a named moment, scrub the millisecond timeline, or step approximately one 60 Hz frame in either direction.
- Play at quarter, half or normal animation speed. Playback stops at the end; it does not autoplay, loop indefinitely or continue in a hidden tab. The charge timeline includes its walk back. The speed is animation speed, without gameplay's charge slow-motion clock.
- Switch between the Blast and Test Survival palettes without rebuilding the scene.
- Choose reference aspect, tall phone or landscape framing. The simulated viewport is fixed and the presentation scales to fit; the camera uses the game's actual resize logic.
- Choose the supplied reference image from your device to view it alongside, or hide it for a larger working scene. The file is opened using a browser-local object URL: it is not uploaded, persisted or included in shared links. Reopening the page requires choosing the image again. The image fits within a frame with the supplied target's aspect ratio. The game scene has no HUD; the reference's HUD is part of the image.
- Download a scene-only PNG and, separately, JSON frame details (state, camera, rendered counts, actual pose diagnostics). PNG resolution follows the renderer's device pixel ratio.
- Copy the review URL to reproduce the same action, millisecond, kit, viewport and reference visibility. A localhost link only works on the machine running that server; a deployed preview link is shareable.

## Implementation boundaries

The page instantiates `GameScene`, not `Game`: no innings, leaderboard calls, music, analytics, identity storage or scoring are started. It uses the same renderer, field, characters, materials, mirrored world and responsive camera as gameplay. The only shared scene API change exposes the existing `batter` as a readonly reference so the review controller can pose it. No stroke keys, grip logic, contact coordinates or charge animation were edited.

Every seek reconstructs from guard, then evaluates the requested timestamp. This avoids inheriting root travel or grip state when scrubbing backwards. The resting bowler and fielders are held fixed. The frame counters include shadow rendering but are not an fps benchmark. A paused scene renders on changes/resizes rather than running a continuous draw loop.

The supplied JPEG remains local and git-ignored at `tools/assets/graphics-reference.jpg`. It is not imported by the app or published. The reference quality bar and subsequent phases remain in `graphics-upgrade-plan.md`.

## Checks

`tests/graphics-review.test.ts` verifies URL-state validation/round-trip, actual shot variants/contact clocks, and backward/cross-action seek reproducibility against a fresh batter using real joint/blade measurements. Run the full existing tests and the TypeScript/build checks before a release.

Browser review should exercise every action, timeline, named moment, play/pause, palettes, each viewport, comparison toggle, PNG/JSON downloads and copied-link restoration, including a narrow screen. Verify that normal game routes still play and production build output excludes this entry.
