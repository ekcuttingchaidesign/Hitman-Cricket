import type { CameraPose } from '../game/ShotReel';

/**
 * The game's own view from behind the bat, for a picture `aspect` wide
 * (width over height).
 *
 * Below 16:9 the view widens towards a constant horizontal field of view, so
 * a tall phone sees the whole pitch rather than the batter's shoulders, and
 * the aim drops with it: the extra frame goes to the wicket, not to empty
 * sky. That widening stops at `tallest` degrees up and down, which in Safari
 * (a page about 0.55 as wide as it is tall, under the address bar and over
 * the toolbar) is about forty degrees across.
 *
 * Saved to an iPhone's home screen the game is the whole screen, about 0.46
 * as wide as tall, and at the same sixty-seven degrees up and down that was
 * thirty-four across: mid-on and mid-off went out of the picture either side
 * and only long-on and long-off were left, the owner saw. Forty across was
 * not enough either, in Safari or out of it: mid-on stands about twenty and a
 * half degrees off straight from the camera, so at forty he was cut in half
 * by the edge. So the picture never gets narrower than `across` degrees,
 * which puts the men on the ring well inside it, and a tall screen gets a
 * taller view to keep that width, up to `widest`: the batter a little
 * smaller, the field all there.
 */
export const VIEW = { design: 16 / 9, base: 50, tallest: 67, across: 46, widest: 90 } as const;

const rad = Math.PI / 180;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** Degrees across a picture `aspect` wide at `fov` degrees up and down. */
export const acrossOf = (fov: number, aspect: number) => 2 * Math.atan(Math.tan(fov * rad / 2) * aspect) / rad;

export function homeViewFor(aspect: number): CameraPose {
  const { design, base, tallest, across, widest } = VIEW;
  const widened = 2 * Math.atan(Math.tan(base * rad / 2) * design / aspect) / rad;
  const tall = clamp((design - aspect) / (design - 0.5), 0, 1);
  let fov = clamp(aspect < design ? widened : base, base, tallest);
  if (acrossOf(fov, aspect) < across) fov = Math.min(widest, 2 * Math.atan(Math.tan(across * rad / 2) / aspect) / rad);
  return { eye: [0, 2.9, -5.15], at: [0, lerp(1.05, 0.15, tall), lerp(9, 5.4, tall)], fov };
}
