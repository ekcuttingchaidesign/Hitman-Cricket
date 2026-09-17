# Hitman Cricket

A small, browser-based 3D cricket batting game. Five overs, 30 legal balls, three wickets. Read the delivery, pick a direction, and time your swing. Built with plain TypeScript, Three.js, and Vite; no external art, fonts, character packs, or physics engine are required.

**[Play it here](https://hitman-cricket.vercel.app/)** — nothing to install, and it works on a phone.

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

A phone gets the cover art. `src/assets/cover.webp` fills the screen, `title.webp` sits in the sky, and **Play** and **How to play** sit low on the pitch at the artwork's own proportions: a button is 54% of the width, and the pair end a twentieth off the foot of the screen. Nothing else is on it — the scoreboard, the confidence meter, the field labels and the button row all wait until there is an innings to describe. The trophy line above the buttons is the way onto the board, and it is always there; what it quotes is not. Until there is a personal best it quotes the board's leader, because a best of nought is a sentence about nobody. Across a landscape phone a portrait cover crops to nothing useful, so the live ground stands in for it and the lockup sits over the real thing.

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
| B | Open the board (Esc or B closes it) |
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

Deliveries are not all the same pace, and the gap is the point. A spinner floats down in about 1.3 seconds and a seam ball in about 0.8; an **express** ball arrives in 0.4 and tightens the timing windows with it. A bouncer is not a slow ball with a length on it either — it can come at you at 168. You have to read the pace before you can time it.

But not off the hand. The bowler's action is identical every ball, so the ball itself is the only thing left to read a slower one off — and a ball that crawls out of the hand at two thirds the pace of the last one announces itself in the first frame, a whole second before it arrives. There is nothing to be deceived by in that. So a slower ball leaves the hand at very nearly the pace of a length ball — 84% of it rather than 63% — and dies on the way down instead, reaching the bat at under half the speed it left at. That is also what a floated ball does: the drag it never had the speed to overcome takes the pace off it late.

Only a slow ball is held back. A quick one is never asked to accelerate down the pitch, because balls slow down and do not speed up. And the curve is arranged so the ball still arrives at precisely the moment it always did: every timing window in the game is measured off the contact time, and none of them move. What changes is only where the ball is in between.

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

Both ends of the action are stationary — waiting at his mark, where the batter
looks straight at him for half a second before every ball, and back on his feet
once the ball has gone — and both used to be frames of the run held still, with
the feet staggered mid-stride and the arms at the shortened reach a runner pumps
them at, which puts both elbows out.

Standing is its own pose now, and the knees are the whole of it: feet under the
hips, legs all but straight, arms hanging. A leg carrying weight at 86% of its
length is a crouch, and a man crouching while he waits reads as braced for
something that never comes. A fielder is a different case — he is watching a
batter about to hit it, so his stance widens and his knees soften ready to move
— but that is the resting pose bent rather than a second one written out beside
it, and the crouch is the only difference between them.

The action is the disguise, so it runs on a clock of its own and the ball is
never passed into it. A bowler runs in and bowls at the same tempo every ball,
and what changes is the ball: a slower one comes out of the same arm at the same
speed, and the batter reads the action, commits, and finds the ball is not where
the action said it would be. An action that slowed down with the ball would
announce every variation a full second before it arrived and leave nothing to be
deceived by — so `animate` takes a time and nothing else, and the flight time
cannot reach it even by accident. Measured across an innings from 117 to 155
kph, the run-up is 900 ms on every ball.

The arm goes over in one accelerating sweep, from the bottom of the gather to
the ball leaving the hand, and it is doing about 29 rad/s as it lets go — a fast
bowler's arm. It used to be two sweeps: a climb at 8 rad/s and a last flick at
18, so the arm was still gathering pace at the exact moment the ball went, and
then fell off a cliff to 5 on the far side of it. An arm that stops at release
is what a slow action actually looks like, because the eye follows it through
the ball and what it sees is the arm stop. It carries its speed past the ball
now and bleeds it off over the next fifth of a second.

He accelerates into the crease and never drops back below the speed he ran in
at: 5.9 m/s in, 8.2 through the leap, 7.2 through the gather and 7.1 through the
delivery stride. The shape is what matters rather than any one of those numbers.
It used to fall off a cliff — 6.6 in, then 3.4 and 2.8 — because the gather and
the delivery stride had a fifth of a second between them to cover a metre, and
short distance over fixed time is a man slowing down. Getting the shape right
meant slowing the approach as much as quickening the delivery: at 6.9 in and 6.1
through the stride the arithmetic was nearly level and it still read as momentum
lost, because against a fast run-in anything short of faster reads as slower. A
fast bowler's delivery stride alone is longer than the gather and the stride
were put together; it is 1.4m now, longer than his leg.

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
| **Yorker** | After he has been hit for three sixes | 152–163 kph, pitched at the toes and skidding on. It arrives at boot height in under half a second, and it is aimed at the stumps. |
| **Bouncer** | Occasionally, any line | Lands short and rears to chest height. It is over the stumps, so you can never be bowled or caught off it — but it can only be **pulled**, and only if you middle it. Perfect timing on a leg-side swipe is six; anything else goes through to the keeper. |
| **Slower ball** | Once four quick balls have gone by | 78–98 kph and floated in at nearly a second and a half, straight after a burst of pace — and out of the same arm at the same speed, leaving the hand at nearly the pace of a length ball and dying late. |

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

## The board

A top fifty, one row per player, best innings only. The ranking is built and tested; the two endpoints behind it are not, so the screen runs against fifty invented innings until they are.

Innings are ordered by **runs**, then **sixes**, then **fours**, then **fewest wickets**, then **fewest dots**, then **earliest submission**. A dot is a ball that scored nothing *and* was not a wicket, which keeps the last two keys independent of each other.

**Strike rate is deliberately not on the ladder.** The innings ends at thirty balls or three wickets, so fewer balls faced means the player got out — ranking on strike rate would put whoever threw it away above whoever saw it through. Wickets lost already carries that, the right way round.

All six keys pack into one number, so a store can sort the board natively with no comparator in the query path and the browser computes the identical number to answer "do I qualify" with no network call:

```
rank  = runs<<17 | sixes<<12 | fours<<7 | (3-wickets)<<5 | (30-dots)
score = rank * 2**28 + (MAX_T - secondsSinceLaunch)
```

Twenty-five bits of rank over twenty-eight of clock is **exactly 53**, a double's mantissa, with nothing spare. Two tests guard it: one pins the budget at 53, the other proves a real innings packs past 2^32 without wrapping — because JavaScript's shift operators are 32-bit and a `<<` on that second line would hand back a small scrambled number with no error anywhere. `LAUNCH_MS` is 1 Jan 2026, and changing it reshuffles existing ties; the submission stamp has to come from the store, or a wrong clock decides a tiebreak.

A row reads left to right as one sentence: where they came, who they are, what the innings came to, and how it was made. Where two rows are level on runs, the lower one says what split them — `level · fewer 6s`, `level · lost more`, `level · later` — and lights the figure it turned on where that figure has a column. Colour is not carrying that alone; the note says the same thing in words. Under the fiftieth row is the cut, the only rule on the sheet with a colour and words on it, and below the cut sits the innings just played when it did not make it.

The fifty invented rows are the best fifty of a field of a hundred and ten, because that is what a board is: sample fifty at random and the worst of them is whoever was bowled in the first over, and the cut-off line reads four runs. Every one of them is played out ball by ball rather than written down as figures, so the runs add up out of the balls that produced them and `plausible()` passes on all fifty. Two ties are planted — one split below runs, one the clock alone split — because both are rare enough in fifty innings to go unseen until they turn up on the real board.

A player is a long random id the browser holds on to, written to localStorage, a long-lived cookie and IndexedDB at once and restored from whichever survived. They fail in different ways and at different times, which is the point: a browser that forgets the id has not lost a row, it has quietly minted a second player who plays under the same name. Each id carries the moment it was minted, so when the copies disagree the older one wins and is written back over the younger. None of this is a security measure — an id in a browser identifies a browser, not a person — and the answer to someone wanting two rows is a delete path for the owner rather than a cleverer cookie.

### The Test ladder

Survive has a board of its own, at `?mode=survive` on both endpoints, and it is a second ladder rather than a second copy of this one. The five-over ladder ranks on runs and reads everything else as a tiebreak, because in that innings runs are the only thing anybody is trying to get. A Test match is not one contest, it is three — and a hundred is not a high score in it, a hundred is a **win**.

So the ladder is tiered, and each tier is ranked on the figure that tier was actually about:

| Tier | Ranked on | Why |
| --- | --- | --- |
| **Won** | fewest balls used | A chase is a race. The same hundred off thirty-eight beats it off fifty-two. |
| **Drawn** | most runs made | He had nothing left to chase, so what he made while surviving is the measure. |
| **Lost** | most balls faced | How long the last man kept them out is the only thing left to be proud of. |

Runs sit under all three as a tiebreak, so two identical chases are split by what was scored on the way, and under runs sits **the meter**: two innings level on everything a scorecard holds are split by how much of a battering they took to get there. One ladder over one number would put a man who made eighty and lost above a man who blocked sixty balls and saved the match, which is exactly backwards.

```
rank  = tier<<23 | primary<<14 | runs<<5 | healthLeft/4
score = rank * 2**28 + (MAX_T - secondsSinceLaunch)
                                           (primary = balls saved, runs, or balls faced)
```

**The meter earns that rung in the drawn tier**, where the two keys above it are the same figure: a draw is ranked on runs and then tied on runs, so before this every pair who batted out the overs for the same score fell straight through to the clock — and a draw for a modest score is the *common* innings here, not a rare one. It is also the one tier where damage costs nothing by itself. He survived, so the meter never ended anything, and a man worked over for sixty balls sat level with one who was barely touched. Under a loss it says less, because there the meter has usually already had its say by ending the innings early.

What is ranked is the **bar, not the blow count** beside it: one on the helmet costs thirty and two on the pad sixteen, so a ladder reading the tally would have said the opposite of what the player watched. It is stored in steps of four points out of a hundred, because twenty-five steps need five bits and a hundred would need seven. Nothing is lost by the rounding — the cheapest blow in the mode still costs several points, so any two innings that took a different battering are at least one step apart.

Twenty-five bits of rank over twenty-eight of clock, which is a double's fifty-three exactly. The meter's five bits took the last of the room this ladder had spare, so it now sits where the other one does: at the line, with nothing left. A test holds it there, because a field added after this cannot be paid for out of the rank — it would have to come out of the clock, and shortening the clock reshuffles ties that are already settled. The clock stays at the bottom regardless: it is the only key the store stamps itself, so it is the one figure a submitted row cannot lie about. The tier is read off the figures rather than carried beside them, because the store has to decide it from a row somebody posted and cannot trust an ending sent along with it. The order matches the game's own `endingOf`: the hundred is checked before the overs, so a chase finished on the last ball is a win, and a man bowled on the sixtieth is a draw with ten down.

A row leads with a letter — **W**, **D**, **L**, in the sheet's own tier colours — because three contests stacked into one list read as one list unless something says where each begins. The tiers are always contiguous, so one column of letters bands the sheet at a glance. The colour is not carrying it alone: the letter says it, and the line under the name says it in full, which is also why the letter is hidden from a screen reader. That line is where the two ways of losing are told apart.

**The big figure on a row is the figure its tier is ranked on** — `primaryOf` itself, so what the eye lands on cannot drift from what put the row there. It is *22 to spare* on a win, *23 runs* on a draw, *47 balls* on a loss, and more is always better. Leading with runs instead is what made a board reading 72 sit above one reading 86 and look broken: both were losses, and a loss is ranked on how long he lasted. The figure is never written without its unit, because the same 47 is a rearguard in one tier and nothing of the kind in another — and what the big figure leaves behind sits beside it in small: the runs (with the not-out star, which follows the runs wherever they are) and the blows.

The line under the name carries what the figures do not: *Won off 38 balls*, *Drew the match*, *Bowled out*, *Retired hurt*. A win says what it took, since the row already says what it left. The two ways of losing are told apart on the wicket: nine down and a wicket makes ten, and no wicket at all with balls still to bowl means he was carried off. That difference is the whole of what the injury bar is for, and a board that flattened both into "out" would throw it away. Where a row was split from the one above it by something the row does not show — the meter, or the clock behind it — it says so under the name: *Drew the match · more hurt*. The three keys the row already carries get no note, because labelling what the reader can see is noise. What it takes to get on is said in the terms of whichever contest the fiftieth row is sitting in, because "you are twelve short" means nothing against a row that won.

The Test card's claim strip is the five-over card's strip, moved. One element with one form, one picker and one set of listeners, relocated into whichever card is on screen — two copies under two sets of ids would have been two of every bug as well.

The meter also tightened what the store will take. Damage comes from blows and from nothing else, so a bar that moved with no blow behind it is refused; and a man carried off — balls left to bowl, no wicket against him — with health still on the bar is a shape the mode cannot produce. Neither is an anti-cheat measure, any more than the rest of the floor is: the game is a static page and a determined person can post anything that passes. They reject what could not exist.

The two boards have **separate ranking and row keys and one shared name registry**. Separate keys because a chase and a five-over slog are not comparable and one sorted set holding both would rank them against each other. Shared names because a name is a person, not an innings: a player carries theirs from one board to the other, and nobody else can bat under it on the board they have not played yet.

There are no invented rows for the Test board. The fifty fixtures stand in for the other one while there is no database; a ladder of people who never batted is worse here than an empty screen.

### Claiming a place

An innings that earns a place puts a strip on the card between the figures and the keys: a green banner saying where it landed, the two rows it landed between, and one key to do something about it. The rows either side are the point — *fifth has 102* is what makes 101 mean something, and a place on its own does not. Each peek row carries the same three figures the board does (runs, sixes, fours), so it is a true preview of the screen the key opens rather than a different thing that resembles it. Other players are bars rather than names: the peek is about where the player sits, and the full board one tap away has every name on it.

Tapping the key morphs the strip rather than growing the card — the peek and the key step aside, the picker and the name field take exactly their place, and nothing above moves. Submitting opens the **full board**, with Play again, Share and Insta Story pinned to the foot of it: fifty rows is a long scroll, and a player who has just been put on the board should not have to reach the bottom of it to leave.

The register key is filled and green, continuing its banner, rather than a second white-on-orange key competing with Play again. Play again is the card's primary and stays the card's primary.

Every state is in `/tools/card-lab.html`, which is also where the peek's own bug showed up: a hardcoded place put the player between two rows that did not bracket them, because 101 runs is not sixth on a board topped at 107. The lab asks the board where the innings goes now.

Whether an innings qualifies is answered from the board already on screen, so nothing waits on the network at the one moment a wait would be felt. A board that has not loaded is not a reason to say no — the store ranks it properly either way. The place shown on the key is the browser's guess; the line after claiming is the store's answer.

A returning player is not asked twice: the name and kit are kept in `localStorage` (`src/game/player.ts`, deliberately not in the three-store identity, because losing a preference costs one tap and losing an id costs a row), and the key submits straight away.

**Game shortcuts are suppressed while a text field has focus.** Without that, typing "Rohit" restarts the innings on the `R` — the shortcut listener is on `window`.

### Private windows

A private window is handed a player id it will forget the moment it closes, so an innings claimed from one takes a row on the board that nobody can ever come back to and improve. The game therefore opens such a window on the poster at `public/younaughtyyou.webp` rather than on the cover.

**No browser will say whether it is private.** It is deliberately undetectable: a page that could tell would be a page that could treat those players differently, which is the thing private browsing exists to stop. So `src/game/private-mode.ts` guesses, from the one side effect left to read. A private window is given a small temporary quota where an ordinary one is given a share of the disk, and `navigator.storage.estimate()` reports the gap: tens of gigabytes against a fraction of one. Firefox adds a second tell — no service workers in a private window — and that is the lot. Nothing asks whether storage *works*, because in a private window it works fine; it is only forgotten afterwards.

The quota tell has one predictable way of being wrong, and it was wrong the first time it was run: a machine with very little disk left reports a private window's figure while being nothing of the kind. So the line is drawn low — twice the JS heap ceiling, held between one and two gigabytes — and a browser that has been here **on an earlier day** is cleared whatever its quota says. That mark (`hitman-seen`, a date in `localStorage`) is the one thing a private window can never produce, because it does not last the night.

**The poster is the screen.** It already says the thing in its own type, so the page adds no words of its own. It is fitted rather than filled, and held to the top of the window: the line runs along the top of the poster and the two emoji sit right out at its edges, so a phone — a narrower shape than the poster — would cut the joke off at both ends if the picture were cropped to fit. The room left over gathers underneath in the poster's own blue, deepened, which is where the keys go: the cover's own pair, the white key on its orange base and the navy plate under it, because the cover already stands that pair over artwork and this is the same game. On a screen with no room to spare they sit over the foot of the poster instead. The picture's last tenth is faded out into that blue: a poster that simply stopped ruled a line across the screen, and where the line fell depended on the phone.

What the keys do is not a lock, because the check is a guess:

- **Play anyway** starts the innings, with the register key turned off for it. The card still says where the innings landed; what it offers is the board rather than a form. The second line inside the key is the cost of pressing it, not a paragraph about private browsing.
- **Copy link**, for pasting into an ordinary tab, which is the thing the poster is asking for.
- The notice is shown **once a session**. A reload does not ask again.
- `?private=1` forces it on and `?private=0` forces it off, which is how the screen is worked on without two browsers open.
- The artwork is served from `public/` rather than bundled, so a missing file costs a headline set in the game's own type rather than a build. The words the poster carries are in the page too, hidden, and take its place if it never loads. The file name is the whole contract — `src/ui/PrivateNotice.ts` is the only place it is asked for, and any format a browser reads will do.

The poster is portrait, near enough to nine by sixteen; this one is 941 &times; 1672, which arrived as a 1.8 MB PNG and was written to WebP at quality 82 — the setting the kit pictures use — for 122 KB with nothing visible lost. A replacement wants the same shape, its own copy of the line along the top, and a quiet lower fifth, which is where the keys land on a screen with no room to spare.

Two events are counted: `private-window` when the notice goes up, and `private-play-anyway` when somebody bats on regardless. The second is the one worth watching — it is also how a check that has started guessing wrong would show up, as a ratio that climbs after a browser release.

### The avatars

Five pictures, at `public/avatars/1.webp` … `5.webp`, 96 px square. They are served as files rather than bundled, so the game builds and runs whether or not they are there. Until they arrive — and if one ever fails to load — each kit is the coloured disc with the player's initial that the board has always drawn, and the picture simply takes itself off the page. The board never shows a broken image, only an earlier version of itself. Kit colours are in `src/config/board.ts`, taken off the kits in the pictures and lightened until navy ink on them clears 6:1.

### Running the board locally

`npm run dev` serves the endpoints itself, over an in-memory board. **No Vercel CLI, no credentials, no database** — the whole feature works on localhost: play an innings, claim a place, watch a name be refused because somebody already has it. The rules are the real ones (`vite.config.ts` mounts the same `readBoard` and `submitScore` that `api/` does); only where the rows are kept stands in. The board starts empty and is forgotten when the server stops.

To run against the real database instead, use Vercel's own CLI, which pulls the credentials down rather than having you copy them:

```
npm i -g vercel && vercel link
vercel env pull .env.development.local
vercel dev
```

### Three compilers, three answers

`npm run build` runs `tsc --noEmit`, then `node scripts/function-check.mjs`, then `vite build` — because the first two ask questions the third cannot.

The middle one exists for a bug that shipped: `package.json` declares `"type": "module"`, so Vercel loads each function as ESM, and **ESM requires an explicit extension on every relative import**. Extensionless specifiers resolve perfectly in Vite, in Vitest and under `moduleResolution: "Bundler"`, and crash in Node. The deployment went green, the build was clean, and every request died with `FUNCTION_INVOCATION_FAILED` before a line of the handler ran — so there was nothing in the logs the handler wrote, because the handler never existed.

Hence the `.js` on relative imports in `api/` and in everything those files reach. It is not a mistake and must not be tidied away. TypeScript maps `.js` back to the `.ts` beside it, so it costs the rest of the project nothing.

`function-check.mjs` transpiles `api/` to real ESM with no bundler in the way and imports each handler in Node, asserting a function comes back. Nothing is called, so it needs no credentials and makes no requests — it asks only whether the module graph resolves. Reintroduce a missing extension and it fails; that was verified rather than assumed.

### The functions carry nothing of their own

`api/board.ts` and `api/score.ts` import no Vercel package and have no tsconfig of their own, deliberately. Both were tried and both made things worse:

- **`@vercel/node`** is the builder as well as the types. A copy pinned here is one more thing that can disagree with the platform's own, so the two interfaces the endpoints actually touch are declared in `src/server/http.ts` instead. They are structural, so anything that passes a request and response of that shape works.
- **`api/tsconfig.json`** forcing CommonJS is wrong in a package declaring `"type": "module"` — it emits `require` into a tree Node will read as ESM.

What is real is that a discriminated union keyed on `ok: true | false` only narrows under `strictNullChecks`, and the compiler that builds the functions is not the one configured here. `api/score.ts` reading `outcome.status` type-checked locally and failed on deploy three times running. Hence `refused()` in `board-store.ts` is a real type predicate rather than an `if (!outcome.ok)` that leans on inference — the code compiles whatever settings it meets. Compiling the functions with `--strict` off is how that was reproduced, and is worth doing after any change to them.

### Checking a deployment

```
npm run check:board                                    # the dev server
node scripts/board-check.mjs https://…vercel.app       # a real deployment
```

Unit tests run the rules against an in-memory store, which catches logic and **cannot** catch a missing credential, a function in the wrong region, or an `api/` directory Vercel never turned into functions. This is the check that does, and it is the first thing to run against any new deployment. It reads the board, submits a real innings, proves the row survives a fresh read, proves a worse innings does not displace it, and proves each refusal — a taken name, an impossible innings, something that is not a player, a kit that does not exist — then checks the preflight and the edge-cache header. It then does the same for the Test ladder and proves the two are really separated: an innings on one is nowhere near the other, a slower chase does not improve on a faster one, and a name held on either board is refused on the other. One wrong key prefix is invisible to the unit tests, which run two stores because the test made two.

It writes. Every run leaves a row under a throwaway id and a name nobody would want, and **a name it claims is never released**. Point it at a preview rather than at the board people are playing for.

### One database, three environments

The integration injects one set of credentials into Production, Preview and Development alike, so without care a branch under test writes to the board people are playing for. Every environment but production therefore prefixes its keys (`preview:board`, `development:board`), driven by `VERCEL_ENV`, which Vercel sets on its own. Anywhere it is unset is treated as development rather than as production, so the accident is a wasted key rather than a polluted board.

### The two endpoints

`GET /api/board` answers with the fifty and the packed score the fiftieth is holding — **the same answer for everybody**, deliberately, so it can sit in Vercel's edge cache for ten seconds. Where a player stands is worked out in their own browser from the packed score, which is the same number computed by the same function, so the response carries nothing personal. A hundred people opening the board in the same ten seconds cost one pair of Redis commands rather than a hundred, which is what keeps a half-million-command month out of reach. It reads with the read-only token: an endpoint that cannot write is one fewer thing to get wrong.

`POST /api/score` checks the rate limit first (so a script pays nothing to be turned away), then the shape, then `plausible()`, then the name — and stamps the submission itself. The clock is read on the server and nowhere else, or a laptop running fast would win every tiebreak it entered.

The storage shape is chosen to spend as few commands as possible rather than for how it would look in a relational schema:

| Key | Type | Holds |
| --- | --- | --- |
| `board` | sorted set | player id → packed score. `ZADD GT CH`, so a worse innings cannot displace a better one and the reply says whether anything moved. |
| `players` | hash | player id → the row as JSON. One `HMGET` returns all fifty. |
| `names` | hash | folded name → player id. `HSETNX`, so two people claiming one name in the same second cannot both be told it is free. |
| `survive:board`, `survive:players` | as above | The Test ladder, on its own keys. `?mode=survive` on either endpoint picks them. |

Two things are deliberately **not** scoped by mode. `names` is one registry across the whole game, for the reason given above. The rate limit is the other: it counts submissions from an address, and an address that has posted sixty innings has posted sixty whichever mode they were played in.

Reading the whole board is **two commands**, not fifty. The row is written only when the score actually improved — the ranking and the figures beside it have to describe the same innings, or the board shows a player's best score next to their latest innings' boundaries.

A name is compared in a folded form — case, spacing, punctuation and accents thrown away — so "Big Show", "bigshow" and "Bíg Shów" are one name and the second person to want it is told so. A name once held is never released, including when the holder has a bad day: letting one go free would let the next person pick up somebody else's reputation.

Rate limiting is by address and the address is **never** used as identity, because a school, an office and everyone behind CGNAT all arrive as one. The limit is deliberately generous for the same reason.

`plausible()` is not an anti-cheat measure and should not be mistaken for one. The game is a static page, so a determined person can post any innings that passes it. It turns down the ones that could not have happened, which is the floor. Replay verification is the ceiling, and nothing built here is thrown away by it.

## Architecture and tuning

- `src/config/gameplay.ts`: timing bands, line positions, delivery weights/speeds/lengths, the compatibility matrix and the threshold that separates a middled shot from a skied one, the triggers for each special delivery, wicket probabilities, and innings pacing.
- `src/game/`: seeded delivery generation that tracks what the innings has done to the bowler, continuous bounce/swing/spin trajectories with per-delivery length, shot resolution, scorekeeping, keyboard input, and small Web Audio effects.
- `src/game/Tutorial.ts`: the three scripted coaching balls, their deliveries, and an outcome that never dismisses the player.
- `src/Game.ts`: explicit innings state machine and game clock. Pausing freezes gameplay time.
- `src/entities/Cricketer.ts`: the body the bowler and every fielder are built from, and `src/entities/rig.ts`: the two-bone solver and segment placement they share with the batter.
- `src/entities/Bowler.ts`: the bowling action, from the top of the mark to the end of the follow-through, on one clock of its own that the delivery cannot reach.
- `src/scene/GameScene.ts`: reusable procedural characters, bat, wickets, ball, field, instanced crowd, and an aspect-aware camera. The popping crease is 1.2m in front of each wicket and the batter stands inside it rather than over the stumps, so the ball is met about a metre in front of them; `GAME.travelScale` carries the shorter flight that leaves, and every delivery keeps the duration it was tuned to. Bowler and fielders are articulated rather than stacked. Trunk, pelvis and head are each one lathed skin — shoulders, ribs, waist and neck in a single unbroken surface — and the trunk tucks inside the wider pelvis at the waist so the join is buried rather than shown. Every limb is solved between two points and drawn as a segment tapering towards the joint it points at, with a joint sphere sized to the radius the two limbs meeting inside it actually arrive with: a joint wider than its limbs is a bead on a string, one narrower is a gap, and a limb tapering the wrong way — thickest at the wrist — is most of why a body reads as a pile of parts rather than a body. The distant stadium keeps its cheaper faceted shading. The resolver determines outcomes; rendering visualizes them.
- **No stroke passes the bat through the batter.** The pick-up holds the blade up behind one shoulder and the contact holds it down at the ball, half a turn away, so the short path between them can run round the back of his hip; a wrapped follow-through ends behind the other shoulder, so the short path home can run through his head. Both are steered by the poses either side of them — the leg-side flick lays its handle back so the blade comes down in front of him, the straight drive finishes a little wider of the grille, and the cut and the long-on drive each name a `recover` pose. A test measures the bat against the ellipsoids the figure is actually built from — trunk, hips and helmet — every 8ms of every stroke, at both lengths, across the full width of the crease, and fails if it reaches inside any of them.

- `src/entities/Batter.ts`: articulated right-handed batter with eight strokes — the five shot directions, a back-foot pull the leg-side input selects at bouncer height, a square cut that stands tall for a ball at the chest, and a charge down the pitch the confidence meter unlocks — built from smooth primitives, with the bat blade extruded from a real cricket-bat outline, with a side-on guard, flexed knees, the back bent forward over the ball, the head carried on the spine, the bat cocked back over the shoulder so the toe points at first slip with the face opened up, a shared two-hand bat grip, and two-bone arm/leg posing. Both fists ride the bat's own rotation — the right hand below the left on the handle, knuckles lined up along it — and only the gauntlets turn, back up the forearm; a hand free to face its own arm ends up gripping the handle a quarter-turn away from the other one. Elbow hints are scored for room and turned around the arm when one would bury the elbow in the chest or lay the forearm along the handle. The bat carries a full orientation — a handle axis plus a blade face — and poses slerp that rotation, so the blade travels a clean arc instead of rolling at random when a stroke reverses it. Each shot has its own footwork, contact pose, and follow-through; drives step forward, the leg-side stroke rolls into a flick, and the square cut rocks back onto the back foot, strikes square with a horizontal bat, and wraps the blade up over the front shoulder. A stroke may also name a `recover` pose, the shape the bat comes down through on its way back to the guard, for a follow-through the bat cannot travel home from in a straight line without passing through the batter. Both gloves stay attached to the bat handle throughout the stroke. The blade, outgoing ball, impact sound, and result feedback are synchronized at visual contact without altering input timing scores.
- `src/game/Confidence.ts`: the confidence meter. Boundaries, twos and threes fill it, a ball that beats the bat drains it, a single or a block leaves it alone, and a wicket or spending it empties it — a run of form rather than a bank balance, so it cannot be saved across a collapse. Full, it buys one charge down the pitch.
- `src/game/Sledge.ts`: counts the run of balls the batter has not scored off, and says when the fielders have heard enough.
- `src/game/Share.ts`: the innings link, the WhatsApp message, and the file name and type each shared picture travels under.
- `src/game/ShareCard.ts`: the innings-end card painted onto a canvas so it can leave the page as a picture. Both share buttons draw the same card, minus its buttons, with the Hitman Cricket lockup in the corner; the story button stands that card on the cover art in a 1080x1920 frame with the address painted on. Two platform limits shape it. A `wa.me` link carries text and nothing else, so where the browser can hand a file to another app the button goes through the share sheet instead and the link stays as the fallback; and a picture in a story is a picture, so the address is readable type rather than a tappable sticker, since link stickers are added inside Instagram or WhatsApp and not by whoever sent the image. The card is a PNG for its flat colour and sharp type, the story a JPEG for its photograph.
- `src/game/leaderboard.ts`: the ladder, written once and imported by both sides — the browser runs it to decide whether an innings is worth asking a name for, and the store will run it to decide what the board actually is. Carries the packed score, the plausibility floor, and `decidedBy`, which names the figure that separated two innings so a row can point at the reason it sits where it does.
- `src/server/board-store.ts`: what the board is on the store's side — reading it, and everything that decides whether a submitted innings is taken. Every command it needs is named on a `BoardStore` interface rather than reached for through a Redis client, so the whole submit path is tested with no network and no database, and the day this moves off Redis one adapter changes and none of the rules do. A `Ladder` says which figures a row carries, how they pack, what could not have happened, and which keys to write; the rules above it are written once and run for both boards.
- `src/server/memory-store.ts`: the board in memory, behind the same interface. It backs the dev server and the tests — one implementation rather than two, because a second copy drifts from the one the endpoints are developed against. It keeps the semantics the Redis adapter leans on rather than the convenient ones.
- `src/server/upstash.ts`: that interface over Upstash. Note it does not use the client's own `Redis.fromEnv()` — Vercel's integration injects `KV_`-prefixed names, `fromEnv` looks for `UPSTASH_`-prefixed ones, and it would find nothing at runtime on a page nobody is watching.
- `src/server/http.ts`: CORS, the address the edge reports, and how a failure is phrased. The allowlist is an allowlist rather than a `*` because one of the two endpoints writes.
- `scripts/function-check.mjs`: whether each function loads at all in Node. Part of `npm run build`.
- `api/board.ts` and `api/score.ts`: thin handlers. They turn a request into a call and the answer into a response, and hold no rules of their own.
- `src/game/board-api.ts`: the browser's side. Every call is on a four-second leash and a failure is an answer rather than an exception, because the board must never hold up an innings. The invented fifty answer only where there is no API to ask — a live board that quietly fell back to made-up names would be lying about who is on it.
- `src/config/board.ts`: the five kits and where their pictures live. One place, because three screens draw them.
- `src/game/player.ts`: the name and kit this browser bats under, kept apart from the identity in `identity.ts` — that one must never be lost, this one costs a tap.
- `src/game/board-fixture.ts`: fifty innings nobody played, so the board could be designed before there is a database behind it. Deterministic from one seed.
- `src/game/identity.ts`: the player id, written to and restored from three stores at once. A store that throws is treated as empty and a store that hangs is left behind after a second, so a wedged IndexedDB costs the player a second rather than the game.
- `src/ui/Leaderboard.ts`: the board as a string of HTML built from figures and nothing else, the way the rest of this interface is written, which is what lets fifty rows be checked with no browser in the room. Names come off the board, which is to say off other players, so they are written into the page as text and never as markup.
- `src/game/survive-board.ts` and `src/ui/SurviveBoard.ts`: the Test ladder and the sheet that draws it. Same shapes, same escaping, same peek — a different ladder underneath and a row that leads with what happened rather than with the number.
- `src/ui/DotMatrix.ts`: the scoreboard's lamps. Faces are 7 rows of dots, drawn as SVG with the dark lamps as well as the lit ones — the unlit grid is what makes a panel read as a board rather than as text in a box. Punctuation is narrow, so an over count reads `5.0` rather than `5 . 0`.
- `src/ui/HUD.ts` and `src/styles.css`: a full-window stage holding the start card, scoreboard, in-field controls, shot feedback, help, pause, and innings-end screens. Ball feedback is a call that rises off the field and fades on its own — no panel interrupts play, and delivery speed and style are not reported.
- `tests/share.test.ts`: what the shared card says for every innings ending, that it copies the innings rather than holding a reference to it, the file name and type each picture travels under, and that the address is in the caption because the picture cannot be tapped.
- `tests/game.test.ts`: deterministic game-rule and progression tests, confidence-meter arithmetic, which deliveries can be charged, the flight curve that hides a slower ball off the hand without moving the moment it arrives, and the WhatsApp share message.
- `tests/batter.test.ts`: grip attachment, hand order and fist alignment on the handle, guard geometry, per-stroke footwork, blade placement at contact, elbow clearance from trunk and handle, hands kept in front of the shoulders through every stroke, and continuous blade travel with a squared face.
- `tests/bowler.test.ts`: an action that is the same pose at the same moment whatever the ball does and cannot be told how fast it is, an arm accelerating into the ball and still going after it, momentum carried into the crease rather than lost on the way, no jump where the run-up hands over to the follow-through, the ball leaving the hand where the delivery starts, a straight bowling arm, an arm that climbs over the top once, planted feet that do not slide, a legal front foot, and no limb reaching past its own length anywhere in the action.
- `tests/leaderboard.test.ts`: every rung of the ladder in turn, the packed score's 53-bit budget and that a real innings packs past 2^32 without wrapping, and the innings the plausibility floor turns down.
- `tests/player.test.ts`: the stored name and kit, including a kit that no longer exists, junk under the key, and storage switched off.
- `tests/board-store.test.ts`: the submit path end to end against an in-memory Redis that keeps the semantics the adapter leans on — `ZADD GT` only moves a score upwards, `HSETNX` only claims a free name. A fake that took every write would pass tests the real store would fail. Covers one row per player however many innings they play, a better innings surviving a worse one that follows it, name folding, and a rate limit that charges a rejected submission nothing.
- `tests/board.test.ts`: that all fifty invented innings could have been dealt, that the last row is a real innings rather than a duck, both planted ties, what a row says about why it sits where it does, and that a name is written into the page as text.
- `tests/identity.test.ts`: restoring a player from whichever store survived, folding a browser that minted a second id back onto the first, and staying playable when every store is broken.
- `tests/scoreboard.test.ts`: a lamp face for every character the board can show, the dark grid behind the lit one, and panel sizing.
- `tests/mobile.test.ts`: swipe directions including the defensive fan and its dead slivers, actual pointer event listeners, recognition timing, cancellation, one-shot gating, and normal/boundary sound selection.

Lines are shuffled in bags of five, giving six of each base line over a 30-ball innings. Pace/style is sampled independently, and the innings is medium-fast by default: about six in ten come out between 118 and 142 kph, roughly one in five is quick, one in seventeen is genuinely express, and one in six is slow. Everything else is a change from that — the quick ones and the slow ones are what happens to a batter who has settled into a rhythm, and a mix with a quarter of each is not a surprise, it is a lottery. Swing develops before the bounce; spin turns after it and finishes before the final third of the pitch. Compatibility uses the nearest line to the final ball position. Travel duration is scaled for arcade readability. The stage mirrors X so negative world X appears on the left from the batting camera, matching the A key.

The score is recorded when a ball is resolved and displayed at visual contact. The result animation completes before the end screen; no additional ball is generated after the innings ends. Fielders are scenery except for the scripted catcher. There are no extras, running controls, teams, or full fielding AI.

During local development, open `/tools/card-lab.html` to review the innings-end card in every state it can reach, including each step of claiming a place — driving those off a real innings needs a board behind it as well as thirty balls. Open `/tools/pose-lab.html` to review the guard, backlift, contact, follow-through, and recovery for every stroke side by side, and orbit the whole grid — a stroke played square cannot be judged from the one angle the game happens to use. `/tools/bowler-lab.html` does the same for the bowling action, one panel per moment, and carries the fielders' own figure below it; a side-on gather cannot be judged from behind the bowler's arm either. This review page is excluded from the production build. The animation tests verify connected grips, reachable arms, planted back toes, distinct footwork, and blade-to-ball alignment across the delivery range.

## Reproduce and inspect

Use `/?debug=1&seed=222` for a repeatable innings. The debug panel shows the phase, seed, delivery line/style/speed, base and final X, ideal contact time, shot, timing delta/grade, compatibility, quality, and outcome. Exact line information is hidden in normal play. The debug-only `window.__cricket.snapshot()` bridge is read-only and supports automated keyboard testing. A seed reproduces the same delivery/outcome sequence when shot inputs are the same.

## Browser verification

With the development server running on port 5173:

```sh
npm run test:browser
```

The supplied scripts use headless Microsoft Edge through Playwright (`channel: 'msedge'`), which must be installed. They take desktop/narrow screenshots, check runtime errors and page overflow, and play a full innings using keyboard events and Playwright's virtual clock. They also verify three-wicket termination, pause, restart, combo input, one-shot gating, and the absence of debugging data in normal play. Screenshots are written to the ignored `test-results/` directory.

Verified in Edge: a 30-ball seeded innings finished at **138/0 in 5.0 overs**, all seven delivery styles appeared, and a no-shot innings ended at three wickets. Unit tests cover all supported scores, timing boundaries, compatibility entries, wicket rules, trajectory continuity, line balance, and deterministic outcomes. Chrome and Safari are target browsers but have not been manually certified here.

## What is counted

The game reports to GoatCounter, which is a hit counter with events: a page view, and named events that are paths with a flag on them. There are no custom properties, so everything worth knowing is in the event's name — runs go out as a band, `score-50-74`, never as a figure, because fifty thousand distinct paths is not a dashboard.

Nothing is reported ball by ball. A thirty-ball innings that sent a hit per delivery would be thirty hits for two minutes of one player's time, which buys nothing except a noisier dashboard. The moments below are the ones that answer a question:

| Event | What it answers |
| --- | --- |
| *page view* | How many arrive, from where, on what. GoatCounter collects this on its own. |
| `first-shot` | Whether they worked out how to swing. Once per session, tutorial or innings. |
| `tutorial-start`, `tutorial-complete` | Whether the three balls are taken up, and whether they are seen through. |
| `innings-start`, `innings-replay` | Every innings begun, and the ones that were not the first of the session. |
| `innings-restart` | An innings walked out on mid-over. Frustration, or a bad first ball. |
| `innings-end` | An innings played out. Against `innings-start`, the completion rate. |
| `innings-all-out`, `innings-overs-up` | Which way it ended: three wickets, or thirty balls. The difficulty dial. |
| `score-0-9` … `score-100-plus` | Where the scores actually fall, claimed or not. |
| `board-open` | Whether the fifty is looked at. |
| `claim-open`, `claim-done`, `claim-failed` | The registration funnel: offered, taken, and refused by the store. |
| `survive-…` | The same events again, for a Test innings. GoatCounter has no custom properties, so the mode is in the name or it is nowhere — everything about an *innings* is prefixed, and everything about a *session* (the first shot, the help screen, the minutes played) is not, because those are the same fact whichever innings they happened in. |
| `survive-result-won` … `survive-result-lost` | Which of the five result cards the Test innings earned. |
| `survive-balls-under-1-over` … `survive-balls-8-10-overs` | How long the last man lasted, in overs rather than balls, because that is how a Test innings is read. |
| `share-whatsapp`, `share-story`, `share-link` | The taps. Whether the sheet was then sent, no browser will say. |
| `help-open` | The controls did not explain themselves. |
| `webgl-fail` | The ground could not load, and nothing that follows was ever possible. |
| `visitor-new`, `visitor-returning` | Whether this browser has played here before. |
| `back-same-day` … `back-over-30-days` | How long a returning player was away. |
| `days-played-1` … `days-played-11-plus` | How many separate days this browser has played on. |
| `innings-under-30s` … `innings-over-5m` | How long an innings took, in each mode under its own prefix. |
| `played-1m`, `played-3m`, `played-5m`, `played-10m`, `played-20m`, `played-30m` | Marks a session got past. |

`counting()` in `src/game/analytics.ts` decides who is counted: not localhost, and not a page opened with `?seed=` or `?debug=1`, which is how the browser checks and a tuning session play their innings. A scripted thirty balls is not a player. The counter script is loaded async, so events raised before it lands queue for up to fifteen seconds and go out when it does; if it never lands — a blocked script, an ad blocker — the queue is dropped and the innings is untouched. Nothing here can throw into the game loop.

### Time, and how it is measured

The clock only runs while the game is actually being played: a ball live, the bowler walking back, the call on screen. It stops for a pause, a hidden tab, the cover and the end card, so a tab left open all afternoon is not an afternoon of play. It is wall-clock time rather than the game's own, which the charge stretches into slow motion — a second of slow motion is still a second of somebody's life.

A session's length is reported as **marks passed** rather than measured at the end, because there is no reliable end to measure at: a browser closing a tab will not be waited on to send anything, and a beacon fired on the way out is the least trustworthy hit there is. A mark is sent while the page is alive and cannot be lost. The counts falling away across the marks are the distribution — a hundred sessions past one minute and thirty past ten is a curve, and the median is wherever it crosses half. An average would have been one number hiding that shape, and would have needed the unreliable beacon to compute.

An innings is different: it has a real end, and its length is known at that moment, so it goes out as a band. Seven of them, narrow where the innings actually fall — thirty balls is around two minutes — and open at both ends for the three-wicket collapse and the player who wandered off mid-over.

### Daily and monthly players

GoatCounter counts a visitor once a day and, deliberately, cannot recognise them tomorrow: the hash it identifies a visit by is salted, and the salt rotates. That is most of why the game needs no cookie banner, and it has a consequence worth being plain about — **the dashboard gives a daily active count and can never give a monthly one.** Thirty days of uniques added up counts somebody who played every day as thirty people, and no amount of squinting at that figure turns it into a monthly one.

So the recognising happens in the player's own browser, which remembers what GoatCounter has forgotten, and what leaves it is a band: new or returning, how long since last time, how many separate days in total. No date and no identifier goes out, so the counter stays as anonymous as it was. That gives:

- **Daily players** — GoatCounter's own unique visits, as before.
- **New players, exactly** — `visitor-new` fires once per browser, ever. Summed over a month, that is new players that month, with no double counting.
- **Retention** — the `back-*` bands are a return curve, and `days-played-*` is how sticky the game is. This is what a monthly active count is usually a proxy for, measured directly instead.

A browser with storage switched off reports none of these rather than reporting itself new every session, which would have made the one exact figure here the least trustworthy thing on the dashboard.

Two things GoatCounter cannot do, and where to go instead. It cannot cross-tabulate, so *did the players who took the tutorial score better* is not a question it will answer; the board store holds the exact figures for every claimed innings and can. And it counts a visitor per path per day, so `innings-start` gives both totals (hits) and players who started at least one (visits) — the replay rate falls out of the two without a second event.

## Hosting

The game is published at **https://hitman-cricket.vercel.app/**, from `codex/cricket-batting-game`, and Vercel is the only host of the three this repository has used that can serve the board: `GET /api/board` and `POST /api/score` are functions, and GitHub Pages and Sites both publish files and nothing else. That is why it is the address.

Two consequences worth knowing:

- **Share the short alias, never a deployment URL.** `hitman-cricket.vercel.app` follows the latest production deployment. The long per-deployment URLs — `hitman-cricket-1qc721gwe-…` and friends — are nailed to one commit each, deliberately, so they never update. A link shared from the deployments list will never show anything you ship afterwards.
- **Put the functions in the database's region.** Both live in Mumbai (`ap-south-1` / `bom1`). Functions default to Washington DC, which makes every Redis command cross the planet twice on a screen that should open instantly.

`.github/workflows/deploy.yml` is gone: it published to GitHub Pages on every push, and a second copy of the game with no board behind it is worse than no second copy. Whatever Pages last built stays up until Pages is switched off in the repository's settings. `.openai/hosting.json` still describes a Sites deployment and has been left alone.

Source remains in the Hitman-Cricket GitHub repository. No account, download, or local server is required to play the published link. A personal best stays on each player's device; a place on the board is kept by the store. Both provided sound clips are included in the public game.
