import { describe, expect, it } from 'vitest';
import { playedBefore, shotsCompass, shotsDue } from '../src/ui/ShotsIntro';

/** A browser's storage, as `read` sees it. */
const held = (store: Record<string, string>) => (key: string) => store[key] ?? null;
const DAY = '2026-10-08';

describe('how to hit, before a first innings', () => {
  it('is shown to a browser that has never batted here', () => {
    expect(shotsDue(held({}), DAY)).toBe(true);
    // Today's visit is written on load, before the first ball: still new.
    expect(shotsDue(held({ 'hitman-visits': JSON.stringify({ first: DAY, last: DAY, days: 1 }) }), DAY)).toBe(true);
  });

  it('is shown once', () => {
    expect(shotsDue(held({ 'hitman-shots-intro': 'done' }), DAY)).toBe(false);
  });

  it('is not shown to anybody who has batted here before', () => {
    expect(shotsDue(held({ 'hitman-best': '0' }), DAY)).toBe(false);
    expect(shotsDue(held({ 'hitman-career-key': '{"code":"abc"}' }), DAY)).toBe(false);
    expect(shotsDue(held({ 'hitman-marathon-intro': '1' }), DAY)).toBe(false);
    expect(shotsDue(held({ 'hitman-visits': JSON.stringify({ first: '2026-09-30', last: '2026-10-01', days: 2 }) }), DAY)).toBe(false);
  });

  it('takes a visits record that does not parse as no record', () => {
    expect(playedBefore(held({ 'hitman-visits': 'junk' }), DAY)).toBe(false);
  });

  it('is not shown where nothing can be remembered, or it would be every innings', () => {
    expect(shotsDue(() => { throw new Error('blocked'); }, DAY)).toBe(false);
  });
});

describe('the swipes it draws', () => {
  const names = (markup: string) => [...markup.matchAll(/<b>([^<]+)<\/b>/g)].map(m => m[1]);
  const keys = (markup: string) => [...markup.matchAll(/<kbd class="keyboard-only">([^<]+)<\/kbd>/g)].map(m => m[1]);

  it('are the six ordinary strokes, with their keys', () => {
    const right = shotsCompass(false);
    expect(names(right)).toEqual(['Pull', 'On drive', 'Straight drive', 'Cover drive', 'Cut', 'Block']);
    expect(keys(right)).toEqual(['A', 'A+W', 'W', 'W+D', 'D', 'S']);
  });

  it('are mirrored for a left-hander, with the keys staying on their side of the screen', () => {
    const left = shotsCompass(true);
    expect(left).toContain('rotate(90)');
    expect(names(left)[0]).toBe('Pull');
    // His pull is a swipe to the right, and the right-hand key plays it.
    expect(keys(left)).toEqual(['D', 'W+D', 'W', 'A+W', 'A', 'S']);
  });
});
