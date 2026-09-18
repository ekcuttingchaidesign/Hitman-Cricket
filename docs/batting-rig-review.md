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

`scripts/rig-sheet.mjs` renders a contact sheet per stroke from a running dev
server, from square of the wicket, from the bowler, or from the leg side. It is
a dev tool: `rig-sheet.html` is not an entry point and is not in the build.

Automated sampling is a regression guard, not proof of realism. The strokes were
also looked at, frame by frame, from more than one angle.

## Still open

The advance shot is unchanged and still wants work; it was left for a separate
pass by request.
