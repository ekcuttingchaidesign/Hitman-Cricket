import { BATTERS, MARATHON, type Batter, type MarathonEnding } from '../config/marathon.js';
import { Health } from './Health.js';
import { SeededRandom } from './SeededRandom.js';
import type { ShotOutcome } from './types.js';

/**
 * A Marathon innings: three batters, one after another, and the rules for when
 * one gives way to the next and when the innings is over.
 *
 * The ball is resolved elsewhere — by Survival's ladder, with the windows of
 * whoever is in — and `ScoreManager` still keeps the team's runs and balls for
 * everything that reads them. What lives here is only what the Marathon adds:
 * whose turn it is, what each of them made, and the four ways it finishes.
 *
 * It is a plain class with no browser in it so that `scripts/marathon-sim.ts`
 * can play it a few thousand times, as `survive-sim.ts` plays Survival.
 */

/** One batter's innings, as the card and the board will read it. */
export interface BatterInnings {
  batter: Batter;
  /** Which of the three, counting from nought. */
  order: number;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  /** Dismissed. A batter who retired hurt, or was still in at the end, is not out. */
  out: boolean;
  retired: boolean;
  /** His own meter. Each walks out with it full, and nothing heals. */
  health: Health;
  /** Bats left-handed: the ground and the swipes are mirrored while he is in. */
  left: boolean;
}

/**
 * Which of the three bats left-handed, counting from nought: any of them, drawn
 * once an innings off its seed, so a seed replays the same innings. Drawn from
 * a stream of its own rather than the bowling's, so adding him changed no ball
 * any seed bowls.
 *
 * `?lefty=1`, `2` or `3` puts him at that place in the order for trying him,
 * and `?lefty=0` bats all three right-handed.
 */
export function leftHanderOf(seed: number, search = ''): number | null {
  const asked = new URLSearchParams(search).get('lefty');
  if (asked !== null) {
    const place = Number(asked);
    return Number.isInteger(place) && place >= 1 && place <= MARATHON.batters ? place - 1 : null;
  }
  return Math.floor(new SeededRandom((seed ^ 0x9e3779b9) >>> 0).next() * MARATHON.batters);
}

/** What a ball did to the order: nothing, or the man in is gone. */
export type Change = 'OUT' | 'RETIRED' | null;

const walkOut = (order: number, left: boolean): BatterInnings => ({
  batter: BATTERS[order], order, runs: 0, balls: 0, fours: 0, sixes: 0, out: false, retired: false, health: new Health(), left,
});

export class MarathonInnings {
  readonly batters: BatterInnings[];
  /** `leftHanded` is which of the three bats left-handed, or null for none: see `leftHanderOf`. */
  constructor(private readonly leftHanded: number | null = null) {
    this.batters = [walkOut(0, leftHanded === 0)];
  }
  runs = 0;
  balls = 0;
  fours = 0;
  sixes = 0;
  private declaredAt = -1;

  /** The batter in, or the last one in once the innings is over. */
  get current(): BatterInnings { return this.batters[this.batters.length - 1]; }
  /** How many have gone, out or carried off. A retirement is not a wicket, but it is a batter spent. */
  get gone() { return this.batters.filter(b => b.out || b.retired).length; }
  get declared() { return this.declaredAt >= 0; }

  get ending(): MarathonEnding | null {
    // The third batter's going decides it before the clock does, so a wicket
    // off the five hundredth ball is all out rather than balls.
    const last = this.batters.length === MARATHON.batters ? this.current : null;
    if (last?.out) return 'ALL_OUT';
    if (last?.retired) return 'RETIRED';
    if (this.balls >= MARATHON.maxBalls) return 'BALLS';
    if (this.declared) return 'DECLARED';
    return null;
  }
  get ended() { return this.ending !== null; }

  /** Whether the pause card offers the declaration: once twenty overs are done, and not after the end. */
  get canDeclare() { return !this.ended && this.balls >= MARATHON.declareFrom; }

  /**
   * One ball. Says whether the man in is gone, and if he is and the innings is
   * not over, the next one is already in — he walks out to the next ball.
   */
  record(outcome: ShotOutcome): Change {
    if (this.ended) return null;
    const man = this.current;
    man.health.record(outcome);
    man.runs += outcome.runs; man.balls++;
    man.fours += Number(outcome.runs === 4); man.sixes += Number(outcome.runs === 6);
    this.runs += outcome.runs; this.balls++;
    this.fours += Number(outcome.runs === 4); this.sixes += Number(outcome.runs === 6);
    // Out beats hurt: a batter caught off the glove that finished him is out.
    const change: Change = outcome.isWicket ? 'OUT' : man.health.spent ? 'RETIRED' : null;
    if (change === 'OUT') man.out = true;
    if (change === 'RETIRED') man.retired = true;
    if (change && this.batters.length < MARATHON.batters && this.balls < MARATHON.maxBalls) {
      this.batters.push(walkOut(this.batters.length, this.leftHanded === this.batters.length));
    }
    return change;
  }

  /** The player has had enough. Refused before over twenty, and after the end. */
  declare(): boolean {
    if (!this.canDeclare) return false;
    this.declaredAt = this.balls;
    return true;
  }

  /** How the batter would be written on a card: `143*` not out, `143` out. */
  static score(batter: Pick<BatterInnings, 'runs' | 'out'>) { return `${batter.runs}${batter.out ? '' : '*'}`; }
}
