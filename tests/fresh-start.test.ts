import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearThisDevice, forgetFreshFlag, freshWanted } from '../src/game/fresh-start';

/**
 * A clean slate that is not clean is worse than none: it leaves a "new" player
 * holding half an old one, and every test walked on top of it is a lie. So what
 * is checked here is mostly that nothing is left behind.
 */
describe('asking for a clean slate', () => {
  it('is asked for by the address and by nothing else', () => {
    expect(freshWanted({ search: '?fresh=1' })).toBe(true);
    expect(freshWanted({ search: '?demo=1&fresh=1' })).toBe(true);
    expect(freshWanted({ search: '' })).toBe(false);
    expect(freshWanted({ search: '?fresh=0' })).toBe(false);
    expect(freshWanted({ search: '?fresh' })).toBe(false);
    expect(freshWanted({ search: '?refresh=1' })).toBe(false);
  });
});

describe('what a clean slate clears', () => {
  const store = () => {
    const held = new Map<string, string>();
    return {
      get length() { return held.size; },
      key: (i: number) => [...held.keys()][i] ?? null,
      getItem: (k: string) => held.get(k) ?? null,
      setItem: (k: string, v: string) => { held.set(k, v); },
      removeItem: (k: string) => { held.delete(k); },
      clear: () => held.clear(),
      held,
    };
  };
  let local: ReturnType<typeof store>;
  let session: ReturnType<typeof store>;
  let deleted: string[];

  beforeEach(() => {
    local = store();
    session = store();
    deleted = [];
    vi.stubGlobal('localStorage', local);
    vi.stubGlobal('sessionStorage', session);
    vi.stubGlobal('document', { cookie: '' });
    vi.stubGlobal('location', { protocol: 'https:', search: '' });
    vi.stubGlobal('indexedDB', {
      deleteDatabase(name: string) {
        deleted.push(name);
        const request = {} as { onsuccess?: () => void };
        queueMicrotask(() => request.onsuccess?.());
        return request;
      },
    });
  });

  /**
   * By prefix rather than by name. There are sixteen keys today and there will
   * be seventeen the first time somebody adds one — a list would go stale
   * silently, and silently is the only way this can go wrong.
   */
  it('takes every key the game wrote, including ones nobody listed', async () => {
    for (const key of ['hitman-player', 'hitman-batter', 'hitman-career-key',
      'hitman-restore-offer', 'hitman-visits', 'hitman-something-invented-later']) {
      local.setItem(key, 'x');
    }
    await clearThisDevice();
    expect([...local.held.keys()]).toEqual([]);
  });

  it('leaves everybody else’s keys alone', async () => {
    local.setItem('hitman-player', 'mine');
    local.setItem('some-other-app', 'theirs');
    local.setItem('hitmanish', 'theirs');
    await clearThisDevice();
    expect([...local.held.keys()].sort()).toEqual(['hitmanish', 'some-other-app']);
  });

  it('clears the session as well as the browser’s longer memory', async () => {
    session.setItem('hitman-demo', '1');
    session.setItem('unrelated', 'keep');
    await clearThisDevice();
    expect([...session.held.keys()]).toEqual(['unrelated']);
  });

  it('expires the cookie the id is also kept in', async () => {
    await clearThisDevice();
    expect(document.cookie).toContain('hitman-player=');
    expect(document.cookie).toContain('max-age=0');
  });

  it('drops the database the id is kept in a third time', async () => {
    await clearThisDevice();
    expect(deleted).toEqual(['hitman-cricket']);
  });

  /**
   * A delete blocks while another tab holds the database open. Somebody left
   * staring at a screen that will not move is worse than one whose other tab
   * kept a stale id, so it is given a moment and then given up on.
   */
  it('gives up on a database another tab is holding rather than hanging', async () => {
    vi.stubGlobal('indexedDB', { deleteDatabase: () => ({}) });
    vi.useFakeTimers();
    const clearing = clearThisDevice();
    await vi.advanceTimersByTimeAsync(2000);
    await expect(clearing).resolves.toBeUndefined();
    vi.useRealTimers();
  });

  it('survives storage being switched off entirely', async () => {
    vi.stubGlobal('localStorage', { get length(): number { throw new Error('off'); } });
    vi.stubGlobal('sessionStorage', { get length(): number { throw new Error('off'); } });
    await expect(clearThisDevice()).resolves.toBeUndefined();
  });
});

describe('the flag afterwards', () => {
  it('comes off the address, so a reload is not a second question', () => {
    const replaced: string[] = [];
    vi.stubGlobal('location', { href: 'https://example.test/?fresh=1&seed=7' });
    vi.stubGlobal('history', { replaceState: (_a: unknown, _b: string, url: string) => replaced.push(url) });
    forgetFreshFlag();
    expect(replaced[0]).toBe('https://example.test/?seed=7');
    expect(replaced[0]).not.toContain('fresh');
  });
});
