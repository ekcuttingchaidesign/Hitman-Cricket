import { afterEach, describe, expect, it, vi } from 'vitest';
import { blastLights, clockLights, keepLights, nextTurn } from '../src/game/lights';

const store = () => {
  const kept = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => { kept.set(key, value); },
  });
  return kept;
};

/** A local time on an ordinary day: the tests read the hour the way the game does. */
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute);

describe('day or night, for the Blast, by the player\'s clock', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is night from six in the evening to seven in the morning, day otherwise', () => {
    expect(clockLights(at(2, 6, 59))).toBe('night');
    expect(clockLights(at(2, 7, 0))).toBe('day');
    expect(clockLights(at(2, 13))).toBe('day');
    expect(clockLights(at(2, 17, 59))).toBe('day');
    expect(clockLights(at(2, 18, 0))).toBe('night');
    expect(clockLights(at(2, 23, 30))).toBe('night');
    expect(clockLights(at(2, 0, 15))).toBe('night');
  });

  it('turns next at six in the evening by day, and at seven in the morning by night', () => {
    expect(nextTurn(at(2, 9, 40))).toEqual(at(2, 18));
    expect(nextTurn(at(2, 21, 10))).toEqual(at(3, 7));
    expect(nextTurn(at(2, 2, 5))).toEqual(at(2, 7));
  });

  it('follows the clock when the player has not chosen', () => {
    store();
    expect(blastLights('', at(2, 12))).toBe('day');
    expect(blastLights('', at(2, 20))).toBe('night');
  });

  it('keeps the player\'s choice until the clock next turns, then gives the clock back', () => {
    store();
    keepLights('day', at(2, 21));
    expect(blastLights('', at(2, 23))).toBe('day');
    expect(blastLights('', at(3, 6, 59))).toBe('day');
    expect(blastLights('', at(3, 7, 0))).toBe('day');
    expect(blastLights('', at(3, 18, 0))).toBe('night');
    keepLights('night', at(4, 12));
    expect(blastLights('', at(4, 17))).toBe('night');
    expect(blastLights('', at(4, 18, 30))).toBe('night');
    expect(blastLights('', at(5, 8))).toBe('day');
  });

  it('lets the clock decide over a choice an earlier build kept with no end to it', () => {
    const kept = store();
    kept.set('hitman-lights', 'day');
    expect(blastLights('', at(2, 22))).toBe('night');
    kept.set('hitman-lights', 'night');
    expect(blastLights('', at(2, 10))).toBe('day');
  });

  it('lets a link override everything, and ignores what it does not understand', () => {
    store();
    keepLights('day', at(2, 21));
    expect(blastLights('?lights=night', at(2, 22))).toBe('night');
    expect(blastLights('?lights=dusk', at(2, 22))).toBe('day');
  });

  it('follows the clock with no storage at all', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } });
    expect(() => keepLights('day')).not.toThrow();
    expect(blastLights('', at(2, 20))).toBe('night');
    expect(blastLights('', at(2, 10))).toBe('day');
  });
});
