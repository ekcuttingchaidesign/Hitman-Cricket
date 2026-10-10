import { describe, expect, it } from 'vitest';
import {
  barHeight, barKind, battingCardMarkup, injuryRingMarkup, injuryWord, milestoneChip, overChartMarkup, wormChartMarkup,
} from '../src/ui/EndCard';

const ball = (runs: number, isWicket = false) => ({ runs, isWicket });

describe('the over-by-over chart', () => {
  it('stands a six full, a four two thirds, a dot empty, and a wicket full in red', () => {
    expect(barHeight(ball(6))).toBe(42);
    expect(barHeight(ball(4))).toBe(28);
    expect(barHeight(ball(1))).toBe(10);
    expect(barHeight(ball(0))).toBe(0);
    expect(barHeight(ball(0, true))).toBe(42);
    expect([ball(6), ball(4), ball(2), ball(0), ball(1, true)].map(barKind)).toEqual(['six', 'four', 'run', 'dot', 'out']);
  });

  it('draws every over of the innings, the runs under each, and the ones never reached as empty tracks', () => {
    const history = [ball(6), ball(4), ball(1), ball(0), ball(6), ball(2), ball(0, true), ball(4)];
    const chart = overChartMarkup(history, 30);
    expect(chart.match(/class="ec-over[ "]/g)).toHaveLength(5);
    expect(chart).toContain('<span>OV 1</span><b>19</b>');
    expect(chart).toContain('<span>OV 2</span><b>4</b>');
    expect(chart.match(/is-unbowled/g)).toHaveLength(3);
    expect(chart.match(/is-unfaced/g)).toHaveLength(22);
  });
});

describe('the Marathon worm', () => {
  it('puts a red ball on the line for each man gone, the last one as the end', () => {
    const worm = wormChartMarkup([1, 4, 0, 6, 1, 0, 2, 0], [{ ball: 3, kind: 'out' }, { ball: 8, kind: 'out' }]);
    expect(worm.match(/class="worm-fall/g)).toHaveLength(2);
    expect(worm).toContain('worm-line');
    expect(worm).not.toContain('worm-best');
  });

  it('measures against a best higher than this innings, on a scale stretched to it', () => {
    const worm = wormChartMarkup(Array(12).fill(6), [], 290);
    expect(worm).toContain('worm-best');
    expect(worm).toContain('Best 290');
    // 72 of 290 sits low on the plot: well under the best's line at the top.
    const top = Number(worm.match(/class="worm-best"[^>]*y1="([\d.]+)"/)![1]);
    expect(top).toBeLessThan(10);
  });
});

describe('the batting card', () => {
  it('numbers the batters and chips the left-hander and a milestone', () => {
    const card = battingCardMarkup([
      { title: 'OPENER', left: true, runs: 62, balls: 23, fours: 13, sixes: 1 },
      { title: 'NO. 3', left: false, runs: 101, balls: 43, fours: 13, sixes: 6 },
    ]);
    expect(card).toContain('<span class="ec-bat-n">1</span><span class="ec-bat-name">OPENER</span><i class="ec-chip">LH</i>');
    expect(card).toContain('is-ton">100</i>');
    expect(milestoneChip(49)).toBeNull();
    expect(milestoneChip(250)).toBe('200');
  });
});

describe('the injury ring', () => {
  it('says how bad in a word', () => {
    expect(injuryWord(30)).toBe('Light');
    expect(injuryWord(65)).toBe('High');
    expect(injuryWord(100)).toBe('Severe');
  });

  it('runs the arc as far round as the injury is', () => {
    const full = 2 * Math.PI * 19.8;
    expect(injuryRingMarkup(50)).toContain(`stroke-dasharray="${(full / 2).toFixed(2)} ${full.toFixed(2)}"`);
    expect(injuryRingMarkup(0)).toContain('stroke-dasharray="0.00');
  });
});
