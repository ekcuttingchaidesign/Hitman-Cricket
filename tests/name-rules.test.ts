import { describe, expect, it } from 'vitest';
import { foldName } from '../src/server/board-store';
import { areSiblings, siblingBase } from '../src/server/name-rules';

const sib = (a: string, b: string) => areSiblings(foldName(a), foldName(b));

describe('siblings: the same name but for a number on the end', () => {
  it('takes the number off the end and nothing else', () => {
    expect(siblingBase('rohit')).toBe('rohit');
    expect(siblingBase('rohit45')).toBe('rohit');
    expect(siblingBase('2fast')).toBe('2fast');
    expect(siblingBase('r2d2')).toBe('r2d');
  });
  it('makes "Name", "Name 1", "Name2" one family, whatever the spacing and case', () => {
    expect(sib('Rohit', 'Rohit 1')).toBe(true);
    expect(sib('Rohit 1', 'rohit2')).toBe(true);
    expect(sib('Virat18', 'Virat7')).toBe(true);
  });
  it('is not a sibling of itself, or of a different name', () => {
    expect(sib('Rohit', 'rohit')).toBe(false);
    expect(sib('Rohit', 'RohitS')).toBe(false);
    expect(sib('Rohit7', 'Rahul7')).toBe(false);
  });
  it('gives a name that is only a number no family', () => {
    expect(siblingBase('12345')).toBe('12345');
    expect(sib('12345', '123')).toBe(false);
  });
});
