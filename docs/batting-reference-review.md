# Pull and advancing drive reference review

Reviewed the two user-supplied screen recordings frame by frame (17 September 2026).
These are manually authored motions based on the recordings, not extracted motion capture.

## Pull — 15-02-20 recording, left-handed demonstration

- Roughly 0.8–1.8 seconds: hands lift; the batter sets the back-foot base.
- Roughly 1.8–2.6 seconds: hips and shoulders turn with a horizontal sweep;
  arms extend through the stroke, without pausing at an imaginary impact key.
- Roughly 2.6–4.5 seconds: elbows fold as the same arc carries the bat around
  into the opposite-shoulder finish. The head does not lead a forward lunge.
- Mirrored to a right-handed batter: leg-side rotation and left-shoulder finish.

## Advance — 15-05-13 recording, right-handed batter

- Roughly 1.8–3.0 seconds: forward movement and gathering step precede the hit.
- Roughly 3.0–3.6 seconds: higher pickup, lead-foot plant, downswing through the ball.
- Roughly 3.6–4.5 seconds: extension rises, then folds into the left-shoulder finish;
  the trailing heel lifts rather than the lead leg kicking backwards.

## Implementation and safeguards

- The active swing uses time-aware cubic tangents: contact and extension are
  pass-through keys. Only the beginning and shoulder rest have zero velocity.
- The pull's unwrapped azimuth keeps the bat on one lateral sweep rather than
  taking a quaternion shortcut vertically through the torso.
- The advance has a separate 440 ms contact time and 1320 ms recovery duration.
  Input scoring is unchanged; presentation reserves an incoming-ball approach
  while a charge is offered, and makes contact down the pitch.
- Advancing foot positions are defined in world space and include toe clearance.
- The drive's front knee bends down the line, not out into the blade.
- Elbow solving considers blade clearance as well as torso/handle clearance.
- Tests sample both sides of the blade every 4 ms against the actual transformed
  spherical body, head and joint meshes; existing grip/limb tests remain enabled.
- Tests also check nonzero, continuous blade velocity at contact and extension.
- The shot-review page uses each animation's own duration and displays contact time.

The clearance tests are sampled regressions, not a proof against every possible
intersection of every mesh. Review the animation at match speed as well as slow motion.
