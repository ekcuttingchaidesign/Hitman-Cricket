import { describe, expect, it } from 'vitest';
import { fallsOf, marathonShareText, scorecardMarkup, wormMarkup, type CardBatter, type CardTotal } from '../src/ui/MarathonCard';

const batter = (over: Partial<CardBatter> = {}): CardBatter => ({
  title: 'Opener', left: false, runs: 90, balls: 120, fours: 9, sixes: 2, out: true, retired: false, ...over,
});
const total: CardTotal = { runs: 160, balls: 210, fours: 15, sixes: 3, wickets: 2, overs: '35.0' };

describe('the falls of wicket', () => {
  it('puts each batter\'s end on the ball it came, and says how', () => {
    const falls = fallsOf([
      batter({ balls: 120, out: true }),
      batter({ balls: 60, out: false, retired: true }),
      batter({ balls: 30, out: false }),
    ]);
    expect(falls).toEqual([{ ball: 120, kind: 'out' }, { ball: 180, kind: 'retired' }]);
  });
});

describe('the worm', () => {
  const perBall = [...Array(60)].map((_, i) => [1, 0, 4, 0, 2, 6][i % 6]);

  it('draws one point a ball, from nought', () => {
    const svg = wormMarkup(perBall, []);
    const points = svg.match(/<polyline class="worm-line" points="([^"]+)"/)![1].split(' ');
    expect(points).toHaveLength(61);
    expect(svg).toContain('aria-label="Runs ball by ball: 130 off 60"');
  });

  it('marks each fall with a ball on the line, red for out and amber for carried off', () => {
    const svg = wormMarkup(perBall, [{ ball: 20, kind: 'out' }, { ball: 45, kind: 'retired' }]);
    expect(svg.match(/class="worm-fall is-out"/g)).toHaveLength(1);
    expect(svg.match(/class="worm-fall is-retired"/g)).toHaveLength(1);
    expect(svg).toContain('2 down');
  });

  it('labels round numbers only, and the last over with its unit', () => {
    const svg = wormMarkup(perBall, []);
    const runs = [...svg.matchAll(/class="worm-y"[^>]*>(\d+)</g)].map(m => Number(m[1]));
    expect(runs).toEqual([0, 50, 100, 150]);
    expect(svg).toMatch(/class="worm-x is-last"[^>]*>10 ov</);
  });

  it('copes with an innings of no balls at all', () => {
    expect(() => wormMarkup([], [])).not.toThrow();
  });
});

describe('the batting card', () => {
  it('writes a row a batter, runs, balls, fours, sixes and strike rate, and the total', () => {
    const html = scorecardMarkup([batter(), batter({ title: 'No. 3', left: true, runs: 70, balls: 90, fours: 6, sixes: 1, out: false })], total);
    expect(html).toContain('<b>Opener</b><small>out</small>');
    expect(html).toMatch(/is-runs">90<\/td>\s*<td>120<\/td><td>9<\/td><td>2<\/td><td>75.0<\/td>/);
    expect(html).toContain('<b>No. 3 <i>LH</i></b><small>not out</small>');
    expect(html).toContain('is-runs">70*</td>');
    expect(html).toMatch(/<b>Total<\/b><small>35.0 overs<\/small><\/th>\s*<td class="is-runs">160\/2<\/td>/);
  });

  it('says a retirement in words, and names whoever never got in', () => {
    const html = scorecardMarkup([batter({ out: false, retired: true })], total, ['No. 3', 'Tailender']);
    expect(html).toContain('<small>retired hurt</small>');
    expect(html).toContain('Did not bat: No. 3, Tailender');
  });
});

describe('the share', () => {
  it('sends the total, each batter, and the link', () => {
    const text = marathonShareText(total, [batter(), batter({ title: 'No. 3', runs: 70, balls: 90, out: false })], 'https://x.test/');
    expect(text).toBe('160/2 in a Test Marathon on Hitman Cricket — opener 90 (120), no. 3 70* (90). Can you bat longer? https://x.test/');
  });
});
