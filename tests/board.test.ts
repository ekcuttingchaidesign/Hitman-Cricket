import { describe, expect, it } from 'vitest';
import { GAME } from '../src/config/gameplay';
import { SeededRandom } from '../src/game/SeededRandom';
import { inventInnings, inventedBoard } from '../src/game/board-fixture';
import { BOARD_SIZE, compareRows, decidedBy, plausible, unpackScore } from '../src/game/leaderboard';
import type { BoardRow, Innings } from '../src/game/leaderboard';
import {
  AVATAR_COLOURS, asInnings, boardMarkup, cutLabel, cutoff, decider, escape, placeOf, rowMarkup, tieNote,
} from '../src/ui/Leaderboard';

const board = inventedBoard();
const row = (over: Partial<BoardRow> = {}): BoardRow => ({
  runs: 50, sixes: 2, fours: 3, wickets: 1, dots: 6, balls: GAME.totalBalls,
  playerId: 'p', name: 'Rohit', avatar: 0, score: 1, ...over,
});
/** Every row of a board, with the one above it, the way the screen reads them. */
const pairs = (rows: readonly BoardRow[]) => rows.slice(1).map((r, i) => [rows[i], r] as const);

describe('fifty innings nobody played', () => {
  it('gives the board its full fifty', () => {
    expect(board).toHaveLength(BOARD_SIZE);
  });

  it('invents only innings the game could have dealt', () => {
    // The whole point of playing them out ball by ball rather than writing the
    // figures down: a fixture that cannot have happened ranks perfectly well and
    // would sit in the file unnoticed.
    for (const innings of board) expect(plausible(innings), `${innings.name} ${innings.runs}`).toBe(true);
  });

  it('ends every innings the only two ways an innings ends', () => {
    for (const innings of board) {
      expect(innings.balls === GAME.totalBalls || innings.wickets === GAME.maxWickets, innings.name).toBe(true);
    }
  });

  it('hands back the same fifty for the same seed, and different ones otherwise', () => {
    expect(inventedBoard(7).map(r => r.runs)).toEqual(inventedBoard(7).map(r => r.runs));
    expect(inventedBoard(7).map(r => r.runs)).not.toEqual(inventedBoard(8).map(r => r.runs));
  });

  it('is in board order already, so the screen never has to sort it', () => {
    expect([...board].sort(compareRows)).toEqual(board);
  });

  it('gives every row its own player and nobody two rows', () => {
    expect(new Set(board.map(r => r.playerId)).size).toBe(BOARD_SIZE);
    expect(new Set(board.map(r => r.name)).size).toBe(BOARD_SIZE);
  });

  it('keeps every name inside the width a row holds', () => {
    for (const r of board) expect(r.name.length, r.name).toBeLessThanOrEqual(14);
  });

  it('picks a kit the board has a colour for', () => {
    for (const r of board) expect(AVATAR_COLOURS[r.avatar]).toBeTruthy();
  });

  it('keeps the best fifty of a whole field, so the last row is a real innings', () => {
    // A board is the top fifty of everything anyone has played, not a sample of
    // fifty. Sample fifty and the worst of them is whoever was bowled in the
    // first over, and the cut-off line reads four runs — which is not the screen
    // anybody has to design for.
    const last = board[BOARD_SIZE - 1];
    expect(last.runs).toBeGreaterThan(30);
    expect(last.balls).toBe(GAME.totalBalls);
  });

  it('spreads the fifty across the ladder rather than bunching them', () => {
    // A board where the fiftieth is within a few runs of the leader is not a
    // board, it is fifty of the same innings, and it would say nothing about
    // whether the screen reads.
    expect(board[0].runs - board[BOARD_SIZE - 1].runs).toBeGreaterThan(20);
  });

  it('plants both kinds of tie, so the screen has them to draw', () => {
    const split = pairs(board).map(([above, r]) => decidedBy(above, r));
    // One pair level on runs, sixes and fours and split further down the ladder.
    expect(split.some(key => key === 'wickets' || key === 'dots')).toBe(true);
    // And one pair the clock alone could split.
    expect(split.some(key => key === null)).toBe(true);
  });

  it('stamps the submissions apart, so no tie is left to chance', () => {
    const seconds = board.map(r => unpackScore(r.score).seconds);
    expect(new Set(seconds).size).toBe(BOARD_SIZE);
  });

  it('leans an innings on how good the player is', () => {
    const weak = inventInnings(new SeededRandom(3), 0);
    const strong = inventInnings(new SeededRandom(3), 1);
    expect(strong.runs).toBeGreaterThan(weak.runs);
  });
});

describe('what a row says about where it sits', () => {
  const base = row();

  it('says nothing when runs alone separated two rows', () => {
    expect(tieNote(row({ runs: 60 }), base)).toBeNull();
  });

  it('names the figure that split a level score', () => {
    expect(tieNote(row({ sixes: 4 }), base)).toBe('level · fewer 6s');
    expect(tieNote(row({ fours: 6 }), base)).toBe('level · fewer 4s');
    expect(tieNote(row({ wickets: 0 }), base)).toBe('level · lost more');
    expect(tieNote(row({ dots: 2 }), base)).toBe('level · more dots');
  });

  it('says outright when only the clock split them', () => {
    // Two identical innings one above the other look like a bug until labelled.
    expect(tieNote(row(), base)).toBe('level · later');
  });

  it('keeps a note short enough not to wrap a row on a phone', () => {
    for (const above of [row({ sixes: 4 }), row({ fours: 6 }), row({ wickets: 0 }), row({ dots: 2 }), row()]) {
      expect(tieNote(above, base)!.length).toBeLessThanOrEqual(20);
    }
  });

  it('only lights a figure the row actually shows', () => {
    expect(decider(row({ sixes: 4 }), base)).toBe('sixes');
    expect(decider(row({ fours: 6 }), base)).toBe('fours');
    expect(decider(row({ wickets: 0 }), base)).toBe('wickets');
    // Dots have no column, so the note under the name carries that one alone.
    expect(decider(row({ dots: 2 }), base)).toBeNull();
    expect(decider(row({ runs: 60 }), base)).toBeNull();
    expect(decider(null, base)).toBeNull();
  });
});

describe('the sheet', () => {
  const markup = boardMarkup({ rows: board, youId: board[11].playerId });

  it('draws every row it was handed, in the order it was handed them', () => {
    expect(markup.match(/class="board-row/g)).toHaveLength(BOARD_SIZE);
    const names = [...markup.matchAll(/class="board-who"><b>([^<]+)<\/b>/g)].map(m => m[1]);
    expect(names).toEqual(board.map(r => escape(r.name)));
  });

  it('picks your row out and says where you came', () => {
    expect(markup).toContain('aria-current="true"');
    expect(markup.match(/is-you/g)).toHaveLength(1);
    expect(markup).toContain('You are <b>12th</b>');
  });

  it('draws the line under the last row that is on the board', () => {
    expect(markup).toContain(`${board[BOARD_SIZE - 1].runs} gets you on the board`);
  });

  it('does not tell anyone that nought gets them on the board', () => {
    // It does not: a duck at fiftieth still has to be beaten on the split.
    expect(cutLabel(row({ runs: 0 }))).toBe('Any run gets you on the board');
  });

  it('leaves the line off while the board is still filling', () => {
    const short = board.slice(0, 9);
    expect(cutoff(short)).toBeNull();
    expect(boardMarkup({ rows: short })).not.toContain('gets you on the board');
  });

  it('lights the figure a tie turned on', () => {
    const tied = boardMarkup({ rows: [row({ playerId: 'a', name: 'A', sixes: 4, score: 2 }), row({ playerId: 'b', name: 'B', score: 1 })] });
    expect(tied).toContain('level · fewer 6s');
    expect(tied.match(/is-split/g)).toHaveLength(1);
  });

  it('shows an innings that missed, and how far off it was', () => {
    const missed = boardMarkup({ rows: board, yours: { ...board[0], runs: board[BOARD_SIZE - 1].runs - 7 } });
    expect(missed).toContain('<b>7</b> short of the board');
    expect(missed).toContain('This innings');
  });

  it('says what keeps a level innings off rather than calling it short', () => {
    const edge = board[BOARD_SIZE - 1];
    const level: Innings = { ...edge, sixes: edge.sixes + 1 };
    expect(boardMarkup({ rows: board, yours: level })).toContain('Level with 50th on runs');
  });

  it('quotes the leader when there is nobody to place', () => {
    expect(boardMarkup({ rows: board })).toContain(`${board[0].name} leads with <b>${board[0].runs}</b>`);
  });

  it('has something to say about an empty board', () => {
    expect(boardMarkup({ rows: [] })).toContain('Nobody has batted yet');
  });

  it('writes a name into the page as text and never as markup', () => {
    // Names come off the board, which is to say off other players.
    const nasty = rowMarkup(row({ name: '<img src=x onerror=alert(1)>' }), 0, null, false);
    expect(nasty).not.toContain('<img');
    expect(nasty).toContain('&lt;img');
  });

  it('numbers the places from one', () => {
    expect(rowMarkup(row(), 0, null, false)).toContain('>1</span>');
    expect(rowMarkup(row(), 49, null, false)).toContain('>50</span>');
  });
});

describe('measuring an innings against the board', () => {
  it('reads the six figures off a finished innings', () => {
    const score = { runs: 74, wickets: 2, balls: 30, fours: 5, sixes: 6, dots: 9 };
    expect(asInnings(score)).toEqual({ runs: 74, sixes: 6, fours: 5, wickets: 2, dots: 9, balls: 30 });
  });

  it('places an innings where it would go', () => {
    const at = Date.now();
    expect(placeOf(board, board[0], at)).toBe(2);
    expect(placeOf(board, { ...board[0], runs: board[0].runs + 1 }, at)).toBe(1);
    expect(placeOf(board, { runs: 0, sixes: 0, fours: 0, wickets: 3, dots: 3, balls: 3 }, at)).toBe(BOARD_SIZE + 1);
  });
});
