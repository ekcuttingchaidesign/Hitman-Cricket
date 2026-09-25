# Graphics pass 02: mesh and turf repair

Branch: `codex/graphics-upgrade`. Production is unchanged.

## What was wrong

The implicit clothing surfaces and broad automatic skin weights produced poor shoulder, sleeve and pelvis deformation. Upper-arm skin broke through sleeve edges, the waistband overlapped the shirt, and the sleeve orientation could flip when the arm pointed forward. High-contrast grass noise, bump shading and isolated pitch-edge blades made the surface read as streaks and spikes.

## Repair

- Replace implicit garments with indexed panels: a torso with two shared armhole loops, regular tube sleeves with turned cuffs, and a waist/seat that splits into two trouser legs along one crotch seam. No overlapping clothing volumes or random vertex folds.
- Author bone weights by panel and sleeve distance. Use a torso-relative quaternion swing to orient sleeves without a forward-axis singularity. Anchor the hem to the hips. Keep only exposed upper-arm skin and place a narrow belt beneath the hem.
- Use the rebuilt clothing on the batter, bowler and fielders in both kits. Existing rigid equipment remains attached to its original anchors.
- Add an outward long-on follow-through keyframe at 220 ms so the bat does not rotate through the front thigh. Contact position, contact time, total shot duration, gameplay rules and the grip solver remain unchanged.
- Remove the 1,800 isolated grass triangles. Replace directional grass texture with low-contrast, seamless, non-directional colour detail; soften mowing contrast; remove grass and pitch noise bump maps and lower pitch grain contrast.
- Label the review and exported frames as pass 02 to distinguish them from earlier captures.

## Verification and remaining limits

Topology checks cover shared-edge winding, non-manifold edges and intentional opening loops for both character rigs. Motion checks inspect actual deformed garment vertices against the blade core, including charge and the remaining shot families. Both kits, bowling deformation and merged venue construction are covered. A separate four-millisecond sweep covered 14 shot variants. These checks do not prove there are no triangle intersections, self-intersections or rendering defects at unsampled times.

Software projections of the actual posed geometry were inspected for guard, drive, pull and charge, including the sleeve silhouettes and waist joins. They are geometry inspections, not screenshots of the WebGL game. Hosted WebGL inspection remains blocked by Vercel preview login in the available browser. Final shader appearance, mobile motion shimmer and sustained phone performance remain unverified.

This is a repair of the reported defects, not acceptance against the supplied reference. The character is still a procedural stylised asset; equipment refinement, more deliberate sculpting and a full running-scene art review are still needed to establish the target quality. Lighting and stadium assets are unchanged in this repair. Reference images stay local-only.
