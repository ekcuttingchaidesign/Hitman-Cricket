import { describe, expect, it } from 'vitest';
import { batterRuns, reachedCentury } from '../src/game/milestone';
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
