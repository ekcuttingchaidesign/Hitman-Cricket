import { describe, expect, it } from 'vitest';
import { SURVIVE } from '../src/config/survive';
import {
  SURVIVE_BOARD_SIZE, SURVIVE_PACKED_BITS, compareSurviveRows, maxSurviveRuns, packSurvive,
  primaryOf, standingOf, surviveImprovesOn, survivePlausible, surviveQualifies, surviveRankKey,
  unpackSurvive, type SurviveInnings, type SurviveRow,
} from '../src/game/survive-board';

const innings = (over: Partial<SurviveInnings> = {}): SurviveInnings =>
  ({ runs: 0, balls: 0, wickets: 0, blows: 0, ...over });

/** An innings as the board would hold it, stamped a minute into the epoch. */
const AT = Date.UTC(2026, 5, 1);
const row = (over: Partial<SurviveInnings>, atMs = AT): SurviveRow => {
  const i = innings(over);
  return { ...i, playerId: 'p', name: 'n', avatar: 0, score: packSurvive(i, atMs) };
};
/** Best first, the way the board is read. */
const order = (...rows: SurviveRow[]) => [...rows].sort(compareSurviveRows);

describe('which contest the innings ended up in', () => {
  it('reads the tier off the figures rather than being told', () => {
    // The store has to decide this from a row somebody posted, so it cannot
    // trust an ending sent along beside it.
    expect(standingOf(innings({ runs: SURVIVE.target, balls: 40 }))).toBe('WON');
    expect(standingOf(innings({ runs: 38, balls: SURVIVE.totalBalls }))).toBe('DRAWN');
    expect(standingOf(innings({ runs: 38, balls: 20, wickets: 1 }))).toBe('LOST');
  });

  it('calls a chase finished on the last ball a win, not a draw', () => {
    expect(standingOf(innings({ runs: SURVIVE.target, balls: SURVIVE.totalBalls }))).toBe('WON');
  });
});

describe('the order the board is asked for', () => {
  it('puts a winner above a defender above a loser', () => {
    const won = row({ runs: SURVIVE.target, balls: 58 });
    const drawn = row({ runs: 99, balls: SURVIVE.totalBalls });
    const lost = row({ runs: 98, balls: 59, wickets: 1 });
    expect(order(lost, drawn, won).map(standingOf)).toEqual(['WON', 'DRAWN', 'LOST']);
  });

  it('puts the faster chase first', () => {
    // A chase is a race, so the same hundred off fewer balls is the better win.
    const quick = row({ runs: SURVIVE.target, balls: 31 });
    const slow = row({ runs: SURVIVE.target, balls: 52 });
    expect(order(slow, quick)[0].balls).toBe(31);
  });

  it('never lets a big score beat a faster chase', () => {
    // Runs are only a tiebreak up here: they must not reorder the race.
    const quickAndLean = row({ runs: SURVIVE.target, balls: 31 });
    const slowAndFat = row({ runs: 260, balls: 52 });
    expect(order(slowAndFat, quickAndLean)[0].balls).toBe(31);
  });

  it('ranks the defenders on what they made while surviving', () => {
    // He had nothing left to chase, so the runs are the measure.
    const better = row({ runs: 74, balls: SURVIVE.totalBalls });
    const worse = row({ runs: 22, balls: SURVIVE.totalBalls });
    expect(order(worse, better)[0].runs).toBe(74);
  });

  it('ranks the losers on how long they kept them out', () => {
    const longer = row({ runs: 9, balls: 44, wickets: 1 });
    const shorter = row({ runs: 61, balls: 12, wickets: 1 });
    expect(order(shorter, longer)[0].balls).toBe(44);
  });

  it('splits two identical chases on the runs made on the way', () => {
    const richer = row({ runs: 141, balls: 40 });
    const poorer = row({ runs: SURVIVE.target, balls: 40 });
    expect(order(poorer, richer)[0].runs).toBe(141);
  });

  it('gives an exact tie to whoever got there first', () => {
    const first = row({ runs: SURVIVE.target, balls: 40 }, AT);
    const second = row({ runs: SURVIVE.target, balls: 40 }, AT + 60_000);
    expect(order(second, first)[0].score).toBe(first.score);
  });
});

describe('the packed key', () => {
  it('stays inside a double', () => {
    // Fifty-three is exactly a double's mantissa. Past it the board scrambles.
    expect(SURVIVE_PACKED_BITS).toBeLessThanOrEqual(53);
    const biggest = packSurvive(innings({ runs: maxSurviveRuns(), balls: SURVIVE.totalBalls }), AT);
    expect(Number.isSafeInteger(biggest)).toBe(true);
  });

  it('comes apart again', () => {
    const played = innings({ runs: SURVIVE.target + 12, balls: 44 });
    const unpacked = unpackSurvive(packSurvive(played, AT));
    expect(unpacked.standing).toBe('WON');
    expect(unpacked.runs).toBe(SURVIVE.target + 12);
    // A chase stores what it saved, not what it spent.
    expect(unpacked.primary).toBe(SURVIVE.totalBalls - 44);
    expect(unpacked.atMs).toBe(AT);
  });

  it('holds the tiers apart whatever is under them', () => {
    // The worst possible win still outranks the best possible draw. A draw caps
    // at one short of the target, because the run that reaches it is a win.
    const worstWin = surviveRankKey(innings({ runs: SURVIVE.target, balls: SURVIVE.totalBalls }));
    const bestDraw = surviveRankKey(innings({ runs: SURVIVE.target - 1, balls: SURVIVE.totalBalls }));
    expect(worstWin).toBeGreaterThan(bestDraw);
    const worstDraw = surviveRankKey(innings({ runs: 0, balls: SURVIVE.totalBalls }));
    const bestLoss = surviveRankKey(innings({ runs: SURVIVE.target - 1, balls: SURVIVE.totalBalls - 1, wickets: 1 }));
    expect(worstDraw).toBeGreaterThan(bestLoss);
  });

  it('stores the chase as balls saved', () => {
    expect(primaryOf(innings({ runs: SURVIVE.target, balls: 10 }))).toBe(SURVIVE.totalBalls - 10);
    expect(primaryOf(innings({ runs: 40, balls: SURVIVE.totalBalls }))).toBe(40);
    expect(primaryOf(innings({ runs: 40, balls: 25, wickets: 1 }))).toBe(25);
  });
});

describe('whether it is worth asking for a name', () => {
  const full = Array.from({ length: SURVIVE_BOARD_SIZE }, (_, i) =>
    row({ runs: 30 + i, balls: SURVIVE.totalBalls }));
  const board = [...full].sort(compareSurviveRows);

  it('takes anything while there is room', () => {
    expect(surviveQualifies(innings({ runs: 1, balls: 3, wickets: 1 }), AT, [])).toBe(true);
  });

  it('turns away an innings that cannot reach fiftieth', () => {
    expect(surviveQualifies(innings({ runs: 0, balls: 2, wickets: 1 }), AT, board)).toBe(false);
  });

  it('takes a win even off a board full of draws', () => {
    expect(surviveQualifies(innings({ runs: SURVIVE.target, balls: 59 }), AT, board)).toBe(true);
  });

  it('will not offer a place an innings would not actually take', () => {
    const standing = { score: packSurvive(innings({ runs: SURVIVE.target, balls: 30 }), AT) };
    expect(surviveImprovesOn(innings({ runs: SURVIVE.target, balls: 41 }), AT, standing)).toBe(false);
    expect(surviveImprovesOn(innings({ runs: SURVIVE.target, balls: 22 }), AT, standing)).toBe(true);
    expect(surviveImprovesOn(innings({ runs: 3, balls: 4, wickets: 1 }), AT, null)).toBe(true);
  });
});

describe('whether the innings could have happened', () => {
  it('takes the three shapes the mode actually produces', () => {
    expect(survivePlausible(innings({ runs: SURVIVE.target, balls: 38, blows: 2 }))).toBe(true);
    expect(survivePlausible(innings({ runs: 51, balls: SURVIVE.totalBalls, blows: 6 }))).toBe(true);
    // Carried off: balls left, and no wicket against him.
    expect(survivePlausible(innings({ runs: 20, balls: 33, wickets: 0, blows: 9 }))).toBe(true);
  });

  it('rejects what no scorecard could hold', () => {
    expect(survivePlausible(innings({ runs: -1 }))).toBe(false);
    expect(survivePlausible(innings({ runs: 4.5, balls: 10 }))).toBe(false);
    expect(survivePlausible(innings({ balls: SURVIVE.totalBalls + 1 }))).toBe(false);
    expect(survivePlausible(innings({ wickets: 2, balls: 10 }))).toBe(false);
    // More blows than balls bowled at him.
    expect(survivePlausible(innings({ balls: 4, blows: 5 }))).toBe(false);
    // Six a ball is the ceiling, and nothing can be scored off no balls at all.
    expect(survivePlausible(innings({ runs: 60, balls: 10 }))).toBe(true);
    expect(survivePlausible(innings({ runs: 61, balls: 10 }))).toBe(false);
    expect(survivePlausible(innings({ runs: 3, balls: 0 }))).toBe(false);
  });

  it('takes a wicket on the very last ball, which the mode does produce', () => {
    // The overs are read before the wicket, so being bowled on the sixtieth
    // ball is a draw with ten down rather than a scorecard nobody could hold.
    expect(survivePlausible(innings({ runs: 20, balls: SURVIVE.totalBalls, wickets: 1 }))).toBe(true);
    expect(standingOf(innings({ runs: 20, balls: SURVIVE.totalBalls, wickets: 1 }))).toBe('DRAWN');
  });

  it('rejects an innings that carried on past the thing that ends it', () => {
    // The hundred ends the chase, so he cannot be out after reaching it.
    expect(survivePlausible(innings({ runs: SURVIVE.target, balls: 40, wickets: 1 }))).toBe(false);
  });
});
