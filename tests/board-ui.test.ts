import { describe, expect, it } from 'vitest';
import { LAUNCH_MS, packScore, type BoardRow, type Innings } from '../src/game/leaderboard';
import { packSurvive, type SurviveRow } from '../src/game/survive-board';
import {
  NO_CONTEXT, blastBody, boardScreenMarkup, marathonBody, menuRank, surviveBody, type BoardContext, type BoardScreen,
} from '../src/ui/Board';

const AT = LAUNCH_MS + 60_000;
const innings = (runs: number, sixes = 4): Innings => ({ runs, sixes, fours: 3, wickets: 1, dots: 6, balls: 30 });
const blastRow = (i: number, runs: number): BoardRow => ({
  ...innings(runs, 10 - (i % 5)), playerId: `p${i}`, name: `Player${i}`, avatar: i % 5, score: packScore(innings(runs, 10 - (i % 5)), AT),
});
/** A full Blast board: fifty rows from 150 down. */
const fifty = Array.from({ length: 50 }, (_, i) => blastRow(i, 150 - i * 2));
const named: BoardContext = { ...NO_CONTEXT, you: { name: 'Shashank', avatar: 2 }, kit: 2, played: true, modeName: 'Blast' };

const screen = (over: Partial<BoardScreen>): BoardScreen => ({
  mode: 'classic', modes: [{ mode: 'classic', rank: '' }], ladder: 'best', ladders: [{ key: 'best', name: 'Top score', blurb: '' }],
  rows: [], state: 'ready', banner: null, dock: null, play: null, focus: 'top', rules: '', ...over,
});

describe('the board’s rows', () => {
  it('names the player’s own row You, with the sixes under every name', () => {
    const body = blastBody(fifty, 'p6', null, named, AT);
    expect(body.rows[6]).toMatchObject({ place: 7, you: true, score: '138' });
    expect(body.rows[0].sub).toBe('10 sixes');
    expect(body.dock?.sentence).toContain('#7');
    expect(body.dock?.detail).toBe('138 runs · 2 behind #6');
  });

  it('marks a Survival row with its result, and a not-out score with a star', () => {
    const won: SurviveRow = { runs: 100, balls: 30, wickets: 0, blows: 1, health: 60, playerId: 'a', name: 'Rohit', avatar: 1, score: 0 };
    const lost: SurviveRow = { runs: 71, balls: 44, wickets: 1, blows: 3, health: 20, playerId: 'b', name: 'Hardik', avatar: 2, score: 0 };
    won.score = packSurvive(won, AT); lost.score = packSurvive(lost, AT);
    const body = surviveBody([won, lost], null, null, NO_CONTEXT, AT);
    expect(body.rows.map(row => [row.chip, row.score])).toEqual([['W', '100*'], ['L', '71']]);
    expect(body.rows[1].sub).toBe('Bowled out · 44 balls');
  });

  it('says which of the three batters made a Marathon innings, and the strike rate on the podium', () => {
    const solo = [{ runs: 168, balls: 235, out: true, order: 1, left: false, playerId: 'a', name: 'Wasim', avatar: 0, score: 3 }];
    const body = marathonBody('solo', [], solo, null, null, NO_CONTEXT, AT);
    expect(body.rows[0].sub).toBe('Opener · 235 balls');
    expect(body.rows[0].podiumSub).toBe('Opener · SR 71.5');
  });
});

describe('what the board says after an innings', () => {
  const posted = (over: Partial<NonNullable<BoardContext['posted']>>): BoardContext => ({
    ...named, posted: { rank: 23, total: 400, was: null, improved: true, first: true, ...over },
  });

  it('a first entry: the place, NEW on the row, and opened on it', () => {
    const body = blastBody(fifty, 'p22', innings(106), posted({}), AT);
    expect(body.banner?.title).toBe('You entered the board at #23');
    expect(body.rows[22].tag).toEqual({ text: 'NEW', tone: 'new' });
    expect(body.rows[22].sub).toMatch(/^Your first innings/);
    expect(body.focus).toBe('you');
  });

  it('a new best that climbed: the places, and what it beat', () => {
    const was = { rank: 23, score: packScore(innings(106), AT) };
    const body = blastBody(fifty, 'p4', innings(142), posted({ rank: 5, was, first: false }), AT);
    expect(body.banner?.title).toBe('New best. Up 18 places to #5');
    expect(body.banner?.line).toBe('142 runs beat your 106.');
    expect(body.rows[4].tag).toEqual({ text: '▲ 18', tone: 'up' });
  });

  it('an innings that did not beat the best: the best still holds, BEST on the row', () => {
    const body = blastBody(fifty, 'p6', innings(92), posted({ rank: 7, improved: false, was: { rank: 7, score: 1 }, first: false }), AT);
    expect(body.banner?.title).toBe('92 this innings. Your best still holds #7');
    expect(body.rows[6].tag?.text).toBe('BEST');
  });

  it('outside the fifty: how far off, in the banner and in the dock', () => {
    const body = blastBody(fifty, null, innings(40), posted({ rank: 73 }), AT);
    expect(body.banner?.title).toBe('Your 40 is outside the top 50');
    expect(body.banner?.line).toBe('13 more runs would have made it.');
    expect(body.dock?.sentence).toContain('#73');
    expect(body.dock?.detail).toBe('40 runs · 13 off the top 50');
  });

  it('a player with no name: the innings stands where it would, and the dock asks for a name', () => {
    const body = blastBody(fifty.slice(0, 10), null, innings(141), { ...NO_CONTEXT, restore: true }, AT);
    const ghost = body.rows.find(row => row.ghost);
    expect(ghost?.place).toBe(6);
    expect(body.rows[6].place).toBe(7);
    expect(body.dock).toMatchObject({ ghost: true, restore: true });
    expect(body.dock?.sentence).toContain('#6');
  });

  it('top of the board, opened from anywhere', () => {
    const body = blastBody(fifty, 'p0', null, named, AT);
    expect(body.banner?.title).toBe('Top of the board');
    expect(body.banner?.line).toBe('2 runs clear of Player1.');
  });
});

describe('the screen', () => {
  it('leaves an open spot on the podium for each place nobody holds', () => {
    const two = blastBody(fifty.slice(0, 2), null, null, NO_CONTEXT, AT);
    const markup = boardScreenMarkup(screen({ rows: two.rows }));
    expect(markup.match(/lb-step is-\d is-open/g)).toHaveLength(1);
    expect(markup).toContain('#3 IS UP FOR GRABS');
    expect(boardScreenMarkup(screen({}))).toContain('THE BOARD IS WIDE OPEN');
  });

  it('says when the board cannot be reached, with a way to try again', () => {
    const markup = boardScreenMarkup(screen({ state: 'offline' }));
    expect(markup).toContain('CAN&rsquo;T REACH THE BOARD');
    expect(markup).toContain('id="board-retry"');
    expect(markup).not.toContain('lb-podium');
  });

  it('puts the player’s place for each mode in the menu', () => {
    expect(menuRank(12, true)).toBe('You are #12');
    expect(menuRank(null, true)).toBe('Not on this board yet');
    expect(menuRank(3, false)).toBe('No name yet');
  });
});
