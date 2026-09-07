# Hitman Cricket

A small, browser-based 3D cricket batting game. Five overs, 30 legal balls, three wickets. Read the delivery, pick a direction, and time your swing. Built with plain TypeScript, Three.js, and Vite; no external art, fonts, character packs, or physics engine are required.

## Run locally

Requires Node.js 22.12+ (or 20.19+) and npm.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite (normally http://127.0.0.1:5173). Use a desktop browser with WebGL and a physical keyboard. The page adapts to narrow screens, but touch batting is outside this MVP.

```sh
npm test          # Vitest gameplay tests
npm run build    # TypeScript checks and production assets in dist/
npm run preview  # Serve the production build locally
```

The production build can be served by any static web host. `base: './'` supports deployment in a subdirectory.

## Controls

| Key | Action |
| --- | --- |
| A | Leg-side shot (left) |
| W | Straight drive |
| D | Off-side shot (right) |
| A + W | Long-on drive |
| W + D | Cover / long-off drive |
| Enter | Start innings / play again |
| Esc | Pause / resume |
| R | Restart innings |
| M | Mute / unmute sound |

Press combo keys within 100 ms. Timing uses the first press, without adding the combo recognition delay. Only one attempt is allowed per delivery; repeated keydown events are ignored. A+D is not a shot combination. During a three-key sequence the first valid pair wins.

Swing as the ball reaches your bat. Perfect timing is within 90 ms, good within 170 ms, and OK within 260 ms; fast balls tighten these bands by 10%. Sixes require perfect timing and a compatible shot. Mistimed contact can be caught. A missed ball on the stumps can be Bowled, or LBW after a failed shot; a miss outside the stumps is a dot ball. Every ball counts, and the innings ends at 30 balls or three wickets.

The game automatically pauses when its tab is hidden or its window loses focus. Resume explicitly to continue. Your personal best is saved locally when browser storage is available. Audio is synthesized after the first user action.

## Architecture and tuning

- `src/config/gameplay.ts`: timing bands, line positions, delivery weights/speeds, compatibility matrix, wicket probabilities, scoring weights, and innings pacing.
- `src/game/`: pure seeded delivery generation, continuous bounce/swing/spin trajectories, shot resolution, scorekeeping, keyboard input, and small Web Audio effects.
- `src/Game.ts`: explicit innings state machine and game clock. Pausing freezes gameplay time.
- `src/scene/GameScene.ts`: reusable procedural characters, bat, wickets, ball, field, instanced crowd, and fixed camera. The resolver determines outcomes; rendering visualizes them.
- `src/entities/Batter.ts`: articulated right-handed batter with a side-on guard, flexed knees, a shared two-hand bat grip, and two-bone arm/leg posing. Each shot has its own footwork, contact pose, and follow-through; drives step forward, the leg-side stroke rolls into a flick, and the square cut makes room off the back foot. Both gloves stay attached to the bat handle throughout the stroke. The blade, outgoing ball, impact sound, and result feedback are synchronized at visual contact without altering input timing scores.
- `src/ui/HUD.ts` and `src/styles.css`: start, scoreboard, over history, shot feedback, help, pause, and innings-end screens.
- `tests/game.test.ts`: deterministic game-rule and progression tests.

Lines are shuffled in bags of five, giving six of each base line over a 30-ball innings. Pace/style is sampled independently. Swing develops before the bounce; spin turns after it and finishes before the final third of the pitch. Compatibility uses the nearest line to the final ball position. Travel duration is scaled for arcade readability. The stage mirrors X so negative world X appears on the left from the batting camera, matching the A key.

The score is recorded when a ball is resolved and displayed at visual contact. The result animation completes before the end screen; no additional ball is generated after the innings ends. Fielders are scenery except for the scripted catcher. There are no extras, running controls, teams, or full fielding AI.

During local development, open `/tools/pose-lab.html` to review the guard, backlift, contact, follow-through, and recovery for all five strokes side by side. This review page is excluded from the production build. The animation tests verify connected grips, reachable arms, planted back toes, distinct footwork, and blade-to-ball alignment across the delivery range.

## Reproduce and inspect

Use `/?debug=1&seed=222` for a repeatable innings. The debug panel shows the phase, seed, delivery line/style/speed, base and final X, ideal contact time, shot, timing delta/grade, compatibility, quality, and outcome. Exact line information is hidden in normal play. The debug-only `window.__cricket.snapshot()` bridge is read-only and supports automated keyboard testing. A seed reproduces the same delivery/outcome sequence when shot inputs are the same.

## Browser verification

With the development server running on port 5173:

```sh
npm run test:browser
```

The supplied scripts use headless Microsoft Edge through Playwright (`channel: 'msedge'`), which must be installed. They take desktop/narrow screenshots, check runtime errors and page overflow, and play a full innings using keyboard events and Playwright's virtual clock. They also verify three-wicket termination, pause, restart, combo input, one-shot gating, and the absence of debugging data in normal play. Screenshots are written to the ignored `test-results/` directory.

Verified in Edge: a 30-ball seeded innings finished at **138/0 in 5.0 overs**, all seven delivery styles appeared, and a no-shot innings ended at three wickets. Unit tests cover all supported scores, timing boundaries, compatibility entries, wicket rules, trajectory continuity, line balance, and deterministic outcomes. Chrome and Safari are target browsers but have not been manually certified here.
