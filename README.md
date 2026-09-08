# Hitman Cricket

A small, browser-based 3D cricket batting game. Five overs, 30 legal balls, three wickets. Read the delivery, pick a direction, and time your swing. Built with plain TypeScript, Three.js, and Vite; no external art, fonts, character packs, or physics engine are required.

## Run locally

Requires Node.js 22.12+ (or 20.19+) and npm.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite (normally http://127.0.0.1:5173). Use a recent browser with WebGL. The ground fills the whole window: there is no page around it, and every control — sound, help, share, pause, fullscreen — sits on the field itself. On a phone, swipe directly on the field to bat; on desktop, use the keyboard. The camera widens and drops its aim on taller screens so portrait play still sees the full pitch. The Share button opens your phone’s share sheet, or copies the game link on desktop.

```sh
npm test          # Vitest gameplay tests
npm run build    # TypeScript checks and production assets in dist/
npm run preview  # Serve the production build locally
```

The production build can be served by any static web host. `base: './'` supports deployment in a subdirectory.

## Tutorial

The start screen offers a three-ball tutorial. Each ball is slow, dead straight, and scripted to teach one gesture: a middle-stump ball to drive straight (swipe up), one on the legs to whip away square (swipe right to left), and one wide outside off to cut behind point (swipe left to right). An arrow on the field sweeps the way you must swipe. Nobody gets out, nothing counts towards a score, and **Skip to innings** leaves at any point.

## Mobile controls

Swipe **left**, **up-left**, **up**, **up-right**, or **right** for leg side, long on, straight, cover, or off side, and **down** to block. A short 24-pixel swipe commits the shot immediately when its direction becomes clear. Timing is measured at that moment, not at finger-down or release, and uses the same timing bands, compatibility, scoring, and wickets as keyboard play. One shot per ball is shared across input methods. Taps, second fingers, and cancelled gestures do not trigger a shot, and nor do the narrow slivers either side of the downward fan. A gesture cannot carry into the next ball.

Use the on-screen Pause button to resume or restart. Page scrolling is suppressed on the field during play; dialogs can still scroll on small screens.

## Keyboard controls

| Key | Action |
| --- | --- |
| A or ← | Leg-side shot (left) |
| W or ↑ | Straight drive |
| D or → | Off-side shot (right) |
| S or ↓ | Forward defensive |
| A + W (or ← + ↑) | Long-on drive |
| W + D (or ↑ + →) | Cover / long-off drive |
| Enter | Start innings / play again |
| Esc | Pause / resume |
| R | Restart innings |
| M | Mute / unmute sound |

The arrow keys are read as the same three shots before anything else looks at them, so combos, the one-shot gate and the timing bands work identically whichever pair a player reaches for — and a mixed pair such as `A` + `↑` is still a combo. Arrow keys are also swallowed during a delivery so the page cannot scroll out from under the innings.

Press combo keys within 100 ms. Timing uses the first press, without adding the combo recognition delay. Only one attempt is allowed per delivery; repeated keydown events are ignored. A+D is not a shot combination. During a three-key sequence the first valid pair wins.

Swing as the ball reaches your bat. Perfect timing is within 40 ms, good within 78 ms, and OK within 135 ms; quick deliveries tighten these bands by 18%. These are narrow on purpose — a rhythm that roughly works will not keep finding the boundary.

Only a middled ball reaches the rope, and timing alone decides which one:

| Timing | Middled (a shot the line suits) |
| --- | --- |
| Perfect | Six |
| Good | Four |
| OK | One, two or three along the ground |
| Poor | Caught |

Reaching for a shot the line does not suit skies it whatever the timing, and so does poor timing. **A ball in the air is only ever six or a catch** — never a nudged single — and the call is held back until it comes down, so a skied shot has to be watched all the way. A shot the line suits outright is never caught. A missed ball on the stumps can be Bowled, or LBW after a failed shot; a miss outside the stumps is a dot ball. Every ball counts, and the innings ends at 30 balls or three wickets.

Deliveries are not all the same pace, and the gap is the point. A spinner floats down in about 1.3 seconds and a seam ball takes under 0.9; an **express** ball arrives in 0.43 and tightens the timing windows with it. You have to read the pace before you can time it.

## Special deliveries

The bowler is not a random number generator — he watches the innings and answers it.

| Delivery | When it comes | What it does |
| --- | --- | --- |
| **Yorker** | After he has been hit for three sixes | 148–158 kph, pitched at the toes and skidding on. It arrives at boot height in under half a second, and it is aimed at the stumps. |
| **Bouncer** | Occasionally, any line | Lands short and rears to chest height. It is over the stumps, so you can never be bowled or caught off it — but it can only be **pulled**, and only if you middle it. Perfect timing on a leg-side swipe is six; anything else goes through to the keeper. |
| **Slower ball** | Once four quick balls have gone by | 78–98 kph and floated in at nearly a second and a half, straight after a burst of pace. |

The pull is not a separate control: swipe leg side (or press `A`) at a ball up around your chest and the batter plays it off the back foot with a horizontal bat, finishing high with the hands in front of the chest, instead of the front-foot flick he uses at a normal-height ball. Only the pull follows a ball up there — every other stroke swings at its own height and a bouncer passes over the bat.

A four runs to the rope along the ground; only a six leaves it, and only a mishit hangs in the air.

## Defending

Swipe down, or press `S`, and the batter blocks it. Get the bat down in time — OK timing or better — and the ball dies at his feet: a dot ball, and nothing off the middle of a dead bat carries to a fielder, so a defended ball can never be caught. Leave it later than that and the ball simply goes past the bat; if it was going on to hit the stumps, that is Bowled or LBW, and if it was missing them it is a play and miss.

Defence beats any stroke pressed with it — a player reaching for the block has decided not to play one — and the downward swipe fan is a full 90 degrees, so a hurried drag down still finds it. It scores nothing, and it costs nothing either: blocking leaves the confidence meter exactly where it stands.

Three balls in a row that go nowhere, though — blocked, left or beaten, in any combination — and the field has something to say about it. A wicket is not one of them; there is nothing to needle a batter about once he is out. The run then starts again from zero, so it takes another three before you hear it a second time.

## Confidence, and the charge down the pitch

Confidence is earned by scoring and lost by not scoring. A six adds 28, a four 22, a three 16 and a two 12; a ball that beats the bat takes 18, while a single or a block leaves it where it stands — a block is a decision, not a failure — and a wicket empties it. Roughly four scoring shots fill it from nothing. It is a run of form rather than a bank balance, so it cannot be saved across a collapse.

Full, the meter pulses. When a ball you can walk at is coming — on the stumps, on a length, at a bowler's pace — the edge of the field lights up gold and the call goes out from the bowler's run-up, a full delivery before it arrives. Drive it and time it perfectly or well, and the batter charges down the wicket and hits it out of the ground for six, and the meter is spent.

He walks back to his crease on his feet: each one plants and stays where it was put while the body moves over it, then swings back a stride and plants again. Translating the whole batter instead freezes his feet to him and skates him up the pitch.

Any upward drive charges it: straight, long-on or cover. The gesture asked for is "swipe up", and a thumb flick that drifts twenty degrees is still a swipe up — but the swipe sectors are 45 degrees wide, so pinning the charge to the straight drive alone threw it away on a gesture the player had no way of seeing was off. Miss it anyway and the call says which half went wrong — `CHARGE MISTIMED` or `THE CHARGE WANTED A DRIVE` — with the meter still charged for the next one.

The length and pace windows exclude every special without naming one: a yorker pitches at your toes, a bouncer over your head, and neither a slower ball nor an express one leaves you time to walk at it.

The game automatically pauses when its tab is hidden or its window loses focus. Resume explicitly to continue. Your personal best is saved locally when browser storage is available. The supplied `normal-hit.mp3` plays for ordinary bat contact (including a contacted dot), `boundary-hit.mp3` plays for both fours and sixes, and `sledge.mp3` comes back from the field after three balls the batter has not scored off. The synthesized fallback is an impact rather than a voice, so a sledge without its clip simply stays silent. These MP3s are bundled locally and decoded after the first Start tap for mobile audio unlocking. Bounce/wicket effects remain synthesized. Mute and pause stop any playing hit clip. A small synthesized fallback keeps play functional if audio loading is unavailable.

## Architecture and tuning

- `src/config/gameplay.ts`: timing bands, line positions, delivery weights/speeds/lengths, the compatibility matrix and the threshold that separates a middled shot from a skied one, the triggers for each special delivery, wicket probabilities, and innings pacing.
- `src/game/`: seeded delivery generation that tracks what the innings has done to the bowler, continuous bounce/swing/spin trajectories with per-delivery length, shot resolution, scorekeeping, keyboard input, and small Web Audio effects.
- `src/game/Tutorial.ts`: the three scripted coaching balls, their deliveries, and an outcome that never dismisses the player.
- `src/Game.ts`: explicit innings state machine and game clock. Pausing freezes gameplay time.
- `src/scene/GameScene.ts`: reusable procedural characters, bat, wickets, ball, field, instanced crowd, and an aspect-aware camera. The popping crease is 1.2m in front of each wicket and the batter stands inside it rather than over the stumps, so the ball is met about a metre in front of them; `GAME.travelScale` carries the shorter flight that leaves, and every delivery keeps the duration it was tuned to. Bowler and fielders are modelled from smooth spheres, capsules, and rounded boxes with sphere joints, so they read as sculpted clay rather than stacked cuboids; the distant stadium keeps its cheaper faceted shading. The resolver determines outcomes; rendering visualizes them.
- `src/entities/Batter.ts`: articulated right-handed batter with seven strokes — the five shot directions, a back-foot pull the leg-side input selects at bouncer height, and a charge down the pitch the confidence meter unlocks — built from smooth primitives, with the bat blade extruded from a real cricket-bat outline, with a side-on guard, flexed knees, the back bent forward over the ball, the head carried on the spine, the bat cocked back over the shoulder so the toe points at first slip with the face opened up, a shared two-hand bat grip, and two-bone arm/leg posing. Both fists ride the bat's own rotation — the right hand below the left on the handle, knuckles lined up along it — and only the gauntlets turn, back up the forearm; a hand free to face its own arm ends up gripping the handle a quarter-turn away from the other one. Elbow hints are scored for room and turned around the arm when one would bury the elbow in the chest or lay the forearm along the handle. The bat carries a full orientation — a handle axis plus a blade face — and poses slerp that rotation, so the blade travels a clean arc instead of rolling at random when a stroke reverses it. Each shot has its own footwork, contact pose, and follow-through; drives step forward, the leg-side stroke rolls into a flick, and the square cut makes room off the back foot. Both gloves stay attached to the bat handle throughout the stroke. The blade, outgoing ball, impact sound, and result feedback are synchronized at visual contact without altering input timing scores.
- `src/game/Confidence.ts`: the confidence meter. Boundaries, twos and threes fill it, a ball that beats the bat drains it, a single or a block leaves it alone, and a wicket or spending it empties it — a run of form rather than a bank balance, so it cannot be saved across a collapse. Full, it buys one charge down the pitch.
- `src/game/Sledge.ts`: counts the run of balls the batter has not scored off, and says when the fielders have heard enough.
- `src/game/Share.ts`: the innings link and the WhatsApp message built from the final score.
- `src/ui/HUD.ts` and `src/styles.css`: a full-window stage holding the start card, scoreboard, in-field controls, shot feedback, help, pause, and innings-end screens. Ball feedback is a call that rises off the field and fades on its own — no panel interrupts play, and delivery speed and style are not reported.
- `tests/game.test.ts`: deterministic game-rule and progression tests, confidence-meter arithmetic, which deliveries can be charged, and the WhatsApp share message.
- `tests/batter.test.ts`: grip attachment, hand order and fist alignment on the handle, guard geometry, per-stroke footwork, blade placement at contact, elbow clearance from trunk and handle, hands kept in front of the shoulders through every stroke, and continuous blade travel with a squared face.
- `tests/mobile.test.ts`: swipe directions including the defensive fan and its dead slivers, actual pointer event listeners, recognition timing, cancellation, one-shot gating, and normal/boundary sound selection.

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

## Hosting

The public deployment is managed by Sites using `.openai/hosting.json`; only `dist/` is published. Source remains in the Hitman-Cricket GitHub repository. No account, download, or local server is required to play the published link. Scores stay on each player’s device. Both provided sound clips are included in the public game.
