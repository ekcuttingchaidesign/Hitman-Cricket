import { afterEach, describe, expect, it, vi } from 'vitest';
import { ballsBand, counting, scoreBand } from '../src/game/analytics';

const at = (hostname: string, search = '') => counting({ hostname, search });

describe('who gets counted', () => {
  it('counts a player on the live game', () => {
    expect(at('hitman-cricket.vercel.app')).toBe(true);
    expect(at('hitman-cricket.vercel.app', '?utm_source=whatsapp')).toBe(true);
  });

  it('does not count the dev server', () => {
    expect(at('localhost')).toBe(false);
    expect(at('127.0.0.1')).toBe(false);
    expect(at('::1')).toBe(false);
  });

  it('does not count a scripted innings', () => {
    // The browser checks play through with a fixed seed, and the debug flag is
    // how a tuning session is opened. Neither is somebody playing the game.
    expect(at('hitman-cricket.vercel.app', '?seed=7')).toBe(false);
    expect(at('hitman-cricket.vercel.app', '?debug=1')).toBe(false);
    expect(at('hitman-cricket.vercel.app', '?debug=0')).toBe(true);
  });
});

describe('the score bands', () => {
  it('reads the innings the way a cricketer would', () => {
    expect(scoreBand(0)).toBe('score-0-9');
    expect(scoreBand(9)).toBe('score-0-9');
    expect(scoreBand(10)).toBe('score-10-24');
    expect(scoreBand(24)).toBe('score-10-24');
    expect(scoreBand(25)).toBe('score-25-49');
    expect(scoreBand(50)).toBe('score-50-74');
    expect(scoreBand(75)).toBe('score-75-99');
    expect(scoreBand(100)).toBe('score-100-plus');
    // Thirty balls, every one of them a six.
    expect(scoreBand(180)).toBe('score-100-plus');
  });

  it('never invents a band between two of them', () => {
    const bands = new Set(Array.from({ length: 181 }, (_, runs) => scoreBand(runs)));
    expect(bands.size).toBe(6);
  });
});

/**
 * The gate, loaded fresh each time.
 *
 * `enabled` is settled once when the module loads, off a `location` that does
 * not exist under the node runner — so a gate test that imports the module
 * normally passes whatever it asserts, because nothing was ever going to be
 * sent. Each case here stubs a live host and a counter, then re-imports.
 */
async function counted() {
  const count = vi.fn();
  vi.stubGlobal('location', { hostname: 'hitman-cricket.vercel.app', search: '' });
  vi.stubGlobal('window', { goatcounter: { count } });
  vi.resetModules();
  return { count, analytics: await import('../src/game/analytics') };
}

describe('counting a moment', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends a moment once the counter is there', async () => {
    const { count, analytics } = await counted();
    analytics.track('innings-start');
    expect(count).toHaveBeenCalledTimes(1);
  });

  it('only counts a once-moment once', async () => {
    const { count, analytics } = await counted();
    analytics.trackOnce('help-open');
    analytics.trackOnce('help-open');
    expect(count).toHaveBeenCalledTimes(1);
  });

  it('keeps the two innings apart by name', async () => {
    // GoatCounter has no custom properties, so the mode is in the name or it is
    // nowhere. A Test match reports `survive-innings-start`; the five-over
    // innings reports `innings-start`, and neither is counted as the other.
    const { count, analytics } = await counted();
    analytics.track('innings-start');
    analytics.track('survive-innings-start');
    expect(count).toHaveBeenNthCalledWith(1, expect.objectContaining({ path: 'innings-start' }));
    expect(count).toHaveBeenNthCalledWith(2, expect.objectContaining({ path: 'survive-innings-start' }));
  });
});

describe('how far he got', () => {
  it('cuts the bands where the mode\u2019s own furniture is', () => {
    // Nine off four balls and nine off forty are the same row on a score band
    // and two completely different innings.
    expect(ballsBand(0)).toBe('balls-under-1-over');
    expect(ballsBand(5)).toBe('balls-under-1-over');
    expect(ballsBand(6)).toBe('balls-1-3-overs');
    expect(ballsBand(17)).toBe('balls-1-3-overs');
    expect(ballsBand(18)).toBe('balls-3-5-overs');
    expect(ballsBand(29)).toBe('balls-3-5-overs');
    expect(ballsBand(30)).toBe('balls-5-8-overs');
    expect(ballsBand(47)).toBe('balls-5-8-overs');
    expect(ballsBand(48)).toBe('balls-8-10-overs');
    expect(ballsBand(60)).toBe('balls-8-10-overs');
  });

  it('never invents a band between two of them', () => {
    const bands = new Set(Array.from({ length: 61 }, (_, balls) => ballsBand(balls)));
    expect(bands.size).toBe(5);
  });
});
