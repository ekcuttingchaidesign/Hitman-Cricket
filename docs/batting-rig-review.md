# Batting rig review — pull, straight drive, and the new square drive

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

## Still open

The advance shot is unchanged and still wants work; it was left for a separate
pass by request.

The two straight drives were built from cricket fundamentals and the square
drive's own recording, because there is no straight-drive reference on this
branch. A recording of both — a checked one and a lofted one — would let the
split be validated against footage rather than first principles.
