# Hitman Cricket

A small, browser-based 3D cricket batting game. Five overs, 30 legal balls, three wickets. Read the delivery, pick a direction, and time your swing. Built with plain TypeScript, Three.js, and Vite; no external art, fonts, character packs, or physics engine are required.

**[Play it here](https://ekcuttingchaidesign.github.io/Hitman-Cricket/)** — nothing to install, and it works on a phone.

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

```sh
npx vite build --config vite.single.config.ts   # one self-contained HTML file
```

That build inlines every asset as a data URI and splits nothing, so `dist-single`
holds a page with nothing left to fetch — which is what a branch preview needs
when the only real deployment tracks the default branch.

## Start screen

A phone gets the cover art. `src/assets/cover.webp` fills the screen, `title.webp` sits in the sky, and **Play** and **How to play** sit low on the pitch at the artwork's own proportions: a button is 54% of the width, and the pair end a twentieth off the foot of the screen. Nothing else is on it — the scoreboard, the confidence meter, the field labels and the button row all wait until there is an innings to describe. A personal best appears above the buttons once there is one. Across a landscape phone a portrait cover crops to nothing useful, so the live ground stands in for it and the lockup sits over the real thing.

Both calls to action are set in **Jaro** (Agyei Archer, Céline Hurka, Mirko Velimirović), bundled as a 19 kB latin subset at `src/assets/jaro-latin.woff2` under the SIL Open Font License 1.1; the notice ships beside it in `jaro-OFL.txt`. The orange is `#e9582b`, taken off the cover art rather than the interface's own `--orange`.

A pointer that is not coarse gets the card over the live ground instead, where there is room for the keys and the pitch behind them. The choice is made once, from the same `touch-device` test the rest of the game uses.

## Tutorial

The start screen offers a three-ball tutorial. Each ball is slow, dead straight, and scripted to teach one gesture: a middle-stump ball to drive straight (swipe up), one on the legs to whip away square (swipe right to left), and one wide outside off to cut square behind point (swipe left to right). An arrow on the field sweeps the way you must swipe. Nobody gets out, nothing counts towards a score, and **Skip to innings** leaves at any point.

## The square cut

The off side's scoring stroke, played off the back foot and square of the wicket: **swipe right**, or press <kbd>D</kbd>. He rocks back and across, frees his arms at the ball, strikes it square with a horizontal bat, and the arc keeps going — the wrists roll, the body unwinds on the back foot, and the blade wraps up over the front shoulder. It replaces the off-side punch that used to sit on this input; the cover drive on <kbd>W</kbd>+<kbd>D</kbd> is untouched.

It wants width. Compatibility runs 1 outside off, 0.85 on off, 0.4 on middle and nothing worth having down the leg side. The bat reaches from the off stump out to the boundary side of the crease, and never back inside it: swung at a ball on middle or leg it plays square of the stumps anyway and the ball passes it, which is what cutting at a straight one deserves — close enough to nick, never square enough to hit.

It is also the second answer to a bouncer, alongside the pull. `CUT.minWidth` gates that case alone — how far outside off a short ball has to finish before there is room to cut it, read off where the ball ends up, so one swinging away is cuttable and one rearing at the body is not. A short ball with width is judged on timing alone: middled it is six, well timed four, held back it is worked along the ground, and anything later or earlier feathers the edge.

Its way back to the guard is authored too. A follow-through that wraps the bat behind the front shoulder cannot travel home in a straight line: the guard holds the bat behind the *other* shoulder, and every short path between the two goes through the batter's head and then his chest. The stroke names a `recover` pose — blade swung forward out in front of him, where he can see it, before it drops into the pick-up — and the tail of the animation routes through that. The long-on drive names one for the same reason.

An edge is not a skier. It comes off the face at gloves height and dies behind the stumps, and there is nobody in the frame to take it — a fielder placed there stands between the camera and the batter and fills the shot. It has its own sound, `bat-edge.mp3`, read ahead of the general wicket sound because the thin noise off the face is the whole story of the dismissal.

## Mobile controls

Swipe **left**, **up-left**, **up**, **up-right**, or **right** for leg side, long on, straight, cover, or the square cut, and **down** to block, on a 90-degree fan so a hurried drag still finds it. The slivers either side of that fan stay dead, so a sideways drag is still no shot. A short 24-pixel swipe commits the shot immediately when its direction becomes clear. Timing is measured at that moment, not at finger-down or release, and uses the same timing bands, compatibility, scoring, and wickets as keyboard play. One shot per ball is shared across input methods. Taps, second fingers, and cancelled gestures do not trigger a shot. A gesture cannot carry into the next ball.

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

## The bowler

He is a right-arm quick, and the action is the five things a real one does, in
the order that makes them work. He runs in — a short approach, a couple of
strides, with the stride tied to the ground he covers so his feet plant rather
than skate; the bound and the delivery stride are what there is to watch, and a
long jog in front of them only spends the batter's waiting time. He leaps into
the bound and turns side-on in the air, bowling arm swept down and back, front
arm reaching up at the target: the gather, where the energy is stored. His back
foot lands parallel to the crease and takes the load. The front leg reaches out
and braces, the front arm is pulled down hard into the ribs, and that block is
what whips the shoulders round and the arm over the top. The ball leaves just
past vertical, from a hand two and a bit metres up. Then he falls away over the
braced leg, the back leg swings through, he runs off down the pitch — and he
stands back up. A follow-through held to its last frame leaves a man bent double
over his own knee, watching a shot he cannot see, which is the tell of an
animation that stopped rather than finished. It runs on its own clock from the
moment of release rather than on the ball's flight, because the flight ends when
the stroke is played: tied to that, a shot cut short strands him half way out of
the follow-through for as long as the result takes to show.

Standing still is the fielders' own pose, not a second one written out beside
it. Both ends of the action are stationary — waiting at his mark, where the
batter looks straight at him for half a second before every ball, and back on
his feet once the ball has gone — and both used to be frames of the run held
still, with the feet staggered mid-stride and the arms at the shortened reach a
runner pumps them at, which puts both elbows out. He is the same body as the men
in the field, so there is one answer to what standing looks like and one place
it is written.

He is lowest as the front foot lands and tallest as the ball goes: the hips
travel up and over the braced leg. That is both what a delivery stride is for
and the only way a leg that length reaches a foot planted that far in front of
it — stood tall the whole way through, the leg is stretched flat before the foot
ever gets down.

The bowling arm is a straight arm on a circle rather than a hand the limb solver
chases, because that is what it physically is: an arm that bends at the elbow
through the delivery swing is a throw, and it is the one thing the laws of the
game actually measure. Driving it by angle means it cannot quietly soften into
one, and a test measures it anyway.

Two things are checked rather than watched. The ball has to leave his hand at
the point the delivery's own trajectory starts from, or it appears out of the
air beside him. And no limb may be asked to reach further than it is long: past
that the two-bone solver clamps, the shin stops short of the foot, and on screen
the leg has come off at the knee. Both plants — the back foot he runs up over
and the braced front foot — are measured in the world he is travelling through
rather than in his own frame, because a foot that slides while it is carrying
weight is the whole tell of a figure being dragged along instead of running. The
front foot also lands behind the popping crease, since the game has no way to
call a no-ball.

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

The game automatically pauses when its tab is hidden or its window loses focus. Resume explicitly to continue. Your personal best is saved locally when browser storage is available. The supplied `normal-hit.mp3` plays for ordinary bat contact (including a contacted dot), `boundary-hit.mp3` plays for both fours and sixes, `bat-edge.mp3` is the thin knick off the face when a cut is edged behind, and `sledge.mp3` comes back from the field after three balls the batter has not scored off. The synthesized fallback is an impact rather than a voice, so a sledge without its clip simply stays silent. These MP3s are bundled locally and decoded after the first Start tap for mobile audio unlocking. Bounce/wicket effects remain synthesized. Mute and pause stop any playing hit clip. A small synthesized fallback keeps play functional if audio loading is unavailable.

## Architecture and tuning

- `src/config/gameplay.ts`: timing bands, line positions, delivery weights/speeds/lengths, the compatibility matrix and the threshold that separates a middled shot from a skied one, the triggers for each special delivery, wicket probabilities, and innings pacing.
- `src/game/`: seeded delivery generation that tracks what the innings has done to the bowler, continuous bounce/swing/spin trajectories with per-delivery length, shot resolution, scorekeeping, keyboard input, and small Web Audio effects.
- `src/game/Tutorial.ts`: the three scripted coaching balls, their deliveries, and an outcome that never dismisses the player.
- `src/Game.ts`: explicit innings state machine and game clock. Pausing freezes gameplay time.
- `src/entities/Cricketer.ts`: the body the bowler and every fielder are built from, and `src/entities/rig.ts`: the two-bone solver and segment placement they share with the batter.
- `src/entities/Bowler.ts`: the bowling action, from the top of the mark to the end of the follow-through.
- `src/scene/GameScene.ts`: reusable procedural characters, bat, wickets, ball, field, instanced crowd, and an aspect-aware camera. The popping crease is 1.2m in front of each wicket and the batter stands inside it rather than over the stumps, so the ball is met about a metre in front of them; `GAME.travelScale` carries the shorter flight that leaves, and every delivery keeps the duration it was tuned to. Bowler and fielders are articulated rather than stacked. Trunk, pelvis and head are each one lathed skin — shoulders, ribs, waist and neck in a single unbroken surface — and the trunk tucks inside the wider pelvis at the waist so the join is buried rather than shown. Every limb is solved between two points and drawn as a segment tapering towards the joint it points at, with a joint sphere sized to the radius the two limbs meeting inside it actually arrive with: a joint wider than its limbs is a bead on a string, one narrower is a gap, and a limb tapering the wrong way — thickest at the wrist — is most of why a body reads as a pile of parts rather than a body. The distant stadium keeps its cheaper faceted shading. The resolver determines outcomes; rendering visualizes them.
- **No stroke passes the bat through the batter.** The pick-up holds the blade up behind one shoulder and the contact holds it down at the ball, half a turn away, so the short path between them can run round the back of his hip; a wrapped follow-through ends behind the other shoulder, so the short path home can run through his head. Both are steered by the poses either side of them — the leg-side flick lays its handle back so the blade comes down in front of him, the straight drive finishes a little wider of the grille, and the cut and the long-on drive each name a `recover` pose. A test measures the bat against the ellipsoids the figure is actually built from — trunk, hips and helmet — every 8ms of every stroke, at both lengths, across the full width of the crease, and fails if it reaches inside any of them.

- `src/entities/Batter.ts`: articulated right-handed batter with eight strokes — the five shot directions, a back-foot pull the leg-side input selects at bouncer height, a square cut that stands tall for a ball at the chest, and a charge down the pitch the confidence meter unlocks — built from smooth primitives, with the bat blade extruded from a real cricket-bat outline, with a side-on guard, flexed knees, the back bent forward over the ball, the head carried on the spine, the bat cocked back over the shoulder so the toe points at first slip with the face opened up, a shared two-hand bat grip, and two-bone arm/leg posing. Both fists ride the bat's own rotation — the right hand below the left on the handle, knuckles lined up along it — and only the gauntlets turn, back up the forearm; a hand free to face its own arm ends up gripping the handle a quarter-turn away from the other one. Elbow hints are scored for room and turned around the arm when one would bury the elbow in the chest or lay the forearm along the handle. The bat carries a full orientation — a handle axis plus a blade face — and poses slerp that rotation, so the blade travels a clean arc instead of rolling at random when a stroke reverses it. Each shot has its own footwork, contact pose, and follow-through; drives step forward, the leg-side stroke rolls into a flick, and the square cut rocks back onto the back foot, strikes square with a horizontal bat, and wraps the blade up over the front shoulder. A stroke may also name a `recover` pose, the shape the bat comes down through on its way back to the guard, for a follow-through the bat cannot travel home from in a straight line without passing through the batter. Both gloves stay attached to the bat handle throughout the stroke. The blade, outgoing ball, impact sound, and result feedback are synchronized at visual contact without altering input timing scores.
- `src/game/Confidence.ts`: the confidence meter. Boundaries, twos and threes fill it, a ball that beats the bat drains it, a single or a block leaves it alone, and a wicket or spending it empties it — a run of form rather than a bank balance, so it cannot be saved across a collapse. Full, it buys one charge down the pitch.
- `src/game/Sledge.ts`: counts the run of balls the batter has not scored off, and says when the fielders have heard enough.
- `src/game/Share.ts`: the innings link and the WhatsApp message built from the final score.
- `src/ui/DotMatrix.ts`: the scoreboard's lamps. Faces are 7 rows of dots, drawn as SVG with the dark lamps as well as the lit ones — the unlit grid is what makes a panel read as a board rather than as text in a box. Punctuation is narrow, so an over count reads `5.0` rather than `5 . 0`.
- `src/ui/HUD.ts` and `src/styles.css`: a full-window stage holding the start card, scoreboard, in-field controls, shot feedback, help, pause, and innings-end screens. Ball feedback is a call that rises off the field and fades on its own — no panel interrupts play, and delivery speed and style are not reported.
- `tests/game.test.ts`: deterministic game-rule and progression tests, confidence-meter arithmetic, which deliveries can be charged, and the WhatsApp share message.
- `tests/batter.test.ts`: grip attachment, hand order and fist alignment on the handle, guard geometry, per-stroke footwork, blade placement at contact, elbow clearance from trunk and handle, hands kept in front of the shoulders through every stroke, and continuous blade travel with a squared face.
- `tests/bowler.test.ts`: the ball leaving the hand where the delivery starts, a straight bowling arm, an arm that climbs over the top once, planted feet that do not slide, a legal front foot, and no limb reaching past its own length anywhere in the action.
- `tests/scoreboard.test.ts`: a lamp face for every character the board can show, the dark grid behind the lit one, and panel sizing.
- `tests/mobile.test.ts`: swipe directions including the defensive fan and its dead slivers, actual pointer event listeners, recognition timing, cancellation, one-shot gating, and normal/boundary sound selection.

Lines are shuffled in bags of five, giving six of each base line over a 30-ball innings. Pace/style is sampled independently. Swing develops before the bounce; spin turns after it and finishes before the final third of the pitch. Compatibility uses the nearest line to the final ball position. Travel duration is scaled for arcade readability. The stage mirrors X so negative world X appears on the left from the batting camera, matching the A key.

The score is recorded when a ball is resolved and displayed at visual contact. The result animation completes before the end screen; no additional ball is generated after the innings ends. Fielders are scenery except for the scripted catcher. There are no extras, running controls, teams, or full fielding AI.

During local development, open `/tools/pose-lab.html` to review the guard, backlift, contact, follow-through, and recovery for every stroke side by side, and orbit the whole grid — a stroke played square cannot be judged from the one angle the game happens to use. `/tools/bowler-lab.html` does the same for the bowling action, one panel per moment, and carries the fielders' own figure below it; a side-on gather cannot be judged from behind the bowler's arm either. This review page is excluded from the production build. The animation tests verify connected grips, reachable arms, planted back toes, distinct footwork, and blade-to-ball alignment across the delivery range.

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

The game is published at **https://ekcuttingchaidesign.github.io/Hitman-Cricket/**. `.github/workflows/deploy.yml` builds and deploys it to GitHub Pages on every push to `codex/cricket-batting-game`, the default branch; only `dist/` is published, and `base: './'` is what lets it serve from a repository subdirectory. A second deployment is managed by Sites using `.openai/hosting.json`. Source remains in the Hitman-Cricket GitHub repository. No account, download, or local server is required to play the published link. Scores stay on each player’s device. Both provided sound clips are included in the public game.
