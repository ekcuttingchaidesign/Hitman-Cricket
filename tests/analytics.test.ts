import { afterEach, describe, expect, it, vi } from 'vitest';
import { counting, scoreBand } from '../src/game/analytics';

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

describe('the innings that does not count', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends a classic moment', async () => {
    const { count, analytics } = await counted();
    analytics.track('innings-start');
    expect(count).toHaveBeenCalledTimes(1);
  });

  it('sends nothing while Survive is being played', async () => {
    const { count, analytics } = await counted();
    analytics.reporting(false);
    analytics.track('innings-start');
    analytics.trackOnce('first-shot');
    expect(count).not.toHaveBeenCalled();
  });

  it('counts again when the player goes back to the classic innings', async () => {
    const { count, analytics } = await counted();
    analytics.reporting(false);
    analytics.track('innings-start');
    analytics.reporting(true);
    analytics.track('innings-start');
    expect(count).toHaveBeenCalledTimes(1);
  });

  it('does not let a suspended moment burn its only turn', async () => {
    // trackOnce marks a name fired before track ever looks at the gate, so the
    // naive version of this would spend `first-shot` on a Survive innings that
    // sent nothing — and the player's first classic shot would go unreported
    // for the rest of the session.
    const { count, analytics } = await counted();
    analytics.reporting(false);
    analytics.trackOnce('first-shot', 'First shot played');
    analytics.reporting(true);
    analytics.trackOnce('first-shot', 'First shot played');
    expect(count).toHaveBeenCalledTimes(1);
    expect(count).toHaveBeenCalledWith({ path: 'first-shot', title: 'First shot played', event: true });
  });

  it('still only counts a once-moment once', async () => {
    const { count, analytics } = await counted();
    analytics.trackOnce('help-open');
    analytics.trackOnce('help-open');
    expect(count).toHaveBeenCalledTimes(1);
  });
});
