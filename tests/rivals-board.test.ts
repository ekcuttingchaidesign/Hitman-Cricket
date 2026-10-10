import { describe, expect, it } from 'vitest';
import { rivalsRankingMarkup, rivalsRowMarkup } from '../src/ui/RivalsBoard';
import type { RivalsRow } from '../src/game/challenge-api';

const ME = 'abc123-defghijklmno';
const row = (over: Partial<RivalsRow> = {}): RivalsRow =>
  ({ playerId: 'abc124-zzzzzzzzzzzz', name: 'Rohit', avatar: 1, won: 3, lost: 1, runs: 1204, ...over });

describe('the Rivals board', () => {
  it('shows wins, losses and runs a row, in the table columns', () => {
    const html = rivalsRowMarkup(row(), 0, false);
    expect(html).toContain('<span class="rv-rank-w">3</span>');
    expect(html).toContain('<span class="rv-rank-l">1</span>');
    expect(html).toContain('<span class="rv-rank-runs">1,204</span>');
  });

  it('lights your row, and calls it You', () => {
    const html = rivalsRankingMarkup({ rows: [row(), row({ playerId: ME, name: 'Virat', won: 1 })], youId: ME });
    expect(html.match(/is-you/g)).toHaveLength(1);
    expect(html).toContain('<b>You</b>');
    expect(html).toContain('Top 50 by matches won, then fewest lost, then runs.');
  });

  it('says so when nobody is on it, and while it is fetching', () => {
    const empty = rivalsRankingMarkup({ rows: [], youId: ME });
    expect(empty).toContain('Nobody is on it yet');
    expect(rivalsRankingMarkup({ rows: [], state: 'loading' })).toContain('Fetching the board');
    expect(rivalsRankingMarkup({ rows: [], state: 'loading' })).not.toContain('Nobody is on it yet');
  });

  it('says what counts, and escapes a name', () => {
    const html = rivalsRankingMarkup({ rows: [row({ name: '<b>x</b>' })] });
    expect(html).toContain('Register a name to appear here');
    expect(html).not.toContain('<b>x</b>');
  });
});
