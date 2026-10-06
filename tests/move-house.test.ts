import { describe, expect, it } from 'vitest';
import { mintPlayerId, type IdStore } from '../src/game/identity';
import {
  forwardingAddress, homeHost, homeOrigin, moving, OLD_HOST, packUp, parcelIn, shouldUnpack, type Parcel,
} from '../src/game/move-house';

const at = (ms: number, fill = 'a') => mintPlayerId(ms, n => fill.repeat(n));
const store = (held: string | null, fault?: 'hangs'): IdStore => ({
  read: () => (fault === 'hangs' ? new Promise<string | null>(() => {}) : held),
  write: () => {},
});

/** Enough of a Storage for packUp to walk. */
const storage = (entries: Record<string, string>): Storage => {
  const keys = Object.keys(entries);
  return {
    length: keys.length,
    key: (i: number) => keys[i] ?? null,
    getItem: (key: string) => entries[key] ?? null,
  } as Storage;
};

describe('whether the move is switched on', () => {
  it('needs an https origin to move to', () => {
    expect(homeOrigin(undefined)).toBeNull();
    expect(homeOrigin('')).toBeNull();
    expect(homeOrigin('not a url')).toBeNull();
    expect(homeOrigin('http://hitmancricket.in')).toBeNull();
    expect(homeOrigin('https://hitmancricket.in/')).toBe('https://hitmancricket.in');
  });

  it('moves only the old production address, never a preview or the new one', () => {
    const home = 'https://hitmancricket.in';
    expect(moving({ hostname: OLD_HOST }, home)).toBe(true);
    expect(moving({ hostname: OLD_HOST }, null)).toBe(false);
    expect(moving({ hostname: 'hitman-cricket-git-claude-x-ek.vercel.app' }, home)).toBe(false);
    expect(moving({ hostname: 'hitmancricket.in' }, home)).toBe(false);
    expect(moving({ hostname: OLD_HOST }, `https://${OLD_HOST}`)).toBe(false);
  });

  it('prints whichever address is home on the key', () => {
    expect(homeHost('https://hitmancricket.in')).toBe('hitmancricket.in');
    expect(homeHost(null)).toBe(OLD_HOST);
  });
});

describe('packing up', () => {
  it('takes every hitman- key and the oldest id any store held', async () => {
    const older = at(1_600_000_000_000, 'b');
    const parcel = await packUp(
      [store(at(1_700_000_000_000)), store(older), store(null, 'hangs')],
      storage({ 'hitman-batter': '{"name":"Rohit","avatar":2}', 'hitman-career-key': 'yorker-sprint-cover-47', other: 'x' }),
      20,
    );
    expect(parcel.id).toBe(older);
    expect(parcel.local).toEqual({ 'hitman-batter': '{"name":"Rohit","avatar":2}', 'hitman-career-key': 'yorker-sprint-cover-47' });
  });

  it('mints nothing for a browser that has never played', async () => {
    expect(await packUp([store(null)], storage({}), 20)).toEqual({ id: null, local: {} });
  });
});

describe('the forwarding address', () => {
  const parcel: Parcel = { id: at(1_650_000_000_000), local: { 'hitman-batter': '{"name":"रोहित","avatar":1}' } };

  it('keeps the path and query, and carries the parcel in the fragment', () => {
    const href = forwardingAddress('https://hitmancricket.in', { pathname: '/feedback', search: '?mode=marathon' }, parcel);
    const url = new URL(href);
    expect(url.origin + url.pathname + url.search).toBe('https://hitmancricket.in/feedback?mode=marathon');
    expect(url.search).not.toContain('carry');
    expect(parcelIn(url.hash)).toEqual(parcel);
  });

  it('carries no fragment when there is nothing to carry', () => {
    expect(forwardingAddress('https://hitmancricket.in', { pathname: '/', search: '' }, { id: null, local: {} }))
      .toBe('https://hitmancricket.in/');
  });

  it('reads nothing out of a fragment that is not a parcel', () => {
    expect(parcelIn('')).toBeNull();
    expect(parcelIn('#demo')).toBeNull();
    expect(parcelIn('#carry=%%%')).toBeNull();
  });

  it('drops anything in a parcel that the game would not have written', () => {
    const forged = btoa(JSON.stringify({ id: 'nope', local: { 'hitman-best': '12', evil: 'x', 'hitman-n': 3 } }));
    expect(parcelIn(`#carry=${forged}`)).toEqual({ id: null, local: { 'hitman-best': '12' } });
  });
});

describe('unpacking over what is already here', () => {
  const old = at(1_600_000_000_000);
  const young = at(1_700_000_000_000);

  it('unpacks into a browser that has nobody', () => {
    expect(shouldUnpack({ id: old, local: {} }, null)).toBe(true);
  });

  it('lets the older player win, whole', () => {
    expect(shouldUnpack({ id: old, local: {} }, young)).toBe(true);
    expect(shouldUnpack({ id: young, local: {} }, old)).toBe(false);
  });

  it('does nothing when the same player follows the old link again', () => {
    expect(shouldUnpack({ id: old, local: { 'hitman-best': '1' } }, old)).toBe(false);
  });

  it('brings settings without an id only to a browser that has nobody', () => {
    expect(shouldUnpack({ id: null, local: { 'hitman-sound': '0' } }, null)).toBe(true);
    expect(shouldUnpack({ id: null, local: { 'hitman-sound': '0' } }, young)).toBe(false);
  });
});
