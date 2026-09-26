import { describe, expect, it } from 'vitest';
import {
  isPlayerId, mintPlayerId, mintedAt, pickPlayerId, playerId, resolvePlayerId, type IdStore,
} from '../src/game/identity';

/** A store that holds what it is given, and can be told to break or to hang. */
const store = (held: string | null = null, fault?: 'throws' | 'hangs'): IdStore & { held: string | null } => ({
  held,
  read() {
    if (fault === 'throws') throw new Error('storage disabled');
    if (fault === 'hangs') return new Promise<string | null>(() => {});
    return this.held;
  },
  write(id: string) {
    if (fault === 'throws') throw new Error('storage disabled');
    if (fault === 'hangs') return new Promise<void>(() => {});
    this.held = id;
  },
});

const at = (ms: number) => mintPlayerId(ms, n => 'a'.repeat(n));

describe('what an id is', () => {
  it('mints one that is recognisably one', () => {
    expect(isPlayerId(mintPlayerId())).toBe(true);
  });

  it('mints a different one every time', () => {
    const minted = new Set(Array.from({ length: 200 }, () => mintPlayerId()));
    expect(minted.size).toBe(200);
  });

  it('carries the moment it was minted, so two copies can be told apart', () => {
    expect(mintedAt(at(1_700_000_000_000))).toBe(1_700_000_000_000);
  });

  it('turns down anything that is not one', () => {
    for (const junk of ['', 'null', 'undefined', '  ', 'abc', 'zzz-', '-aaaaaaaaaaaa', 42, null, undefined, {}]) {
      expect(isPlayerId(junk), String(junk)).toBe(false);
    }
  });
});

describe('choosing between the copies', () => {
  it('finds nothing in three empty stores', () => {
    expect(pickPlayerId([null, null, undefined])).toBeNull();
  });

  it('keeps the older of two ids, because the board already knows it', () => {
    const old = at(1_000_000_000_000), young = at(1_700_000_000_000);
    expect(pickPlayerId([young, old])).toBe(old);
    expect(pickPlayerId([old, young])).toBe(old);
  });

  it('settles a dead heat the same way whichever order they arrive in', () => {
    const a = mintPlayerId(1_000, n => 'a'.repeat(n));
    const b = mintPlayerId(1_000, n => 'b'.repeat(n));
    expect(pickPlayerId([a, b])).toBe(pickPlayerId([b, a]));
  });

  it('steps over a store holding junk rather than repairing it', () => {
    const good = at(1_000_000_000_000);
    expect(pickPlayerId(['not-an-id', good])).toBe(good);
  });
});

describe('settling the id across three stores', () => {
  it('mints one when every store is empty', async () => {
    const stores = [store(), store(), store()];
    const id = await resolvePlayerId(stores);
    expect(isPlayerId(id)).toBe(true);
    for (const s of stores) expect(s.held).toBe(id);
  });

  it('restores the player from whichever store survived', async () => {
    // The whole reason there are three: a wipe that takes two still leaves one.
    const kept = at(1_500_000_000_000);
    const stores = [store(), store(kept), store()];
    expect(await resolvePlayerId(stores)).toBe(kept);
    for (const s of stores) expect(s.held).toBe(kept);
  });

  it('writes the id back even to the stores that already had it', async () => {
    // A localStorage write is what pushes Safari's eviction clock back, so the
    // stores that agreed are written to as well.
    const kept = at(1_500_000_000_000);
    const stores = [store(kept), store(kept), store(kept)];
    expect(await resolvePlayerId(stores)).toBe(kept);
    for (const s of stores) expect(s.held).toBe(kept);
  });

  it('folds a browser that minted a second player back onto the first', async () => {
    const first = at(1_000_000_000_000), second = at(1_700_000_000_000);
    const stores = [store(second), store(first), store()];
    expect(await resolvePlayerId(stores)).toBe(first);
    for (const s of stores) expect(s.held).toBe(first);
  });

  it('treats a store that throws as one that is empty', async () => {
    const kept = at(1_500_000_000_000);
    const stores = [store(null, 'throws'), store(kept), store()];
    expect(await resolvePlayerId(stores)).toBe(kept);
    expect(stores[2].held).toBe(kept);
  });

  it('keeps the player when every store is broken', async () => {
    // A private window keeps nothing. The innings still has to be playable.
    const id = await resolvePlayerId([store(null, 'throws'), store(null, 'throws')]);
    expect(isPlayerId(id)).toBe(true);
  });

  it('mints through a supplied minter, so a caller can pin one', async () => {
    expect(await resolvePlayerId([store()], () => at(42))).toBe(at(42));
  });

  it('waits on a store that answers slowly rather than racing past it', async () => {
    const kept = at(1_500_000_000_000);
    const slow: IdStore = { read: () => new Promise(resolve => setTimeout(() => resolve(kept), 5)), write: () => {} };
    expect(await resolvePlayerId([store(), slow])).toBe(kept);
  });

  it('is left waiting by a store that hangs, which is what the timeout is for', async () => {
    // resolvePlayerId itself never gives up; playerId races it against a clock.
    let settled = false;
    void resolvePlayerId([store(null, 'hangs')]).then(() => { settled = true; });
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(settled).toBe(false);
  });
});

/**
 * The bug this guards against cost a player their identity rather than a
 * second of their time.
 *
 * `playerId` used to race all three stores against one clock and mint a fresh
 * id when the clock won — and hand that id back without writing it anywhere. On
 * a slow first paint or a cold IndexedDB, a returning player became a stranger
 * on every load: their board row was somebody else's, and a challenge they set
 * was one they could not prove was theirs. The instant stores are now read on
 * their own first, so the clock never comes near a browser that has been here.
 */
describe('settling on an id without losing one', () => {
  /** A store that cannot hang, which is what localStorage and the cookie are. */
  const instant = (held: string | null = null): IdStore & { held: string | null } => ({
    held,
    instant: true,
    read() { return this.held; },
    write(id: string) { this.held = id; },
  });

  it('takes the id an instant store holds, however long the slow one takes', async () => {
    const kept = at(1_500_000_000_000);
    const quick = instant(kept);
    // The kind of IndexedDB that caused this: it never answers at all.
    const id = await playerId([quick, store(null, 'hangs')], 40);
    expect(id).toBe(kept);
  });

  it('does it without waiting for the clock', async () => {
    const kept = at(1_500_000_000_000);
    const began = Date.now();
    await playerId([instant(kept), store(null, 'hangs')], 400);
    // Recognising a returning browser is a synchronous read, so it cannot have
    // spent anything like the timeout doing it.
    expect(Date.now() - began).toBeLessThan(200);
  });

  it('writes the minted id down when there was nothing to find', async () => {
    const local = instant(null);
    const cookie = instant(null);
    const id = await playerId([local, cookie, store(null, 'hangs')], 20);
    expect(isPlayerId(id)).toBe(true);
    // The whole failure was that this never happened, so the next load minted
    // another one.
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(local.held).toBe(id);
    expect(cookie.held).toBe(id);
  });

  it('gives the same browser the same id twice running', async () => {
    const local = instant(null);
    const cookie = instant(null);
    const stores = [local, cookie, store(null, 'hangs')];
    const first = await playerId(stores, 20);
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(await playerId(stores, 20)).toBe(first);
  });

  it('still reaches the slow store when the quick pair are empty', async () => {
    const kept = at(1_400_000_000_000);
    const slow: IdStore = { read: () => new Promise(resolve => setTimeout(() => resolve(kept), 5)), write: () => {} };
    expect(await playerId([instant(null), slow], 200)).toBe(kept);
  });
});
