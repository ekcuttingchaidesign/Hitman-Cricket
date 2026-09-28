import { describe, expect, it } from 'vitest';
import { rivalsBoardMarkup, rivalsRowMarkup } from '../src/ui/RivalsBoard';
import type { RivalsRow } from '../src/game/challenge-api';

const ME = 'abc123-defghijklmno';
const row = (over: Partial<RivalsRow> = {}): RivalsRow =>
  ({ playerId: 'abc124-zzzzzzzzzzzz', name: 'Rohit', avatar: 1, won: 3, lost: 1, runs: 1204, ...over });

describe('the Rivals board', () => {
  it('shows three figures a row, in the order the board ranks on', () => {
    const html = rivalsRowMarkup(row(), 0, false);
    const figures = [...html.matchAll(/<em class="is-(\w+)">([\d,]+)<small>(\w+)<\/small><\/em>/g)]
      .map(m => [m[2], m[3], m[1]]);
    // Each column carries its own class, which is what colours wins green and
    // losses red.
    expect(figures).toEqual([['3', 'won', 'won'], ['1', 'lost', 'lost'], ['1,204', 'runs', 'runs']]);
  });

  it('lights your row and says where you stand', () => {
    const html = rivalsBoardMarkup({ rows: [row(), row({ playerId: ME, name: 'Virat', won: 1 })], youId: ME });
    expect(html).toContain('You are <b>2nd</b> with 1 win.');
    expect(html.match(/is-you/g)).toHaveLength(1);
  });

  it('names the leader when you are not on it, and says so when nobody is', () => {
    expect(rivalsBoardMarkup({ rows: [row()], youId: ME })).toContain('Rohit leads with <b>3 wins</b>.');
    const empty = rivalsBoardMarkup({ rows: [], youId: ME });
    expect(empty).toContain('Nobody is on it yet');
    expect(rivalsBoardMarkup({ rows: [], state: 'loading' })).toContain('Fetching the board');
    expect(rivalsBoardMarkup({ rows: [], state: 'loading' })).not.toContain('Nobody is on it yet');
  });

  it('says what counts, and escapes a name', () => {
    const html = rivalsBoardMarkup({ rows: [row({ name: '<b>x</b>' })] });
    expect(html).toContain('Register a name to appear here');
    expect(html).not.toContain('<b>x</b>');
  });
});
