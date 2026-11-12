import type { ShotOutcome } from '../game/types';

/**
 * The camera going after the ball off the bat, under Pro Cam and Close.
 *
 * **Pro Cam** is his eyes, and a batter watches the ball he has hit: a cover
 * drive for four, a nudge for one, a skier, his head goes with it. So from
 * the bat meeting the ball the look turns after it (`turn`, quick, as a head
 * turns), stays on it while it flies and `hold` milliseconds after, on the
 * fielder who has it or where it stopped, then comes back down the pitch
 * (`back`, slower) before the next ball. Only the look turns: the camera
 * stays at his eyes. Never further round than `yaw` either side of straight
 * down the pitch, nor up or down past `up` and `down`: a fine leg sweep has
 * him looking over his shoulder, not out of the back of his head.
 *
 * **Close** stands low behind him, so from the bat a ball going to the rope
 * runs off into the stand at the top of the picture, where the classic view,
 * higher and further back, watches it across the grass. So it cranes up and
 * back to `CLOSE_FOLLOW.eye` as the look pans after the ball, like a camera
 * operator behind the bat, and comes back down before the next ball. Only
 * panning from where it stands was tried beside it, and the owner kept the lift.
 *
 * Which balls: one off the bat that goes somewhere (`followed`). Not an edge
 * or one played on, not a block that dies at his feet, not off the pad or the
 * body. A ball the catch camera or a replay films is theirs: a film's camera
 * is drawn over all of this.
 *
 * Only the picture: who goes for the ball is judged from the classic view
 * (`GameScene.inShot`), so nothing is fielded or scored differently.
 * `?camturn=0` turns both off, for holding them side by side.
 */
export const BALL_LOOK = {
  /** Time constants of the look's ease, milliseconds: after the ball under Pro Cam and Close, and back down the pitch. */
  turn: 110, closeTurn: 240, back: 260,
  /** How long the look stays on the ball once its flight is over. */
  hold: 450,
  /** The furthest round from straight down the pitch, and up and down, in degrees. */
  yaw: 115, up: 55, down: 35,
  /**
   * Under Pro Cam, the bat and gloves go out of the picture this long after
   * the bat meets a ball it follows, until the look comes back: turned after
   * the ball, the follow-through filled the picture and hid it.
   */
  batGone: 120,
  /** A ball that goes less than this far from the bat is not followed, in metres. */
  reach: 6,
} as const;

/** Close's camera lifted for a ball going away: higher and further back, about the classic view's place. */
export const CLOSE_FOLLOW = { eye: [0, 3.7, -5.6] as const, lift: 380, drop: 420 } as const;

/**
 * Classic going after the ball, two ways to look at side by side, neither on
 * unless the link asks (`?classicfollow=pan` or `zoom`): Classic is the view
 * players know, so it stays as it is until the owner picks.
 *
 * **pan**: the camera stays where it stands and its look turns `share` of the
 * way after the ball, never more than `yaw` round or `up` up: a square cut no
 * longer runs straight off the side of a phone's narrow picture, and the
 * batter stays in it.
 *
 * **zoom**: the pan, and the lens closing in on the ball as it goes away, as
 * a television camera picks up a ball running to the rope: down to `zoom` of
 * the lens's width once the ball is `far` metres off, opened again as the look
 * comes back.
 */
export const CLASSIC_FOLLOW = {
  share: .6, yaw: 38, up: 22,
  turn: 300,
  zoom: .55, near: 12, far: 55, zoomIn: 450, zoomOut: 380,
} as const;

export type ClassicFollow = 'pan' | 'zoom';

/** What the link asks for: on, unless it says `?camturn=0`; and Classic's follow, only where `?classicfollow=` names one. */
export function readBallLook(search = typeof location === 'undefined' ? '' : location.search): { on: boolean; classic: ClassicFollow | null } {
  const q = new URLSearchParams(search), asked = q.get('classicfollow');
  return { on: q.get('camturn') !== '0', classic: asked === 'pan' || asked === 'zoom' ? asked : null };
}

/**
 * Classic's look: `share` of the way from straight down its own line (`rest`)
 * to the ball (`toward`), by yaw and pitch, held inside `CLASSIC_FOLLOW.yaw`
 * and `up` of where it rests. Both unit vectors.
 */
export function partialLook(rest: readonly [number, number, number], toward: readonly [number, number, number], share: number = CLASSIC_FOLLOW.share): [number, number, number] {
  const angles = (v: readonly [number, number, number]) => [Math.atan2(v[0], v[2]), Math.asin(clamp(v[1], -1, 1))];
  const [y0, p0] = angles(rest), [y1, p1] = angles(toward);
  let dy = y1 - y0;
  if (dy > Math.PI) dy -= 2 * Math.PI; else if (dy < -Math.PI) dy += 2 * Math.PI;
  const yaw = y0 + clamp(dy * share, -CLASSIC_FOLLOW.yaw * rad, CLASSIC_FOLLOW.yaw * rad);
  const pitch = p0 + clamp((p1 - p0) * share, -CLASSIC_FOLLOW.up * rad, CLASSIC_FOLLOW.up * rad);
  return [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
}

/** How far in the zoom's lens is, as a share of its width, for a ball `distance` metres from the camera. */
export function zoomFor(distance: number): number {
  const { near, far, zoom } = CLASSIC_FOLLOW;
  const k = clamp((distance - near) / (far - near), 0, 1);
  return 1 - (1 - zoom) * k * k * (3 - 2 * k);
}

/** A ball off the bat the camera goes after, given how far from the bat it ends up. */
export function followed(outcome: ShotOutcome, reach: number): boolean {
  if (!outcome.madeBatContact || outcome.edged || outcome.defended || outcome.padded || outcome.hit) return false;
  if (outcome.wicketType === 'BOWLED' || outcome.wicketType === 'STUMPED' || outcome.wicketType === 'LBW') return false;
  return reach >= BALL_LOOK.reach;
}

export type LookPhase = 'follow' | 'hold' | 'back';

/** Where the look is `since` milliseconds after the bat met a followed ball whose flight lasts `flightMs`. */
export function lookPhase(since: number, flightMs: number): LookPhase {
  return since < flightMs ? 'follow' : since < flightMs + BALL_LOOK.hold ? 'hold' : 'back';
}

const rad = Math.PI / 180;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * The direction from the lens to the ball, as a unit vector, held inside the
 * turn a head can make (`BALL_LOOK.yaw`, `up`, `down`) about straight down the
 * pitch, which is `+z`.
 */
export function lookToward(dx: number, dy: number, dz: number): [number, number, number] {
  const flat = Math.hypot(dx, dz);
  if (flat < 1e-6 && Math.abs(dy) < 1e-6) return [0, 0, 1];
  const yaw = clamp(Math.atan2(dx, dz), -BALL_LOOK.yaw * rad, BALL_LOOK.yaw * rad);
  const pitch = clamp(Math.atan2(dy, flat), -BALL_LOOK.down * rad, BALL_LOOK.up * rad);
  return [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
}

/** An ease's share of the way covered in `dt` milliseconds with time constant `tau`. */
export const easeBy = (dt: number, tau: number) => 1 - Math.exp(-Math.max(0, dt) / tau);
