# Graphics upgrade: reference, feasibility, and delivery plan

Reviewed 25 September 2026 against production commit `d630eb441afefcc4beaf1c713a3e1891a2caf5a2`.
Working branch: `codex/graphics-upgrade`.
Inputs: all 16 pages of `Hitman-Cricket-Graphics.pdf` and the separately attached portrait reference JPEG.

## Decision

Three.js 0.180 can support this art direction. There is no identified engine feature blocking it. Reaching it requires coordinated work on geometry, materials, lighting, scene composition, and mobile rendering cost. Changing renderer settings alone will not produce the reference.

The reference is the acceptance target. The PDF's proposed "80–90%" is not an agreed quality concession, a measurable result, or a guarantee. A single still also cannot prove fidelity during motion or sustained phone performance. We need reference comparisons in the running game and actual device measurements before claiming success.

Plan a purpose-built, continuously skinned hero batter from the outset. Prove its silhouette, shading, and deformation early. Keep the current pose timing, bat trajectory, grip anchors, and gameplay as the authority; adapt the visual mesh to them. Improving distant procedural players remains sensible. Spending weeks polishing primitive hero parts before discovering that they cannot satisfy the image is the wrong order for this brief.

This commit records the audit and plan. It does not change game rendering, animations, gameplay, dependencies, hosting, or production. No branch has been pushed.

## What the reference actually asks for

| Area | Required visual result | Implementation direction |
| --- | --- | --- |
| Overall image | Bright blue daytime sky, warm sun, rich green turf, creamy pitch, navy/orange kits, soft stylised surfaces | Tune sun, sky fill, environment, exposure, and surface roughness together; compare tone mapping alternatives against the reference |
| Hero batter | Rounded helmet; continuous shirt, shoulders, trousers and limbs; convincing sleeves and folds; padded gloves; clear grille; correct bat; orange back number and shoe accents | Custom skinned body with deliberate topology, authored silhouette, restrained normal detail and baked local occlusion; rigid helmet/bat/pads attached to appropriate anchors |
| Near turf | Fine grass texture, believable pitch edge, broad alternating mowing bands and visible curved patterns | Separate broad field colour/mowing pattern from repeating fine detail; sparse near-camera grass geometry only if the edge still looks flat |
| Pitch | Warm granular surface, restrained wear and footprints, clean creases | Deterministic textures with soft wear masks, roughness variation and modest normal detail; keep crease resolution independent of a coarse field texture |
| Grounding | Soft shadows under shoes, pads, stumps and bodies; shapes shaded where they meet | Tight directional shadow coverage near play, soft contact decals following feet, baked static AO; selective character occlusion rather than full-screen AO as the phone baseline |
| Sky and depth | Blue gradient, soft clouds, foliage beyond stands, distant scenery that retains colour | Lightweight sky/cloud layers and instanced tree clumps; coordinate haze with the horizon colour |
| Venue | Cream pavilion, blue glass, roof depth, recognisable seated crowd, navy/orange boards, segmented boundary and round floodlight lamps | Bevelled or weighted-normal architectural edges, material/vertex shading, instanced seated silhouettes, merged scenery by sector, round emissive lamps |
| Composition | Same behind-batter view, centred pitch, batter left of stumps, recognisable pavilion and existing HUD hierarchy | Compare reference landmarks at matching aspect ratios; preserve gameplay coordinates and layout, tune projection only if comparison establishes a need |
| Playability | Readable approaching red ball and immediate timing response throughout | Protect ball contrast, avoid gameplay depth-of-field, keep effects clear of the delivery path, profile frames during batting and charge effects |

The image contains both straight and curved mowing patterns. Replacing every circle with straight stripes because the PDF calls rings unrealistic would diverge from the supplied target. Likewise, shrinking the stylised helmet to anatomically realistic dimensions would change the desired art direction.

## Audit of the current source

Verified in `src/scene/GameScene.ts`, `src/entities/Batter.ts`, `Cricketer.ts`, `Bowler.ts`, `rig.ts`, `batGeometry.ts`, `src/Game.ts`, the README and `CLAUDE.md`:

- Three.js is locked to 0.180.0. `WebGLRenderer` uses hardware antialiasing, sRGB output, PCF soft shadows, and no explicit tone mapper or scene environment.
- Touch pixel ratio is capped at 1.5; desktop at 2. Shadow maps are 1024 and 2048 respectively. Touch detection is not a measure of GPU capability.
- The background is a clear colour plus linear fog. No clouds or tree line exist.
- The ground has ten separate mowing rings. The pitch has 95 separate wear meshes and separate crease boxes. Scenery materials are predominantly flat shaded and untextured.
- Crowd instances are boxes. Most stadium elements are separate meshes. The generic `box()` helper marks them all as shadow casters, even tiny wear marks and remote stadium pieces.
- The batter uses an ellipsoid torso, separate limb tubes and joint spheres. Bowler/fielders have lathed torso/pelvis profiles, but their limbs are still separate segments and joint balls. Neither is a skinned mesh.
- The orange back-number strokes already exist as geometry. Grille metalness and differentiated character roughness also already exist; these need improvement, not claims that they are absent.
- Both duplicate charge-ring construction blocks described by the PDF are present. The orphan starts invisible: remove it for correctness/resource ownership, but do not count it as a large active draw-call saving.
- The world is mirrored on X. Texture lettering, tangent handedness, imported bone spaces, bat handedness and material culling need explicit checks under that parent transform.
- Camera resize changes vertical FOV and aim on portrait screens. A reference match must use the correct viewport, not a desktop screenshot resized into a phone outline.
- `Batter.apply()` contains grip correction and reach constraints in addition to simple limb placement. `inspect()` reads actual mesh scales and transforms in several places. A skinning adapter must preserve truthful measurements and update mesh-specific checks where needed; retaining old diagnostics beside an incorrect new mesh would be a false pass.
- Current cleanup handles geometry/materials. New textures, environment render targets and any post-processing targets need explicit lifecycle ownership and disposal.

### Geometry inventory measured during this review

Constructed the real classes through Vite's server-side module loader and traversed their geometry. Triangle counts include instance multiplicity. These are complete-object inventories, not visible-frame draw counts, GPU timings or phone benchmarks.

| Object set | Mesh objects | Triangles | Shadow-casting mesh objects |
| --- | ---: | ---: | ---: |
| Batter | 83 | 60,684 | 83 |
| One shared cricketer | 41 | 33,068 | 41 |
| Ground, stadium and both wickets, excluding fielders | 391 | 25,252 | 378 |

There are five scenic fielders, plus the bowler and catcher. Even an unseen or tiny figure has a costly source asset. The inventory confirms the need for lower-detail figures and batching, but does not establish whether a particular phone is CPU-, GPU-, or fill-rate-limited.

The PDF reports approximately 950 calls/450,000 triangles on a phone viewport and 1,060/520,000 on desktop, including shadow rendering. Those are the PDF author's earlier software-renderer measurements, not newly reproduced measurements in this review.

## Corrections to the proposed approach

1. **Material polish cannot repair silhouette.** Tone mapping changes colour response; an environment improves surface lighting. Neither joins shoulders to a torso nor creates believable shirt folds. The hero needs an asset solution.
2. **Do not postpone the hardest asset.** Start the hero proof alongside the lighting proof. A modelled batter is the planned route for this acceptance target, not a late optional decoration.
3. **Animation retention requires an adapter.** Existing poses supply anchors, but bone hierarchy, rest orientations, bind matrices, twist and skin weights determine deformation. Imported clips are unnecessary; retargeting the current poses is still real work. Correct joint lengths alone are insufficient.
4. **One atlas is not one free crowd.** Instancing can minimise draw submissions, but transparent quads still cost pixels and may sort badly. Compare instanced low-poly seated people against alpha-tested atlas figures at gameplay scale. Use a few batches where that produces cleaner silhouettes.
5. **Merging has limits.** Merge by compatible material and spatial sector, transforming vertices/normals correctly. One giant stadium loses useful frustum culling; a merged object with many material groups still creates multiple draws. Keep bails, flags and reactive elements separate.
6. **A texture covering the whole field will not resolve near grass.** Use world-scale tiling/detail plus a separate broad colour/mowing mask. Mipmaps and anisotropy must be checked in motion to avoid shimmer.
7. **Ambient occlusion is not interchangeable.** Baked AO/vertex shading can shade fixed roofs, seating and cloth creases cheaply. Dynamic limb overlap and foot contacts need a different treatment. Simple dark circles alone will not reproduce all the reference's contact shading.
8. **Download size is not texture memory.** A 2048² uncompressed RGBA texture with mipmaps is about 21.3 MiB even if its PNG/WebP file is small. Geometry compression and GPU texture compression solve different problems. Budget both separately; consider KTX2 for authored texture sets.
9. **The quoted 665 kB is not the full game download.** The current build splits JavaScript into multiple chunks and also loads artwork/audio. `public/` is approximately 12 MiB and `src/assets/` approximately 1.2 MiB on disk. Neither folder total equals first-play transfer: record an actual cold network trace before setting a final loading budget.
10. **Effort estimates are provisional.** The PDF's 6–9 weeks assumes an asset route and iteration cost that have not been demonstrated. Establish the hero proof and real-device budget before treating any schedule as a commitment.

## Character asset contract

A suitable final hero asset does not exist in this repository or in the supplied files. The JPEG supplies one view, not a model, UV layout, skeleton, or hidden-side design. This is an asset-production dependency, not an engine limitation.

Create a custom body (DCC-authored or carefully authored procedural continuous geometry) in the reference's style. A commissioned asset is an option, not a prerequisite to starting. Generic sports models and raw image-to-3D output must pass the same art and deformation checks; neither should be presumed to match.

- Use the current coordinate scale and explicit documented rest pose. Match shoulder, hip, hand, and foot anchor locations before rig integration.
- Keep current gameplay/contact coordinates, shot clocks and blade orientation authoritative. Any proportion change that alters reach needs a conscious rig review.
- Provide continuous shirt/torso and trouser surfaces; enough loops around shoulders, elbows, hips and knees to bend without seams. Preserve the large stylised helmet.
- Plan approximately 15–25k hero triangles initially, 3–6 material groups, and a compact atlas. These are design budgets to validate, not arbitrary quality ceilings.
- Use baked normal/AO detail for restrained folds, seams, glove padding and equipment surfaces. Avoid simulation for loose clothing.
- Keep the bat rigid with its existing two grip anchors; maintain puffy gloves and the actual overhand/underhand grip. Keep helmet and equipment attachments stable under animation.
- Support navy/orange Blast and cream Test Survival through material masks/palette swaps; do not bake a permanent coloured shirt into all channels.
- Include UVs, normals, texture colour-space declarations, skin weights, attachment definitions and any necessary licence record. Choose compression after fidelity/decoding tests.
- Validate guard, backlift, contact, follow-through, recovery, pull, sweep, scoop, charge, and injury/fall. Check the actual skinned surface as well as joint diagnostics.

## Delivery phases and acceptance gates

### Phase 0: prove quality and establish budgets

Capture deterministic baseline frames and performance counters. Establish a lighting/material test using the real game camera and a hero-body prototype, including the guard and three demanding strokes: straight drive, pull, and charge. Keep the approved production shot timing and advance-charge action.

Gate: the prototype demonstrates the target silhouette and surface treatment at phone size, and correct joint/grip deformation. Identify and resolve the authoring route if it falls short. Do not spend the entire world phase before learning whether the hero can meet the target.

### Phase 1: render headroom and the world

Replace pitch wear meshes with texture layers; merge scenery by sector/material; simplify distant figures and their shadows. Introduce semantic material definitions so grass, painted metal, concrete and cloth no longer share appearance solely because they share a colour. Add lighting/exposure calibration, a suitable daylight environment, sky/clouds, the tree line, turf layers, pitch surface and boundary treatment.

Gate: side-by-side portrait screenshots match the reference's palette, broad composition, sky, turf and pitch. No disappearing creases, mirrored labels, texture shimmer, changed ball path or loss of input responsiveness. Record render cost before and after.

### Phase 2: finish the players

Integrate the proven skinned hero, kit textures, helmet/grille, bat graphics, shoes, pads and gloves. Give the bowler and nearer fielders simplified continuous silhouettes; use cheaper geometry for distant fielders. Preserve bowling release/contact synchronisation and both mode palettes.

Gate: every existing stroke and injury pose passes numerical checks and visual review from game and lab views. No bat/body clipping, broken grip, sliding feet, floating pads, collapsing shoulders, or change to the existing advance-charge animation. A numerical test pass alone is insufficient.

### Phase 3: venue finish and performance acceptance

Finish seated crowd silhouettes, pavilion glazing, roof/seat occlusion, round lamps, subtle contact shadows and restrained reactive details. Recheck HUD material treatment only where necessary to match the reference while preserving layout and controls. Optional desktop effects must not be required for the core phone look.

Gate: matching-aspect reference comparison, full innings in both modes, sustained tests on real iPhone Safari and Android Chrome, cold-load and memory checks, rotation/background/resume checks, and reduced-motion checks. Review the separate preview before any production release. There is no production deployment authorisation in this task.

Night matches, broadcast camera cuts, additional modes, umpires and extra stadium screens are outside this reference-matching upgrade. They are not prerequisites for its visual result.

## Provisional mobile budgets

These are starting engineering targets to test, not measured current performance or promises across all phones.

| Metric | Initial target |
| --- | --- |
| Gameplay frame rate | Sustained 60 fps on agreed target phones; explicitly review any lower-device support tier rather than silently accepting 30 fps |
| Total render submissions | Aim below 200 per frame, including shadows; start around 150 where practical |
| Rendered triangles | Aim below 200k per frame including shadows, while protecting the hero silhouette |
| Hero | Approximately 15–25k triangles and 3–6 material groups before shadow pass |
| Distant fielder | Approximately 1–3k triangles; atlas/vertex colours and few groups |
| New resident textures | Start with an incremental budget around 64 MiB; measure total application memory as well |
| New compressed visual transfer | Initial working budget 2–4 MB, validated with a network trace and the eventual asset quality |
| Phone post-processing | No mandatory full-screen AO, depth-of-field or bloom; keep the reference's core look in assets and lighting |

Record frame-time distribution and visible stalls, not just average fps. Test 5–10 minutes of gameplay, charge effects and mode transitions to reveal thermal degradation. Quality tiers may reduce invisible geometry, shadow resolution and effect cost; they cannot be used to declare a visibly inferior character acceptable. Stop and revise the budget if the reference and target-device frame time cannot both be met.

## Verification completed and remaining

- Production build: `npm run build` passed, including TypeScript and the function-import check.
- Baseline full suite: 1,042 passed; one dense grip-continuity test hit its 5-second timeout while the build/test work was running. Reran that exact test alone with a 20-second timeout: passed in about 4.25 seconds. No assertion failure was reproduced. No test thresholds or source were changed.
- Source inventory: measured the figures and scenery above from the actual classes.
- Reference: inspected the supplied JPEG and the PDF's target section; read all 16 pages.
- Browser capture/frame profiling: not completed. No local Chromium binary was available, and both the project and bundled Playwright browser downloads returned invalid/empty archives. Do not present the PDF's figures as a new benchmark or claim a rendered visual match from this audit.
- Real phones: not tested. Device selection and access remain release-validation dependencies. Desktop software rendering would not establish Safari/Android thermal performance anyway.
- There are no gameplay/rendering edits in this phase, and nothing has been pushed or deployed.

## Technical references

Confirmed the relevant capabilities in the installed Three.js 0.180 source as well as the official documentation. Current web documentation may describe newer releases; keep implementation aligned with the installed version.

- [MeshStandardMaterial](https://threejs.org/docs/pages/MeshStandardMaterial.html): environment, AO, roughness and normal-map surfaces.
- [SkinnedMesh](https://threejs.org/docs/pages/SkinnedMesh.html): skeleton binding, skin weights and bind transforms.
- [Optimising many objects](https://threejs.org/manual/pages/optimize-lots-of-objects.html): geometry batching and draw submissions.
- [Resource cleanup](https://threejs.org/manual/pages/cleanup.html): explicit disposal and texture memory.
