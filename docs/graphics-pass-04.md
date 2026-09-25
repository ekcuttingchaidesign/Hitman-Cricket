# Graphics pass 04: colour and rendering clarity

Branch: `codex/graphics-upgrade`. Production is unchanged.

## Changes

The previous pass combined muted material colours with excessive ambient fill, flattening the scene. This pass restores richer grass and foliage greens, a clearer cyan-blue sky and warmer sandy pitch. The directional key is slightly stronger and the hemisphere/fill contribution lower, keeping cool shadow separation without a global amber tint. ACES tone mapping remains in use. The HUD is unchanged.

The game previously capped touch-screen rendering at 1.5× device-independent pixels. On a 3× phone that supplied half the native pixel width and height. Resolution now follows device pixel ratio up to 3×, bounded by a 3.5-million-pixel touch-screen budget (6 million on desktop) and the driver's renderbuffer/viewport limits. A 390×844 viewport on a 3× phone renders at 1170×2532. Large tablets can use a lower ratio to remain within budget. Resizes reduce DPR before enlarging the viewport when needed to avoid an oversized intermediate allocation. PNG export keeps its independent resolution and restores the current game ratio.

Increase round-surface subdivisions on the batter's helmet/head/joints and the fielding figures' caps. Increase tree-crown tessellation and reduce the angular-looking surface perturbation. Keep the repaired garment topology, animations, camera and gameplay intact.

## Validation and tradeoffs

Tests cover native phone resolution, lower-density screens, tablet/desktop pixel budgets, portrait/landscape orientation and driver dimension limits, in addition to the existing regression suite and graphics export checks. The graphics build checks TypeScript and bundles both game and review routes.

Native 3× rendering can require four times as many screen pixels as the old 1.5× cap. The pixel budget bounds allocation but does not establish a frame-rate guarantee. Sustained phone performance remains unmeasured. No blur, CSS sharpening or upscaled screenshot is used as a substitute for rendering more pixels.

The available browser still reaches Vercel login instead of the running preview. This code/build validation does not establish a visual match to the supplied colour reference. Live WebGL and phone visual/performance verification remain outstanding until browser access is available. Higher resolution and smoother primitives do not by themselves replace further character art refinement.
