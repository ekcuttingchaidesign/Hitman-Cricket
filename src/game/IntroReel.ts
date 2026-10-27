import { GAME } from '../config/gameplay';
import type { CameraPose } from './ShotReel';

/**
 * The walk-on: a few seconds before the first ball of an innings, the camera
 * climbing the batter from his boots to his helmet while he stands in the
 * four's lean — legs crossed, leaning on the bat planted at his side, the free
 * hand on his hip — a light sweeping across the bat's face as it passes, then
 * his head coming up to the bowler and him stepping into his guard as the
 * camera swings round behind him and lands on the game's own view.
 *
 * Everything here is a function of the film's own clock, `t` in milliseconds
 * from its start, so any moment of it can be drawn on its own (the checks pin
 * it, `__cricket.introAt`). The camera is in the game's frame, unmirrored, as
 * `GameScene.cinematic` takes it. Nothing is bowled, scored or counted.
 *
 * A prototype for now, behind `?intro=1`.
 */
export const INTRO = {
  /** He holds the lean, breathing, his eyes on the bat, until this. */
  hold: 2150,
  /** His head up to the bowler. */
  look: 2450,
  /** Stood up out of it, the legs uncrossed. */
  stand: 2800,
  /** In his guard. */
  guard: 3100,
  /** The camera on the game's view: the bowler may go. */
  total: 3500,
  /** The light across the bat, from and to. */
  sweep: [950, 1500] as const,
} as const;

type Vec = readonly [number, number, number];

/** Where he stands, in the game's frame: his root, as `Batter.clear` places it. */
const ROOT: Vec = [GAME.stanceX, 0, GAME.stanceZ];
/** Which way the lean faces him (`LEANING`'s yaw): turned past side-on, towards the keeper. */
const LEAN_YAW = 2.05;

/**
 * A point round him: `turn` radians from the way he faces in the lean (round
 * towards the bat for a negative turn), `out` metres from his middle, `up`
 * metres off the turf.
 */
function round(turn: number, out: number, up: number): Vec {
  const a = LEAN_YAW + turn;
  return [ROOT[0] - .03 + Math.sin(a) * out, up, ROOT[2] - .03 + Math.cos(a) * out];
}
/** A point on him to look at, `up` metres off the turf, eased towards the bat's side by `bat`. */
function on(up: number, bat = 0): Vec {
  // The bat stands out at his far side (`LEANING`'s grip): off his hip along the far shoulder's line.
  const far = LEAN_YAW + Math.PI / 2;
  return [ROOT[0] - .03 + Math.sin(far) * .30 * bat, up, ROOT[2] - .03 + Math.cos(far) * .30 * bat];
}

/**
 * One key of the climb: at `t`, the camera `turn` radians round him from the
 * way the lean faces, `out` metres from his middle and `up` off the turf,
 * looking at him `look` off the turf and `bat` of the way across to the bat.
 */
interface Shot { t: number; turn: number; out: number; up: number; look: number; bat: number; fov: number }
/**
 * The climb, as keys the camera passes through: the boots from low in front,
 * up the pads and round to the bat at his side, the light across it, up the
 * shirt to the helmet, and back over his shoulder to the game's view (`home`,
 * the last key, filled in by `introCamera`). Turned round him one way only,
 * since the game's view is on the bat's side of him already.
 */
const CLIMB: readonly Shot[] = [
  // His boots, from low in front: the legs crossed, the toe of the bat beside them.
  { t: 0, turn: -.20, out: 1.75, up: .14, look: .26, bat: .2, fov: 40 },
  // Up the pads, round towards the bat: inside the line to the stumps, which otherwise come between.
  { t: 600, turn: .62, out: 1.18, up: .36, look: .36, bat: .5, fov: 38 },
  // The back of the bat, where a skin's big art is, as the light crosses it.
  { t: 1200, turn: 1.35, out: 1.15, up: .60, look: .58, bat: 1, fov: 32 },
  // His glove on the handle.
  { t: 1600, turn: 1.40, out: 1.40, up: .98, look: .96, bat: .7, fov: 33 },
  // Up his shirt from a little in front, his arm beside it rather than across the lens.
  { t: 1820, turn: 1.10, out: 2.00, up: 1.28, look: 1.28, bat: .2, fov: 34 },
  // His helmet, looking down at the bat, before he looks up to the bowler.
  { t: 2050, turn: 1.20, out: 1.55, up: 1.58, look: 1.55, bat: .05, fov: 34 },
];
interface Key { t: number; eye: Vec; at: Vec; fov: number }
const keyOf = (s: Shot): Key => ({ t: s.t, eye: round(s.turn, s.out, s.up), at: on(s.look, s.bat), fov: s.fov });

/**
 * Through every key with the velocity carried across each one, on the film's
 * own clock: a cubic Hermite whose tangents are taken over time, so a long
 * segment and a short one meet without a jolt. Still at either end.
 */
function hermite(keys: readonly { t: number; v: Vec }[], t: number): Vec {
  const last = keys.length - 1;
  if (t <= keys[0].t) return keys[0].v;
  if (t >= keys[last].t) return keys[last].v;
  let i = 0; while (t > keys[i + 1].t) i++;
  const tangent = (k: number): Vec => {
    if (k === 0 || k === last) return [0, 0, 0];
    const a = keys[k - 1], b = keys[k + 1], span = b.t - a.t;
    return [(b.v[0] - a.v[0]) / span, (b.v[1] - a.v[1]) / span, (b.v[2] - a.v[2]) / span];
  };
  const a = keys[i], b = keys[i + 1], dt = b.t - a.t, s = (t - a.t) / dt;
  const ma = tangent(i), mb = tangent(i + 1);
  const h00 = 2 * s ** 3 - 3 * s ** 2 + 1, h10 = s ** 3 - 2 * s ** 2 + s, h01 = -2 * s ** 3 + 3 * s ** 2, h11 = s ** 3 - s ** 2;
  return [0, 1, 2].map(j => h00 * a.v[j] + h10 * dt * ma[j] + h01 * b.v[j] + h11 * dt * mb[j]) as unknown as Vec;
}

/** Where the camera stands at `t`, ending exactly on `home`, the game's own view. */
export function introCamera(t: number, home: CameraPose): CameraPose {
  const climb = CLIMB.map(keyOf);
  const keys = [...climb, { t: INTRO.total, eye: home.eye, at: home.at, fov: home.fov }];
  const eye = hermite(keys.map(k => ({ t: k.t, v: k.eye })), t);
  const at = hermite(keys.map(k => ({ t: k.t, v: k.at })), t);
  const [fov] = hermite(keys.map(k => ({ t: k.t, v: [k.fov, 0, 0] as Vec })), t);
  return { eye, at, fov };
}

/**
 * The light across the bat's face: where the band is along the blade, from
 * nought at its shoulder to one at its toe, or null while it is not crossing.
 * It runs down from above the shoulder, across the stickers, and off.
 */
export function introSweep(t: number): number | null {
  const [from, to] = INTRO.sweep;
  if (t < from || t > to) return null;
  const k = (t - from) / (to - from), eased = k * k * (3 - 2 * k);
  return -.2 + eased * 1.1;
}

/** How far the bars are in, one while the film plays: drawn in over its first moment and away as it lands. */
export function introBars(t: number): number {
  const into = Math.min(1, t / 250), away = Math.min(1, Math.max(0, (INTRO.total - t) / 450));
  return Math.min(into, away);
}
