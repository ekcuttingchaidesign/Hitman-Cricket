import { describe, expect, it } from 'vitest';
import {
  againLabel, beaten, chaseProgress, chipLine, close, introLine, mineLine, placeOnPassing, verdict, wanted, type Chase,
} from '../src/game/chase';

const kabir: Chase = { handle: '0123456789abcdef', name: 'Kabir', avatar: 1, mode: 'classic', target: 187, theirPlace: 4 };

describe('the chase', () => {
  it('wants one more than the target, and level is not beaten', () => {
    expect(wanted(kabir, 122)).toBe(66);
    expect(wanted(kabir, 187)).toBe(1);
    expect(beaten(kabir, 187)).toBe(false);
    expect(beaten(kabir, 188)).toBe(true);
    expect(wanted(kabir, 200)).toBe(0);
  });

  it('says what is wanted off how many in the Blast, and only what is wanted elsewhere', () => {
    expect(chipLine(kabir, 122, 18)).toEqual({ need: '66', off: '18', done: false });
    expect(chipLine({ ...kabir, mode: 'survive' }, 40, 50)).toEqual({ need: '148', off: null, done: false });
    expect(chipLine(kabir, 188, 6)).toEqual({ need: 'Passed Kabir', off: null, done: true });
  });

  it('fills the bar toward one more than the target, and beats inside ten', () => {
    expect(chaseProgress(kabir, 0)).toBe(0);
    expect(chaseProgress(kabir, 188)).toBe(1);
    expect(close(kabir, 177)).toBe(false);
    expect(close(kabir, 178)).toBe(true);
    expect(close(kabir, 188)).toBe(false);
  });
});

describe('the intro', () => {
  it('names the place to be had from below', () => {
    expect(introLine(kabir, { best: 175, place: 9 })).toBe('Beat it and you pass Kabir to go #4 on The Blast.');
    expect(introLine(kabir, { best: null, place: null })).toContain('#4');
  });

  it('says so when they are already above', () => {
    expect(introLine(kabir, { best: 190, place: 2 })).toMatch(/already above Kabir/);
  });

  it('says the player’s own best', () => {
    expect(mineLine({ best: 175, place: 9 })).toBe('Best 175 \u00b7 #9');
    expect(mineLine({ best: null, place: null })).toBe('No best yet');
  });

  it('takes their place on passing, or keeps a better one', () => {
    expect(placeOnPassing(kabir, { best: 175, place: 9 })).toBe(4);
    expect(placeOnPassing(kabir, { best: 190, place: 2 })).toBe(2);
  });
});

describe('the verdict', () => {
  it('beaten: by how many, and where it took them', () => {
    expect(verdict(kabir, 196, { now: 4, was: 9 })).toEqual({ beat: true, title: 'You beat Kabir by 9', line: '196 vs 187 \u00b7 up from #9', short: 0 });
  });

  it('short: by how many, and where they still stand', () => {
    expect(verdict(kabir, 164, { now: 9, was: 9 })).toEqual({ beat: false, title: '23 short of Kabir', line: '164 vs 187 \u00b7 still #9 on The Blast', short: 23 });
  });

  it('level: one more would have done it', () => {
    expect(verdict(kabir, 187, { now: null, was: null }).title).toBe('Level with Kabir');
  });

  it('offers it again by the figure', () => {
    expect(againLabel(kabir)).toBe('CHASE 187 AGAIN');
  });
});
