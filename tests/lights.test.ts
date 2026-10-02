import { afterEach, describe, expect, it, vi } from 'vitest';
import { BLAST_DEFAULT, blastLights, keepLights } from '../src/game/lights';

const store = () => {
  const kept = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => { kept.set(key, value); },
  });
  return kept;
};

describe('day or night, for the Blast', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is night unless the player has asked for a day game', () => {
    store();
    expect(BLAST_DEFAULT).toBe('night');
    expect(blastLights('')).toBe('night');
  });

  it('keeps the player\'s choice', () => {
    const kept = store();
    keepLights('day');
    expect(kept.get('hitman-lights')).toBe('day');
    expect(blastLights('')).toBe('day');
    keepLights('night');
    expect(blastLights('')).toBe('night');
  });

  it('lets a link override both, and ignores what it does not understand', () => {
    store();
    keepLights('day');
    expect(blastLights('?lights=night')).toBe('night');
    expect(blastLights('?lights=dusk')).toBe('day');
  });

  it('falls back to night with no storage at all', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } });
    expect(() => keepLights('day')).not.toThrow();
    expect(blastLights('')).toBe('night');
  });
});
