import { describe, expect, it } from 'vitest';
import { CONFIDENCE_STEP, howToDue, LANE_ORDER, laneFor, playedBefore, SHOTS_STEP, shotsCompass, SURVIVE_SHOTS_STEP } from '../src/ui/ShotsIntro';

/** A browser's storage, as `read` sees it. */
const held = (store: Record<string, string>) => (key: string) => store[key] ?? null;
const DAY = '2026-10-08';

describe('how to hit, before a first innings', () => {
  const titles = (meter: boolean, store: Record<string, string>) => howToDue(meter, held(store), DAY).map(step => step.title);

  it('is the swipes and then the confidence meter, to a browser that has never batted here', () => {
    expect(howToDue(true, held({}), DAY)).toEqual([SHOTS_STEP, CONFIDENCE_STEP]);
    expect(CONFIDENCE_STEP.spot).toBe('confidence');
    expect(CONFIDENCE_STEP.tag).toBe('Confidence meter');
    // Today's visit is written on load, before the first ball: still new.
    expect(titles(true, { 'hitman-visits': JSON.stringify({ first: DAY, last: DAY, days: 1 }) })).toHaveLength(2);
  });

  it('is the swipes alone where the scoreboard has no confidence meter, saying what it is to win', () => {
    expect(howToDue(false, held({}), DAY)).toEqual([SURVIVE_SHOTS_STEP]);
    expect(SURVIVE_SHOTS_STEP.title).toBe(SHOTS_STEP.title);
    expect(SURVIVE_SHOTS_STEP.line).toMatch(/survive every ball for the draw/);
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
    expect(titles(true, { 'hitman-marathon-intro': '1' })).toEqual([]);
    expect(titles(true, { 'hitman-visits': JSON.stringify({ first: '2026-09-30', last: '2026-10-01', days: 2 }) })).toEqual([]);
  });

  it('is shown to a new player who has just claimed a name, and with it a career key', () => {
    expect(titles(true, { 'hitman-career-key': '{"code":"abc"}', 'hitman-profile': '1' })).toHaveLength(2);
  });

  it('takes a visits record that does not parse as no record', () => {
    expect(playedBefore(held({ 'hitman-visits': 'junk' }), DAY)).toBe(false);
  });

  it('is not shown where nothing can be remembered, or it would be every innings', () => {
    expect(howToDue(true, () => { throw new Error('blocked'); }, DAY)).toEqual([]);
  });
});

describe('the swipes it draws', () => {
  const names = (markup: string) => [...markup.matchAll(/class="hb-label"[^>]*><b>([^<]+)<\/b>/g)].map(m => m[1]);
  const keys = (markup: string) => [...markup.matchAll(/<kbd class="keyboard-only">([^<]+)<\/kbd>/g)].map(m => m[1]);
  const lanes = (markup: string) => [...markup.matchAll(/class="hb-lane" data-i="\d" d="M0 0L(-?[\d.]+) /g)].map(m => Math.sign(Number(m[1])));

  it('are seven lanes from the bat, named, with their keys, and the block as a caption', () => {
    const right = shotsCompass(false);
    expect(names(right)).toEqual(['Pull', 'On drive', 'Straight drive', 'Cover drive', 'Cut', 'Late cut', 'Hook']);
    expect(keys(right)).toEqual(['A', 'A+W', 'W', 'W+D', 'D', 'D+S', 'A+S']);
    expect(right).toMatch(/hb-caption is-block"><b class="touch-only">Swipe down<\/b><b class="keyboard-only">S<\/b>/);
    // Lit first, as drawn: the straight drive, a swipe up.
    expect(right).toContain('data-lit="2"');
    expect(right).toMatch(/is-lane"><b class="touch-only">Swipe up<\/b><b class="keyboard-only">W<\/b><span>=&nbsp;&nbsp;straight drive/);
  });

  it('are mirrored for a left-hander, with the keys staying on their side of the screen', () => {
    const left = shotsCompass(true);
    expect(names(left)[0]).toBe('Pull');
    // His pull goes off to the right, and the right-hand key plays it.
    expect(lanes(left)[0]).toBe(1);
    expect(lanes(shotsCompass(false))[0]).toBe(-1);
    expect(keys(left)).toEqual(['D', 'W+D', 'W', 'A+W', 'A', 'A+S', 'D+S']);
  });
  it('walks the light round all seven, and says when the hook is played', () => {
    expect([...LANE_ORDER].sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(laneFor(5).swipe).toBe('Swipe down-right'); expect(laneFor(5).caption).toBe('late cut');
    expect(laneFor(6).swipe).toBe('Swipe down-left'); expect(laneFor(6).caption).toBe('hook at a bouncer');
  });
});
