import { describe, expect, it } from 'vitest';
import { batterRuns, milestoneOf, nearingEnd, nearingOf, reachedCentury, reachedFifty, sixSixes } from '../src/game/milestone';
import type { ShotOutcome } from '../src/game/types';

const ball = (runs: ShotOutcome['runs'], isWicket = false): ShotOutcome => ({
  runs, isWicket, quality: .5, feedback: '', timingGrade: 'GOOD', timingDeltaMs: 0,
  compatibility: 1, madeBatContact: !isWicket, aerial: false,
});
const sixes = (n: number) => Array.from({ length: n }, () => ball(6));

describe('the hundred', () => {
  it('is counted from the last wicket, not from the first ball', () => {
    expect(batterRuns([...sixes(10), ball(0, true), ball(4)])).toBe(4);
    expect(batterRuns([...sixes(10), ball(4)])).toBe(64);
  });

  it('is reached on the ball that crosses it', () => {
    expect(reachedCentury([...sixes(16), ball(4)])).toBe(true);      // 96, then 100
    expect(reachedCentury([...sixes(16), ball(6)])).toBe(true);      // 96, then 102
    expect(reachedCentury([...sixes(16), ball(3), ball(1)])).toBe(true); // 99, then 100
  });

  it('is not reached again on the next ball, or before it', () => {
    expect(reachedCentury([...sixes(16), ball(4), ball(4)])).toBe(false);
    expect(reachedCentury([...sixes(16), ball(3)])).toBe(false);     // 99
    expect(reachedCentury([])).toBe(false);
  });

  it('belongs to the batter, so the side passing a hundred is not one', () => {
    // Sixty for the first man, then out; the second man's forty takes the side
    // past a hundred and him nowhere near one.
    expect(reachedCentury([...sixes(10), ball(0, true), ...sixes(7)])).toBe(false);
  });

  it('is never the ball he is out to', () => {
    expect(reachedCentury([...sixes(16), ball(4, true)])).toBe(false);
  });
});

describe('the fifty', () => {
  it('is reached on the ball that crosses it, and never again', () => {
    expect(reachedFifty([...sixes(8), ball(2)])).toBe(true);       // 48, then 50
    expect(reachedFifty([...sixes(8), ball(2), ball(4)])).toBe(false);
    expect(reachedFifty([...sixes(8), ball(1)])).toBe(false);      // 49
  });
});

describe('six sixes in a row', () => {
  it('is the sixth six running', () => {
    expect(sixSixes(sixes(6))).toBe(true);
    expect(sixSixes([ball(1), ...sixes(6)])).toBe(true);
    expect(sixSixes(sixes(5))).toBe(false);
  });
  it('is not the seventh, or six with anything in between', () => {
    expect(sixSixes(sixes(7))).toBe(false);
    expect(sixSixes([...sixes(3), ball(4), ...sixes(3)])).toBe(false);
  });
  it('can come again after the run is broken', () => {
    expect(sixSixes([...sixes(6), ball(0), ...sixes(6)])).toBe(true);
  });
});

describe('which moment a ball is', () => {
  it('is the biggest of them when one ball is more than one', () => {
    // Sixty-six, then six more sixes: the hundred and the six sixes come on
    // the same ball, and the six sixes is the rarer of the two.
    expect(milestoneOf([...sixes(11), ball(0), ...sixes(6)].slice(-18))).toBe('six-sixes');
    expect(milestoneOf([...sixes(16), ball(4)])).toBe('century');
    expect(milestoneOf([...sixes(8), ball(2)])).toBe('fifty');
    expect(milestoneOf([ball(4)])).toBe(null);
  });
});

describe('the wait for a moment', () => {
  it('goes up ten short of a fifty and of a hundred, and not before', () => {
    expect(nearingOf([...sixes(6), ball(3), ball(1)])).toEqual({ kind: 'fifty', runs: 40, need: 10 });
    expect(nearingOf([...sixes(6), ball(3)])).toBe(null);                     // 39
    expect(nearingOf([...sixes(8), ball(1)])).toEqual({ kind: 'fifty', runs: 49, need: 1 });
    expect(nearingOf([...sixes(15), ball(4), ball(1), ball(1)])).toEqual({ kind: 'century', runs: 96, need: 4 });
    expect(nearingOf([...sixes(8), ball(4), ball(1)])).toBe(null);            // 53: past one, nowhere near the next
  });

  it('is his, from the last wicket', () => {
    expect(nearingOf([...sixes(15), ball(0, true), ball(4)])).toBe(null);
  });

  it('shows the sixes from the third running, and gives way to nothing', () => {
    expect(nearingOf([ball(1), ...sixes(2)])).toBe(null);
    expect(nearingOf([ball(1), ...sixes(3)])).toEqual({ kind: 'six-sixes', sixes: 3 });
    expect(nearingOf([ball(1), ...sixes(5)])).toEqual({ kind: 'six-sixes', sixes: 5 });
    // The sixth is the moment itself, and the slots come down for it.
    expect(nearingOf([ball(1), ...sixes(6)])).toBe(null);
  });

  it('puts the sixes first when he is in the nineties as well, since they end sooner', () => {
    // 72, then three sixes: 90 and three running.
    expect(batterRuns([...sixes(12), ball(0), ...sixes(3)])).toBe(90);
    expect(nearingOf([...sixes(12), ball(0), ...sixes(3)])).toEqual({ kind: 'six-sixes', sixes: 3 });
  });

  it('comes off when he gets there', () => {
    const before = nearingOf([...sixes(15), ball(2), ball(0)])!;             // 92
    expect(nearingEnd(before, [...sixes(15), ball(2), ball(0), ball(6), ball(2)])).toEqual({ how: 'reached', runs: 100 });
    // Past it on the ball that gets there: what he has, not the mark.
    expect(nearingEnd(before, [...sixes(15), ball(2), ball(0), ball(6), ball(6)])).toEqual({ how: 'reached', runs: 104 });
    const five = nearingOf([ball(1), ...sixes(5)]);
    expect(nearingEnd(five, [ball(1), ...sixes(6)])).toEqual({ how: 'reached', runs: 37 });
  });

  it('comes off saying what he was out for when he is out short', () => {
    const before = nearingOf([...sixes(16)])!;                                // 96
    expect(nearingEnd(before, [...sixes(16), ball(0, true)])).toEqual({ how: 'out', runs: 96 });
  });

  it('comes off broken when a run of sixes stops', () => {
    const before = nearingOf([ball(1), ...sixes(4)]);
    expect(nearingEnd(before, [ball(1), ...sixes(4), ball(4)])).toEqual({ how: 'broken' });
  });

  it('stays on while it is the same wait', () => {
    const before = nearingOf([...sixes(15), ball(2)]);                        // 92
    expect(nearingEnd(before, [...sixes(15), ball(2), ball(0)])).toBe(null);
    expect(nearingEnd(before, [...sixes(15), ball(2), ball(4)])).toBe(null);
    expect(nearingEnd(null, [ball(4)])).toBe(null);
  });
});
