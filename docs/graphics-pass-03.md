# Graphics pass 03: pleasant daylight and the fielding side

Branch: `codex/graphics-upgrade`; production is unchanged.

## Art changes

- Replace the amber directional key with neutral daylight and reduce its intensity from 3.1 to 1.85. Increase neutral sky fill, lower exposure from 1.12 to 1.04 and reduce the foot-contact decal opacity. This changes the light/shadow balance rather than applying a blue screen filter.
- Cool the pitch from yellow ochre to pale earth, shift grass away from lime, neutralise clouds and stadium whites, and reduce the warm lamp emission. Keep enough directional light for the figures and ball to retain shape.
- Refine the common bowler/fielder asset with a smooth sampled head profile, rounder limbs, a domed cap with an open underside and a thinner peak, a connected neck/collar, restrained facial features, kit badges and correctly proportioned shoes with soles and laces. Use the existing skin, kit and trim material roles so switching to whites still works. Add instanced soft ground-contact decals beneath the five static fielders. No animation timing, skeleton anchors, ball release, shot rules or camera changes.
- Replace tall faceted foliage with 48 broadleaf trees, each with six overlapping, slightly irregular, smooth canopy lobes and a trunk/branch structure. Weld canopy vertices before computing normals so the sphere seam does not produce a shading split. Foliage and trunks use two instanced draws and opaque materials.
- Rebuild the pavilion with a raised central gallery, deeper slate roof overhangs, shaded soffits, recessed window bays, structural pilasters, a balcony with balusters, ground-floor doors and side steps. Keep static architecture merged by material. The batting camera and HUD layout remain unchanged, so the score panels still obscure part of the building.
- Review labels and exported filenames identify pass 03.

## Verification and limits

Run the TypeScript/graphics build and existing regression suite, including character deformation, kit changes and bowling release. Inspect software projections of the actual posed character geometry and static venue silhouettes. These are geometry inspections, not WebGL screenshots or proof of the new colour grade.

Vercel preview protection has blocked the available browser from inspecting the running game. Final daylight balance on the user's phone, motion aliasing, shadow quality and sustained mobile frame time require live visual review. This pass is not a claim that the reference quality has been achieved. The batter's repaired garment topology is retained unchanged.
