import { describe, expect, it } from 'vitest';
import { COUNTED, countStroke, freshTally, strokeMarks, type Counted, type StrokeBall } from '../src/game/stroke-tally';

const ball = (over: Partial<StrokeBall>): StrokeBall =>
  ({ its: false, armBall: false, played: false, swung: true, runs: 0, out: false, missed: false, ...over });
const names = (balls: Partial<StrokeBall>[], counted: Counted = COUNTED.spinPull) =>
  strokeMarks(balls.map(ball).reduce(countStroke, freshTally()), counted).map(([name]) => name);

describe('counting a stroke', () => {
  it('counts nothing for an innings that never saw its ball or played it', () => {
    expect(names([{ runs: 4 }, { armBall: true, runs: 1 }, { swung: false }])).toEqual([]);
  });
  it('counts its ball faced, and whether it was met with another stroke', () => {
    expect(names([{ its: true, swung: false }])).toEqual(['spinshort-faced']);
    expect(names([{ its: true, runs: 2 }])).toEqual(['spinshort-faced', 'spinshort-other']);
  });
  it('counts what the stroke came to, once an innings however often it happened', () => {
    expect(names([
      { its: true, played: true, runs: 6 }, { its: true, played: true, runs: 6 },
      { its: true, played: true, runs: 4 }, { its: true, played: true, out: true },
    ])).toEqual(['spinshort-faced', 'spinpull-played', 'spinpull-six', 'spinpull-four', 'spinpull-out']);
  });
  it('counts the arm ball pulled, which is not a short ball', () => {
    expect(names([{ armBall: true, played: true, runs: 1 }])).toEqual(['spinpull-played', 'spinpull-arm']);
  });
  it('counts a stroke that was beaten', () => {
    expect(names([{ its: true, played: true, missed: true }])).toEqual(['spinshort-faced', 'spinpull-played', 'spinpull-missed']);
  });
  it('names the hook’s under its own', () => {
    expect(names([{ its: true, played: true, runs: 6 }, { its: true, played: false }], COUNTED.hook))
      .toEqual(['hookball-faced', 'hookball-other', 'hook-played', 'hook-six']);
  });
});
