import { GAME } from '../config/gameplay';
import type { CameraPose } from './ShotReel';

/**
 * The new batter's arrival: a few seconds after a wicket, before the next
 * ball, as a broadcast shows the next man in. Built from a clip the owner
 * sent of a batter walking out to the middle.
 *
 * He is already walking as the picture cuts in, the last few strides to his
 * crease from behind his stumps on the leg side (`ARRIVE.from` to `to`), the
 * bat carried in his bottom hand by the handle with its blade hanging beside
 * his leg, both arms swinging, and the camera tracking behind him so his back
 * leads the shot. He slows into his last stride, steps into place, holds the
 * bat upright in front of him in both hands and looks up the pitch to the
 * umpire for his guard, nods, looks round the field — the leg side, then the
 * off — and goes into his stance as the camera rises onto the game's own view.
 *
 * A function of its own clock, as the walk-on's films are (`IntroReel.ts`),
 * so any moment can be drawn alone (`__cricket.introAt`). Positions are the
 * batter's own, off his root, as the walk-on's `behind` takes them; the scene
 * mirrors them with the ground for a left-hander. Nothing is bowled, scored or
 * counted while it plays.
 */
export const ARRIVE = {
  /** Where his hips are as the picture cuts in, and where they stop: off his root, across and down the pitch. */
  from: [-2.0, -2.45] as const,
  to: [-0.05, -0.03] as const,
  /** Four strides from cut to stop, the last of them slowing (`decel` of it) to a stand. */
  strides: 4,
  /** When he has stopped walking. */
  walk: 2600,
  /** How long the slowing into the stop takes. */
  decel: 600,
  /** Stepped into place, the bat up in front of him in both hands, looking up the pitch to the umpire. */
  set: 3000,
  /** His nod to the umpire's signal, from and to. */
  nod: [3250, 3550] as const,
  /** Turned to look out over the leg side. */
  look: 3900,
  /** Looked round to the off side. */
  scan: 4450,
  /** In his guard. */
  guard: 4950,
  /** The camera on the game's view: the bowler may go. */
  total: 5300,
} as const;

type Vec = readonly [number, number, number];

/** How far he walks, from the cut to the stop. */
export const ARRIVE_DISTANCE = Math.hypot(ARRIVE.to[0] - ARRIVE.from[0], ARRIVE.to[1] - ARRIVE.from[1]);
/** The way he walks, as a turn about the vertical: `sin` across, `cos` down the pitch. */
export const ARRIVE_HEADING = Math.atan2(ARRIVE.to[0] - ARRIVE.from[0], ARRIVE.to[1] - ARRIVE.from[1]);
/** One step, heel to heel: the walk is a whole number of them, so he stops with both feet down. */
export const ARRIVE_STEP = ARRIVE_DISTANCE / ARRIVE.strides;
/** His walking pace, in metres a second, before he slows: the whole distance over the even part and half the slowing. */
export const ARRIVE_PACE = ARRIVE_DISTANCE / ((ARRIVE.walk - ARRIVE.decel / 2) / 1000);

/**
 * How far along his line he has walked at `t`: steadily, then slowing evenly
 * to a stop exactly at the end of it at `ARRIVE.walk`.
 */
export function walkedBy(t: number): number {
  const v = ARRIVE_PACE / 1000, even = ARRIVE.walk - ARRIVE.decel;
  if (t <= 0) return 0;
  if (t <= even) return v * t;
  const s = Math.min(t, ARRIVE.walk) - even;
  return v * even + v * s - v * s * s / (2 * ARRIVE.decel);
}

/** Where his hips are along the walk, off his root (across, down the pitch). */
export function walkedTo(t: number): [number, number] {
  const d = walkedBy(t);
  return [ARRIVE.from[0] + Math.sin(ARRIVE_HEADING) * d, ARRIVE.from[1] + Math.cos(ARRIVE_HEADING) * d];
}

/** Where he stands, in the game's frame: his root, as `Batter.reset` places it. */
const ROOT: Vec = [GAME.stanceX, 0, GAME.stanceZ];
const off = (x: number, y: number, z: number): Vec => [ROOT[0] + x, y, ROOT[2] + z];

/**
 * The tracking camera while he walks: behind him and off to his left, a
 * little above his shoulders, looking past him up his line, so his back and
 * the number on it lead the picture and the crease opens up ahead of him.
 */
function following(t: number): { eye: Vec; at: Vec; fov: number } {
  const [x, z] = walkedTo(t), ax = Math.sin(ARRIVE_HEADING), az = Math.cos(ARRIVE_HEADING);
  // His left, the leg side of his line: away from the stumps, which would otherwise come between.
  const lx = -az, lz = ax;
  // Five metres back, so a phone held upright has him head to boots with the
  // turf round him: at two and a half he was a back from the knees up.
  return {
    eye: off(x - ax * FOLLOW.back + lx * FOLLOW.aside, FOLLOW.up, z - az * FOLLOW.back + lz * FOLLOW.aside),
    at: off(x + ax * FOLLOW.ahead, .85, z + az * FOLLOW.ahead),
    fov: 40,
  };
}
/** How the tracking camera sits off him: metres back along his line, out to his left, up, and how far ahead of him it looks. */
export const FOLLOW = { back: 5.0, aside: 1.0, up: 1.75, ahead: 1.2 } as const;
/** Behind him on the leg side as he takes guard and looks round, the pitch running away to the umpire beyond him. */
const SHOULDER = { eye: off(-1.7, 2.25, -4.6), at: off(.10, .85, 2.6), fov: 40 } as const;

const ease = (k: number) => k * k * (3 - 2 * k);
const lerp = (a: Vec, b: Vec, k: number): Vec => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

/**
 * The other two ways the walk is shot, dealt at random with the tracking shot
 * from behind for variety: from in front of him on a longer lens, walking
 * towards the camera as he comes down the steps in the owner's clip, the
 * camera backing away at his pace; and side on, keeping pace with him on the
 * leg side, where the stumps never come between, which shows the whole stride.
 * Both cut to over his shoulder as he stops (a cut from in front of him to
 * behind him cannot be a move), and land on the game's view as the tracking
 * shot does.
 */
export type ArrivalAngle = 'behind' | 'front' | 'side';
export const ARRIVAL_ANGLES: readonly ArrivalAngle[] = ['behind', 'front', 'side'];
function walkShot(t: number, angle: ArrivalAngle): { eye: Vec; at: Vec; fov: number } {
  if (angle === 'behind') return following(t);
  const [x, z] = walkedTo(t), ax = Math.sin(ARRIVE_HEADING), az = Math.cos(ARRIVE_HEADING);
  const lx = -az, lz = ax;
  if (angle === 'front') {
    // Ahead of him and well out to his right, the bat's side, three-quarters on, eye high, looking back at him:
    // head to boots on a 34-degree lens. Straight on, a bat tucked under the arm was a dot and he seemed to have none.
    return { eye: off(x + ax * FRONT.ahead + lx * FRONT.aside, FRONT.up, z + az * FRONT.ahead + lz * FRONT.aside), at: off(x, .9, z), fov: FRONT.fov };
  }
  // Off his left side, square to his line, a pace ahead of him so he walks into the picture.
  return { eye: off(x + lx * SIDE.out + ax * SIDE.lead, SIDE.up, z + lz * SIDE.out + az * SIDE.lead), at: off(x + ax * SIDE.lead * .5, .85, z + az * SIDE.lead * .5), fov: SIDE.fov };
}
/** From in front: how far ahead of him, out to his left, up, and the lens. */
export const FRONT = { ahead: 4.9, aside: -2.2, up: 1.45, fov: 34 } as const;
/** Side on: how far out to his left, how far ahead of him it leads, up, and the lens. */
export const SIDE = { out: 5.2, lead: .6, up: 1.3, fov: 38 } as const;

/**
 * Where the camera stands at `t`, shot from `angle`. The walk is tracked;
 * from the stop it is over his shoulder for the guard and the look round
 * (eased there from the tracking shot, cut to from the others), and from
 * there onto `home`, the game's own view, exactly at `ARRIVE.total`.
 */
export function arrivalCamera(t: number, home: CameraPose, angle: ArrivalAngle = 'behind'): CameraPose {
  if (t <= ARRIVE.walk) return walkShot(t, angle);
  const stop = angle === 'behind' ? following(ARRIVE.walk) : CLOSER;
  if (t <= ARRIVE.look) {
    const k = ease((t - ARRIVE.walk) / (ARRIVE.look - ARRIVE.walk));
    return { eye: lerp(stop.eye, SHOULDER.eye, k), at: lerp(stop.at, SHOULDER.at, k), fov: stop.fov + (SHOULDER.fov - stop.fov) * k };
  }
  const k = ease(Math.min(1, (t - ARRIVE.look) / (ARRIVE.total - ARRIVE.look)));
  return { eye: lerp(SHOULDER.eye, home.eye, k), at: lerp(SHOULDER.at, home.at, k), fov: SHOULDER.fov + (home.fov - SHOULDER.fov) * k };
}
/** Cut to from in front or side on: over his shoulder a little nearer, easing out to `SHOULDER` as he takes guard. */
const CLOSER = { eye: off(-1.45, 2.1, -4.2), at: off(.10, 1.0, 2.6), fov: 40 } as const;

/** The bars: in over the cut, out as the camera lands on the game's view. */
export function arrivalBars(t: number): number {
  return Math.min(Math.min(1, t / 200), Math.min(1, Math.max(0, (ARRIVE.total - t) / 600)));
}

/** The name card is up from just after the cut until he has looked round. */
export const ARRIVAL_CARD = [500, 4100] as const;

/**
 * Whether a ball's end brings a new batter out to the middle: a wicket, or a
 * man carried off, with the innings going on. Never in the tutorial, a demo,
 * or for a player who has asked for less motion; under `?debug=1`, whose
 * checks time their innings to the ball, only when `?arrive=1` asks.
 */
export function arrivalDue(o: { out: boolean; over: boolean; lesson: boolean; demo: boolean; asked: boolean | null; debug: boolean; still: boolean }): boolean {
  if (!o.out || o.over || o.lesson || o.demo || o.asked === false) return false;
  if (o.asked === true) return true;
  return !o.debug && !o.still;
}
