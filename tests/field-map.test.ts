import { describe, expect, it } from 'vitest';
import { fieldFor } from '../src/game/super10-field';
import { fieldMapMarkup } from '../src/ui/FieldMap';

/** Each man's dot, as the map draws it: how far from the batter at the centre, and whether he is back. */
function dots(markup: string) {
  return [...markup.matchAll(/class="s10-man( is-deep)?"[^>]*translate\(([\d.]+)px,([\d.]+)px\)/g)]
    .map(([, deep, x, y]) => ({ deep: !!deep, r: Math.hypot(+x - 50, +y - 50) }));
}
const ring = (markup: string) => +/class="s10-ring" cx="50" cy="50" r="([\d.]+)"/.exec(markup)![1];

describe('the field map', () => {
  it('draws every man in the ring inside the dashed circle and every boundary rider out by the rope, well apart', () => {
    for (const [bowler, over] of [['SWING', 0], ['SEAM', 6], ['SPIN', 3], ['SLING', 4], ['DEATH', 7]] as const) {
      const markup = fieldMapMarkup(fieldFor({ bowler, over }));
      const circle = ring(markup), men = dots(markup);
      expect(men).toHaveLength(9);
      const inner = men.filter(m => !m.deep).map(m => m.r), outer = men.filter(m => m.deep).map(m => m.r);
      for (const r of inner) expect(r).toBeLessThan(circle);
      for (const r of outer) expect(r).toBeGreaterThan(circle + 8);
      // Square of the wicket the ground is twenty-eight metres, and drawn to scale the two were a few points apart.
      expect(Math.min(...outer) - Math.max(...inner)).toBeGreaterThan(12);
    }
  });

  it('gives every man a ring to be lit by when he takes the ball', () => {
    const markup = fieldMapMarkup(fieldFor({ bowler: 'DEATH', over: 7 }));
    expect(markup.match(/class="s10-halo"/g)).toHaveLength(9);
  });
});
