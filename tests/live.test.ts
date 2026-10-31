import { describe, expect, it } from 'vitest';
import { BATTING_MS, ONLINE_MS, checkIn, liveStateOf, memoryLive, readLive } from '../src/server/live-store';
import { handleOf } from '../src/game/handle';

const KABIR = 'lx2k9a-abcdefghijkl1';
const RIYA = 'lx2k9b-abcdefghijkl2';
const names = new Map([['kabir', KABIR], ['riya', RIYA]]);
const store = () => memoryLive(folded => names.get(folded) ?? null);

describe('who is around', () => {
  it('keeps a named player under their handle, never their id', async () => {
    const live = store();
    expect(await checkIn(live, { playerId: KABIR, name: 'Kabir', avatar: 2, state: 'online', mode: null }, 1000)).toEqual({ ok: true });
    const list = await readLive(live, 2000);
    expect(list.players).toEqual([{ handle: handleOf(KABIR), name: 'Kabir', avatar: 2, state: 'online', mode: null }]);
    expect(JSON.stringify(list)).not.toContain(KABIR);
  });

  it('refuses a name that is somebody else’s, or none', async () => {
    const live = store();
    expect(await checkIn(live, { playerId: RIYA, name: 'Kabir', avatar: 0, state: 'online', mode: null })).toMatchObject({ ok: false, status: 403 });
    expect(await checkIn(live, { playerId: RIYA, name: '', avatar: 0, state: 'online', mode: null })).toMatchObject({ ok: false, status: 400 });
    expect(await checkIn(live, { playerId: 'nope', name: 'Riya', avatar: 0, state: 'online', mode: null })).toMatchObject({ ok: false, status: 400 });
    expect((await readLive(live)).players).toEqual([]);
  });

  it('puts the batting first, with their mode', async () => {
    const live = store();
    await checkIn(live, { playerId: KABIR, name: 'Kabir', avatar: 1, state: 'online', mode: 'classic' }, 5000);
    await checkIn(live, { playerId: RIYA, name: 'Riya', avatar: 3, state: 'batting', mode: 'super10' }, 1000);
    const list = await readLive(live, 6000);
    expect(list.players.map(p => [p.name, p.state, p.mode])).toEqual([['Riya', 'batting', 'super10'], ['Kabir', 'online', null]]);
  });

  it('forgets a player gone quiet, and a batting tab that stopped saying so', async () => {
    const live = store();
    await checkIn(live, { playerId: RIYA, name: 'Riya', avatar: 0, state: 'batting', mode: 'classic' }, 0);
    expect(liveStateOf({ name: 'Riya', avatar: 0, state: 'batting', mode: 'classic', at: 0 }, BATTING_MS + 1)).toBe('online');
    expect((await readLive(live, BATTING_MS + 1)).players[0]).toMatchObject({ state: 'online', mode: null });
    expect((await readLive(live, ONLINE_MS + 1)).players).toEqual([]);
    expect(await live.readAll()).toEqual({});
  });
});
