import { describe, expect, it } from 'vitest';
import { dotMatrix, matrixWidth } from '../src/ui/DotMatrix';

const lit = (svg: string) => (svg.split('matrix-lit')[1]?.match(/<circle/g) ?? []).length;
const dark = (svg: string) => (svg.split('matrix-lit')[0].match(/<circle/g) ?? []).length;

describe('the scoreboard lamps', () => {
  it('has a face for every character the board can show', () => {
    // Runs, wickets, overs, and the last-ball call — including a wicket and the
    // dash before a ball is bowled.
    for (const character of '0123456789./-W') {
      const svg = dotMatrix(character);
      expect(lit(svg), `${character} is unlit`).toBeGreaterThan(0);
      expect(svg, character).toContain('viewBox');
    }
  });
  it('draws the dark lamps as well as the lit ones', () => {
    // The unlit grid is what makes a panel read as a board rather than as text.
    const svg = dotMatrix('1');
    expect(dark(svg)).toBeGreaterThan(lit(svg));
    expect(dark(svg) + lit(svg)).toBe(5 * 7);
  });
  it('sizes the panel to the string it is given', () => {
    expect(matrixWidth('8')).toBe(5);
    expect(matrixWidth('88')).toBe(11);          // two faces and the gap between
    expect(matrixWidth('5.0')).toBe(5 + 1 + 2 + 1 + 5); // the stop is narrow
    expect(dotMatrix('132')).toContain(`viewBox="0 0 ${matrixWidth('132')} 7"`);
    expect(dotMatrix('132')).toContain(`--lamps:${matrixWidth('132')}`);
  });
  it('reads out what it displays, and never throws on a character it lacks', () => {
    expect(dotMatrix('6', '6 off the last ball')).toContain('aria-label="6 off the last ball"');
    expect(() => dotMatrix('?')).not.toThrow();
    expect(lit(dotMatrix('?'))).toBeGreaterThan(0);
  });
  it('lights the same lamps whichever case the call arrives in', () => {
    expect(lit(dotMatrix('w'))).toBe(lit(dotMatrix('W')));
  });
});
