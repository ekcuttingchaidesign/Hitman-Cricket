import { describe, expect, it } from 'vitest';
import { KEY_WORDS, KEY_WORD_BITS } from '../src/game/key-words';

/**
 * The rules the list keeps.
 *
 * They are tested rather than trusted because the list is two hundred and
 * fifty-six words long and every one of them was typed by hand: the one that
 * breaks a rule is the one nobody notices, and the cost of noticing it late
 * is a key somebody has already written on paper.
 */
describe('the career key wordlist', () => {
  it('is exactly as long as a word is wide', () => {
    expect(KEY_WORDS).toHaveLength(2 ** KEY_WORD_BITS);
  });

  it('is all lower-case letters, four to seven of them', () => {
    const wrong = KEY_WORDS.filter(word => !/^[a-z]{4,7}$/.test(word));
    expect(wrong).toEqual([]);
  });

  it('holds no word twice', () => {
    expect(new Set(KEY_WORDS).size).toBe(KEY_WORDS.length);
  });

  /**
   * The rule that lets a key be typed rather than only pasted: four letters in,
   * a word is already decided, so somebody reading their own handwriting has
   * one word to reach rather than a choice between two.
   */
  it('decides every word by its first four letters', () => {
    const by = new Map<string, string[]>();
    for (const word of KEY_WORDS) {
      const stem = word.slice(0, 4);
      by.set(stem, [...(by.get(stem) ?? []), word]);
    }
    const shared = [...by.entries()].filter(([, words]) => words.length > 1);
    expect(shared).toEqual([]);
  });

  /**
   * Said down a phone, these pairs are one word. Within the list that is fatal
   * — there is no way to know which was meant. Outside it, a word that only
   * sounds like one of these opens nothing, so the attempt simply fails.
   */
  it('holds no two words that sound the same', () => {
    const SAME = [
      ['caught', 'court'], ['bails', 'bales'], ['medal', 'meddle'],
      ['thrown', 'throne'], ['weights', 'waits'], ['flex', 'flecks'],
      ['pacer', 'pacer'], ['boots', 'butes'], ['guard', 'gaurd'],
      ['crease', 'creese'], ['leave', 'leaf'], ['relay', 'relais'],
    ];
    const held = new Set(KEY_WORDS);
    const both = SAME.filter(([a, b]) => a !== b && held.has(a) && held.has(b));
    expect(both).toEqual([]);
  });
});
