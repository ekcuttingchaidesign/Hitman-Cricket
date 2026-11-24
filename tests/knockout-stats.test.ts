import { describe, expect, it } from 'vitest';
import { EMPTY_KNOCKOUT_CAREER, type KnockoutStanding } from '../src/server/knockout-ledger';
import { knockoutBestRank, knockoutHeroMarkup, knockoutSlideMarkup, knockoutStats, knockoutTabMarkup } from '../src/ui/KnockoutStats';

/**
 * Super Knockout on My profile (`KnockoutStats.ts`, Figma section 42, S1 and
 * S2): what the tab says of a record, and of none.
 */
const places = (over: Partial<KnockoutStanding['places']> = {}): KnockoutStanding['places'] =>
  ({ points: { week: null, all: null }, wins: { week: null, all: null }, best: null, rate: null, ...over });
const standing = (career: Partial<KnockoutStanding['career']> | null, over: Partial<KnockoutStanding> = {}): KnockoutStanding =>
  ({ ok: true, week: '2026-11-16', career: career && { ...EMPTY_KNOCKOUT_CAREER, ...career }, places: places(), behind: null, ...over });

describe('Super Knockout on My profile', () => {
  it('says the record as the design has it: the week, the last five, six figures', () => {
    const view = knockoutStats({ pointsFrom: 3, standing: standing(
      { played: 46, wins: 3, top3: 11, places: 230, best: 92, bestPlace: 1, points: 140, last: [1, 6, 3, 9, 2], week: '2026-11-16', weekPoints: 23, weekWins: 1, weekPlayed: 4 },
      { places: places({ points: { week: 23, all: 40 }, wins: { week: 12, all: 9 }, best: 31 }), behind: 9 }) });
    expect(view.matches).toBe('46 matches played');
    expect(view.glance).toEqual([{ value: '23', label: 'points this week' }, { value: '#23', label: 'this week', place: true }, { value: '3', label: 'wins' }]);
    expect(view.week).toBe('23 points · 9 behind #22');
    expect(view.five.map(f => [f.word, f.top])).toEqual([['1st', true], ['6th', false], ['3rd', true], ['9th', false], ['2nd', true]]);
    expect(view.tiles.map(t => [t.label, t.value])).toEqual([
      ['Matches', '46'], ['Wins', '3'], ['Top 3', '11'], ['Highest total', '92'], ['Average finish', '5th'], ['Best rank', '#9'],
    ]);
    expect(view.tiles.find(t => t.label === 'Best rank')!.tone).toBe('rank');
  });

  it('says level, top of the week, and a week with nothing played', () => {
    const base = { played: 4, wins: 1, points: 8, places: 20, week: '2026-11-16', weekPoints: 5, weekPlayed: 2 };
    expect(knockoutStats({ pointsFrom: 3, standing: standing(base, { places: places({ points: { week: 3, all: 3 } }), behind: 0 }) }).week).toBe('5 points · level with #2');
    expect(knockoutStats({ pointsFrom: 3, standing: standing(base, { places: places({ points: { week: 1, all: 1 } }) }) }).week).toBe('5 points · top of the week');
    expect(knockoutStats({ pointsFrom: 3, standing: standing({ ...base, weekPoints: 1 }, { places: places({ points: { week: 2, all: 2 } }), behind: 4 }) }).week).toBe('1 point · 4 behind #1');
    expect(knockoutStats({ pointsFrom: 3, standing: standing({ ...base, weekPoints: 0, weekPlayed: 0 }) }).week).toBe('No match yet this week');
  });

  it('marks a match run away from in the last five, and pads what has not been played', () => {
    const view = knockoutStats({ pointsFrom: 3, standing: standing({ played: 2, places: 16, last: [0, 4] }) });
    expect(view.five.map(f => f.word)).toEqual(['Ran', '4th', '–', '–', '–']);
    expect(view.five[0]).toMatchObject({ ran: true, top: false });
    expect(view.tiles.find(t => t.label === 'Average finish')!.value).toBe('8th');
  });

  it('waits, for a player with no match: how the first points come, and dashes', () => {
    for (const none of [standing(null), null]) {
      const view = knockoutStats({ pointsFrom: 3, standing: none });
      expect(view.matches).toBe('Not played yet');
      expect(view.week).toBe('Finish top 3 in a match of 3 or more real players for your first points.');
      expect(view.glance.map(g => g.value)).toEqual(['0', '—', '0']);
      expect(view.five.map(f => f.word)).toEqual(['–', '–', '–', '–', '–']);
      expect(view.tiles.map(t => t.value)).toEqual(['0', '0', '0', '—', '—', '—']);
    }
  });

  it('takes the best place held on any ladder as the best rank', () => {
    expect(knockoutBestRank(places({ points: { week: 7, all: 12 }, wins: { week: null, all: 4 }, best: 9 }))).toBe(4);
    expect(knockoutBestRank(places())).toBeNull();
    expect(knockoutBestRank(null)).toBeNull();
  });

  it('draws on the rail’s own slide numbers and classes, so the rail moves it as it moves the careers', () => {
    const slide = { pointsFrom: 3, standing: standing({ played: 1, places: 5, last: [5] }) };
    expect(knockoutTabMarkup(4, true)).toMatch(/class="stats-dot mp-mode is-knockout is-on"[^>]*data-slide="4"/);
    expect(knockoutHeroMarkup(slide, { name: 'Mojo', avatar: 1 }, null, 4, false)).toMatch(/class="ps-hero mp-hero is-knockout" data-slide="4" aria-hidden="true"/);
    const markup = knockoutSlideMarkup(slide, true);
    expect(markup).toContain('class="stats-slide is-knockout" data-mode="knockout"');
    expect(markup).toContain('data-live="1"');
    expect((markup.match(/<li/g) ?? []).length).toBe(5);
    expect((markup.match(/class="st-tile[ "]/g) ?? []).length).toBe(6);
  });
});
