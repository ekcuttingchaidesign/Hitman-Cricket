import type { CareerMode } from './career';
import type { CameraPose } from './ShotReel';

/**
 * The podium: a stage put up on the outfield at the end of an innings that
 * made a new best or won a chase, in the Blast and Super10 only — the stage
 * itself is `src/scene/podium.ts`, and this is when it goes up, what it says
 * and where the camera stands, each a function of its own clock.
 */
export type PodiumKind = 'best' | 'chase';

/** The film's three shots and its end: the stage wide, round him, and up at him from the foot of the block. */
export const PODIUM = { cuts: [2300, 4300], total: 6400 } as const;

/**
 * The least a new best must be to go up: a first innings beats a best of
 * nought, and a new player beats their own every other innings, so the
 * stage would stand for nothing. A Super10 total is a team's over ten overs.
 */
export const PODIUM_FLOOR = { classic: 50, super10: 100 } as const;

export interface PodiumAsk {
  mode: CareerMode;
  /** An innings that counts: not practice, a Rival Match or a demo, and asked for (not reduced motion, not the checks). */
  real: boolean;
  runs: number;
  /** Beat this browser's own best in the mode. */
  record: boolean;
  /** A chase that was on, and beaten. */
  chaseWon: boolean;
}

/** Whether the innings ends on the podium, and which: a chase won first, then a new best over the floor. */
export function podiumDue(ask: PodiumAsk): PodiumKind | null {
  if (!ask.real || (ask.mode !== 'classic' && ask.mode !== 'super10')) return null;
  if (ask.chaseWon) return 'chase';
  return ask.record && ask.runs >= PODIUM_FLOOR[ask.mode] ? 'best' : null;
}

/** What goes across the deck's front. */
export function podiumLine(kind: PodiumKind, chase: { name: string; target: number } | null): string {
  return kind === 'chase' && chase ? `Chased ${chase.name}'s ${chase.target}` : 'New best';
}

/** The figure on the block: the runs, and in Super10 the wickets with them, as its board reads a total. */
export function podiumScore(mode: CareerMode, runs: number, wickets: number): string {
  return mode === 'super10' ? `${runs}/${wickets}` : String(runs);
}

type Vec = readonly [number, number, number];
const mix = (a: Vec, b: Vec, k: number): Vec => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const ease = (x: number) => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };
/** Where he stands, in the stage's frame: the top of the block (`PODIUM_TOP`). */
const BLOCK_Z = -2.4;

/**
 * The camera, in the stage's frame (the deck's front edge on the grass, its
 * front facing +z). Slow, as the walk-on is, and never near the gloves:
 *
 * 1. The stage whole, low on the outfield, pushing in as the fountains go.
 * 2. Cut round to his left, turning about him a little at full-body distance.
 * 3. Cut to low at the foot of the block looking up at him, the score under
 *    his boots and the arch behind his head, rising a touch; held to the end,
 *    and wider for a chase won, whose arms and bat are flung out, aimed
 *    partly at the bat (`batX`: where it is across the stage from him).
 */
export function podiumCamera(t: number, kind: PodiumKind = 'best', batX = 0): CameraPose {
  const [one, two] = PODIUM.cuts;
  if (t < one) {
    const k = ease(t / one);
    return { eye: mix([0, 2.3, 30], [0, 2.6, 25], k), at: mix([0, 3.9, -2.5], [0, 3.5, BLOCK_Z], k), fov: 52 - 6 * k };
  }
  if (t < two) {
    const k = ease((t - one) / (two - one)), turn = -.5 + .3 * k, r = 9;
    return { eye: [Math.sin(turn) * r, 2.3 + .4 * k, BLOCK_Z + Math.cos(turn) * r], at: [0, 2.9, BLOCK_Z], fov: 40 };
  }
  const k = ease((t - two) / (PODIUM.total - two));
  // A chase won has his arms flung wide with the bat out along one of them, which wants the wider picture.
  // Aimed partly at the bat, `batX` across the stage from him, which is his left or right by his hand.
  if (kind === 'chase') {
    const lean = batX * .45;
    return { eye: mix([1.5 + lean, .95, 5.8], [1.1 + lean, 1.1, 5.2], k), at: mix([lean, 2.9, BLOCK_Z], [lean, 3.0, BLOCK_Z], k), fov: 48 - 2 * k };
  }
  return { eye: mix([1.5, .95, 4.8], [1.1, 1.1, 4.2], k), at: mix([0, 3.0, BLOCK_Z], [0, 3.15, BLOCK_Z], k), fov: 42 - 2 * k };
}
