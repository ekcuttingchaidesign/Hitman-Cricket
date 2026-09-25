# Graphics pass 01

Historical implementation notes. The clothing and terrain details below are superseded by [graphics pass 02](graphics-pass-02.md), following visible defects found during user gameplay.

Implemented on `codex/graphics-upgrade`, based on the production snapshot already pulled into that branch. No production ref, deployment setting, database, gameplay rules, shot keyframes, grip solver or camera coordinates are changed by this pass.

## Visible changes

- The batter, bowler and fielders have continuous skinned jerseys and trousers. Signed-distance garment volumes are triangulated, welded and assigned skin weights; the existing solved shoulder, elbow, hip, knee and foot positions drive the bones. Shirt hems follow the pelvis while the chest and sleeves follow their own anchors. The generation is deterministic and cached per detail level.
- Puffy gloves, pads, helmet and bat stay rigid on the established attachments. Added helmet ear guards/vents, boot laces, a face decal and willow grain. Reduced subdivision on small equipment and distant figures.
- Repeating grass microdetail, curved mowing bands, sparse geometry at the pitch edge, granular wicket material, flat scuff impressions and separate crease markings replace the original flat field and 95 raised wear boxes.
- Warm directional sunlight, cooler sky fill, filmic tone mapping, tighter 2048px directional shadow coverage, and soft contact decals following the batter's feet. The ball retains its existing contrasting colour, path and flight cues.
- Blue gradient sky with procedural soft clouds, instanced tree canopies, rounded lamp faces, curved flags, pavilion window mullions and deeper roof/ledge forms.
- Three instanced seated-crowd batches replace box spectators. Static architecture is merged by sector and material. Alternating boundary cushions sit outside the existing gameplay boundary.
- Review UI identifies this as graphics pass 01. This rendering is also used by the ordinary game route on this feature branch.

## Ownership and budgets

Generated terrain colour/bump maps: 512² grass plus 512×2048 pitch, about 6.7 MiB combined with mipmaps. Contact map: 64². Grass detail repeats at world scale; anisotropy is capped at eight and the hardware limit. New texture and skeleton resources are disposed with the scene. Cached CPU garment templates have fixed keys; each scene owns its geometry/material clones.

The hero uses about 48k visible triangles after the change (previous inventory about 61k). These are geometry counts, not measured GPU frame timings. Distant characters use a coarser garment grid and simpler equipment geometry. Scenery fielders no longer render into the near-play shadow map. The shadow map is now 2048px on touch devices too; this is a deliberate first-pass quality choice that still needs sustained phone performance measurement. There is no full-screen AO, depth of field or bloom pass.

## Validation and limits

The existing tests check the established animation and gameplay invariants. New tests inspect the actual CPU-skinned clothing vertices for non-finite positions and intersections with the blade core across guard/drive/pull/charge phases, check mode colours and bowling deformation, and exercise static mesh merging. These supplement the old rig diagnostics; the retained hidden primitive meshes are solver measurements, not evidence that the new surface never clips.

A local software projection of the actual deformed geometry was used to inspect silhouettes and catch a waist separation. That inspection is **not** a Three.js/WebGL lighting, texture or shader validation. Vercel's protected previews require login in the available remote browser, which currently prevents hosted visual QA. TypeScript/build and passing unit tests cannot establish the reference match, shader appearance, motion shimmer, whole-body self-intersection, or sustained mobile frame rate.

This is the first substantive graphics pass, not final acceptance against the reference. Next visual review must compare the running phone scene and motion against the supplied image, particularly shoulder deformation, short-sleeve edges, trouser folds, grass scale, pitch warmth, cloud appearance, and ball readability. The custom procedural clothing is an authored asset prototype; it still needs that art/deformation review before being called final. The original reference image remains local-only and is never published.
