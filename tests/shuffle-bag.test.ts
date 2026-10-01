import { describe, expect, it } from 'vitest';
import { ShuffleBag } from '../src/game/ShuffleBag';
import { SeededRandom } from '../src/game/SeededRandom';

const five = ['teeth', 'flame', 'bolt', 'puff', 'star'] as const;

describe('the shuffle bag the special stroke’s bursts are dealt from', () => {
  it('deals every one before any comes round again', () => {
    const rng = new SeededRandom(7);
    const bag = new ShuffleBag(five, () => rng.next());
    for (let round = 0; round < 40; round++) {
      const dealt = five.map(() => bag.next());
      expect(new Set(dealt).size).toBe(five.length);
    }
  });

  it('never deals the same one twice running, across a reshuffle too', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const rng = new SeededRandom(seed);
      const bag = new ShuffleBag(five, () => rng.next());
      let last = bag.next();
      for (let i = 0; i < 60; i++) {
        const next = bag.next();
        expect(next).not.toBe(last);
        last = next;
      }
    }
  });

  it('with one thing in it, deals that', () => {
    const bag = new ShuffleBag(['teeth']);
    expect([bag.next(), bag.next()]).toEqual(['teeth', 'teeth']);
  });

  it('refuses to be empty', () => {
    expect(() => new ShuffleBag([])).toThrow();
  });
});
