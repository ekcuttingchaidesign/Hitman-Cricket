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
 * Close (`?cam=close`): low and close behind him, just over his helmet so the
 * bowler's hand is never behind it, looking down the pitch at the bowler. He
 * stands big at the foot of the picture and the ball comes at the lens; the
 * stand fills the top, which from that low is what a batter sees. The lens
 * is held at `fov` degrees up and down whatever the screen's shape.
 */
export const CLOSE_CAM = { eye: [0, 2.05, -3.1] as const, at: [0, .25, 12] as const, fov: 50 } as const;

export function closeViewFor(_aspect: number): CameraPose {
  return { eye: CLOSE_CAM.eye, at: CLOSE_CAM.at, fov: CLOSE_CAM.fov };
}

/**
 * Pro Cam (`?cam=pro`), the batter's own eyes: the camera is where his eyes
 * are (`Batter.eyes`), following his head as he moves, and nothing of him is
 * drawn but the gloves and the bat (`Batter.firstPerson`), which come into
 * the picture only as he swings them up into it: in his guard there is
 * nothing of him on the screen, as a broadcast game's pro camera has it. It
 * looks down the middle of the pitch at `aim`, nearly level, so the stand is
 * across the top, the bowler small in the middle and the pitch running down
 * to the foot, on a lens of `fov` degrees up and down whatever the screen's
 * shape. `eye` is only where it stands before he is first drawn. It stands
 * `behind` his eyes and `above` them. The bat and gloves are out of the
 * picture while the handle is within `clear` of the lens, as they come up
 * past his face on the follow-through and down again into his guard: drawn
 * there they filled the picture, and cut by the near plane (`near`) they read
 * as a glove chopped in two. The ball is drawn at `ball` of the size it is
 * drawn from behind the bat, which is three times its own: from his eyes it
 * comes within a metre of the lens.
 */
export const PRO_CAM = { eye: [-.2, 1.65, .9] as const, aim: [0, -.1, 18] as const, fov: 62, follow: 90, ball: .5, behind: .35, above: .05, near: .22, clear: .3 } as const;

export function proViewFor(_aspect: number): CameraPose {
  return { eye: PRO_CAM.eye, at: PRO_CAM.aim, fov: PRO_CAM.fov };
}
