import { describe, expect, it } from 'vitest';
import { heroChip, heroView, type HeroInput } from '../src/game/rank-hero';
import { rankHeroMarkup } from '../src/ui/RankHero';

const base = (over: Partial<HeroInput> = {}): HeroInput => ({
  name: 'Shashank', modeName: 'THE BLAST', place: 6, was: 9, total: 1284, improved: true, measure: 'runs',
  innings: { runs: 181 }, best: { runs: 181 }, chase: null,
  around: { passed: [{ name: 'Zoya', avatar: 1, runs: 180 }, { name: 'Arnav', avatar: 2, runs: 178 }], passedCount: 3, next: { name: 'Meera', avatar: 4, runs: 183, place: 5 } },
  ...over,
});

describe('the rank hero, the end card’s player card', () => {
  it('climbed with a new best (E1): the place, UP and how far, the best in gold, who it surpassed and what the next one takes', () => {
    const view = heroView(base());
    expect(view.place).toBe(6);
    expect(view.chip).toEqual({ text: 'UP 3', tone: 'up' });
    expect(view.placeTone).toBe('up');
    expect(view.eyebrow).toBe('SHASHANK · THE BLAST');
    expect(view.head).toEqual({ text: 'New best 181', gold: '181' });
    expect(view.sub).toBe('of 1,284 on the board');
    expect(view.left).toEqual({ kind: 'surpassed', faces: [{ name: 'Zoya', avatar: 1 }, { name: 'Arnav', avatar: 2 }], more: 1, names: ['Zoya', 'Arnav'] });
    // 183 to beat: 184 surpasses it, three more than 181.
    expect(view.right).toEqual({ kind: 'next', who: { name: 'Meera', avatar: 4, runs: 183, place: 5 }, line: '3 runs to surpass' });
  });

  it('a best still standing (E2): HOLDS, the best that holds, this innings on the left, and the next one off the best', () => {
    const view = heroView(base({ improved: false, was: 6, innings: { runs: 148 }, best: { runs: 181 }, around: { passed: [], passedCount: 0, next: { name: 'Meera', avatar: 4, runs: 183, place: 5 } } }));
    expect(view.chip).toEqual({ text: 'HOLDS', tone: 'holds' });
    expect(view.placeTone).toBe('holds');
    expect(view.head).toEqual({ text: 'Best 181 stands', gold: null });
    expect(view.sub).toBe('This one 148 · 33 short');
    expect(view.left).toEqual({ kind: 'innings', figure: '148', line: 'No places moved' });
    expect(view.right?.kind === 'next' && view.right.line).toBe('3 runs to surpass');
  });

  it('a chase won (E3): the chase on the eyebrow, its verdict as the headline with their name in gold', () => {
    const view = heroView(base({ place: 4, was: 9, chase: { name: 'Kabir', target: 187, beat: true, title: 'You beat Kabir by 9', line: '196 vs 187 · up from #9' } }));
    expect(view.eyebrow).toBe('CHASE · KABIR’S 187');
    expect(view.head).toEqual({ text: 'You beat Kabir by 9', gold: 'Kabir' });
    expect(view.sub).toBe('196 vs 187 · up from #9');
    expect(view.left.kind).toBe('surpassed');
    expect(rankHeroMarkup(view)).toContain('You beat <b>Kabir</b> by 9');
  });

  it('a chase fallen short (E4): the near miss in place of the two answers', () => {
    const view = heroView(base({ place: 9, was: 9, improved: false, innings: { runs: 164 }, best: { runs: 175 }, chase: { name: 'Kabir', target: 187, beat: false, title: '23 short of Kabir', line: '164 vs 187 · still #9' } }));
    expect(view.chip.text).toBe('HOLDS');
    expect(view.left).toEqual({ kind: 'bar' });
    // The near miss is the whole width, and no trophy for a chase lost.
    expect(view.right).toBeNull();
    expect(view.trophy).toBe(false);
    expect(rankHeroMarkup(view, '<div class="ch-strip-bar"></div>')).toContain('class="rh-bar"><div class="ch-strip-bar">');
  });

  it('says one run to surpass, not one runs', () => {
    const view = heroView(base({ around: { passed: [], passedCount: 0, next: { name: 'Meera', avatar: 4, runs: 181, place: 5 } } }));
    expect(view.right?.kind === 'next' && view.right.line).toBe('1 run to surpass');
  });

  it('outside the fifty (E5): still a place, still a climb', () => {
    const view = heroView(base({ place: 87, was: 99, innings: { runs: 96 }, best: { runs: 96 }, around: { passed: [{ name: 'Dev', avatar: 1, runs: 95 }, { name: 'Ira', avatar: 2, runs: 94 }], passedCount: 12, next: { name: 'Aman', avatar: 3, runs: 98, place: 86 } } }));
    expect(view.chip.text).toBe('UP 12');
    expect(view.left.kind === 'surpassed' && view.left.more).toBe(10);
    expect(view.right?.kind === 'next' && view.right.line).toBe('3 runs to surpass');
  });

  it('a new #1 (E6): gold, how far clear of the old leader, and nobody ahead', () => {
    const view = heroView(base({ place: 1, was: 3, innings: { runs: 154 }, best: { runs: 154 }, around: { passed: [{ name: 'Riya', avatar: 0, runs: 150 }, { name: 'Kabir', avatar: 3, runs: 148 }], passedCount: 2, next: null } }));
    expect(view.placeTone).toBe('top');
    expect(view.sub).toBe('4 clear of Riya at the top');
    expect(view.right).toEqual({ kind: 'top' });
    expect(rankHeroMarkup(view)).toContain('Nobody ahead');
  });

  it('a first row on a board says NEW, and that it is the first', () => {
    const view = heroView(base({ was: null, around: { passed: [], passedCount: 0, next: { name: 'Meera', avatar: 4, runs: 183, place: 5 } } }));
    expect(view.chip).toEqual({ text: 'NEW', tone: 'new' });
    expect(view.left).toEqual({ kind: 'innings', figure: '181', line: 'Your first on this board' });
  });

  it('Survival is said in its result, and the next one is to surpass without a count of runs', () => {
    const view = heroView(base({ measure: 'result', innings: { runs: 40, line: 'Won off 38 balls' }, best: { runs: 40, line: 'Won off 38 balls' } }));
    expect(view.head).toEqual({ text: 'New best', gold: null });
    expect(view.sub).toBe('Won off 38 balls');
    expect(view.right?.kind === 'next' && view.right.line).toBe('Next to surpass');
  });

  it('puts the chip’s arrow only on a climb, and never prints a name it was not handed safely', () => {
    expect(heroChip(4, 9)).toEqual({ text: 'UP 5', tone: 'up' });
    expect(heroChip(4, 4)).toEqual({ text: 'HOLDS', tone: 'holds' });
    const markup = rankHeroMarkup(heroView(base({ around: { passed: [{ name: '<b>x</b>', avatar: 1, runs: 1 }], passedCount: 1, next: null } })));
    expect(markup).not.toContain('<b>x</b>');
  });
});
