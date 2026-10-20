import { describe, expect, it } from 'vitest';
import { countSpinPull, freshSpinPulls, spinPullMarks, type SpinPullBall } from '../src/game/spin-pull-tally';

const ball = (over: Partial<SpinPullBall>): SpinPullBall =>
  ({ dragged: false, armBall: false, pulled: false, swung: true, runs: 0, out: false, missed: false, ...over });
const names = (balls: Partial<SpinPullBall>[]) =>
  spinPullMarks(balls.map(ball).reduce(countSpinPull, freshSpinPulls())).map(([name]) => name);

describe('counting the pull off the spinner', () => {
  it('counts nothing for an innings that never saw the short ball or played the pull', () => {
    expect(names([{ runs: 4 }, { armBall: true, runs: 1 }, { swung: false }])).toEqual([]);
  });
  it('counts the short ball faced, and whether it was met with another stroke', () => {
    expect(names([{ dragged: true, swung: false }])).toEqual(['spinshort-faced']);
    expect(names([{ dragged: true, runs: 2 }])).toEqual(['spinshort-faced', 'spinshort-other']);
  });
  it('counts what the pull came to, once an innings however often it happened', () => {
    expect(names([
      { dragged: true, pulled: true, runs: 6 }, { dragged: true, pulled: true, runs: 6 },
      { dragged: true, pulled: true, runs: 4 }, { dragged: true, pulled: true, out: true },
    ])).toEqual(['spinshort-faced', 'spinpull-played', 'spinpull-six', 'spinpull-four', 'spinpull-out']);
  });
  it('counts the arm ball pulled, which is not a short ball', () => {
    expect(names([{ armBall: true, pulled: true, runs: 1 }])).toEqual(['spinpull-played', 'spinpull-arm']);
  });
  it('counts a pull that was beaten', () => {
    expect(names([{ dragged: true, pulled: true, missed: true }])).toEqual(['spinshort-faced', 'spinpull-played', 'spinpull-missed']);
  });
});
