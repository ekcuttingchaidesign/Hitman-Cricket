import { GAME } from '../config/gameplay';
import type { CameraPose } from './ShotReel';

/**
 * The walk-on: a few seconds before the first ball of a visit's first innings,
 * one of two films, each a function of its own clock.
 *
 * **The bat** (`BAT`): a long lens drifting up the back of the blade (where a
 * skin's big art is) as a light runs up it; then a cut to behind him, low on
 * his front foot scuffing his mark, craning up over his shoulder with the bat
 * resting on it; he looks up to the bowler, and as the bat comes off into his
 * guard the camera rises onto the game's own view.
 *
 * **The duel** (`DUEL`): high above the pitch, looking down on the 22 yards
 * between them, turning slowly and sinking; then a cut to the bowler's eyes
 * at the top of his mark, the batter at the far end as big as he is from
 * there, scuffing his mark with the bat on his shoulder, looking up the pitch
 * at him, and settling into his guard, the look panning slowly across and
 * breathing as a held eye does; cut on the game's view as the real run-up
 * starts. It ends on a cut,
 * not a landing: the first ball is its last shot. Nobody is shot close: the
 * figures do not hold up near to.
 *
 * Slow on purpose: a moment before an innings, not a transition. Any moment of
 * either can be drawn on its own (the checks pin it, `__cricket.introAt`). The
 * camera is in the game's frame, unmirrored, as `GameScene.cinematic` takes
 * it. Nothing is bowled, scored or counted.
 *
 * A prototype for now, behind `?intro=1`.
 */
export type Film = 'bat' | 'duel';
export const FILMS: readonly Film[] = ['bat', 'duel'];
export const BAT = {
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
export const DUEL = {
  /** The cut from above the pitch to the bowler's eyes. */
  cut: 2600,
  /** The batter's front foot scuffing his mark, twice, from and to. */
  scuffs: [2800, 4300] as const,
  /** His head up, down the pitch at the bowler: from half a second before this. */
  look: 4850,
  /** The bat lifted off his shoulder. */
  lift: 5250,
  /** In his guard, waiting; his taps from here. */
  guard: 5750,
  /** The cut to the game's view, as the run-up starts. */
  total: 6700,
} as const;
/**
 * When the player card (`walkOnCard`) is up in each film: over his shoulder as
 * the camera climbs to the pitch in the bat, through the bowler's eyes in the
 * duel; gone again before either hands over to the game.
 */
const CARD: Record<Film, readonly [number, number]> = { bat: [3700, 6300], duel: [3200, 6200] };
/** Whether the player card is up at `t` in `film`. */
export const cardShown = (film: Film, t: number) => t >= CARD[film][0] && t < CARD[film][1];
/** How long a film runs. */
export const filmLength = (film: Film) => film === 'bat' ? BAT.total : DUEL.total;
/** The film after `last`: the other one, so a visit never opens on the same film twice running; the first a coin's. */
export const nextFilm = (last: Film | null, coin: number): Film => last ? (last === 'bat' ? 'duel' : 'bat') : coin < .5 ? 'bat' : 'duel';

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
const BAT_SHOTS: readonly (readonly Key[])[] = [
  // The bat: a long lens low by the back of the blade, drifting up it from
  // the plain willow to the art under the handle, and stopping short of his
  // glove. The light crosses it on the way.
  [
    { t: 0, eye: round(1.22, 1.10, .30), at: onBat(.36), fov: 26 },
    { t: BAT.cut, eye: round(1.48, 1.08, .62), at: onBat(.62), fov: 26 },
  ],
  // Behind him on the leg side, where the stumps are not in the way and his
  // body hides the hand on the handle: low on his front foot scuffing the
  // crease, craning slowly up his back to over his shoulder, the bat resting
  // on the far one and the pitch running away to the bowler beside him; then
  // the bowler, as he looks up, and onto the game's view.
  [
    { t: BAT.cut, eye: behind(-.85, .62, -1.45), at: behind(-.05, .20, .35), fov: 40 },
    { t: BAT.scuffs[1], eye: behind(-.60, 2.0, -1.85), at: aim(behind(-.60, 2.0, -1.85), 13.5, 11), fov: 40 },
    { t: BAT.look + 150, eye: behind(-.50, 2.1, -1.95), at: aim(behind(-.50, 2.1, -1.95), 9, 7), fov: 38 },
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

/**
 * The duel's shots. Above the pitch, the camera looks so nearly straight down
 * that the screen's up runs along the pitch, the bowler's end at the top, so a
 * phone held upright frames the 22 yards whole, both of them in it: centred
 * between the batter and the bowler's mark, high enough that the bars leave
 * both in the picture, and below the haze, which starts at 48 metres. It turns
 * square into that and sinks. Then the bowler's eyes (`bowler`, where the
 * stage draws him at the top of his mark: a spinner's mark is nearer, round
 * the wicket the other side), just in front of his face so nothing of him is
 * in the picture.
 */
function duelShots(bowler: Vec, side: number): readonly (readonly Key[])[] {
  const [bx, , bz] = bowler, between = (ROOT[2] + bz) / 2;
  // Above the middle of the pitch between them, a metre or so off towards the
  // batter's end at `turn` radians round, so the screen's up points to the bowler.
  const above = (turn: number, off: number, up: number): Vec => [Math.sin(turn) * off, up, between - Math.cos(turn) * off];
  const middle: Vec = [0, 0, between];
  const eyes: Vec = [bx, 1.72, bz - .35];
  // Where his eyes rest at the far end, `across` metres to the right of the
  // batter as the picture has it: the stage is mirrored for one hand and not
  // the other (`side`), and the pan runs left to right on the screen either way.
  const looking = (across: number): Vec => [ROOT[0] + side * across, 1.0, ROOT[2]];
  return [
    [
      { t: 0, eye: above(-.45, 1.4, 46), at: middle, fov: 50 },
      { t: DUEL.cut, eye: above(0, 1.0, 40), at: middle, fov: 50 },
    ],
    // His eyes, not a lens: the batter as big as he is from the top of the
    // mark, nothing zoomed, the look drifting slowly across from left of him
    // to just right of him as he scuffs, looks up and settles.
    [
      { t: DUEL.cut, eye: eyes, at: looking(-2.4), fov: EYES_FOV },
      { t: DUEL.total, eye: eyes, at: looking(.6), fov: EYES_FOV },
    ],
  ];
}
/** The bowler's eyes: a man's view down the pitch, a touch narrower than the game's own, and held. */
const EYES_FOV = 40;
/** A held eye's sway: a breath's slow rise and fall, and a slower drift, a centimetre or two. */
function breathing(t: number): Vec {
  return [Math.sin(t * Math.PI * 2 / 3100) * .012, Math.sin(t * Math.PI * 2 / 2300) * .009, 0];
}

/**
 * Where the camera stands at `t` in `film`. The bat ends exactly on `home`,
 * the game's own view; the duel cuts to it from its last shot. `bowler` is
 * where the bowler stands at the top of his mark, which the duel is framed on.
 */
export function introCamera(film: Film, t: number, home: CameraPose, bowler: Vec, side = 1): CameraPose {
  const shots = film === 'bat' ? BAT_SHOTS : duelShots(bowler, side);
  let n = 0; while (n < shots.length - 1 && t >= shots[n + 1][0].t) n++;
  const landing = film === 'bat' && n === shots.length - 1;
  const keys = landing ? [...shots[n], { t: BAT.total, eye: home.eye, at: home.at, fov: home.fov }] : shots[n];
  const along = (pick: (k: Key) => Vec) => hermite(keys.map(k => ({ t: k.t, v: pick(k) })), t, landing);
  const eye = along(k => k.eye), seen = along(k => k.at), fov = along(k => [k.fov, 0, 0])[0];
  // Through the bowler's eyes the picture breathes: a long lens shows every
  // movement of the head holding it.
  if (film === 'duel' && n === 1) {
    const sway = breathing(t);
    return { eye: [eye[0] + sway[0], eye[1] + sway[1], eye[2]], at: [seen[0] + sway[0] * 4, seen[1] + sway[1] * 4, seen[2]], fov };
  }
  return { eye, at: seen, fov };
}

/**
 * The light across the bat: where the band is along the blade, from nought at
 * its shoulder to one at its toe, or null while it is not crossing. Up the
 * blade from its toe, slowly, as the camera climbs it, and off over the top.
 */
export function introSweep(film: Film, t: number): number | null {
  if (film !== 'bat') return null;
  const [from, to] = BAT.sweep;
  if (t < from || t > to) return null;
  const k = (t - from) / (to - from), eased = k * k * (3 - 2 * k);
  return 1.05 - eased * 1.3;
}

/**
 * How far the bars are in, one while the film plays: drawn in over its first
 * moment, and away as the bat's lands on the game's view or, for the duel,
 * which ends on a cut, as fast as the cut.
 */
export function introBars(film: Film, t: number): number {
  const total = filmLength(film), out = film === 'bat' ? 600 : 120;
  const into = Math.min(1, t / 250), away = Math.min(1, Math.max(0, (total - t) / out));
  return Math.min(into, away);
}
