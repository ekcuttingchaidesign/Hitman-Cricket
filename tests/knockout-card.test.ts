import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/config/board', () => ({ avatarSrc: (n: number) => `avatars/${n}.webp` }));

import { knockoutCard, knockoutShareText, type KnockoutFinish } from '../src/game/KnockoutCard';

const finish = (over: Partial<KnockoutFinish> = {}): KnockoutFinish =>
  ({ won: false, place: 5, of: 12, name: 'Mojo', face: 3, runs: 41, balls: 18, sixes: 4, ...over });

describe('the Super Knockout share picture', () => {
  it('crowns the winner and says who was outlasted', () => {
    const view = knockoutCard(finish({ won: true, place: 1, runs: 96, balls: 30, sixes: 9 }));
    expect(view.title).toBe('WINNER');
    expect(view.line).toBe('OUTLASTED 11 · LAST ONE STANDING');
    expect(view.crowned).toBe(true);
    expect(view.ask).toBe('Can you outlast me?');
    expect(view.figures.map(one => `${one.value} ${one.label}`)).toEqual(['96 runs', '30 balls', '9 sixes']);
  });

  it('says where anybody else finished, with no crown', () => {
    const view = knockoutCard(finish());
    expect(view.title).toBe('5TH OF 12');
    expect(view.line).toBe('OUTLASTED 7 OF 11');
    expect(view.crowned).toBe(false);
    expect(view.ask).toBe('Can you do better?');
  });

  it('says the final for the one beaten in it, and first out for the last place', () => {
    expect(knockoutCard(finish({ place: 2 })).line).toBe('OUTLASTED 10 · BEATEN IN THE FINAL');
    expect(knockoutCard(finish({ place: 12 })).line).toBe('FIRST ONE OUT');
    expect(knockoutCard(finish({ place: 12 })).title).toBe('12TH OF 12');
  });

  it('counts one of anything as one', () => {
    const view = knockoutCard(finish({ runs: 1, balls: 1, sixes: 1 }));
    expect(view.figures.map(one => one.label)).toEqual(['run', 'ball', 'six']);
  });

  it('puts the name on the tag in capitals', () => {
    expect(knockoutCard(finish({ name: 'Riya K' })).tag).toBe('RIYA K');
  });

  it('sends words with the link, and never an id', () => {
    const won = knockoutShareText(finish({ won: true, place: 1, runs: 96, balls: 30 }), 'https://hitmancricket.in/');
    expect(won).toBe('Last one standing of 12 in Super Knockout, with 96 off 30. Can you outlast me? https://hitmancricket.in/');
    expect(knockoutShareText(finish(), 'https://hitmancricket.in/')).toBe('5th of 12 in Super Knockout, with 41 off 18. Can you do better? https://hitmancricket.in/');
  });
});
