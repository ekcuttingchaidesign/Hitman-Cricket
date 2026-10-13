import { describe, expect, it } from 'vitest';
import {
  cleanRecap, factsOf, foldInnings, foldUnlocks, totalsOf, whenOf, type InningsFacts,
} from '../src/game/recap';
import { memoryRecap, recordInnings, recordUnlocks } from '../src/server/recap-store';
import { memoryDressing, saveDressing } from '../src/server/dressing-save';
import type { BlastTally, MarathonTally, SurviveTally } from '../src/game/career';
import type { SavedDressing } from '../src/game/dressing-sync';

const PLAYER = 'abc1234-0123456789ab';
const OTHER = 'xyz9876-ba9876543210';
/** Noon in India on a day in March. */
const MARCH = Date.UTC(2026, 2, 4, 6, 30);

const blast = (patch: Partial<BlastTally> = {}): BlastTally => ({
  runs: 63, sixes: 4, fours: 5, wickets: 2, dots: 8, balls: 30, individual: 63, hundreds: 0, ...patch,
});
const survive = (patch: Partial<SurviveTally> = {}): SurviveTally => ({
  runs: 104, balls: 80, wickets: 0, blows: 1, health: 70, sixes: 6, fours: 9, ...patch,
});
const marathon = (scores: number[]): MarathonTally => ({
  runs: scores.reduce((a, b) => a + b, 0), balls: 200, fours: 20, sixes: 5, ending: 'ALL_OUT',
  batters: scores.map(runs => ({ runs, balls: 60, fours: 6, sixes: 1, out: true, retired: false })),
} as unknown as MarathonTally);
const facts = (patch: Partial<InningsFacts> = {}): InningsFacts => ({
  runs: 40, balls: 30, fours: 3, sixes: 2, fifties: 0, hundreds: 0, won: false, ...patch,
});

describe('the year recap, folded', () => {
  it('reads the day and the hour in India, and the year turns there', () => {
    expect(whenOf(MARCH)).toEqual({ year: 2026, day: '03-04', hour: 12 });
    // Half past midnight on New Year's Day in India is still the old year in London.
    expect(whenOf(Date.UTC(2026, 11, 31, 19, 0))).toEqual({ year: 2027, day: '01-01', hour: 0 });
  });

  it('counts fifties, hundreds and a win off each mode the way the mode keeps them', () => {
    expect(factsOf('classic', blast())).toMatchObject({ runs: 63, fifties: 1, hundreds: 0, won: false });
    expect(factsOf('classic', blast({ individual: 104, hundreds: 1 }))).toMatchObject({ fifties: 0, hundreds: 1 });
    expect(factsOf('survive', survive())).toMatchObject({ runs: 104, hundreds: 1, won: true });
    expect(factsOf('survive', survive({ runs: 40, wickets: 1 }))).toMatchObject({ won: false, fifties: 0 });
    expect(factsOf('marathon', marathon([120, 55, 3]))).toMatchObject({ runs: 178, fifties: 1, hundreds: 1 });
  });

  it('adds each innings to its mode, its kit and bat, its day and hour', () => {
    const look = { kit: 'electric', bat: 'venom' } as const;
    let year = foldInnings(null, 'classic', facts({ runs: 40 }), look, MARCH);
    year = foldInnings(year, 'classic', facts({ runs: 71, fifties: 1 }), look, MARCH + 3_600_000);
    year = foldInnings(year, 'marathon', facts({ runs: 210, hundreds: 1 }), { kit: 'home', bat: 'venom' }, MARCH + 86_400_000);
    expect(year.innings).toBe(3);
    expect(year.modes.classic).toMatchObject({ innings: 2, runs: 111, best: 71, fifties: 1 });
    expect(year.modes.marathon).toMatchObject({ innings: 1, best: 210, hundreds: 1 });
    expect(year.kits).toEqual({ electric: 2, home: 1 });
    expect(year.bats).toEqual({ venom: 3 });
    expect(year.days).toEqual({ '03-04': 2, '03-05': 1 });
    expect(year.hours).toEqual({ 12: 2, 13: 1 });
    expect([year.first, year.last]).toEqual([MARCH, MARCH + 86_400_000]);
  });

  it('counts an innings with no look sent without inventing one', () => {
    const year = foldInnings(null, 'survive', facts(), null, MARCH);
    expect(year.kits).toEqual({});
    expect(year.bats).toEqual({});
    expect(year.innings).toBe(1);
  });

  it('never dates the kit and bat everybody starts with', () => {
    expect(foldUnlocks(null, ['kit:home', 'bat:plain', 'kit:crimson'], MARCH).dated).toEqual(['kit:crimson']);
  });

  it('dates a piece of the room once, on the day it was first won', () => {
    const first = foldUnlocks(null, ['bat:boom'], MARCH);
    expect(first.dated).toEqual(['bat:boom']);
    const again = foldUnlocks(first.recap, ['bat:boom', 'kit:electric'], MARCH + 1000);
    expect(again.dated).toEqual(['kit:electric']);
    expect(again.recap.unlocked).toEqual({ 'bat:boom': MARCH, 'kit:electric': MARCH + 1000 });
  });

  it('raises the totals for everybody, and counts a player once a year', () => {
    const look = { kit: 'gold', bat: 'rage' } as const;
    expect(totalsOf('survive', facts({ won: true, hundreds: 1 }), look, MARCH, true)).toMatchObject({
      innings: 1, 'innings:survive': 1, 'wins:survive': 1, hundreds: 1, 'kit:gold': 1, 'bat:rage': 1,
      'day:03-04': 1, 'hour:12': 1, players: 1,
    });
    expect(totalsOf('classic', facts(), null, MARCH, false)).not.toHaveProperty('players');
  });

  it('reads back only what is a record', () => {
    expect(cleanRecap(null)).toBeNull();
    expect(cleanRecap({ innings: 'lots' })).toBeNull();
    expect(cleanRecap({ innings: 2, first: 1, last: 2 })).toMatchObject({ innings: 2, kits: {}, unlocked: {} });
  });
});

describe('the year recap, kept', () => {
  it('folds each counted innings into the player and the year', async () => {
    const store = memoryRecap();
    await recordInnings(store, { playerId: PLAYER, mode: 'classic', tally: blast(), look: { kit: 'electric', bat: 'venom' }, at: MARCH });
    await recordInnings(store, { playerId: PLAYER, mode: 'classic', tally: blast({ runs: 12, individual: 12 }), look: { kit: 'electric', bat: 'boom' }, at: MARCH });
    await recordInnings(store, { playerId: OTHER, mode: 'survive', tally: survive(), look: { kit: 'home', bat: 'plain' }, at: MARCH });
    expect((await store.read(2026, PLAYER))?.modes.classic).toMatchObject({ innings: 2, runs: 75, best: 63, fifties: 1 });
    expect(store.totals(2026)).toMatchObject({
      players: 2, innings: 3, 'innings:classic': 2, 'kit:electric': 2, 'bat:venom': 1, 'bat:boom': 1, 'wins:survive': 1,
    });
  });

  it('keeps nothing for what is not a player', async () => {
    const store = memoryRecap();
    await recordInnings(store, { playerId: 'nobody', mode: 'classic', tally: blast(), look: null, at: MARCH });
    expect(store.totals(2026)).toEqual({});
  });

  it('counts how many players won each piece, once each', async () => {
    const store = memoryRecap();
    await recordUnlocks(store, { playerId: PLAYER, keys: ['bat:boom'], at: MARCH });
    await recordUnlocks(store, { playerId: PLAYER, keys: ['bat:boom'], at: MARCH + 5 });
    await recordUnlocks(store, { playerId: OTHER, keys: ['bat:boom', 'kit:crimson'], at: MARCH });
    expect(store.totals(2026)).toEqual({ 'unlock:bat:boom': 2, 'unlock:kit:crimson': 1 });
    expect((await store.read(2026, PLAYER))?.unlocked).toEqual({ 'bat:boom': MARCH });
  });

  it('is told by a Dressing Room save which pieces it brought in for the first time', async () => {
    const dressing = memoryDressing();
    const copy = (seen: string[]): SavedDressing => ({ outfit: 'home', bat: 'plain', pickedAt: 0, launch: null, seen, shown: [], visited: false });
    const first = await saveDressing(dressing, { playerId: PLAYER, dressing: copy(['kit:home', 'bat:boom']), address: 'a' });
    expect(first.ok && first.won).toEqual(['kit:home', 'bat:boom']);
    const again = await saveDressing(dressing, { playerId: PLAYER, dressing: copy(['bat:boom', 'kit:crimson']), address: 'a' });
    expect(again.ok && again.won).toEqual(['kit:crimson']);
  });
});
