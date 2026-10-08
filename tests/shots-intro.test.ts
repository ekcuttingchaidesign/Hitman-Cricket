import { describe, expect, it } from 'vitest';
import { CONFIDENCE_STEP, howToDue, playedBefore, SHOTS_STEP, shotsCompass } from '../src/ui/ShotsIntro';

/** A browser's storage, as `read` sees it. */
const held = (store: Record<string, string>) => (key: string) => store[key] ?? null;
const DAY = '2026-10-08';

describe('how to hit, before a first innings', () => {
  const titles = (meter: boolean, store: Record<string, string>) => howToDue(meter, held(store), DAY).map(step => step.title);

  it('is the swipes and then the confidence meter, to a browser that has never batted here', () => {
    expect(howToDue(true, held({}), DAY)).toEqual([SHOTS_STEP, CONFIDENCE_STEP]);
    expect(CONFIDENCE_STEP.spot).toBe('confidence');
    // Today's visit is written on load, before the first ball: still new.
    expect(titles(true, { 'hitman-visits': JSON.stringify({ first: DAY, last: DAY, days: 1 }) })).toHaveLength(2);
  });

  it('is the swipes alone where the scoreboard has no confidence meter', () => {
    expect(howToDue(false, held({}), DAY)).toEqual([SHOTS_STEP]);
  });

  it('leaves the meter for later when only the swipes were shown', () => {
    expect(howToDue(true, held({ 'hitman-shots-intro': 'swipes', 'hitman-best': '12' }), DAY)).toEqual([CONFIDENCE_STEP]);
    expect(howToDue(false, held({ 'hitman-shots-intro': 'swipes' }), DAY)).toEqual([]);
  });

  it('is shown once', () => {
    expect(titles(true, { 'hitman-shots-intro': 'done' })).toEqual([]);
  });

  it('is not shown to anybody who has batted here before', () => {
    expect(titles(true, { 'hitman-best': '0' })).toEqual([]);
    expect(titles(true, { 'hitman-career-key': '{"code":"abc"}' })).toEqual([]);
    expect(titles(true, { 'hitman-marathon-intro': '1' })).toEqual([]);
    expect(titles(true, { 'hitman-visits': JSON.stringify({ first: '2026-09-30', last: '2026-10-01', days: 2 }) })).toEqual([]);
  });

  it('takes a visits record that does not parse as no record', () => {
    expect(playedBefore(held({ 'hitman-visits': 'junk' }), DAY)).toBe(false);
  });

  it('is not shown where nothing can be remembered, or it would be every innings', () => {
    expect(howToDue(true, () => { throw new Error('blocked'); }, DAY)).toEqual([]);
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
