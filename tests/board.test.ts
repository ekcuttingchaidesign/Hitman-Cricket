import { describe, expect, it } from 'vitest';
import { GAME } from '../src/config/gameplay';
import { SeededRandom } from '../src/game/SeededRandom';
import { inventInnings, inventedBoard } from '../src/game/board-fixture';
import { BOARD_SIZE, compareRows, decidedBy, plausible, unpackScore } from '../src/game/leaderboard';
import type { BoardRow, Innings } from '../src/game/leaderboard';
import {
  asInnings, boardMarkup, cardOffer, cutLabel, cutoff, decider, escape, kitMarkup, peekMarkup, pickerMarkup, placeOf,
  rowMarkup, standingPeek, tieNote,
} from '../src/ui/Leaderboard';
import { AVATARS, KITS, kitColour, kitDeal, kitName } from '../src/config/board';
import { readdirSync } from 'node:fs';

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
    for (const r of board) expect(r.avatar).toBeLessThan(AVATARS);
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
    // Names come off the board, which is to say off other players. The kit has
    // an <img> of its own, so this asks whether the name became markup rather
    // than whether the row contains any — and the kit's own onerror is why the
    // check names the payload rather than the attribute.
    const nasty = rowMarkup(row({ name: '<img src=x onerror=alert(1)>' }), 0, null, false);
    // One <img> in the row: the kit's own. The name did not become a second.
    expect(nasty.match(/<img/g)).toHaveLength(1);
    expect(nasty).not.toContain('<img src=x');
    expect(nasty).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('numbers the places from one', () => {
    expect(rowMarkup(row(), 0, null, false)).toContain('>1</span>');
    expect(rowMarkup(row(), 49, null, false)).toContain('>50</span>');
  });
});

describe('the kits', () => {
  it('puts the picture on a disc of that picture\'s own ring colour', () => {
    // The disc fills the space for the moment before the picture paints, so its
    // colour is sampled off the picture rather than chosen: a continuous load
    // rather than a colour changing under the reader.
    const kit = kitMarkup(2);
    expect(kit).toContain(kitColour(2));
    expect(kit).toContain(`avatars/${KITS[2].file}`);
  });

  it('maps every kit to a picture that is actually in the repository', () => {
    const shipped = readdirSync('public/avatars');
    for (const kit of KITS) expect(shipped, kit.name).toContain(kit.file);
  });

  it('escapes the letter on the one disc that has no picture behind it', () => {
    // A player who has not registered has not picked a kit, so their row is the
    // only disc still carrying a letter — and the name is theirs to type.
    const nasty = peekMarkup(board, 3, board[2], null, '<script>x');
    expect(nasty).toContain('&lt;');
    expect(nasty).not.toContain('<script');
  });

  it('takes a picture that will not load off the page rather than showing it broken', () => {
    // The files may not be in public/avatars yet. The board degrades to the
    // version of itself it had yesterday, not to a row of broken images.
    expect(kitMarkup(0, 'A')).toContain('onerror');
  });

  it('asks for the picture relative to the page, not the domain root', () => {
    // The game is published into a repository subdirectory on GitHub Pages.
    expect(kitMarkup(0, 'A')).not.toContain('src="/avatars');
  });

  it('wraps round rather than reaching past the kits that exist', () => {
    expect(kitMarkup(AVATARS, 'A')).toContain(kitColour(0));
  });

  it('offers every kit as one choice rather than as five buttons', () => {
    const picker = pickerMarkup(1);
    expect(picker.match(/role="radio"/g)).toHaveLength(AVATARS);
    expect(picker).toContain('role="radiogroup"');
    expect(picker.match(/aria-checked="true"/g)).toHaveLength(1);
    expect(picker.match(/is-chosen/g)).toHaveLength(1);
  });

  it('lays the kits out in the order it is given, labelled by name', () => {
    const picker = pickerMarkup(2, [4, 0, 2, 1, 3]);
    // The order the discs appear in, read off the markup.
    expect([...picker.matchAll(/data-kit="(\d)"/g)].map(m => m[1])).toEqual(['4', '0', '2', '1', '3']);
    // A disc carries its own kit number, so nothing downstream has to know that
    // the third one along is not kit three.
    expect(picker).toContain('data-kit="2" aria-label="purple"');
    expect(picker).toContain('aria-label="india blue"');
    expect(picker.match(/aria-checked="true"/g)).toHaveLength(1);
    // The name is what a screen reader is given, and is not drawn on the card.
    expect(picker).not.toContain('<small>');
  });

  it('rings the kit it was given, wherever that kit has been dealt', () => {
    // Kit 3, dealt last. Ringing by position instead would light kit 1.
    const picker = pickerMarkup(3, [4, 0, 2, 1, 3]);
    expect(picker.match(/is-chosen/g)).toHaveLength(1);
    const ringed = picker.split('<button').find(disc => disc.includes('is-chosen'))!;
    expect(ringed).toContain('data-kit="3"');
    expect(ringed).toContain('aria-checked="true"');
  });

  it('says what the discs are for, in one title the group is named by', () => {
    const picker = pickerMarkup(0);
    expect(picker).toContain('Choose your avatar');
    // On screen and to a screen reader, the same words: the group points at the
    // title rather than carrying a second wording of its own.
    expect(picker).toContain('aria-labelledby="kit-picker-label"');
    expect(picker).toContain('id="kit-picker-label"');
    expect(picker).not.toContain('aria-label="Pick your kit"');
  });
});

/**
 * Everybody was shown kit zero with the ring already on it, which reads as an
 * answer rather than a question — so almost nobody moved it and the board filled
 * up with one colour. The kits are dealt per player now.
 */
describe('dealing the five kits', () => {
  const ids = Array.from({ length: 400 }, (_, i) => `${(1e12 + i).toString(36)}-abcdefghijk${i}`);

  it('gives a player every kit, once each', () => {
    const { order } = kitDeal(ids[0]);
    expect([...order].sort()).toEqual([...Array(AVATARS).keys()]);
  });

  it('opens on the kit it dealt first, whichever that is', () => {
    for (const id of ids.slice(0, 20)) {
      const { order, opening } = kitDeal(id);
      expect(opening).toBe(order[0]);
    }
  });

  /**
   * The one that would be maddening rather than merely wrong. A fresh roll each
   * time would hand a player a different kit for closing the form and opening it
   * again, and shuffle the row under them while they were looking at it.
   */
  it('deals the same player the same hand every time', () => {
    for (const id of ids.slice(0, 20)) expect(kitDeal(id)).toEqual(kitDeal(id));
  });

  it('does not open everybody on the same kit', () => {
    const opened = new Set(ids.map(id => kitDeal(id).opening));
    expect(opened.size).toBe(AVATARS);
  });

  it('spreads the opening kit roughly evenly, which is the whole point', () => {
    const counts = new Array(AVATARS).fill(0);
    for (const id of ids) counts[kitDeal(id).opening]++;
    // An even deal is 80 of 400. Well inside this, and nowhere near the 400 and
    // four noughts the fixed default produced.
    for (const [kit, count] of counts.entries()) {
      expect(count, `${kitName(kit)}: ${counts.join(',')}`).toBeGreaterThan(400 / AVATARS / 2);
      expect(count, `${kitName(kit)}: ${counts.join(',')}`).toBeLessThan(400 / AVATARS * 2);
    }
  });

  it('does not put the same kit first for everybody in the row either', () => {
    expect(new Set(ids.map(id => kitDeal(id).order.join(''))).size).toBeGreaterThan(AVATARS * 2);
  });

  it('deals a player with no id yet a hand rather than falling over', () => {
    const { order, opening } = kitDeal(null);
    expect([...order].sort()).toEqual([...Array(AVATARS).keys()]);
    expect(opening).toBe(order[0]);
  });

  it('gives every kit a name of its own, which is what a screen reader is told', () => {
    const named = Array.from({ length: AVATARS }, (_, kit) => kitName(kit));
    for (const name of named) expect(name).toMatch(/^[a-z][a-z ]*[a-z]$/);
    expect(new Set(named).size).toBe(AVATARS);
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


describe('offering a place', () => {
  const at = Date.UTC(2026, 5, 1);
  const good: Innings = { runs: 111, sixes: 15, fours: 5, wickets: 3, dots: 4, balls: GAME.totalBalls };
  const kind = (...args: Parameters<typeof cardOffer>) => cardOffer(...args).kind;

  /**
   * The one that shipped. An empty board and a reached board both leave `rows`
   * empty, and gating on the row count refused the first player a place: no rows
   * means no offer, and no offer means it never gets a row. A board nobody can
   * ever get onto is not a board.
   */
  it('offers the first player a place on a board that is empty but reachable', () => {
    expect(cardOffer(true, [], good, at)).toEqual({ kind: 'claim', place: 1 });
  });

  it('offers nothing when the board was never reached', () => {
    // A host that only serves files has no endpoints at all, and a kit and a
    // name should not be asked for against a place that cannot be taken.
    expect(kind(false, [], good, at)).toBe('silent');
    expect(kind(false, board, good, at)).toBe('silent');
  });

  it('offers a place to an innings that clears the fiftieth', () => {
    const best = { ...board[0], runs: board[0].runs + 1 };
    expect(cardOffer(true, board, best, at)).toEqual({ kind: 'claim', place: 1 });
  });

  it('offers nothing to an innings that does not clear it', () => {
    const worst = { ...board[BOARD_SIZE - 1], runs: 1, sixes: 0, fours: 0 };
    expect(kind(true, board, worst, at)).toBe('silent');
  });

  it('offers nothing for a duck, even onto an empty board', () => {
    const duck: Innings = { runs: 0, sixes: 0, fours: 0, wickets: 3, dots: 5, balls: 8 };
    expect(kind(true, [], duck, at)).toBe('silent');
  });
});

/**
 * The board keeps one row a player, their best, so an innings below that row
 * changes nothing however good it looks against everybody else's. The screen
 * used to measure it against the fiftieth alone: somebody top of the board with
 * 140 who then made 120 was told they were fourth and handed a key that did
 * nothing at all.
 */
describe('an innings beaten by your own row', () => {
  const at = Date.UTC(2026, 5, 1);
  const leader = board[0];
  const lesser = (over: Partial<Innings> = {}): Innings =>
    ({ ...leader, runs: leader.runs - 20, ...over });

  it('says what still stands instead of offering a place it cannot take', () => {
    expect(cardOffer(true, board, lesser(), at, leader.playerId))
      .toEqual({ kind: 'standing', runs: leader.runs, place: 1 });
  });

  it('would have offered that same innings a place to anybody else', () => {
    // The innings is good — fourth or thereabouts. It is only this player it
    // does nothing for, which is exactly what made the old screen wrong.
    const offer = cardOffer(true, board, lesser(), at, 'somebody-else');
    expect(offer.kind).toBe('claim');
  });

  it('names the place the standing row holds, not the place this innings would', () => {
    const seventh = board[6];
    expect(cardOffer(true, board, { ...seventh, runs: seventh.runs - 5 }, at, seventh.playerId))
      .toEqual({ kind: 'standing', runs: seventh.runs, place: 7 });
  });

  it('offers a place again the moment the innings beats that row', () => {
    const better = { ...leader, runs: leader.runs + 1 };
    expect(cardOffer(true, board, better, at, leader.playerId)).toEqual({ kind: 'claim', place: 1 });
  });

  /**
   * Beating yourself is a whole-ladder question, not a runs question: the store
   * writes the new row whenever it outranks the old one, so the screen has to
   * offer the place on the same terms or the two disagree.
   */
  it('counts a level score with one more six as beating it', () => {
    const sharper = { ...leader, sixes: leader.sixes + 1, fours: Math.max(0, leader.fours - 2) };
    expect(cardOffer(true, board, sharper, at, leader.playerId).kind).toBe('claim');
  });

  it('does not count the same innings played again, because it got there later', () => {
    // Identical on every playing key, so the clock splits them — and the row
    // already up there got there first. The store would refuse it too.
    expect(cardOffer(true, board, { ...leader }, at, leader.playerId).kind).toBe('standing');
  });

  it('still says what stands after an innings that was going nowhere', () => {
    // A duck is silent for everybody else. For a player who is on the board it
    // is the moment their best is worth quoting back.
    const duck: Innings = { runs: 0, sixes: 0, fours: 0, wickets: 3, dots: 5, balls: 8 };
    expect(cardOffer(true, board, duck, at, leader.playerId))
      .toEqual({ kind: 'standing', runs: leader.runs, place: 1 });
  });

  it('shows the rows around the row that is standing, not around this innings', () => {
    const peek = standingPeek(board, 1);
    expect(peek).toContain(escape(board[0].name));
    // Three rows, placed 1, 2, 3: nothing is being inserted, so nothing shifts.
    expect(peek.match(/class="board-row/g)).toHaveLength(3);
    expect(peek.match(/class="board-place">(\d+)</g)).toEqual([
      'class="board-place">1<', 'class="board-place">2<', 'class="board-place">3<',
    ]);
    expect(peek.match(/is-you/g)).toHaveLength(1);
  });

  it('brackets a row in the middle of the board with its real neighbours', () => {
    const peek = standingPeek(board, 7);
    expect(peek.match(/class="board-place">(\d+)</g)).toEqual([
      'class="board-place">6<', 'class="board-place">7<', 'class="board-place">8<',
    ]);
    expect(peek).toContain(escape(board[6].name));
  });
});

describe('an innings that is not a row yet', () => {
  const at = Date.UTC(2026, 5, 1);
  const good: Innings = { runs: 111, sixes: 15, fours: 5, wickets: 3, dots: 4, balls: GAME.totalBalls };

  /**
   * The one in the screenshot. On an empty board the innings was drawn as
   * having missed the cut: a dash where its place should be, and "level, and
   * below on the split" under it, against nobody. A hundred and eleven was
   * being told it came up short of an empty board.
   */
  it('shows the top spot to the first innings, not a miss', () => {
    const markup = boardMarkup({ rows: [], yours: good, atMs: at });
    expect(markup).toContain('takes the top');
    expect(markup).toContain('>1<');
    expect(markup).not.toContain('level, and below on the split');
    expect(markup).toContain('Nobody has batted yet');
  });

  it('shows the place an innings would take on a board with room', () => {
    const markup = boardMarkup({ rows: board.slice(0, 3), yours: good, atMs: at });
    expect(markup).toMatch(/takes the top|yours to claim/);
    expect(markup).not.toContain('level, and below on the split');
  });

  it('still says plainly when an innings missed a full board', () => {
    const short: Innings = { runs: 1, sixes: 0, fours: 0, wickets: 3, dots: 6, balls: 9 };
    const markup = boardMarkup({ rows: board, yours: short, atMs: at });
    expect(markup).toContain('short');
    expect(markup).toContain('board-place">&mdash;');
  });
});
