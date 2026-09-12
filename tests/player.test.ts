import { afterEach, describe, expect, it, vi } from 'vitest';
import { AVATARS } from '../src/config/board';
import { readPlayer, writePlayer } from '../src/game/player';

/** localStorage, as a map, so the preference can be tested without a browser. */
function fakeStorage(seed: Record<string, string> = {}) {
  const held = new Map(Object.entries(seed));
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => held.get(key) ?? null,
    setItem: (key: string, value: string) => { held.set(key, value); },
  });
  return held;
}

afterEach(() => vi.unstubAllGlobals());

describe('what this browser bats under', () => {
  it('has nobody until somebody has batted', () => {
    fakeStorage();
    expect(readPlayer()).toBeNull();
  });

  it('remembers the pair, so a second innings is one key rather than a form', () => {
    fakeStorage();
    writePlayer({ name: 'Rohit', avatar: 3 });
    expect(readPlayer()).toEqual({ name: 'Rohit', avatar: 3 });
  });

  it('treats a name that is only spaces as no name at all', () => {
    fakeStorage({ 'hitman-batter': JSON.stringify({ name: '   ', avatar: 1 }) });
    expect(readPlayer()).toBeNull();
  });

  it('falls back to the first kit rather than one that does not exist', () => {
    for (const avatar of [AVATARS, -1, 'blue', null, 1.5]) {
      fakeStorage({ 'hitman-batter': JSON.stringify({ name: 'Gilly', avatar }) });
      expect(readPlayer(), String(avatar)).toEqual({ name: 'Gilly', avatar: 0 });
    }
  });

  it('shrugs off whatever else is under the key', () => {
    for (const junk of ['', 'not json', '[]', 'null', '42']) {
      fakeStorage({ 'hitman-batter': junk });
      expect(readPlayer(), junk).toBeNull();
    }
  });

  it('stays playable when storage is switched off', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('disabled'); },
      setItem: () => { throw new Error('disabled'); },
    });
    expect(readPlayer()).toBeNull();
    expect(() => writePlayer({ name: 'Kaka', avatar: 0 })).not.toThrow();
  });
});
