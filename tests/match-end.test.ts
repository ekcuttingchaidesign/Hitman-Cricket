import { describe, expect, it } from 'vitest';
import { ended } from '../src/game/ball-string';
import { chaseEndOf, verdictOf } from '../src/game/match-end';

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

  it('gives each side its verdict, from its own side', () => {
    const row = (name: string, runs: number, balls: number, at: number, status = 'done') => ({ name, avatar: 1, runs, balls, status, at });
    const setter = row('Kabir', 31, 30, 1), chaser = row('Riya', 35, 13, 2);
    // The chaser won it with seventeen balls to spare; the setter sees the same match as a defeat.
    expect(verdictOf({ outcome: 'W', forfeit: false, mine: chaser, them: setter, mode: 'classic', balls: 30, youAvatar: 2 }))
      .toMatchObject({ kind: 'won', title: 'VICTORY', sub: 'You beat Kabir · 35–31', how: 'CHASED WITH 17 BALLS TO SPARE', you: { avatar: 2 } });
    expect(verdictOf({ outcome: 'L', forfeit: false, mine: setter, them: chaser, mode: 'classic', balls: 30, youAvatar: 1 }))
      .toMatchObject({ kind: 'lost', title: 'DEFEAT', sub: 'Riya beat you · 35–31', how: 'CHASED DOWN WITH 17 BALLS TO SPARE' });
    // A total that held: the setter defended it, the chaser fell short.
    const short = row('Riya', 27, 30, 2);
    expect(verdictOf({ outcome: 'W', forfeit: false, mine: setter, them: short, mode: 'super10', balls: 60, youAvatar: 1 }))
      .toMatchObject({ kind: 'won', how: 'DEFENDED BY 4 RUNS', mode: 'super10' });
    expect(verdictOf({ outcome: 'L', forfeit: false, mine: short, them: setter, mode: 'classic', balls: 30, youAvatar: 1 }).how).toBe('SHORT BY 4 RUNS');
    // Level on everything, and level on runs but beaten on boundaries.
    expect(verdictOf({ outcome: 'D', forfeit: false, mine: setter, them: row('Riya', 31, 30, 2), mode: 'classic', balls: 30, youAvatar: 1 }))
      .toMatchObject({ kind: 'drawn', title: 'DRAW', sub: 'Level with Riya · 31–31' });
    expect(verdictOf({ outcome: 'L', forfeit: false, mine: row('Riya', 31, 30, 2), them: setter, mode: 'classic', balls: 30, youAvatar: 1 }).how).toBe('ON BOUNDARIES');
  });

  it('says a walkout as one', () => {
    const row = (name: string, runs: number, status: string, at: number) => ({ name, avatar: 1, runs, balls: 9, status, at });
    expect(verdictOf({ outcome: 'W', forfeit: true, mine: row('Kabir', 31, 'done', 1), them: row('Riya', 12, 'forfeit', 2), mode: 'classic', balls: 30, youAvatar: 1 }))
      .toMatchObject({ kind: 'won', sub: 'Riya walked out', how: 'BY FORFEIT' });
    expect(verdictOf({ outcome: 'L', forfeit: true, mine: row('Riya', 12, 'forfeit', 2), them: row('Kabir', 31, 'done', 1), mode: 'classic', balls: 30, youAvatar: 1 }))
      .toMatchObject({ kind: 'lost', sub: 'You walked out on Kabir', how: 'BY FORFEIT' });
  });
});
