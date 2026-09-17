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

## Cover / straight drives and revised charge — 16-32-12 recording

Reviewed the new 5.43-second recording at 4 fps, with a denser 6 fps review
of 2.5–4.5 seconds. It shows a gather with the blade raised, hands leading the
downswing (roughly 2.5–3.3 s), contact around 3.3 s, and a raised finish over the
lead shoulder by roughly 4.2–5.4 s. The head remains down over the planted lead
leg. This latest reference supersedes the earlier flat, behind-shoulder charge
finish; it is not a request to change the approved pull.

The flagged IMG_4046 frame exposed a limitation in the previous fix: fixed
grip *positions* did not prevent independent rotation of the two fists about
the handle. The charge now captures its initial grip angles, locks them during
the gather/downswing/contact (100–440 ms), and progressively releases that
constraint over the next 120 ms as the arms follow through. The elbow solve
accommodates the palms rather than making the palms spin to chase elbows.
The old sideways clearance key at 690 ms has been replaced by a raised blade
key, followed by the video-based high finish. Recovery first carries that
raised blade clear of the helmet before lowering it.

IMG_4043 guides the lower cover-drive lunge, inside-line lead foot and high
finish; IMG_4044 guides the straight drive's raised lead elbow and vertical
blade presentation in front of the body. Both drives now have continuous
contact/extension keys at 110/220 ms, settle at 410 ms and recover through
an outside clearance pose. Knee poles follow the drive direction to keep the
front pad out of the swing; the rear foot follows lateral reach to avoid leg
stretching. The pull poses, timing, grip solve and sweep are unchanged.

Expanded validation covers all four reference shots at the centre and both
reach limits: 2 ms elbow/wrist continuity checks, 4 ms blade-volume samples
against body/head/joints and forearm capsules, fixed limb lengths, and nonzero
continuous drive velocity through impact/extension. An explicit charge test
checks that neither glove rotates relative to the handle from 100–440 ms.
Preview selection now includes Cover drive and Straight drive, with the
correct contact/extension/finish buttons for each.

## Shoulder-led revision — 17-07-41 cover / 17-09-01 straight recordings

Reviewed the supplied cover recording at 3 fps and straight recording at 4 fps.
The straight recording includes a long freeze frame: its held upright blade is
not evidence of a separate wrist rotation. The cover recording shows the hands
carrying forward and upward while the blade remains down after contact, before
the late high fold. These motion references supersede the earlier interpretation
of the finish stills. The charge illustration emphasizes forward/upward arm
extension; it is a pose reference, not a measured motion sequence.

Drive follow-throughs now carry the hands on a shoulder-centred arc, with an
authored lead upper-arm bend plane and gradual shoulder elevation. Both upper
arms move through the shoulder joints; the two wrist targets remain coupled to
the handle. This is shoulder-guided IK, not a physics simulation of power.
The straight blade stays toe-down from contact through the held high finish;
the old lofted intermediate pose and sideways blade return are removed. Cover
retains a forward carry before folding high. Charge extends its arms forward
and upward before its high finish. Recovery retains shoulder guidance until
the arms lower to avoid an elbow-plane flip. The approved pull motion is unchanged.

The multi-view bat reference informs a new cross-section mesh: near-flat bowed
striking face, beveled edges, raised rear spine, broad rounded toe, tapered
shoulders, and ribbed rubber grip. Grip anchors and gameplay contact coordinates
are unchanged. Collision tests now sample the actual blade vertices and triangle
centres, including the thicker spine, rather than the old rectangular envelope.
Regression checks require both upper arms to sweep more than 45 degrees between
contact and finish, hands to rise over 0.5 m, and the straight blade to remain
upright throughout its post-contact active phase. These tests guard the intended
motion; they do not by themselves certify realism.

## Face orientation and folded-elbow seam — IMG_4055 / IMG_4056

The raised guard previously authored the flat face skyward. The rendered
drive orientation now transports the impact frame back along the existing
blade axis, yielding a downward-facing flat surface at pickup without changing
the approved blade-tip or hand trajectory. Contact remains flat-face-forward.
Return-to-guard roll is spread over the recovery, with a consistent signed
rotation so crossing a quaternion hemisphere cannot flip the face.

Removed the earlier charge-specific frozen glove-angle workaround: it encoded
the old reversed-face setup and forced the wrists backwards when used with the
corrected face. Both hands retain their handle stations and grasp axes, while
the continuous shoulder/elbow solve determines the wrist sockets. Continuity,
wrist flexion and blade-volume clearance remain checked throughout the motion.

The folded elbow also exposed a mesh seam: the old 0.05 m skin joint sphere did
not cover the 0.0725 m sleeve-end radius. A matching rounded jersey elbow now
encloses that end in every bend plane. Tests check this geometric coverage as
well as the existing joint-position and bat/body-clearance constraints.

## High straight finish and confidence-charge emphasis — IMG_4057

The new side-view reference clarifies that the upright straight-drive blade is
an intermediate position, not the stopping point. The 220 ms extension remains;
the hands then rise to 1.62 m and the blade continues forward/up to the high
410 ms finish. The contact and cover-drive pose keys are unchanged.

Charge now gathers at 330 ms with a stronger shoulder coil, strikes at the
unchanged 440 ms contact time, extends at 560 ms, and reaches its finish at
740 ms rather than 810 ms. Holding that finish until 980 ms gives the faster
release a distinct settling beat. The nominal centre-line blade-tip speed at
contact rises from 9.74 to 12.30 scene units/second. No ball timing, confidence
rules, shot outcome, camera shake, or scoring changes accompany this animation
revision. Preview phase buttons follow the revised charge keys.

## Diagonal top-hand grip and continuous drive arc — IMG_4060–4065

The supplied fifth image identifies the next correction: the lead wrist exits
diagonally toward the handle butt, with the lead elbow above it. The old shared
perpendicular wrist sockets produced a paddle-like silhouette even though both
hands remained attached. The shared sockets now allow a diagonal top-hand
connection and a smaller bottom-hand offset. That offset relaxes continuously
as the forearm passes the grip during wrapped finishes; it must not stay fixed
and bend the wrist backwards. Straight, cover and charge also lead contact
with a raised elbow. Recovery of cover is slightly redistributed to keep the
new wrist connection continuous at the reach limits.

Straight-drive extension now already carries the blade forward/up by 220 ms,
rather than holding it almost vertical until the high finish. This removes the
upright plateau while retaining the contact point, strike time and high finish.
The previous upright-until-220 test is replaced by continued angular travel;
new contact tests check the diagonal top-hand wrist and raised lead elbow.
