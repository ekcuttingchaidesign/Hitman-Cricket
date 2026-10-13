import { describe, expect, it } from 'vitest';
import { cleanDressing, mergeDressing, sameDressing, type SavedDressing } from '../src/game/dressing-sync';
import { SAVE_LIMIT, memoryDressing, readSaved, saveDressing } from '../src/server/dressing-save';

const copy = (patch: Partial<SavedDressing> = {}): SavedDressing => ({
  outfit: 'home', bat: 'plain', pickedAt: 0, launch: null, seen: ['kit:home', 'bat:plain'], shown: ['kit:home', 'bat:plain'], visited: false, ...patch,
});
const PLAYER = 'abc1234-0123456789ab';

describe('a Dressing Room as it travels', () => {
  it('takes only kits and bats that are on the shelves, and only unlocks it knows', () => {
    expect(cleanDressing({ ...copy(), outfit: 'tartan' })).toBeNull();
    expect(cleanDressing({ ...copy(), bat: 'excalibur' })).toBeNull();
    expect(cleanDressing('nonsense')).toBeNull();
    const held = cleanDressing({ ...copy(), seen: ['kit:home', 'kit:home', 'bat:boom', 'bat:excalibur', 7], pickedAt: -4, launch: { classic: 'x', survive: 30 } });
    expect(held).toEqual({ ...copy(), seen: ['kit:home', 'bat:boom'], pickedAt: 0, launch: { classic: 0, survive: 30, marathon: 0 } });
  });

  it('keeps the later pick whole, never a kit from one device and a bat from another', () => {
    const phone = copy({ outfit: 'crimson', bat: 'boom', pickedAt: 200 });
    const laptop = copy({ outfit: 'forest', bat: 'savage', pickedAt: 100 });
    expect(mergeDressing(phone, laptop)).toMatchObject({ outfit: 'crimson', bat: 'boom', pickedAt: 200 });
    expect(mergeDressing(laptop, phone)).toMatchObject({ outfit: 'crimson', bat: 'boom', pickedAt: 200 });
  });

  it('keeps every unlock either has shown, the room once opened, and the earlier launch figures', () => {
    const a = copy({ seen: ['kit:home', 'bat:boom'], visited: true, launch: { classic: 400, survive: 20, marathon: 0 } });
    const b = copy({ seen: ['kit:crimson'], launch: { classic: 300, survive: 50, marathon: 10 } });
    const merged = mergeDressing(a, b);
    expect(merged.seen.sort()).toEqual(['bat:boom', 'kit:crimson', 'kit:home']);
    expect(merged.visited).toBe(true);
    expect(merged.launch).toEqual({ classic: 300, survive: 20, marathon: 0 });
    expect(mergeDressing(copy(), b).launch).toEqual(b.launch);
  });

  it('knows two copies that say the same thing, whatever order their unlocks are in', () => {
    expect(sameDressing(copy({ seen: ['kit:home', 'bat:plain'] }), copy({ seen: ['bat:plain', 'kit:home'] }))).toBe(true);
    expect(sameDressing(copy(), copy({ bat: 'boom' }))).toBe(false);
    expect(sameDressing(copy(), null)).toBe(false);
  });
});

describe('the store of them', () => {
  it('keeps a copy for a player and merges the next into it', async () => {
    const store = memoryDressing();
    expect(await readSaved(store, PLAYER)).toBeNull();
    await saveDressing(store, { playerId: PLAYER, dressing: copy({ outfit: 'crimson', pickedAt: 100, seen: ['kit:crimson'] }), address: 'a' });
    const answer = await saveDressing(store, { playerId: PLAYER, dressing: copy({ bat: 'boom', pickedAt: 50, seen: ['bat:boom'] }), address: 'a' });
    expect(answer).toMatchObject({ ok: true, saved: { outfit: 'crimson', bat: 'plain', pickedAt: 100 } });
    expect((await readSaved(store, PLAYER))!.seen.sort()).toEqual(['bat:boom', 'kit:crimson']);
  });

  it('turns away a copy for no player, a copy that is not one, and a loop', async () => {
    const store = memoryDressing();
    expect(await saveDressing(store, { playerId: 'me', dressing: copy(), address: 'a' })).toMatchObject({ ok: false, status: 400 });
    expect(await saveDressing(store, { playerId: PLAYER, dressing: { outfit: 'home' }, address: 'a' })).toMatchObject({ ok: false, status: 400 });
    expect(await readSaved(store, 'me')).toBeNull();
    for (let i = 0; i < SAVE_LIMIT; i++) await saveDressing(store, { playerId: PLAYER, dressing: copy(), address: 'b' });
    expect(await saveDressing(store, { playerId: PLAYER, dressing: copy(), address: 'b' })).toMatchObject({ ok: false, status: 429 });
  });

  it('reads a copy from before the shown list as having shown nothing but Boom and the free pair', () => {
    const old = { outfit: 'home', bat: 'plain', pickedAt: 0, launch: null, seen: ['kit:home', 'bat:plain', 'bat:boom', 'kit:crimson', 'bat:meg'], visited: true };
    expect(cleanDressing(old)?.shown).toEqual(['kit:home', 'bat:plain', 'bat:boom']);
    // Once kept, it is read as kept.
    expect(cleanDressing({ ...old, shown: ['bat:meg', 'bat:excalibur'] })?.shown).toEqual(['bat:meg']);
  });

  it('keeps every moment either copy has played', () => {
    const merged = mergeDressing(copy({ shown: ['kit:home', 'bat:meg'] }), copy({ shown: ['kit:crimson'] }));
    expect(merged.shown.sort()).toEqual(['bat:meg', 'kit:crimson', 'kit:home']);
    expect(sameDressing(copy({ shown: ['bat:meg'] }), copy({ shown: [] }))).toBe(false);
  });
});
