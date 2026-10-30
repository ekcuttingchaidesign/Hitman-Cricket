import { describe, expect, it } from 'vitest';
import {
  SUPER10_PACKED_BITS, battersOf, packSuper10, readSuper10, super10BattersPlausible, super10Plausible, super10SoloOf,
  unpackSuper10, type Super10Figures, type Super10Innings,
} from '../src/game/super10-board';
import type { SoloInnings } from '../src/game/marathon-board';
import { readSuper10Boards, readSuper10Standing, refused, submitSuper10, type Submission } from '../src/server/board-store';
import { memoryStore } from '../src/server/memory-store';
import { NO_CONTEXT, super10SoloBody } from '../src/ui/Board';
import { SUPER10_CAREER, emptySuper10, mergeSuper10 } from '../src/game/career';
import { TIERS, standingOf } from '../src/game/tier';
import { modeAsked } from '../src/server/mode';

const at = Date.UTC(2026, 9, 25, 12);
const innings = (runs: number, wickets: number, sixes: number, extra: Partial<Super10Innings> = {}): Super10Innings =>
  ({ runs, wickets, sixes, fours: 0, balls: 60, ...extra });

describe("Super10's board", () => {
  it('ranks the team total first', () => {
    expect(packSuper10(innings(181, 5, 0, { balls: 50 }), at)).toBeGreaterThan(packSuper10(innings(180, 0, 20), at));
  });

  it('splits level totals on fewer wickets, then more sixes, then whoever was first', () => {
    expect(packSuper10(innings(150, 2, 0), at)).toBeGreaterThan(packSuper10(innings(150, 3, 12), at));
    expect(packSuper10(innings(150, 2, 9), at)).toBeGreaterThan(packSuper10(innings(150, 2, 8), at));
    expect(packSuper10(innings(150, 2, 9), at)).toBeGreaterThan(packSuper10(innings(150, 2, 9), at + 1000));
  });

  it('fits a double, and comes apart again', () => {
    expect(SUPER10_PACKED_BITS).toBeLessThanOrEqual(53);
    const back = unpackSuper10(packSuper10(innings(212, 3, 14), at));
    expect(back).toEqual({ runs: 212, wickets: 3, sixes: 14, atMs: at });
    expect(Number.isSafeInteger(packSuper10(innings(360, 0, 60), at))).toBe(true);
  });

  it('refuses an innings that could not have happened', () => {
    expect(super10Plausible(innings(120, 2, 6, { fours: 8 }))).toBe(true);
    expect(super10Plausible(innings(120, 2, 6, { balls: 40 }))).toBe(false);
    expect(super10Plausible(innings(30, 5, 0, { balls: 22 }))).toBe(true);
    expect(super10Plausible(innings(361, 0, 60))).toBe(false);
    expect(super10Plausible(innings(100, 6, 0))).toBe(false);
    expect(super10Plausible(innings(Number.NaN, 0, 0))).toBe(false);
  });

  it('is asked for by name', () => {
    expect(modeAsked('super10')).toBe('super10');
  });
});

describe("Super10's career", () => {
  it('adds up innings, runs and sixes, and counts team totals of a hundred and two hundred', () => {
    let career = emptySuper10();
    for (const runs of [96, 104, 211]) career = mergeSuper10(career, innings(runs, 3, 5, { fours: 4 }));
    expect(career).toMatchObject({ innings: 3, runs: 411, sixes: 15, fours: 12, highest: 211, hundreds: 2, doubles: 1 });
    expect(SUPER10_CAREER.scope).toBe('super10career:');
    expect(SUPER10_CAREER.boards.map(board => board.key)).toEqual(['runs']);
  });

  it('climbs its own ladder: 750, 7,500 and 25,000 runs', () => {
    expect(TIERS.map(tier => tier.at.super10)).toEqual([0, 750, 7500, 25000]);
    expect(standingOf('super10', { ...emptySuper10(), runs: 749 }).tier.key).toBe('debutant');
    expect(standingOf('super10', { ...emptySuper10(), runs: 750 }).tier.key).toBe('emerging');
    expect(standingOf('super10', { ...emptySuper10(), runs: 25000 }).tier.key).toBe('hitman');
  });
});

describe("Super10's Batters board", () => {
  // The innings ball by ball: a list of runs, and 'W' for a wicket.
  const play = (...balls: (number | 'W')[]) => balls.map(ball => ({ runs: ball === 'W' ? 0 : ball, isWicket: ball === 'W' }));
  /** Sixty balls: the opener out for 26 off 10, No. 2 not out with the rest. */
  const sixty = play(6, 4, 1, 6, 0, 4, 1, 0, 4, 'W', ...Array.from({ length: 50 }, (_, i) => (i % 5 === 0 ? 6 : 1)));
  const teamOf = (balls: ReturnType<typeof play>): Super10Innings => ({
    runs: balls.reduce((n, b) => n + b.runs, 0), balls: balls.length, wickets: balls.filter(b => b.isWicket).length,
    fours: balls.filter(b => b.runs === 4).length, sixes: balls.filter(b => b.runs === 6).length,
  });
  const stores = () => {
    const names = new Map<string, string>();
    return { team: memoryStore<Super10Innings>(names), solo: memoryStore<SoloInnings>(names) };
  };
  const send = (innings: Super10Figures, playerId = 'mfj2k1-abcdefghijkl', name = 'Gayle'): Submission<Super10Figures> =>
    ({ playerId, name, avatar: 2, innings, address: 'here' });

  it('splits an innings between the batters, the next one in after each wicket', () => {
    const batters = battersOf(sixty);
    expect(batters).toHaveLength(2);
    expect(batters[0]).toEqual({ runs: 26, balls: 10, fours: 3, sixes: 2, out: true });
    expect(batters[1]).toMatchObject({ balls: 50, out: false, sixes: 10 });
    expect(super10BattersPlausible(teamOf(sixty), batters)).toBe(true);
  });

  it('takes the best of the five, not out above out on level runs', () => {
    const best = super10SoloOf([
      { runs: 40, balls: 20, fours: 4, sixes: 2, out: true },
      { runs: 40, balls: 30, fours: 4, sixes: 2, out: false },
      { runs: 12, balls: 10, fours: 0, sixes: 2, out: false },
    ]);
    expect(best).toEqual({ runs: 40, balls: 30, out: false, order: 2, left: false });
  });

  it('refuses batters that do not add up to the side, or a man not out before the last', () => {
    const team = teamOf(sixty), batters = battersOf(sixty);
    expect(super10BattersPlausible(team, batters.map((b, i) => (i ? { ...b, runs: b.runs + 1 } : b)))).toBe(false);
    expect(super10BattersPlausible(team, [{ ...batters[0], out: false }, batters[1]])).toBe(false);
    expect(super10BattersPlausible(team, [...batters, { runs: 0, balls: 0, fours: 0, sixes: 0, out: false }])).toBe(false);
    expect(super10BattersPlausible(team, undefined)).toBe(false);
    expect(super10BattersPlausible(team, readSuper10({ ...team, batters: [{ ...batters[0], out: 'yes' }, batters[1]] }).batters)).toBe(false);
  });

  it('writes the team total and the best batter from one post', async () => {
    const both = stores();
    const taken = await submitSuper10(both, send({ ...teamOf(sixty), batters: battersOf(sixty) }), at);
    if (refused(taken)) throw new Error(taken.reason);
    expect(taken.improved).toBe(true);
    expect(taken.solo).toMatchObject({ improved: true, standing: { rank: 1, total: 1, was: null } });
    const read = await readSuper10Boards(both);
    expect(read.rows[0]).toMatchObject({ runs: teamOf(sixty).runs, name: 'Gayle' });
    expect(read.solo.rows[0]).toMatchObject({ runs: battersOf(sixty)[1].runs, out: false, order: 2, name: 'Gayle', avatar: 2 });
    expect(taken.board).toEqual(read);
  });

  it('still takes the team total when the batters are missing or do not hold up', async () => {
    const both = stores();
    const old = await submitSuper10(both, send(teamOf(sixty)), at);
    if (refused(old)) throw new Error(old.reason);
    expect(old.solo).toBeUndefined();
    const wrong = await submitSuper10(both, send({ ...teamOf(sixty), batters: [battersOf(sixty)[0]] }, 'mfj2k1-zzzzzzzzzzzz', 'Pollard'), at);
    if (refused(wrong)) throw new Error(wrong.reason);
    const read = await readSuper10Boards(both);
    expect(read.rows.map(row => row.name)).toEqual(['Gayle', 'Pollard']);
    expect(read.solo.rows).toEqual([]);
    expect((await readSuper10Standing(both, 'mfj2k1-abcdefghijkl')).solo.rank).toBeNull();
  });

  it('draws the five by title, not out starred', () => {
    const rows = [{ runs: 64, balls: 31, out: false, order: 3, left: false, handle: 'h', name: 'Gayle', avatar: 1, score: 9 }];
    const body = super10SoloBody(rows, null, null, NO_CONTEXT, at);
    expect(body.rows[0]).toMatchObject({ score: '64*', sub: 'No. 3 · 31 balls' });
  });
});
