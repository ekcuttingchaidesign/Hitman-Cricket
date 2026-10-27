import { describe, expect, it } from 'vitest';
import { emptyBlast, emptyMarathon, emptySurvive } from '../src/game/career';
import { walkOnCard } from '../src/game/walk-on-card';

const who = { name: 'Shashank', avatar: 3 };

describe('the walk-on\'s player card', () => {
  it('says DEBUTANT, and no figures, for a player who has never batted in the mode', () => {
    for (const [mode, career] of [['classic', emptyBlast()], ['marathon', emptyMarathon()], ['survive', emptySurvive()]] as const) {
      const card = walkOnCard(mode, career, who);
      expect(card.debut).toBe(true);
      expect(card.figures).toEqual([]);
      expect(card.name).toBe('Shashank');
    }
  });

  it('is a debut per mode: fifty Blasts are nothing to the Marathon', () => {
    expect(walkOnCard('classic', { ...emptyBlast(), innings: 50, runs: 2100 }, who).debut).toBe(false);
    expect(walkOnCard('marathon', emptyMarathon(), who).debut).toBe(true);
  });

  it('puts four of My Stats\' figures for the mode, the Blast\'s innings, runs, highest and sixes', () => {
    const card = walkOnCard('classic', { ...emptyBlast(), innings: 23, runs: 1204, highest: 181, sixes: 77 }, who);
    expect(card.debut).toBe(false);
    expect(card.modeName).toBe('The Blast');
    expect(card.figures).toEqual([
      { label: 'Innings', value: '23' }, { label: 'Runs', value: '1,204' }, { label: 'Highest', value: '181' }, { label: 'Sixes', value: '77' },
    ]);
  });

  it('the Marathon\'s best is the batter\'s own score, not the side\'s', () => {
    const card = walkOnCard('marathon', { ...emptyMarathon(), innings: 4, runs: 900, highest: 410, individual: 162, hundreds: 2 }, who);
    expect(card.figures.find(one => one.label === 'Best')?.value).toBe('162');
    expect(card.figures.find(one => one.label === '100s')?.value).toBe('2');
  });

  it('Survival counts the Tests survived and won', () => {
    const card = walkOnCard('survive', { ...emptySurvive(), innings: 9, runs: 400, wins: 3, draws: 2 }, who);
    expect(card.figures.map(one => one.label)).toEqual(['Innings', 'Survived', 'Won', 'Runs']);
    expect(card.figures.find(one => one.label === 'Won')?.value).toBe('3');
  });

  it('wears the rung: its key for the material and the medallion, and the pill\'s words as the player sheet\'s', () => {
    expect(walkOnCard('classic', emptyBlast(), who).tier).toBe('debutant');
    const emerging = walkOnCard('classic', { ...emptyBlast(), innings: 23, runs: 1204 }, who);
    expect(emerging.tier).toBe('emerging');
    expect(emerging.rung).toBe('EMERGING PLAYER');
    // The Marathon says which game's rung it is.
    expect(walkOnCard('marathon', { ...emptyMarathon(), innings: 3, runs: 210, balls: 300 }, who).rung).toBe('TEST DEBUTANT');
  });

  it('calls a player with no name You, as the rest of the game does', () => {
    expect(walkOnCard('classic', emptyBlast(), { name: '', avatar: 0 }).name).toBe('You');
  });
});
