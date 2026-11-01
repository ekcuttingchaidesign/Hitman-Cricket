import { describe, expect, it } from 'vitest';
import { ended } from '../src/game/ball-string';
import { chaseEndOf, victoryOf } from '../src/game/match-end';

const BLAST = { balls: 30, wickets: 3 }, SUPER10 = { balls: 60, wickets: 5 };

describe('the end of a challenge’s chase', () => {
  it('is over on the ball the total is passed, and not on the ball it is equalled', () => {
    const figures = (runs: number) => ({ runs, balls: 13, wickets: 1, dots: 0, fours: 0, sixes: 0 });
    expect(ended(figures(31), 'classic', 31)).toBe(false);
    expect(ended(figures(32), 'classic', 31)).toBe(true);
    // No total, no early end: the setter, and every room made from a link.
    expect(ended(figures(200), 'classic')).toBe(false);
  });

  it('says a chase won, with the balls to spare', () => {
    expect(chaseEndOf({ runs: 35, balls: 13, wickets: 1, limits: BLAST }, 31, 'Kabir'))
      .toEqual({ kind: 'won', title: 'TARGET CHASED', chip: 'WITH 17 BALLS TO SPARE', line: '35 off 13 balls · Kabir’s 31 beaten' });
    expect(chaseEndOf({ runs: 32, balls: 30, wickets: 2, limits: BLAST }, 31, 'Kabir').chip).toBe('OFF THE LAST BALL');
    expect(chaseEndOf({ runs: 150, balls: 59, wickets: 4, limits: SUPER10 }, 140, 'Kabir').chip).toBe('WITH 1 BALL TO SPARE');
  });

  it('says how far short, all out or out of balls', () => {
    expect(chaseEndOf({ runs: 27, balls: 18, wickets: 3, limits: BLAST }, 31, 'Kabir'))
      .toEqual({ kind: 'short', title: 'FELL SHORT', chip: 'BY 4 RUNS', line: 'All out for 27 · Kabir needed 32' });
    expect(chaseEndOf({ runs: 30, balls: 30, wickets: 1, limits: BLAST }, 31, 'Kabir'))
      .toMatchObject({ chip: 'BY 1 RUN', line: '30 off 30 balls · Kabir needed 32' });
  });

  it('leaves level scores to the sixes and fours', () => {
    expect(chaseEndOf({ runs: 31, balls: 30, wickets: 2, limits: BLAST }, 31, 'Kabir'))
      .toMatchObject({ kind: 'level', title: 'SCORES LEVEL', chip: 'BOTH ON 31' });
  });

  it('plays the victory only for a chase won', () => {
    const view = { runs: 35, target: 31, you: { avatar: 1 }, them: { name: 'Kabir', avatar: 3 }, mode: 'super10' as const };
    expect(victoryOf(chaseEndOf({ runs: 35, balls: 13, wickets: 1, limits: SUPER10 }, 31, 'Kabir'), view))
      .toMatchObject({ sub: 'You beat Kabir · 35–31', how: 'TARGET CHASED WITH 47 BALLS TO SPARE', mode: 'super10' });
    expect(victoryOf(chaseEndOf({ runs: 27, balls: 30, wickets: 2, limits: BLAST }, 31, 'Kabir'), view)).toBeNull();
    expect(victoryOf(chaseEndOf({ runs: 31, balls: 30, wickets: 2, limits: BLAST }, 31, 'Kabir'), view)).toBeNull();
  });
});
