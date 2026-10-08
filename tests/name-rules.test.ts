import { describe, expect, it } from 'vitest';
import { foldName } from '../src/server/board-store';
import { areSiblings, nameProblem, siblingBase } from '../src/server/name-rules';

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

describe('the rules a new name is held to', () => {
  const problem = (name: string) => nameProblem(name, foldName(name));
  it('takes names with numbers, accents and the four marks', () => {
    for (const name of ['Rohit', 'Virat18', '2Fast', 'Hitman45', "D'Souza", 'Zoë', 'MS.Dhoni_7', 'Big-Show']) {
      expect(problem(name), name).toBeNull();
    }
  });
  it('needs three letters or numbers, and one letter', () => {
    expect(problem('Ab')).toMatch(/At least 3/);
    expect(problem('A.B')).toMatch(/At least 3/);
    expect(problem('12345')).toMatch(/one letter/);
  });
  it('keeps to Latin letters, numbers and the four marks', () => {
    expect(problem('रोहित')).toMatch(/letters, numbers/);
    expect(problem('Rohit🔥')).toMatch(/letters, numbers/);
    expect(problem('Rohit@45')).toMatch(/letters, numbers/);
  });
  it('keeps a phone number off the board', () => {
    expect(problem('Rohit9876543')).toMatch(/phone number/);
    expect(problem('Rohit123456')).toBeNull();
  });
  it('keeps the official-looking names, whole', () => {
    expect(problem('Admin')).toMatch(/kept for the game/);
    expect(problem('Hitman Cricket')).toMatch(/kept for the game/);
    expect(problem('Hitman')).toMatch(/kept for the game/);
    expect(problem('Hitman45')).toBeNull();
  });
  it('turns the blocked words down too', () => {
    expect(problem('Gandu99')).toMatch(/isn't allowed/);
  });
});
