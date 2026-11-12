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

/**
 * The television's view (`?cam=broadcast`): high behind the bowler's arm on a
 * long lens, looking down the pitch at the batter with the keeper beyond him
 * and the bowler coming into the foot of the picture as he delivers. Steep
 * enough that the grass runs up past the keeper rather than the boards: the
 * rope behind the bat is twenty metres off on these grounds, where a real
 * one's is sixty. The lens is held at `fov` degrees up and down whatever the
 * screen's shape, so the batter and the bowler stand where they do on every
 * phone; a wider screen sees more grass either side.
 */
export const BROADCAST = { eye: [0, 7, 46] as const, at: [0, .5, 7.1] as const, fov: 8.5, ball: .55 } as const;

export function broadcastViewFor(_aspect: number): CameraPose {
  return { eye: BROADCAST.eye, at: BROADCAST.at, fov: BROADCAST.fov };
}

/**
 * Pro Cam (`?cam=pro`), the batter's eyes: the camera is where his eyes are
 * (`Batter.eyes`), following his head as he moves, and he is not drawn but
 * for his arms and the bat (`Batter.firstPerson`). It looks down the pitch at
 * `aim`, low enough that the bowler's hand is near the top of the picture and
 * the ball comes down it to the bat at the foot, on a lens of `fov` degrees up
 * and down whatever the screen's shape. `eye` is only where it stands before
 * he is first drawn. The ball is drawn at `ball` of the size it is drawn from
 * behind the bat, which is three times its own: from his eyes it comes within
 * a metre of the lens. The lens stands `behind` his eyes and `above` them, a
 * hand's width back towards the keeper, so his gloves and the bat show at the
 * foot as he waits; and nothing nearer it than `near` is drawn, or his arm
 * filled the picture as it came up past his face on the follow-through.
 */
export const PRO_CAM = { eye: [-.2, 1.6, .7] as const, aim: [0, -.7, 9] as const, fov: 74, follow: 90, ball: .5, behind: .35, above: .06, near: .22 } as const;

export function proViewFor(_aspect: number): CameraPose {
  return { eye: PRO_CAM.eye, at: PRO_CAM.aim, fov: PRO_CAM.fov };
}
