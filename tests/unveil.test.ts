import { afterEach, describe, expect, it, vi } from 'vitest';
import { COMMIT, FLICK, REST, REVEAL, markUnveiled, settle, unveilDue } from '../src/game/unveil';
import { unveilMarkup } from '../src/ui/Unveil';

function fakeStorage(seed: Record<string, string> = {}) {
  const held = new Map(Object.entries(seed));
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => held.get(key) ?? null,
    setItem: (key: string, value: string) => { held.set(key, value); },
  });
  return held;
}

afterEach(() => vi.unstubAllGlobals());

describe('the covers, once', () => {
  it('are due for a browser that has never pulled them off', () => {
    fakeStorage();
    expect(unveilDue()).toBe(true);
  });

  it('are not due again once they have come off', () => {
    const held = fakeStorage();
    markUnveiled();
    expect(unveilDue()).toBe(false);
    // Under a hitman- key, so ?fresh=1 puts them back on.
    expect(held.get('hitman-unveiled')).toBe(REVEAL);
  });

  it('come back for a later reveal, which is a new key', () => {
    fakeStorage({ 'hitman-unveiled': 'some-earlier-update' });
    expect(unveilDue()).toBe(true);
  });

  it('are never put up where nothing can remember them coming off', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } });
    expect(unveilDue()).toBe(false);
    expect(() => markUnveiled()).not.toThrow();
  });
});

describe('where a let-go leaves the line', () => {
  it('finishes once more new ground shows than old', () => {
    expect(settle(COMMIT, 0)).toBe('open');
    expect(settle(0.1, 0.5)).toBe('open');
  });

  it('springs back short of that, when it was let go gently', () => {
    expect(settle(0.7, 0)).toBe('rest');
    expect(settle(COMMIT + 0.01, -0.2)).toBe('rest');
  });

  it('finishes on a flick to the left from anywhere it had been moved', () => {
    expect(settle(0.75, -FLICK)).toBe('open');
    // A flick to the right is somebody changing their mind.
    expect(settle(0.75, FLICK)).toBe('rest');
  });

  it('is not finished by a flick that never moved it off its rest', () => {
    expect(settle(REST, -3)).toBe('rest');
  });
});

describe('the screen', () => {
  const html = unveilMarkup();

  it('asks in one line, and says what is under it once it is off', () => {
    expect(html).toContain('Swipe to pull the covers off');
    expect(html).toContain('Covers off. Play on.');
    expect(html).toMatch(/id="unveil-play"[^>]*>PLAY</);
  });

  it('is a slider to whoever cannot see it, with both pictures described', () => {
    expect(html).toMatch(/role="slider"/);
    expect(html).toMatch(/aria-valuenow="\d+"/);
    const alts = [...html.matchAll(/alt="([^"]+)"/g)].map(match => match[1]);
    expect(alts).toHaveLength(2);
    for (const alt of alts) expect(alt.length).toBeGreaterThan(30);
  });

  it('starts with the line at rest and the old ground over the new', () => {
    expect(html).toContain(`--at:${REST * 100}%`);
    expect(html.indexOf('is-after')).toBeLessThan(html.indexOf('is-before'));
  });
});
