import { describe, expect, it } from 'vitest';
import { SUPER10_KIT_IDS } from '../src/game/super10-kits';
import { SQUADS, lineupOf } from '../src/game/super10-squads';
import { battingCardMarkup, battingOf } from '../src/ui/EndCard';

describe("Super10's squads", () => {
  it('gives every team four men, and nobody plays for two', () => {
    const all = SUPER10_KIT_IDS.flatMap(id => SQUADS[id].map(one => one.card.toUpperCase()));
    expect(all).toHaveLength(24);
    expect(new Set(all).size).toBe(24);
  });

  it('opens with the player by name, as captain, then the kit\'s squad by surname', () => {
    const five = lineupOf('s10-purple', 'Shashank');
    expect(five.map(one => one.card)).toEqual(['SHASHANK (c)', 'BUTLIN', 'GILANI', 'KHAAN', 'BUMRA']);
    expect(five[0].walkOut).toBe('OPENER · SHASHANK #10');
    expect(five[2].walkOut).toBe('NO. 3 · SHUBH GILANI #9');
    expect(five[4].walkOut).toBe('NO. 5 · JASPREET BUMRA #77');
  });

  it('keeps the rank and the particle where the joke or the name needs them', () => {
    expect(lineupOf('s10-violet', 'A').map(one => one.card)).toEqual(['A (c)', 'DE VILJOEN', 'KOHLE', 'DHARAN', 'DSP SIRAJ']);
    expect(lineupOf('s10-cherry', 'A')[2].card).toBe('RAHIL');
  });

  it('opens as OPENER for a player with no name', () => {
    const five = lineupOf('s10-neon', null);
    expect(five[0]).toEqual({ card: 'OPENER', walkOut: 'OPENER IN · TAKE YOUR GUARD' });
    expect(lineupOf('s10-neon', '  ')[0].card).toBe('OPENER');
  });

  it('puts the names on the batting card, escaped', () => {
    const ball = (runs: number, isWicket = false) => ({ runs, isWicket }) as Parameters<typeof battingOf>[0][number];
    const card = battingCardMarkup(battingOf([ball(4), ball(0, true), ball(6)], lineupOf('s10-orange', '<b>')
      .map(one => one.card)));
    expect(card).toContain('&lt;B&gt; (c)');
    expect(card).toContain('BAVUMA');
    expect(card).not.toContain('<b>');
  });
});
