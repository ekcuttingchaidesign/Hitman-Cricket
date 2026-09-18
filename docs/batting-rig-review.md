# Batting rig review — pull, straight drive, the square drive, and the slog sweep

What was reviewed, what was changed, and what was deliberately left alone.
These are hand-authored poses judged against video, not motion capture.

## What was taken from `codex/pro-batting-rig`

That branch forked at `b3d1e3e`, before the feedback questionnaire, the music
and the injury meter landed, so it could not be merged: the merge would have
removed all three. The rig work was ported across on its own instead —
`Batter.ts`, `rig.ts` and the new `batGeometry.ts`, with the batting tests.
Nothing outside the rig came with it.

The shared improvements kept from that branch: the time-aware cubic
interpolation (`flowing`), the shoulder-centred follow-through (`shoulderDriven`),
the unwrapped lateral sweep for cross-bat strokes, the reference-based blade and
grip meshes, the photo-referenced gloves, the diagonal top-hand wrist, and the
inner-reach clamp in `solveJoint` — without which a two-bone target closer than
the difference of the bone lengths produced an exploding limb.

## The Advance Charge is untouched

The charge keeps the production animation and the production clock. The preview
branch had rebuilt it around a separate 440 ms contact, a 1320 ms duration, a
pre-contact approach with world-space foot plants and a contact plane a stride
down the pitch. None of that was taken.

This is checked rather than asserted: the charge was sampled every 10 ms across
its whole life including the walk back, at three ball positions, and every
sampled quantity — grip, blade axis, blade tip, hips, chest, both feet, yaw and
distance down the pitch — is identical to production to six decimal places.

One leak was found and fixed while doing it. The drives shift the back foot
sideways to follow the ball; the charge is played with `shot === 'STRAIGHT'`, so
it was picking that shift up and moving its back foot by up to 11 cm. The shift
now excludes the charge explicitly.

Two shared things do still reach the charge, because they are shared and the
charge cannot be exempted from them without forking the rig: the bat and glove
meshes from `batGeometry.ts`, and the grip anchor spacing, which the preview
branch narrowed from 0.135 m to 0.110 m against close-up photographs. If the
local Advance Charge revert touches either, that is where it will conflict.

## The pull

The sweep was right and the finish was not. The blade came through the ball
horizontal and then stayed horizontal: measured off the pose keys, the handle
sat at about 6°, 5° and 6° of elevation at contact, extension and finish. The
bat was swung flat and then simply stopped, lying across the chest at shoulder
height. The back heel barely left the turf either — 0.04 rising to 0.10 — while
the hips turned through a full radian above it, which shears the body off the
feet it is supposed to be pivoting on.

The elbows now fold. The blade lifts out of the sweep and wraps up and away
behind the front shoulder, and the hands finish wider rather than tight beside
the ear, because the tight version brings the shaft down across the grille. The
heel lifts through the stroke and the feet move with the pivot instead of
staying nailed down.

## The straight drive

The blade turned through about 77° in total and stopped horizontal, pointing
down the ground, above the helmet, where it was held for 160 ms. The silhouette
is a javelin balanced on the batter's head. The shoulders barely moved either:
yaw travelled 0.16 rad — about 9° — from contact to finish, so the arms were
doing all of the work and the body none of it.

It now turns through about 150°, up in front of him and then over the front
shoulder, finishing high with the bat raked back and the hands driven forward.
The shoulders turn about 24° through it.

Getting there needed one extra pose key. From a blade pointing at the ground to
one pointing behind the ear is more than a right angle, and interpolated in a
single span the shortest path cuts the corner — and the corner, for a bat on the
end of two raised arms, is the batter's own head. The `carry` key brings the
blade up in front of him first. The square drive turns through as much and takes
one too.

## The square drive — new

Built from the supplied recording (3.75 s, 60 fps, filmed square on the off
side), reviewed at 8 fps throughout and 24 fps across 1.25–2.40 s.

- Roughly 0.9 s: high pickup, weight going back, blade cocked behind the
  shoulder.
- Roughly 1.50 s: contact. The ball is almost on the floor and wide. The bat is
  near vertical with the toe down and the face turned square to the off side —
  not down the ground, which is what makes it this stroke rather than a cover
  drive. Head over the ball, front foot planted across.
- Roughly 1.75 s: extension, and the part that defines the stroke. The hands run
  out square with the blade still hanging below them. They do not climb. A cover
  drive's hands leave contact rising; these stay down and go across.
- Roughly 2.10–2.35 s: only then does it turn over. The body opens right up, the
  back heel comes off, and the bat finishes high above the front shoulder with
  the hands at chin height.

It is implemented as a variation on the off-side drive input, the way the pull
is a variation on the leg-side drive and the standing cut on the cut: a ball
wide of off (≥ 0.30) and low enough to drive off the front foot (≤ 0.70) is
driven square; the same swipe at anything straighter or shorter is still the
cover drive. It has its own 130 ms contact and a longer, flatter extension.

No scoring changed. `SHOT_ANGLES`, the compatibility table and the shot list are
all untouched: this is how the stroke is played, not where the ball goes.

## Checking it

`tests/batter.test.ts` sweeps every stroke at the centre and both limits of its
reach: blade-volume samples every 4 ms against the body, helmet, joint and
forearm meshes; elbow, wrist and grip continuity every 2 ms; fixed limb lengths;
and nonzero, continuous blade velocity through contact and extension. The square
drive adds checks on its gate, its across-the-line stride, its flat extension and
its high open finish.

## Looking at it

`shot-preview.html` is an interactive page: every stroke, five camera angles,
scrub and play/pause, named phase buttons, and a marker at the point the ball is
met so the blade can be checked against it rather than eyeballed. The readout
names which variation is live, so the square drive's gate can be seen firing.

    npm run dev        # then open http://127.0.0.1:5173/shot-preview.html

It is a second Vite entry, so a branch deployment serves it at
`/shot-preview.html` too. It is unlinked from the game and pulls in nothing the
game does not already ship; drop the entry from `vite.config.ts` before a
production release if you would rather it were not reachable.

`scripts/rig-sheet.mjs` is the other half: it renders a contact sheet per stroke
from a running dev server, for comparing frames side by side. That one is dev
only — `rig-sheet.html` is not an entry point and is not in the build.

Automated sampling is a regression guard, not proof of realism. The strokes were
also looked at, frame by frame, from more than one angle.

## Second pass — the arms

The first pass fixed where the bat went and left the arms alone. Reviewed on
the hosted preview, two faults showed up in both drives, and measuring them
confirmed both.

**The elbows never opened.** Measured as the shoulder-to-wrist span over the
length of an arm, the straight drive held 0.51 at contact and *0.44* at its
extension key — it folded tighter after the ball than it was at it. The cover
drive did the same, 0.60 to 0.53. That is the bent-armed, shoulder-hinged look:
the swing was being carried by a pole rotating about the shoulder with the
elbow locked shut behind it.

The cause is geometric and it is not the pole. Both fists hold one handle, so
the two arms cannot be posed independently: the only place both can be straight
is directly out in front of the sternum at a shade under an arm's length. Put
the hands anywhere else and one elbow folds to make up the difference. Every
drive key is now solved for that rather than eyeballed — hands, torso and yaw
together, under the leg-length limits.

The drives now run 0.55–0.90 at contact and 0.73–0.94 a tenth of a second
later, opening through the ball in every case. The square drive, which is the
one the reference recording shows, reaches 0.94.

At contact the arms are still bent, and they should be: the recording shows
them folded at impact and straightening over the following quarter second. The
opening happens *through* the ball.

**The arms went through the helmet.** No part of the arm solver knew where the
batter's head was. Measured against the head centre, the lead upper arm came to
0.09 m on the square drive and 0.14 m on the straight — an arm is about 0.05
thick and a helmet 0.135 across, so both were well inside him.

There is now a clearance guard: solve the arm, measure the two segments against
the head, and lean the bend plane off it by an amount that varies smoothly with
how close it actually came. It runs last, after every other pole adjustment,
because it is the safety net. It measures the solved arm rather than the
shoulder-to-hand line — the first version used the line, which passes close to
the head on any stroke played under the eyes even while the elbow bows well
clear, and leaning off a danger that was not there dragged the front elbow down
through every drive contact. Every stroke now clears by at least 0.185 m.

The charge is exempt, and remains byte-identical to production.

## Two straight drives

The four and the six are different strokes after impact and the same one
before it, so they share a contact and separate at the follow-through. The
classic drive is checked: the hands finish high in front of the chest with the
blade pointing up the ground after the ball, over a braced front leg. The
lofted one keeps climbing through the line, the chest opens right up, the back
foot comes off the turf and the blade finishes over the front shoulder with the
hands above the helmet.

Which one is played is decided at the moment of the shot, from the same rule
the score is worked out from — `loftedDrive` in `ShotResolver`, beside the
`advanceShot` it is modelled on. Middled on a line that suits the stroke is the
six; everything short of that is the classic drive, which is also everything
that is not worth six. No scoring changed: the rule reads the existing table
rather than adding to it.

## Third pass — the square drive, from two more angles

Two further recordings: one from square on the off side showing the footwork,
one from the bowler's end showing the follow-through. Three things were wrong,
and all three were confirmed by measurement before being changed.

**He was not getting onto the front foot.** The stroke was played from an
almost upright stance. It is a lunge: the front foot strides across and down
the wicket and takes the weight, the knee folds over it, and the back leg is
left straight behind with the heel off the turf. The hips now sink about a
third of a metre by contact — from 0.94 at the guard to 0.64 — and stay there
through the extension before the body rises out of it.

The front foot also now plants INSIDE the line of the ball. It had been
tracking the ball by the same fraction as the body, which put it outside the
ball at the narrow end of the stroke's width; the blade then swung through his
own boot, which the blade-volume sweep caught.

**It finished over the wrong shoulder.** A right-hander's square drive finishes
over his left — the front one. This finished over the right: the shoulder the
bat had just come down from, so the swing went out square and then returned the
way it came. Measured against the two shoulder directions, every other
cross-batted stroke in the rig — the cut, the pull, the cover drive — was
already finishing on the correct side, and only the square drive was not.

**The wrists span.** The blade's roll about its own axis ran to 207 degrees
between the pose keys and, worse, it reversed: +34, +33, then −78. The wrists
wound over through the stroke and unwound again at the finish. The face at each
key is now parallel-transported along the blade's own axis with a steady thirty
degrees of roll added per span — one direction, ninety degrees in total — so
what is left reads as a wrist roll rather than a windmill.

Two rig-wide faults turned up while fixing it. The bat could outrun the arms
holding it between two keys, because interpolation overshoots what each key
was checked for on its own; the bat is now drawn back to whichever shoulder it
has run away from, by exactly the distance it is out by, which costs nothing in
the 95% of frames where the arms can reach. And the helmet guard leaned off the
head using the shoulder's outward bearing, which works while an arm is on its
own side of the body but resolves upward on a finish that carries the hands
across to the far shoulder — it was lifting the trailing elbow over the helmet
instead of tucking it under.

## Fourth pass — the slog sweep

The second special stroke, and the first one added since the charge. It is
gated the way the charge is — a full confidence meter, in The Blast — but it
answers the opposite ball: a spinner, pitched up enough to get underneath
(`SWEEP.minBounceZ`), met with a leg-side swipe. Middled it is six over
midwicket; a shade under is four, and that four is given its own flight — it
beats the infield in the air, pitches around three-quarters of the way out and
skids over the rope (`Flight.bounceAt`, drawn as two arcs rather than one).

The two special strokes are deliberately disjoint: nothing is both chargeable
and sweepable, which is what lets the confidence meter name the shot on its way
("CHARGE IT — SWIPE UP" against "SWEEP IT — SWIPE TO LEG") instead of offering a
cue that might be about the wrong one.

### The rig tore, and it was never where it looked

The stroke is played off the knee, which is a pose the rig had never been asked
for, and it broke it in four separate places. All four were the same kind of
fault and none of them was in the sweep:

**Poles were being blended as points.** The elbow's bend plane is named by a
pole, and a weighted mix of two pole *points* travels the straight line between
them. When the two poles sit on opposite sides of the arm, that line runs
through the arm itself — the plane passes through undefined and comes out
reversed, and the elbow crosses a third of a metre between two frames. Nothing
upstream was discontinuous; the helmet guard that exposed it ramps from 0.003 to
0.9 over five frames. Every hint now names a *direction* and turns the running
one about the arm, which takes the same two ends round the short way and has no
crossing to fall into.

**A sign test on a cross product.** The shared bend plane ended with
`round.dot(outward) < 0 ? round.negate() : round` — which looks like housekeeping
and is a threshold switch. As the arm swings across the body that dot product
passes through zero; at 210 ms into the sweep it did, and took the elbow with
it. A cross product is already continuous; nobody needed it snapped.

**The wrist offset faded into a fixed direction.** Which way round the handle a
wrist sits is the shoulder's bearing on the bat, and on a pull at head height
the back shoulder ends up almost *on* the handle's line, leaving a centimetre to
normalise. The previous fix faded into a fixed across-the-body bearing — and a
fixed bearing has to be given a side. The side came from a dot product, that dot
product crossed zero at 244 ms into the pull, and the wrist moved 15 cm in one
frame. There is no side to pick: a shoulder on the handle's line has no bearing
off it. The *offset* now fades to nothing instead, which puts the wrist on the
axis, which is where the geometry was heading anyway.

**The drive aim was overriding the sweep's own plane.** The front arm's pole is
taken outright from a world-space drive aim, so ahead of that the sweep's plane
was simply discarded for that arm — and an aim that knows about driving through
the line and nothing about swinging from the knees walked the front elbow into
the helmet: 7.5 cm of clearance at the carry, left for the guard to rescue in
four frames. Taking the sweep's plane last leaves 16 cm and the guard almost
nothing to do.

Worst elbow movement between two frames, across each stroke's whole reach, in
metres per 2 ms — the shared limit is 0.032. "Before" is `HEAD` for the strokes
that existed there, and the sweep's own first working draft for the sweep:

| | before | after |
|---|---|---|
| sweep | 0.52 | 0.025 |
| square cut | 0.075 | 0.051 |
| cover drive | 0.026 | 0.028 |
| pull | 0.018 | 0.018 |

The cut is the one that still reads high; it is not in the flip check's list and
was higher before. The cover drive is 2 mm worse and inside the limit.

### The charge is still byte-identical

Two of those fixes move the charge, because its arms are folded tight enough to
sit in exactly the degenerate cases they address — through the new pole pipeline
its elbows moved more than half a metre. It is finished, signed-off work, so it
keeps the arithmetic it was authored against: the radial and the pole both have
an explicit `this.charging` branch, commented as such. Verified by dumping every
measurement of 6,608 charge frames from this branch and from `HEAD` and
differencing them: **maximum delta 0**. `src/entities/rig.ts` is untouched for
the same reason — a continuous-fade `solveJoint` was tried, was no longer needed
once the poles were square to the arm by construction, and was reverted because
it was the thing moving the charge.

### The pose, and what the recordings changed

- **He sits back.** The hips were shifted 14 cm back through contact, through
  and carry, so the ball is met in front of him rather than beside him. Before
  that the front elbow passed 13.6 cm from the spine — inside his own trunk.
- **The front knee was in the swing.** It sat at 0.479 m, which is the height
  the ball is met at, so the blade went through it. Its bend hint now drops the
  knee under the hip instead of throwing it forward.
- **The front foot is planted across, not down the ground.** Pulled in to
  `[.26, .08, .32]` after the hips moved, because a stride that stays where it
  was drew the front leg 13% past its own length.
- **It finishes outside the front shoulder.** The hands finishing in front of
  the face read as the right picture and are not one — they carried the back
  glove within 19 cm of the helmet. Taken out past the shoulder, on the line the
  carry was already on, the bat keeps travelling the way it was going instead of
  reversing back across him.
- **The follow-through is longer than a drive's.** The swing is the same hurry;
  a bat travelling that fast round a kneeling body carries the elbows with it,
  and crammed into the drives' window the front elbow moved 18 m/s.
- **He unwraps it in front of him.** The finish holds the bat behind the front
  shoulder and the guard holds it behind the back one, and the straight line
  between those two runs through the front shoulder. He now takes it out where
  he can see it first, blade down, then back into the pick-up.

### What it is checked against

The sweep joins `PLAYS`, so it takes the shared arm and blade checks the other
strokes take — no flips, no limb past its own length, nothing through the
helmet, nothing through the trunk, the blade's whole volume outside every joint.
On top of those: the back knee reaches the turf at the ball and neither knee
ever goes under it, the front foot is planted across and in front of the hips,
the blade is flat through contact, the finish is nearer the front shoulder than
the back one and outside it, and the stroke comes all the way home to the guard.
The gate, the timing split, the disjointness from the charge, the midwicket
sector and the bouncing four have their own tests in `game.test.ts` and
`flight.test.ts`.

## Fifth pass — the sweep, rejected and rebuilt

Three faults, reported together, and all three were real.

### He never actually strode

The front foot went from 0.27 at the guard to 0.34 at contact — seven
centimetres. What looked like a stride was the hips sinking 40cm past a foot
that stayed where it started, which is a man folding up, not one stepping out.

It was the fourth pass's own fix doing it: the hips had been pushed 14cm back to
get the front elbow out of the trunk, and the foot was pulled back with them to
keep the front leg inside its own length. The leg is the whole constraint —
hip-to-foot cannot exceed 0.87 — and it was already at full stretch, so every
centimetre the hips moved back cost a centimetre of stride, one for one.

The leg was being spent on **width**, not length: at the carry the hips rotate
open and carry the front hip joint across to x = −0.31, and with the foot
planted at +0.30 that is a 61cm lateral span with nothing left for the stride.
Trading width for length — the foot in to 0.10 across, out to 0.56 down the
ground — buys back 24cm of stride for 20cm of width nobody was looking at.
The foot now finishes 0.58 down the ground against the drives' 0.62.

### The arms crossed

Both fists are on one handle, so the two forearms always arrive at the same
place; what separates a grip from a raft paddle is whether they get there side
by side or reach across each other. Measured against the other strokes, the
sweep was the only one that crossed:

| | forearm gap | elbow splay |
|---|---|---|
| **sweep, as rejected** | **0.040** | **0.096** |
| sweep, now | 0.110 | 0.284 |
| square drive | 0.202 | 0.349 |
| cover drive | 0.283 | 0.484 |
| pull | 0.133 | 0.396 |

A forearm is 0.095 across, so 0.040 is one arm inside the other. The splay
figure is measured along his own shoulder line rather than in world axes, so it
survives him turning: at 130ms the front elbow was 0.24 to the off side and the
back elbow 0.03, which is the two arms swapped over.

The cause was the sweep's own bend hint, which leaned 0.78 on "down" and only
0.62 on "round". Down is where the elbows go on a sweep, but it is also the
direction both arms already point once he is over the ball, so weighting it
collapsed them onto one line. Round is what separates them. At 1.0 round and
0.10 down the arms come apart — and then the front elbow sits exactly where the
bat wants to be at the finish, so the width is now faded out between 380ms and
520ms: elbows out to hit, folded as the bat comes over the shoulder, which is
what arms do anyway.

### The blade spun

The blade turned 187 degrees about its own handle across the stroke and
reversed twice doing it. `flowing` does not interpolate the blade's orientation
directly for a cross-bat shot — it takes the bat's horizontal bearing, its
elevation and a *roll* about the handle, and interpolates those three. So the
roll is the thing to author, and it had never been authored: it fell out of the
`batFace` vectors and came to −46, +89, −2, +36, +34 across the five spans.
Ninety degrees of counter-rotation inside the backlift alone.

Rolls are now stated as angles and the faces derived from them —
32, 6, 12, 35, 52 — one direction, no reversal:

| | blade turn, 0–620ms | wrist roll, 0–560ms |
|---|---|---|
| sweep, as rejected | 187° | 171° |
| sweep, now | 162° | 121° |
| square drive | — | 160° |
| pull | 117° | 90° |

(The square drive's blade-turn figure is not comparable: its handle passes
through vertical, where a bearing-relative roll is undefined.)

### What is checked now

Two new shared checks, run across the pull, both drives, the cut and the sweep:
the elbow halves of the two forearms stay more than 0.098 apart and the elbows
never swap sides; and the sweep's blade turn stays under 175 degrees with no
single frame turning it more than 12. The stride check now asks for the foot to
travel, not merely to sit wide of the hips.

The charge is still byte-identical over 6,608 frames — max delta 0.

## Sixth pass — the right-angle leg, and the bat in front of the pad

Two faults, both measurable, both worse than any screenshot made obvious.

**The front leg was a straight diagonal, not a fold.** 111-143 degrees at the
knee where the shot wants 90, with the thigh 45-64 degrees off flat and the
shin 58-79 off upright. The reason it never folded is that the knee is not
placed, it is *solved*: `solveJoint` puts it wherever the knee pole points, and
the sweep's front pole pointed down. Turning it up, and putting the front hip
joint level with the knee and 0.43 behind it, gives the L: thigh flat, shin
upright, ankle under the knee. It now measures 86-95 degrees with both tilts
inside 12.

**The bat spent the whole stroke behind the front foot** — between 0.6m and
0.9m behind it, which put the handle 0.059 from the line of his own spine.

That one has a hard geometric cause. The ball is met at a fixed point 0.30 in
front of the batter's centre, and his *guard* front foot already stands at 0.27.
So the foot is at the ball's depth before he has moved at all, and any stride
down the ground puts it past the ball — the previous pass strode it to 0.56,
0.26 beyond, and a bat that has to reach a ball behind its own front pad has
nowhere to put its handle except through him.

So he steps across and slightly back rather than down the ground: 0.48 of
travel from the guard, ending 0.12 behind his own centre, dropping onto the back
knee with the front leg folded out of the way. The whole bat is then 0.17 in
front of the foot at the ball, and the handle never comes within 0.31 of his
spine.

### What the bat can and cannot do

A bat is a 1.05m bar turning about the hands, so the moment its handle lies
across the ball's line the knob is 0.69 behind the middle by construction.
Asking for the whole bat to stay in front of the foot for the *whole*
follow-through would mean planting the front foot 0.39 behind the ball, which is
not a stance anyone takes. The tests therefore ask for the whole bat in front
through the hit — knob, middle and toe — and allow a few centimetres of knob
after it, while the blade is a metre in front. The rejected version fails both.

There was also a genuine conflict between this round and the last, and it is
recorded in `tests/batter.test.ts` rather than quietly resolved: the previous
round's check asked for the foot to finish *forward* of the guard, and this
round's asks for the bat to be ahead of the foot. Nothing satisfies both. The
first complaint was really that the foot did not MOVE — it bent where it already
stood while the body sank past it — so that is what is measured now: distance
travelled and distance across, with no claim about which way down the ground.

### Two bugs found on the way

`tests/batter.test.ts` compared the blade tip's WORLD x against the hands'
ROOT-LOCAL x. Those frames are 0.36 apart, the same order as the thing being
measured, so the assertion passed by luck rather than by being true. Corrected,
it says the thing worth saying: the hands finish inside the line of the ball and
the blade reaches across to it.

And git worktrees are created inside `.claude/`, which makes each of them a
second complete copy of the repository — tests included. Vitest's default globs
collected those copies, so one checkout's run reported another checkout's
failures and the same test name appeared three times with three different sets
of numbers. `vite.config.ts` now excludes them.

## Seventh pass — the front pad was never aimed at anything

Reported as the shin turning the opposite way to the swing while the shoe below
it stayed straight. Both halves of that are exactly right, and the reason is
that the shoe is aimed and the pad is not.

The shoe is yawed outright, from the pose. The pad was built with
`setFromUnitVectors(UP, shin)` and a fixed 79-degree twist — and
`setFromUnitVectors` gives you the shortest turn from vertical to the shin,
whose roll ABOUT the shin is simply whatever falls out. With the shin lying
diagonally that lands somewhere plausible, which is why this survived every
pass so far. With the shin UPRIGHT — which is precisely where the right-angle
front leg now puts it — the turn collapses to nothing, the roll is left to the
fixed twist, and the pad points across him. Then, as the shin tips through the
stroke, the leftover roll swings the other way.

Measured against its own shoe, the front pad was out by up to 95 degrees on the
sweep, 92 on the pull, 70 on the straight drive. It now takes the shoe's
bearing and builds its frame around the shin — front where the toes are,
whatever the shin is doing:

| | pad vs shoe, before | after |
|---|---|---|
| sweep | 95° | **3°** |
| pull | 92° | **11°** |
| straight drive | 70° | **4°** |
| square drive | 64° | **21°** |
| cover drive | 37° | **3°** |

What is left is not error: the pad's face is square to the shin, so a shin
leaning hard carries it a little off the shoe's flat bearing, which is what a
real pad does. A test now holds all five strokes under 25 degrees.

The back pad has the same fault and is worse — up to 160 degrees on the sweep,
where it spends the follow-through pointing backwards. It is left alone for now
because only the front one was reported, the back leg is folded away under him
for most of the stroke, and changing it moves five signed-off strokes. The
charge keeps the old arithmetic here too, as it does for its radial and its
elbow pole.

## Eighth pass — the back leg was a rod, not a kneel

Reported as the hip looking isolated from the leg, and the front foot sitting
directly in front of the back one with no gap between them. Both are the back
leg, and both are measurable.

**The back knee came off the turf.** It starts on it at the ball — 0.094 — and
climbs to 0.213 by the finish. Not because anything lifts it: because the back
foot was pinned 0.79 behind him while the hips turn a quarter of a metre
forward through the follow-through, most of that from the yaw swinging the hip
joint's own offset round. The leg ran out of length — 0.846 of its 0.87 — and
the solver had nothing left to do but straighten it. A straight rod trailing off
a pelvis is exactly what "the hip is not connected to the leg" looks like.

The fix is to give the leg slack and let the foot travel with him: the back knee
sits under the hip joint on the turf, the shin lies flat behind, and the foot is
authored per key so hip-joint-to-foot stays around 0.62 rather than creeping to
the limit. The knee now runs 0.094 to 0.128 across the whole follow-through.

**The feet were in line.** 0.137 apart across him, which from square of the
wicket means the front leg covers the back one completely. The reference has a
clear gap: front leg planted across, back leg folded away behind and to the leg
side. The back shin now runs back AND to the leg side, and the separation is
0.31 to 0.37 through the stroke.

Both are held by a test from the ball to the finish, because the fault was never
visible at the ball — it grew as he turned.

## Ninth pass — one arc, not two movements

Reported as the bat being down at 430ms and up at 590ms, which is not a swing.
The blade tip's height, from the ball to the finish, said the same thing:

    0.563  contact      toe just above the hands
    0.325  through      toe 0.24 BELOW them
    0.445  carry        still down there
    1.522  finish       hauled a metre back up

A V, and the eye reads a V as two movements. The cause was the `through` and
`carry` keys holding the handle UP — elevations of +22 and +38 degrees, which
points the toe DOWN — on the reasoning that the hit finishes before the bat
starts climbing. It does not: the toe leaves the ball and rises from that
moment, all the way round to the shoulder. Those two keys now carry the handle
DOWN instead, at -12 and -26, and the finish at -40, and the tip climbs
0.57 to 1.68 without falling.

Five centimetres of that is still a sag, in the first 60ms after the ball. It is
the interpolation, not the keys: the elevation has to climb from -59 at the
backlift to -6 at contact and then turn back down, so contact is a maximum and
Catmull-Rom puts its peak a fraction after the key rather than on it. Flattening
the backlift to -35 halves it and costs the high backlift, which is worth more
than five centimetres inside the hitting zone.

### Folding means turning, not shrinking

Raising the blade put it straight through the front elbow at the carry — 0.033
from its centre. The elbow tuck added in the sixth pass was not doing anything:
it scaled the sideways part of the bend hint while leaving the downward part
alone, and a normalised sum of a big vector and a small one still points almost
where the big one did. The elbow stayed out at x = -0.78 and the rising blade
went through it.

The two components are perpendicular by construction, so turning from one to the
other is a quarter turn that cannot collapse on the way. Turning 70% of it folds
the front elbow down and under — to (-0.69, 0.82, 0.03) — and the blade passes
0.26 clear. Turning the whole way bunches the two forearms to 0.082, inside the
0.098 they need, which is what fixes the amount at 70.

## Tenth pass — the square drive becomes a shot, and what that was actually worth

The square drive had been an animation with no say in anything: `squaring` never
reached `ShotResolver`, so a wide full ball driven square was scored exactly as
a cover drive. It now has its own branch, on the same bargain the cut offers —
timing alone names the result, and driving at it without middling it takes the
edge behind.

### The premise I argued it from was wrong

The case I made was that a full ball outside off is the only line with no stroke
worth 1.0 — the cut owns that line but only answers a short ball — so width
capped the batter at the cover drive's 0.9 and made the easiest ball to hit
score *worse*.

The first half is true. The conclusion is not, and a simulation of 36,000 balls
said so by refusing to move at all. In the classic innings `compatibility` does
exactly one thing: it gates the aerial branch at `SOLID_SHOT`, which is 0.55.
Runs come from the timing grade alone above that line. At 0.9 the gate never
trips, so 0.9 and 1.0 score identically, and `quality` — the number the two
differ in — is read by nothing but a debug overlay.

Graded out, the whole difference is one row:

| timing | before | after |
|---|---|---|
| PERFECT | 6 | 6 |
| GOOD | 4 | 4 |
| OK | ground runs | ground runs |
| POOR | out, skied and caught | out, **edged behind** |
| MISS | dot | dot |

Runs identical, wickets identical, over every grade and across 36,000 simulated
balls. What changed is the *kind* of dismissal and where the ball goes.

### What it is worth anyway

Both of those are worth having. Chasing a wide half-volley and nicking it to the
keeper is the most common way a batter gets out to a good bowler, and until now
the drive had no edge in it at all — a mistimed one could only balloon up and be
caught in the field. And a stroke called the square drive now goes square: 62
degrees, between the cover drive's 24 and the cut's 100, instead of flying to
extra cover.

The happy accident is that this lands on 17% of deliveries and moves the run
rate by nothing. A change that touches one ball in six and is provably
balance-neutral is the best version of this there was; it just is not the
version that was argued for.

## Still open

The advance shot is unchanged and still wants work; it was left for a separate
pass by request.

The two straight drives were built from cricket fundamentals and the square
drive's own recordings, because there is no straight-drive reference on this
branch. A recording of both — a checked one and a lofted one — would let the
split be validated against footage rather than first principles.

The wrists are still bent about 78 degrees away from the handle at the square
drive's contact, against roughly 40 in the recording. That angle is mostly
forced rather than authored: the ball is met low and the arms are out straight,
so the forearms arrive nearly horizontal at a vertical handle. Closing it
further means either sinking the stance lower again or moving the fists up the
handle, and both reach past this stroke into every other one.

## Eleventh pass — the orthodox sweep

A second sweep, and the first stroke in this branch that is a variation of an
existing one rather than a new one. The brief was unusually precise: same body,
same everything, and a blade that stays at the height it met the ball at rather
than climbing over the shoulder. Four, three, two or one off the timing; only
against the spinner; square leg; and LBW or bowled if he misses.

Because the brief named the body as fixed, the body is not re-authored. Every
key of `FLAT_SWEEP` is the corresponding key of `SLOG_SWEEP`, passed through a
function that turns the bat about the axis that levels it and carries the face
round with it. Rotating rather than rewriting is what keeps `batUp` and
`batFace` exactly perpendicular: editing the one and leaving the other is how a
bat ends up twisted off its own handle, and the roll the stroke was authored
with survives untouched. Only the grip height and the arm hints are set by hand.

Measured against the slog sweep frame by frame, at three ball positions, every
four milliseconds: `hip`, `chest`, both feet, `knees`, `backToe`, `yaw` and the
leg lengths are identical to the last digit. The bat and the arms holding it are
the whole of the difference, which is what the brief asked for. The blade
climbs 0.95 m out of the slog and 0.11 m out of this one.

One thing did break, and the suite caught it rather than the eye. The sweep's
elbow `fold` — the hint that lets the elbows collapse under a blade coming over
the shoulder — was still ramping in at 380 ms. With no climb to fold under it
closed the forearms to 0.059 m by the finish, where a forearm is 0.095 m across:
the two arms one inside the other, which is the raft-paddle grip this rig was
fixed for once already. The fold is now the climbing stroke's alone.

The miss is the interesting half of the scoring. A ball swept at and missed has
the pads behind it and the stumps behind those, so `stumpIntersection` decides
whether it is a wicket at all and the line decides which one — except that a
ball pitched outside leg stump can never be LBW however plumb it strikes him,
which is the one law in cricket written for the man sweeping. It still bowls him
if it hits.
