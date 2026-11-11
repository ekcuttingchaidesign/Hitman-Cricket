import type { CameraPose } from '../game/ShotReel';

/**
 * The game's own view from behind the bat, for a picture `aspect` wide
 * (width over height).
 *
 * Below 16:9 the view widens towards a constant horizontal field of view, so
 * a tall phone sees the whole pitch rather than the batter's shoulders, and
 * the aim drops with it: the extra frame goes to the wicket, not to empty
 * sky. That widening stops at `tallest` degrees up and down, which keeps the
 * batter the size players know him at.
 *
 * Saved to an iPhone's home screen the game is the whole screen, about 0.46
 * as wide as tall, and at sixty-seven degrees up and down that is thirty-four
 * across, where mid-on and mid-off used to stand out of the picture. Widening
 * the view to bring them in made the batter smaller, which the owner did not
 * want, so the view is left alone and the men stand where it sees them
 * (`BLAST_FIELD`, `TEST_FIELD` in `field.ts`, held in `tests/home-view.test.ts`).
 */
export const VIEW = { design: 16 / 9, base: 50, tallest: 67 } as const;

const rad = Math.PI / 180;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

export function homeViewFor(aspect: number): CameraPose {
  const { design, base, tallest } = VIEW;
  const widened = 2 * Math.atan(Math.tan(base * rad / 2) * design / aspect) / rad;
  const tall = clamp((design - aspect) / (design - 0.5), 0, 1);
  const fov = clamp(aspect < design ? widened : base, base, tallest);
  return { eye: [0, 2.9, -5.15], at: [0, lerp(1.05, 0.15, tall), lerp(9, 5.4, tall)], fov };
}
