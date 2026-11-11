import { GAME } from '../config/gameplay';
import { STUMP_XS } from './wicket';

/**
 * How the wicket goes when the ball hits it. The bails used to fly off the
 * same way every time and the stumps never moved; now the stump the ball hits
 * goes, and how depends on the ball.
 *
 * - A yorker, on whatever line it is bowled, uproots the stump it hits: the
 *   foot kicked out backwards and the stump turning end over end towards the
 *   keeper, top first towards the bowler, before it lands and lies there.
 * - Any other ball that bowls him is one of four, by where it hits and how
 *   fast it was (`fallOf`):
 *   - `clip`: up at the bails, they go and the stumps only shiver;
 *   - `lean`: the stump knocked back, rattling, and left leaning in its hole;
 *   - `uproot`: knocked out of the ground and cartwheeling back, the quicker
 *     the ball, the likelier and the further;
 *   - `splay`: between two stumps, both knocked back and apart.
 *
 * Played on, off an inside edge, the ball only dislodges the bails (`clip`):
 * the bat has taken the pace off it, and the owner did not want the stumps
 * knocked by it.
 *
 * Which of them is drawn off the delivery's own figures (`roll`, from its
 * speed), never the page's dice, so a replay of the ball breaks the wicket
 * the same way the ball did. Everything is a function of the time since the
 * ball hit, as every other move in the scene is, so a replay or a pinned
 * clock draws any moment alone.
 *
 * Positions are off each stump's foot, in the stage's frame: x across, y up,
 * z up the pitch (the keeper is behind, at -z). The stage is mirrored for a
 * left-hander and these with it.
 */
export type Fall = 'clip' | 'lean' | 'uproot' | 'splay';

export interface WicketHit {
  fall: Fall;
  /** The stump the ball hits, by `STUMP_XS`, and the other one for `splay`. */
  struck: number;
  second: number | null;
  /** How fast it came, nought (a spinner) to one (the express bowler's), which sends everything further. */
  pace: number;
  /** A yorker: the stump hit at its foot, which kicks the foot out first. */
  yorker: boolean;
  /** Which way across it is pushed, -1 to 1: where on the stump the ball hit it. */
  side: number;
  /** A second draw off the ball, for the bails' and the turn's variety. */
  spin: number;
}

/** The stump's height, and the height up it above which the ball takes only the bails. */
export const STUMP = { height: GAME.stumpHeight, clipAbove: GAME.stumpHeight - .07, radius: .025 } as const;
const G = 9.8;

/** A number in [0, 1) the same for the same delivery every time. */
export function rollOf(kph: number, salt = 0): number {
  const x = Math.sin(kph * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * How the wicket goes, from where the ball is as it reaches the stumps (`x`
 * across, `y` up), its speed and whether it is a yorker.
 */
export function fallOf(x: number, y: number, kph: number, yorker: boolean, playedOn = false): WicketHit {
  const pace = Math.min(1, Math.max(0, (kph - 75) / 80));
  let struck = 0;
  STUMP_XS.forEach((sx, i) => { if (Math.abs(x - sx) < Math.abs(x - STUMP_XS[struck])) struck = i; });
  const off = x - STUMP_XS[struck];
  const side = Math.max(-1, Math.min(1, off / .04));
  const roll = rollOf(kph), spin = rollOf(kph, 1);
  const base = { struck, second: null, pace, yorker, side, spin };
  // Played on, off an inside edge: the bat has taken the pace off it, so it only dislodges the bails, whatever its line or length.
  if (playedOn) return { ...base, yorker: false, pace: pace * .5, fall: 'clip' };
  // A yorker is at his toes, so at the foot of the stump: it comes out, whatever the line.
  if (yorker || y < .18) return { ...base, fall: 'uproot', yorker: true };
  if (y > STUMP.clipAbove) return { ...base, fall: 'clip' };
  // Between two stumps, nearer the gap than either: both of them go.
  const next = struck + Math.sign(off);
  if (Math.abs(off) > .05 && next >= 0 && next < STUMP_XS.length && roll < .7) return { ...base, fall: 'splay', second: next };
  // Quicker, the likelier it is sent cartwheeling; slower, knocked back and left leaning, or the bails alone.
  const uproot = .2 + .45 * pace, lean = uproot + .55 - .2 * pace;
  return { ...base, fall: roll < uproot ? 'uproot' : roll < lean ? 'lean' : 'clip' };
}

export interface StumpPose {
  /** Off the stump's foot, metres. */
  x: number; y: number; z: number;
  /** Turned back (negative: the top towards the keeper) and across, radians. */
  rx: number; rz: number;
}

const still: StumpPose = { x: 0, y: 0, z: 0, rx: 0, rz: 0 };

/** A shiver: a few small swings either way, dying away. */
const shiver = (t: number, size: number, phase = 0) => size * Math.exp(-t * 6) * Math.sin(t * 42 + phase);

/** Knocked back to `lean` with a rattle and left there: a stiff spring, over in a quarter of a second. */
const knocked = (t: number, lean: number) => lean * (1 - Math.exp(-t * 16) * Math.cos(t * 34));

/**
 * The uprooted stump's flight: thrown back off the ground turning end over
 * end, then lying on the turf where it lands, sliding a little further. Its
 * centre is what flies, so it turns about its middle, not its foot.
 */
function uprooted(hit: WicketHit, t: number): StumpPose {
  const half = STUMP.height / 2;
  const back = 1.7 + 2.6 * hit.pace, up = hit.yorker ? 1.5 + .6 * hit.pace : 2 + 1.2 * hit.pace;
  const across = hit.side * .7 + (hit.spin - .5) * .5;
  // A yorker kicks the foot out under it, so the top goes towards the bowler; a ball higher up knocks the top back.
  const turn = (hit.yorker ? 1 : -1) * (9 + 9 * hit.pace) * (.85 + .3 * hit.spin);
  const landed = landing(hit);
  const fly = Math.min(t, landed);
  let rx = turn * fly;
  let cx = across * fly, cz = -back * fly, cy = half + up * fly - G / 2 * fly * fly;
  const rz = hit.side * .6 * fly;
  if (t > landed) {
    // Down: it slides on, slowing, and settles flat on whichever side it landed.
    const after = t - landed, slide = (1 - Math.exp(-after * 5)) / 5;
    cx += across * .45 * slide; cz += -back * .45 * slide;
    const flat = Math.PI / 2 * (Math.round((rx / (Math.PI / 2) - 1) / 2) * 2 + 1);
    rx = flat + (rx - flat) * Math.exp(-after * 18);
    cy = STUMP.radius + (cy - STUMP.radius) * Math.exp(-after * 18);
  }
  // Never through the turf: its lower end, however it is turned, stays on top of it.
  cy = Math.max(cy, half * Math.abs(Math.cos(rx)) + STUMP.radius * Math.abs(Math.sin(rx)) * .5);
  // Off its middle back to its foot, which is where the group stands.
  return { x: cx, y: cy - half * Math.cos(rx), z: cz - half * Math.sin(rx), rx, rz };
}

/** When the uprooted stump comes down: its lower end, turning, reaches the turf. */
export function landing(hit: WicketHit): number {
  const half = STUMP.height / 2;
  const up = hit.yorker ? 1.5 + .6 * hit.pace : 2 + 1.2 * hit.pace;
  const turn = (hit.yorker ? 1 : -1) * (9 + 9 * hit.pace) * (.85 + .3 * hit.spin);
  for (let t = .12; t < 2; t += .005) {
    const cy = half + up * t - G / 2 * t * t;
    if (cy - half * Math.abs(Math.cos(turn * t)) <= .01) return t;
  }
  return 2;
}

/** Where stump `i` is `ms` after the ball hit the wicket. */
export function stumpPose(hit: WicketHit, i: number, ms: number): StumpPose {
  const t = Math.max(0, ms / 1000);
  const struck = i === hit.struck, second = i === hit.second;
  if (hit.fall === 'uproot' && struck) return uprooted(hit, t);
  if (hit.fall === 'lean' && struck) {
    const lean = .32 + .3 * hit.pace;
    return { ...still, z: -.04 * knocked(t, 1), rx: -knocked(t, lean), rz: knocked(t, hit.side * .18) };
  }
  if (hit.fall === 'splay' && (struck || second)) {
    // Knocked back and apart, each away from the gap the ball went into.
    const away = Math.sign(i - (hit.struck + (hit.second ?? hit.struck)) / 2) || 1;
    const lean = (struck ? .3 : .22) + .2 * hit.pace;
    return { ...still, z: -.03 * knocked(t, 1), rx: -knocked(t, lean), rz: -knocked(t, away * .28) };
  }
  // The ones left standing shiver with the blow; the struck one too, where only the bails went.
  const near = Math.abs(i - hit.struck) === 1 ? 1 : .5;
  const size = struck ? .07 : (hit.fall === 'clip' ? .025 : .045) * near;
  return { ...still, rx: -shiver(t, size, i), rz: shiver(t, size * .4, i * 2) };
}

export interface BailPose { x: number; y: number; z: number; rx: number; ry: number; rz: number }

/**
 * Where bail `i` (0 on the -x side, as it sits) is `ms` after the ball hit:
 * flung back and up off the stump that was hit, further for a quicker ball,
 * spun on its own axis, and down on the turf. `rest` is where it sat.
 */
export function bailPose(hit: WicketHit, i: number, ms: number, rest: { x: number; y: number }): BailPose {
  const t = Math.min(1, Math.max(0, ms / 620));
  // The bail over the stump that was hit goes hardest; the other one is knocked off it.
  const over = (i === 0 ? hit.struck <= 1 : hit.struck >= 1) ? 1 : .7;
  const reach = (hit.fall === 'clip' ? .8 : 1) * (.7 + .8 * hit.pace) * over * (.85 + .3 * rollOf(hit.spin * 97, i));
  const lift = (hit.fall === 'clip' ? 1.2 : 1) * (.7 + .5 * rollOf(hit.spin * 53, i + 2));
  const out = (i === 0 ? -1 : 1) * .35 * rollOf(hit.spin * 31, i + 4) + hit.side * .4;
  return {
    x: rest.x + t * out * reach,
    // Up by `lift` and down on the turf by the time it has gone back, however high it went.
    y: Math.max(.05, rest.y + t * .9 * lift - t * t * (1.6 + .9 * (lift - 1))),
    z: -t * 1.9 * reach,
    rx: t * (8 + 6 * rollOf(hit.spin * 11, i)) * (i ? 1 : -1),
    ry: t * 3 * (rollOf(hit.spin * 7, i + 6) - .5),
    rz: t * (i ? 5 : -5) * (.6 + .8 * rollOf(hit.spin * 3, i + 8)),
  };
}
