import { GAME } from '../config/gameplay';
import type { CameraPose } from './ShotReel';

/**
 * The walk-on: a few seconds before the first ball of an innings, in two slow
 * shots. First the bat, close to, a long lens drifting up the back of the
 * blade (where a skin's big art is) as a light crosses it; then a cut to
 * behind him, above his shoulders, looking down past his helmet and the bat
 * resting on his shoulder at his front foot scuffing his mark on the crease.
 * He looks up to the bowler, the camera tilting up the pitch with him, and as
 * the bat comes off his shoulder into his guard it rises onto the game's own
 * view. Slow on purpose: a moment before an innings, not a transition.
 *
 * Everything here is a function of the film's own clock, `t` in milliseconds
 * from its start, so any moment of it can be drawn on its own (the checks pin
 * it, `__cricket.introAt`). The camera is in the game's frame, unmirrored, as
 * `GameScene.cinematic` takes it. Nothing is bowled, scored or counted.
 *
 * A prototype for now, behind `?intro=1`.
 */
export const INTRO = {
  /** The cut from the bat to behind him. */
  cut: 2600,
  /** His front foot scuffing his mark, twice, from and to. */
  scuffs: [2800, 4400] as const,
  /** His head up to the bowler, from half a second before this. */
  look: 5000,
  /** The bat lifted off his shoulder. */
  lift: 5800,
  /** In his guard. */
  guard: 6400,
  /** The camera on the game's view: the bowler may go. */
  total: 7000,
  /** The light across the bat, from and to. */
  sweep: [550, 2150] as const,
} as const;

type Vec = readonly [number, number, number];

/** Where he stands, in the game's frame: his root, as `Batter.clear` places it. */
const ROOT: Vec = [GAME.stanceX, 0, GAME.stanceZ];
/** Which way the lean faces him (`LEANING`'s yaw): turned past side-on, towards the keeper. */
const LEAN_YAW = 2.05;
/** His middle in the lean, which the bat shot is framed round. */
const MIDDLE: Vec = [ROOT[0] - .03, 0, ROOT[2] - .03];

/**
 * A point round him in the lean: `turn` radians from the way he faces (round
 * towards the bat for a positive turn), `out` metres from his middle, `up`
 * metres off the turf.
 */
function round(turn: number, out: number, up: number): Vec {
  const a = LEAN_YAW + turn;
  return [MIDDLE[0] + Math.sin(a) * out, up, MIDDLE[2] + Math.cos(a) * out];
}
/** A point on the bat planted at his side in the lean, `up` metres off the turf. */
function onBat(up: number): Vec {
  // Off his hip along the far shoulder's line (`LEANING`'s grip).
  const far = LEAN_YAW + Math.PI / 2;
  return [MIDDLE[0] + Math.sin(far) * .30, up, MIDDLE[2] + Math.cos(far) * .30];
}

/** A point off his root in the game's frame: across, up, and down the pitch from where he stands. */
const behind = (x: number, y: number, z: number): Vec => [ROOT[0] + x, y, ROOT[2] + z];
/** Where a camera at `eye` looks, turned `yaw` degrees towards the off side and tipped `down` degrees. */
function aim(eye: Vec, yaw: number, down: number): Vec {
  const y = yaw * Math.PI / 180, d = down * Math.PI / 180;
  return [eye[0] + 3 * Math.sin(y) * Math.cos(d), eye[1] - 3 * Math.sin(d), eye[2] + 3 * Math.cos(y) * Math.cos(d)];
}

interface Key { t: number; eye: Vec; at: Vec; fov: number }
/**
 * The shots, each a run of keys from the cut that opens it to the next one.
 * A shot opens already moving, as a cut into a moving camera does; only the
 * last eases, onto the game's view (`home`, filled in by `introCamera`).
 */
const SHOTS: readonly (readonly Key[])[] = [
  // The bat: a long lens low by the back of the blade, drifting up it from
  // the plain willow to the art under the handle, and stopping short of his
  // glove. The light crosses it on the way.
  [
    { t: 0, eye: round(1.22, 1.10, .30), at: onBat(.36), fov: 26 },
    { t: INTRO.cut, eye: round(1.48, 1.08, .62), at: onBat(.62), fov: 26 },
  ],
  // Behind him on the leg side, where the stumps are not in the way and his
  // body hides the hand on the handle: low on his front foot scuffing the
  // crease, craning slowly up his back to over his shoulder, the bat resting
  // on the far one and the pitch running away to the bowler beside him; then
  // the bowler, as he looks up, and onto the game's view.
  [
    { t: INTRO.cut, eye: behind(-.85, .62, -1.45), at: behind(-.05, .20, .35), fov: 40 },
    { t: INTRO.scuffs[1], eye: behind(-.60, 2.0, -1.85), at: aim(behind(-.60, 2.0, -1.85), 13.5, 11), fov: 40 },
    { t: INTRO.look + 150, eye: behind(-.50, 2.1, -1.95), at: aim(behind(-.50, 2.1, -1.95), 9, 7), fov: 38 },
  ],
];

/**
 * Through every key with the velocity carried across each one, on the film's
 * own clock: a cubic Hermite whose tangents are taken over time, so a long
 * segment and a short one meet without a jolt. A shot's first key is already
 * moving; the last key of the film is still.
 */
function hermite(keys: readonly { t: number; v: Vec }[], t: number, landing: boolean): Vec {
  const last = keys.length - 1;
  if (t <= keys[0].t) return keys[0].v;
  if (t >= keys[last].t) return keys[last].v;
  let i = 0; while (t > keys[i + 1].t) i++;
  const slope = (a: { t: number; v: Vec }, b: { t: number; v: Vec }): Vec =>
    [(b.v[0] - a.v[0]) / (b.t - a.t), (b.v[1] - a.v[1]) / (b.t - a.t), (b.v[2] - a.v[2]) / (b.t - a.t)];
  const tangent = (k: number): Vec =>
    k === 0 ? slope(keys[0], keys[1]) : k === last ? (landing ? [0, 0, 0] : slope(keys[last - 1], keys[last])) : slope(keys[k - 1], keys[k + 1]);
  const a = keys[i], b = keys[i + 1], dt = b.t - a.t, s = (t - a.t) / dt;
  const ma = tangent(i), mb = tangent(i + 1);
  const h00 = 2 * s ** 3 - 3 * s ** 2 + 1, h10 = s ** 3 - 2 * s ** 2 + s, h01 = -2 * s ** 3 + 3 * s ** 2, h11 = s ** 3 - s ** 2;
  return [0, 1, 2].map(j => h00 * a.v[j] + h10 * dt * ma[j] + h01 * b.v[j] + h11 * dt * mb[j]) as unknown as Vec;
}

/** Where the camera stands at `t`, ending exactly on `home`, the game's own view. */
export function introCamera(t: number, home: CameraPose): CameraPose {
  let n = 0; while (n < SHOTS.length - 1 && t >= SHOTS[n + 1][0].t) n++;
  const landing = n === SHOTS.length - 1;
  const keys = landing ? [...SHOTS[n], { t: INTRO.total, eye: home.eye, at: home.at, fov: home.fov }] : SHOTS[n];
  const along = (pick: (k: Key) => Vec) => hermite(keys.map(k => ({ t: k.t, v: pick(k) })), t, landing);
  return { eye: along(k => k.eye), at: along(k => k.at), fov: along(k => [k.fov, 0, 0])[0] };
}

/**
 * The light across the bat: where the band is along the blade, from nought at
 * its shoulder to one at its toe, or null while it is not crossing. Up the
 * blade from its toe, slowly, as the camera climbs it, and off over the top.
 */
export function introSweep(t: number): number | null {
  const [from, to] = INTRO.sweep;
  if (t < from || t > to) return null;
  const k = (t - from) / (to - from), eased = k * k * (3 - 2 * k);
  return 1.05 - eased * 1.3;
}

/** How far the bars are in, one while the film plays: drawn in over its first moment and away as it lands. */
export function introBars(t: number): number {
  const into = Math.min(1, t / 250), away = Math.min(1, Math.max(0, (INTRO.total - t) / 600));
  return Math.min(into, away);
}
