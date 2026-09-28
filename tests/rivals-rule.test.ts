import { describe, expect, it, vi } from 'vitest';
import { GAME } from '../src/config/gameplay';

/**
 * The Rivals board with the rule against farming switched on: a match counts
 * only when somebody else in it has a registered name.
 *
 * It is off in the game for now (see `src/config/rivals.ts`), and this file is
 * what keeps it working for the day it is switched back on. The switch is a
 * constant, so it is set here for this file alone.
 */
const rule = vi.hoisted(() => ({ on: true }));
vi.mock('../src/config/rivals', () => ({
  get RIVALS_NEED_REGISTERED_RIVAL() { return rule.on; },
}));

const { createChallenge, joinChallenge, readMine, readRivalsBoard, recordBalls } = await import('../src/server/challenge-store');
const { memoryChallenges } = await import('../src/server/memory-store');
const { foldName } = await import('../src/server/board-store');
const { rivalsBoardMarkup } = await import('../src/ui/RivalsBoard');

const HOST = 'abcdef-abcdefghijkl';
const FRIEND = 'abcdeg-mnopqrstuvwx';
const T0 = Date.UTC(2026, 8, 1, 12, 0, 0);
const card = (runs: number) =>
  ('6'.repeat(Math.floor(runs / 6)) + '1'.repeat(runs % 6)).padEnd(GAME.totalBalls, '0');
const host = { playerId: HOST, name: 'VK', avatar: 0, address: '1.2.3.4' };
const friend = { playerId: FRIEND, name: 'Rahul', avatar: 1, address: '1.2.3.4' };

type Store = ReturnType<typeof memoryChallenges>;
const register = (store: Store, name: string, id: string) => store.names.set(foldName(name), id);
const board = async (store: Store) =>
  (await readRivalsBoard(store)).rows.map(row => [row.name, row.won, row.lost, row.runs]);
async function match(store: Store, hostRuns: number, friendRuns: number, at = T0) {
  const made = await createChallenge(store, host, at);
  if (!made.ok) throw new Error(made.reason);
  await recordBalls(store, made.code, { ...host, card: card(hostRuns) }, at + 1000);
  await joinChallenge(store, made.code, friend, at + 2000);
  await recordBalls(store, made.code, { ...friend, card: card(friendRuns) }, at + 3000);
  return made.code;
}

describe('the Rivals board, with the rule against farming on', () => {
  it('leaves out a match against a made-up name, and keeps it on the record', async () => {
    rule.on = true;
    const store = memoryChallenges();
    register(store, 'VK', HOST);
    await match(store, 50, 12);
    // The host's win was against a name nobody holds, so it does not count;
    // the friend's loss was against a real one, but they have no name to show.
    expect(await board(store)).toEqual([]);
    const mine = await readMine(store, HOST, T0 + 10_000);
    expect(mine.ok && 'record' in mine && mine.record).toEqual({ won: 1, lost: 0, drawn: 0 });
  });

  it('counts a match against a registered name', async () => {
    rule.on = true;
    const store = memoryChallenges();
    register(store, 'VK', HOST);
    register(store, 'Rahul', FRIEND);
    await match(store, 40, 24);
    expect(await board(store)).toEqual([['VK', 1, 0, 40], ['Rahul', 0, 1, 24]]);
  });

  it('takes a player off the board when it is switched on and nothing of theirs counts any more', async () => {
    rule.on = false;
    const store = memoryChallenges();
    register(store, 'VK', HOST);
    await match(store, 40, 24);
    expect(await board(store)).toEqual([['VK', 1, 0, 40]]);
    rule.on = true;
    await readMine(store, HOST, T0 + 10_000);
    expect(await board(store)).toEqual([]);
  });

  it('says so under the board', () => {
    rule.on = true;
    expect(rivalsBoardMarkup({ rows: [] })).toContain('has a registered name');
    rule.on = false;
    expect(rivalsBoardMarkup({ rows: [] })).not.toContain('has a registered name');
  });
});
