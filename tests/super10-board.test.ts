import { describe, expect, it } from 'vitest';
import {
  SUPER10_PACKED_BITS, packSuper10, super10Plausible, unpackSuper10, type Super10Innings,
} from '../src/game/super10-board';
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
