import { describe, expect, it } from 'vitest';
import { SUPER10_KIT_IDS } from '../src/game/super10-kits';
import { SQUADS, drawFrom, lineupOf, squadNames } from '../src/game/super10-squads';
import { battingCardMarkup, battingOf } from '../src/ui/EndCard';

/** A roll that hands back the given numbers in turn. */
const rolls = (...values: number[]) => { let i = 0; return () => values[i++ % values.length]; };

describe("Super10's squads", () => {
  it('gives every team five batters, two pace bowlers and two spinners, and nobody a surname twice', () => {
    const all = SUPER10_KIT_IDS.flatMap(id => squadNames(SQUADS[id]));
    expect(all).toHaveLength(54);
    const surnames = all.map(name => name.split(' ').slice(-1)[0].toUpperCase());
    expect(new Set(surnames).size).toBe(54);
  });

  it('keeps every name short enough for the card', () => {
    for (const id of SUPER10_KIT_IDS) for (const name of squadNames(SQUADS[id])) expect(name.length).toBeLessThanOrEqual(15);
  });

  it('draws two different batters, then a pace bowler and a spinner either way round', () => {
    const squad = SQUADS['s10-purple'];
    expect(drawFrom(squad, rolls(0, 0, 0, 0, 0))).toEqual(['Josh Butlin', 'Shubh Gilani', 'Jaspreet Bumra', 'Rasheed Khaan']);
    expect(drawFrom(squad, rolls(0.99, 0.99, 0.99, 0.99, 0.99))).toEqual(['Tilok Varman', 'Henrik Klassen', 'Washy Sunder', 'Pat Cummings']);
    for (let i = 0; i < 200; i++) {
      const [a, b, c, d] = drawFrom(squad);
      expect(squad.batters).toContain(a);
      expect(squad.batters).toContain(b);
      expect(a).not.toBe(b);
      expect([...squad.pace, ...squad.spin]).toContain(c);
      expect([squad.pace.includes(c), squad.pace.includes(d)].sort()).toEqual([false, true]);
    }
  });

  it('reaches every one of the forty sides, in every batting order', () => {
    const sides = new Set<string>(), orders = new Set<string>();
    for (let i = 0; i < 8000; i++) {
      const four = drawFrom(SQUADS['s10-violet']);
      sides.add([...four].sort().join('|'));
      orders.add(four.join('|'));
    }
    expect(sides.size).toBe(40);
    expect(orders.size).toBe(160);
  });

  it('opens with the player by name, as captain, then four of the kit\'s squad by full name', () => {
    const five = lineupOf('s10-purple', 'Shashank', rolls(0, 0, 0, 0, 0));
    expect(five.map(one => one.card)).toEqual(['SHASHANK (c)', 'JOSH BUTLIN', 'SHUBH GILANI', 'JASPREET BUMRA', 'RASHEED KHAAN']);
    expect(five[0].walkOut).toBe('OPENER · SHASHANK #10');
    expect(five[2].walkOut).toBe('NO. 3 · SHUBH GILANI #9');
    expect(five[4].walkOut).toBe('NO. 5 · RASHEED KHAAN #77');
  });

  it('opens as OPENER for a player with no name', () => {
    expect(lineupOf('s10-neon', null)[0]).toEqual({ card: 'OPENER', walkOut: 'OPENER IN · TAKE YOUR GUARD' });
    expect(lineupOf('s10-neon', '  ')[0].card).toBe('OPENER');
  });

  it('puts the names on the batting card, escaped', () => {
    const ball = (runs: number, isWicket = false) => ({ runs, isWicket }) as Parameters<typeof battingOf>[0][number];
    const card = battingCardMarkup(battingOf([ball(4), ball(0, true), ball(6)], lineupOf('s10-orange', '<b>', rolls(0))
      .map(one => one.card)));
    expect(card).toContain('&lt;B&gt; (c)');
    expect(card).toContain('DON BAVUMA');
    expect(card).not.toContain('<b>');
  });
});
