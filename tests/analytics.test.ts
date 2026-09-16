import { describe, expect, it } from 'vitest';
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
