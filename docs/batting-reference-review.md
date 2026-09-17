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
- The updated grip has separate left/right thumbs and wrist sockets 75 mm from
  the handle centre. Arms solve to those sockets, not through the fists.
- A continuous anatomical elbow pole replaces the clearance-candidate switching
  for the pull and charge (and the shared guard). The square cut retains its
  separate clearance plane, blended from guard.
- Tests sample both sides of the blade every 4 ms against the actual transformed
  spherical body, head and joint meshes; existing grip/limb tests remain enabled.
- Tests also check nonzero, continuous blade velocity at contact and extension.
- The shot-review page uses each animation's own duration and displays contact time.

The clearance tests are sampled regressions, not a proof against every possible
intersection of every mesh. Review the animation at match speed as well as slow motion.

## Grip and load-up revision — six supplied screenshots

The first three screenshots identify the broken elbow/wrist connection and
cramped charge. The stance, extended lofted drive and Rohit load-up images guide
the revision; the sixth image is the pull load-up despite the message calling it
the fifth. These references take priority over a generic textbook pose.

- Pull: 120 ms loaded back-foot/backlift key, 230 ms contact, 340 ms extension,
  500 ms shoulder wrap. Contact timing uses `strikeAt`, leaving input scoring
  unchanged. This is a visible preparation phase, not a pause at impact.
- Charge: further forward/upward hand extension at 580 ms, then the existing
  left-shoulder wrap. Foot plant and 440 ms contact are unchanged.
- Smaller, handed glove geometry; fixed handle stations with rotation around
  the handle permitted. The previous zero-glove-rotation assertion incorrectly
  enshrined the identical-mitten grip rather than checking wrist connections.
- New 2 ms checks cover elbow and grip-rotation continuity, including the
  transition from guard; wrist socket coincidence; and wrist folding below 90°.
- Blade samples now also check forearm capsules, not just body/joint ellipsoids.
- The shared two-bone solver clamps its inner as well as outer reach: targets
  closer than the difference in bone lengths cannot produce exploding limbs.
- Front/side camera presets and named phase buttons allow direct pose review.

Additional coaching context: [Cricket Namibia, Batting Strategy](https://cricketnamibia.com/batting-strategy/)
discusses grip/backlift coupling and the importance of bottom-hand flexibility.
This supports allowing handle-axis rotation rather than freezing both glove
orientations; it is not a claim that the procedural rig reproduces biomechanics.

Validation uses actual rig geometry rendered offline from front/side views,
plus automated sampling. The hosted Vercel preview requires sign-in, so no
unauthenticated hosted-browser visual verification is claimed.
