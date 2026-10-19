import { describe, expect, it } from 'vitest';
import { LADDER, tookTheTop, topSpotView } from '../src/game/top-spot';

const row = (name: string, runs: number, you = false) => ({ name, avatar: 1, runs, you });
const board = [row('You', 154, true), row('Riya', 150), row('Kabir', 148), row('Meera', 145), row('Arjun', 141), row('Zoya', 139)];

describe('New #1', () => {
  it('plays only for the top taken: first now, and not first before', () => {
    expect(tookTheTop(1, 6)).toBe(true);
    expect(tookTheTop(1, null)).toBe(true);
    expect(tookTheTop(1, 1)).toBe(false);
    expect(tookTheTop(2, 6)).toBe(false);
    expect(tookTheTop(null, null)).toBe(false);
  });

  it('climbs past every row that stood above, and says by how much it is clear', () => {
    const view = topSpotView({ mode: 'classic', you: { name: 'Shashank', avatar: 1 }, rows: board, was: 6, measure: 'runs' })!;
    expect(view.above.map(one => one.name)).toEqual(['Riya', 'Kabir', 'Meera', 'Arjun']);
    expect(view.above).toHaveLength(LADDER);
    expect(view.start).toBe(LADDER);
    expect(view.top).toBe('TOP OF THE BLAST');
    expect(view.sub).toBe('154 · 4 clear of Riya');
    expect(view.clear).toBe('+4 CLEAR');
    expect(view.second?.name).toBe('Riya');
    expect(view.third?.name).toBe('Kabir');
    expect(view.you).toMatchObject({ label: '154', from: 6 });
  });

  it('from #3, goes past the two rows above it and nobody it was already ahead of', () => {
    const view = topSpotView({ mode: 'classic', you: { name: 'Shashank', avatar: 1 }, rows: board, was: 3, measure: 'runs' })!;
    expect(view.above.map(one => one.name)).toEqual(['Riya', 'Kabir']);
    expect(view.start).toBe(2);
  });

  it('a first innings on the board climbs past the four at the top', () => {
    const view = topSpotView({ mode: 'marathon', you: { name: 'Shashank', avatar: 1 }, rows: board, was: null, measure: 'runs' })!;
    expect(view.above).toHaveLength(LADDER);
    expect(view.top).toBe('TOP OF THE MARATHON');
    expect(view.colour).toBe('#1f8a55');
  });

  it('Survival says its result, not runs, and the first on an empty board says so', () => {
    const rows = [{ ...row('You', 40, true), line: 'Won off 38 balls' }, { ...row('Riya', 44), line: 'Won off 41 balls' }];
    const view = topSpotView({ mode: 'survive', you: { name: 'Shashank', avatar: 1 }, rows, was: 2, measure: 'result' })!;
    expect(view.sub).toBe('Won off 38 balls · ahead of Riya');
    expect(view.clear).toBe('NEW LEADER');
    const alone = topSpotView({ mode: 'classic', you: { name: 'Shashank', avatar: 1 }, rows: [row('You', 20, true)], was: null, measure: 'runs' })!;
    expect(alone.sub).toBe('20 · the first on the board');
    expect(alone.second).toBeNull();
  });

  it('needs the player on the board it is shown', () => {
    expect(topSpotView({ mode: 'classic', you: { name: 'Shashank', avatar: 1 }, rows: board.slice(1), was: 6, measure: 'runs' })).toBeNull();
  });
});
