import { describe, expect, it } from 'vitest';
import { GAME } from '../src/config/gameplay';
import { ScoreManager } from '../src/game/ScoreManager';
import {
  BOARD_SIZE, LAUNCH_MS, PACKED_BITS, type BoardRow, type Innings,
  compareRows, decidedBy, inningsFrom, maxRuns, packScore, plausible, qualifies, rankKey, unpackScore,
} from '../src/game/leaderboard';
import type { ShotOutcome } from '../src/game/types';

/**
 * An innings by its figures: a real one, thirty balls, and the runs actually add
 * up out of the boundaries and the balls left over. Fixtures that cannot have
 * happened rank perfectly well, which is exactly how one gets into a test file
 * and stays there until the plausibility checks are written.
 */
const innings = (over: Partial<Innings> = {}): Innings =>
  ({ runs: 50, sixes: 2, fours: 3, wickets: 1, dots: 6, balls: GAME.totalBalls, ...over });

const ball = (runs: ShotOutcome['runs'], isWicket = false) => ({ runs, isWicket } as ShotOutcome);
const played = (balls: ShotOutcome[]) => {
  const score = new ScoreManager();
  balls.forEach(b => score.record(b));
  return score;
};
const row = (over: Partial<Innings>, atMs = LAUNCH_MS + 5_000): BoardRow => {
  const figures = innings(over);
  return { ...figures, playerId: 'p', name: 'n', avatar: 0, score: packScore(figures, atMs) };
};

describe('the ladder, one rung at a time', () => {
  const beats = (a: Partial<Innings>, b: Partial<Innings>) =>
    rankKey(innings(a)) > rankKey(innings(b));

  it('puts runs above everything', () => {
    expect(beats({ runs: 41, sixes: 0, fours: 0, dots: 29 }, { runs: 40, sixes: 6, fours: 6, dots: 0 })).toBe(true);
  });

  it('splits an equal score on sixes', () => {
    expect(beats({ runs: 87, sixes: 4, fours: 8 }, { runs: 87, sixes: 3, fours: 9 })).toBe(true);
  });

  it('splits an equal score and equal sixes on fours', () => {
    expect(beats({ runs: 87, sixes: 4, fours: 9 }, { runs: 87, sixes: 4, fours: 8 })).toBe(true);
  });

  it('prefers the innings that kept its wickets', () => {
    expect(beats({ wickets: 0 }, { wickets: 1 })).toBe(true);
    expect(beats({ wickets: 2 }, { wickets: 3 })).toBe(true);
  });

  it('prefers the innings that wasted fewer balls', () => {
    expect(beats({ dots: 5 }, { dots: 6 })).toBe(true);
  });

  it('reads the keys in order, so a lower rung never overturns a higher one', () => {
    // One extra six outranks four extra fours, three spare wickets and six fewer dots.
    expect(beats(
      { runs: 60, sixes: 5, fours: 2, wickets: 3, dots: 10 },
      { runs: 60, sixes: 4, fours: 6, wickets: 0, dots: 4 },
    )).toBe(true);
  });
});

describe('the packed score', () => {
  it('spends exactly the fifty-three bits a double has, and no more', () => {
    expect(PACKED_BITS).toBe(53);
    expect(2 ** PACKED_BITS).toBe(Number.MAX_SAFE_INTEGER + 1);
  });

  it('survives the round trip', () => {
    const figures = innings({ runs: 133, sixes: 14, fours: 7, wickets: 2, dots: 4 });
    const at = LAUNCH_MS + 86_400_000;
    const back = unpackScore(packScore(figures, at));
    expect(back.runs).toBe(133);
    expect(back.sixes).toBe(14);
    expect(back.fours).toBe(7);
    expect(back.wickets).toBe(2);
    expect(back.dots).toBe(4);
    expect(back.atMs).toBe(at);
  });

  it('holds the biggest innings the game can produce without losing a bit', () => {
    // Thirty balls, every one a six: nothing can rank above this.
    const best = innings({ runs: maxRuns(), sixes: GAME.totalBalls, fours: 0, wickets: 0, dots: 0 });
    const score = packScore(best, LAUNCH_MS);
    expect(Number.isSafeInteger(score)).toBe(true);
    expect(score).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
    const back = unpackScore(score);
    expect(back.runs).toBe(maxRuns());
    expect(back.sixes).toBe(GAME.totalBalls);
    expect(back.wickets).toBe(0);
    expect(back.dots).toBe(0);
  });

  /**
   * The one line in this file that can be silently wrong. JavaScript's shift
   * operators are thirty-two bit, so `rank << 28` would wrap and hand back a
   * small, scrambled number instead of a large ordered one. A real innings packs
   * well past 2^32, so this catches that the moment it happens.
   */
  it('does not wrap at thirty-two bits', () => {
    const score = packScore(innings({ runs: 120, sixes: 12, fours: 9 }), LAUNCH_MS);
    expect(score).toBeGreaterThan(2 ** 32);
    expect(score % 1).toBe(0);
    // And the order still holds either side of that boundary.
    const lower = packScore(innings({ runs: 119, sixes: 12, fours: 9 }), LAUNCH_MS);
    expect(score).toBeGreaterThan(lower);
  });

  it('breaks an exact tie in favour of whoever got there first', () => {
    const figures = innings();
    const early = packScore(figures, LAUNCH_MS + 10_000);
    const late = packScore(figures, LAUNCH_MS + 20_000);
    expect(early).toBeGreaterThan(late);
  });

  it('never lets the clock overturn a playing key', () => {
    // A worse innings posted years earlier still sits below a better one posted now.
    const worse = packScore(innings({ runs: 40 }), LAUNCH_MS);
    const better = packScore(innings({ runs: 41 }), LAUNCH_MS + 8 * 365 * 86_400_000);
    expect(better).toBeGreaterThan(worse);
  });

  it('holds a stamp steady for eight years and clamps beyond its range', () => {
    const eightYears = LAUNCH_MS + 8 * 365 * 86_400_000;
    expect(unpackScore(packScore(innings(), eightYears)).atMs).toBe(eightYears);
    // A clock before the epoch cannot mint a tail bigger than the earliest real one.
    const beforeTime = packScore(innings(), LAUNCH_MS - 60_000);
    expect(beforeTime).toBe(packScore(innings(), LAUNCH_MS));
  });
});

describe('sorting a board', () => {
  it('puts the best innings first', () => {
    const board = [
      row({ runs: 87, sixes: 3, fours: 9 }),
      row({ runs: 112, sixes: 9, fours: 8 }),
      row({ runs: 87, sixes: 4, fours: 8 }),
    ].sort(compareRows);
    expect(board.map(r => [r.runs, r.sixes])).toEqual([[112, 9], [87, 4], [87, 3]]);
  });
});

describe('why a row sits where it does', () => {
  it('names the figure that separated two innings', () => {
    expect(decidedBy(innings({ runs: 88 }), innings({ runs: 87 }))).toBe('runs');
    expect(decidedBy(innings({ sixes: 4 }), innings({ sixes: 3 }))).toBe('sixes');
    expect(decidedBy(innings({ fours: 9 }), innings({ fours: 8 }))).toBe('fours');
    expect(decidedBy(innings({ wickets: 0 }), innings({ wickets: 2 }))).toBe('wickets');
    expect(decidedBy(innings({ dots: 4 }), innings({ dots: 5 }))).toBe('dots');
  });

  it('names the highest figure that differs, not the first it finds', () => {
    expect(decidedBy(
      innings({ runs: 87, sixes: 4, fours: 2, dots: 9 }),
      innings({ runs: 87, sixes: 3, fours: 9, dots: 2 }),
    )).toBe('sixes');
  });

  it('says nothing when only the clock split them', () => {
    expect(decidedBy(innings(), innings())).toBeNull();
  });
});

describe('whether it is worth asking for a name', () => {
  const full = Array.from({ length: BOARD_SIZE }, (_, i) => row({ runs: 100 - i })).sort(compareRows);

  it('takes anything while there are seats left', () => {
    expect(qualifies(innings({ runs: 1, sixes: 0, fours: 0, wickets: 3, balls: 3, dots: 0 }),
      Date.now(), full.slice(0, BOARD_SIZE - 1))).toBe(true);
  });

  it('takes an innings that beats the fiftieth', () => {
    expect(qualifies(innings({ runs: 60 }), LAUNCH_MS + 60_000, full)).toBe(true);
  });

  it('turns away an innings that does not', () => {
    expect(qualifies(innings({ runs: 40 }), LAUNCH_MS + 60_000, full)).toBe(false);
  });

  it('turns away an innings that only equals the fiftieth, because it came later', () => {
    const fiftieth = full[BOARD_SIZE - 1];
    const same: Innings = { ...fiftieth };
    expect(qualifies(same, LAUNCH_MS + 10_000_000, full)).toBe(false);
  });
});

describe('innings that could not have happened', () => {
  it('accepts one the game actually produced', () => {
    const score = played([
      ball(6), ball(4), ball(0), ball(1), ball(2), ball(3), ball(0, true), ball(4), ball(6), ball(1),
      ...Array.from({ length: 20 }, () => ball(1)),
    ]);
    expect(plausible(inningsFrom(score))).toBe(true);
  });

  it('accepts a completed thirty and an all-out short one', () => {
    expect(plausible(innings({ balls: GAME.totalBalls, wickets: 0 }))).toBe(true);
    expect(plausible(innings({ balls: 9, wickets: 3, runs: 12, sixes: 1, fours: 1, dots: 2 }))).toBe(true);
  });

  it('rejects an innings that stopped early without losing three', () => {
    expect(plausible(innings({ balls: 12, wickets: 1 }))).toBe(false);
  });

  it('rejects more runs than the balls could carry', () => {
    expect(plausible(innings({ runs: maxRuns() + 1, sixes: 30, fours: 0, wickets: 0, dots: 0 }))).toBe(false);
    expect(plausible(innings({ runs: 100, sixes: 0, fours: 0, wickets: 0, dots: 0 }))).toBe(false);
  });

  it('rejects boundaries the runs cannot account for', () => {
    // Ten sixes is sixty runs on its own; forty cannot contain them.
    expect(plausible(innings({ runs: 40, sixes: 10, fours: 0, wickets: 0, dots: 20 }))).toBe(false);
  });

  it('rejects more balls than the innings has', () => {
    expect(plausible(innings({ sixes: 20, fours: 20, dots: 20 }))).toBe(false);
    expect(plausible(innings({ balls: GAME.totalBalls + 1 }))).toBe(false);
    expect(plausible(innings({ wickets: GAME.maxWickets + 1 }))).toBe(false);
  });

  it('rejects runs that the leftover balls could not have scored', () => {
    // Twenty-one balls left over, each worth one to three: never twenty-two to a hundred.
    expect(plausible(innings({ runs: 200, sixes: 6, fours: 3, wickets: 0, dots: 0 }))).toBe(false);
  });

  it('rejects fractions and negatives', () => {
    expect(plausible(innings({ runs: 40.5 }))).toBe(false);
    expect(plausible(innings({ dots: -1 }))).toBe(false);
  });
});

describe('counting dots off a real innings', () => {
  it('counts the balls that scored nothing and were not wickets', () => {
    const score = played([ball(0), ball(0), ball(4), ball(0, true), ball(6), ball(0)]);
    expect(score.dots).toBe(3);
    expect(score.wickets).toBe(1);
  });

  it('starts at nought and ignores anything after the innings ends', () => {
    const score = played([ball(0, true), ball(0, true), ball(0, true), ball(0)]);
    expect(score.balls).toBe(GAME.maxWickets);
    expect(score.dots).toBe(0);
  });

  it('hands the board the same figures the card shows', () => {
    const score = played([ball(6), ball(4), ball(0), ball(0, true), ball(2)]);
    expect(inningsFrom(score)).toEqual({ runs: 12, sixes: 1, fours: 1, wickets: 1, dots: 1, balls: 5 });
  });
});
