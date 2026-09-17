import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HEALTH, SURVIVE } from '../src/config/survive';
import {
  LAUNCH_MS, SURVIVE_BOARD_SIZE, packSurvive, type SurviveInnings, type SurviveRow,
} from '../src/game/survive-board';
import {
  asSurvive, outcomeOf, surviveBest, surviveBoardMarkup, surviveCutLabel, surviveCutoff,
  surviveLine, surviveMissedLabel, surviveMissedMarkup, surviveOffer, survivePeekMarkup,
  survivePlaceOf, surviveRowMarkup, surviveStandingPeek, splitOnBattering,
} from '../src/ui/SurviveBoard';
import {
  CLASSIC_LADDER, SURVIVE_LADDER, readBoard, submitScore, type Submission,
} from '../src/server/board-store';
import { memoryStore } from '../src/server/memory-store';
import { fetchSurviveBoard, forgetBoard, submitSurvive } from '../src/game/board-api';

const AT = LAUNCH_MS + 60_000;
const innings = (over: Partial<SurviveInnings> = {}): SurviveInnings =>
  ({ runs: 0, balls: 0, wickets: 0, blows: 0, health: HEALTH.full, ...over });
const row = (over: Partial<SurviveRow> = {}): SurviveRow => {
  const figures = innings(over);
  return { ...figures, playerId: 'p', name: 'Rohit', avatar: 0, score: packSurvive(figures, AT), ...over };
};

describe('what a row says happened', () => {
  it('tells the two ways of losing apart, which is the whole of the injury bar', () => {
    // Nine down and a wicket makes ten; no wicket with balls still to bowl
    // means he was carried off. A board that flattened both into "out" would
    // throw away the one thing this mode is about.
    expect(surviveLine(innings({ runs: 31, balls: 24, wickets: 1 }))).toBe('Bowled out');
    expect(surviveLine(innings({ runs: 31, balls: 24, wickets: 0 }))).toBe('Retired hurt');
  });

  it('says what a win took, since the row itself says what it left', () => {
    // The margin is the row's own ranked figure now, so a line quoting it too
    // would be the same fact written twice on one row.
    expect(surviveLine(innings({ runs: SURVIVE.target, balls: 38 }))).toBe('Won off 38 balls');
    expect(surviveLine(innings({ runs: SURVIVE.target, balls: SURVIVE.totalBalls }))).toBe('Won off the last ball');
  });

  it('calls the ten overs seen out what it is', () => {
    expect(surviveLine(innings({ runs: 41, balls: SURVIVE.totalBalls }))).toBe('Drew the match');
  });
});

describe('a row, drawn', () => {
  it('carries the tier as a class, so the words are not the only thing saying it', () => {
    expect(surviveRowMarkup(row({ runs: SURVIVE.target, balls: 30 }), 0, false)).toContain('is-won');
    expect(surviveRowMarkup(row({ runs: 20, balls: SURVIVE.totalBalls }), 0, false)).toContain('is-drawn');
    expect(surviveRowMarkup(row({ runs: 20, balls: 30, wickets: 1 }), 0, false)).toContain('is-lost');
  });

  it('writes a name as text, because names come from other players', () => {
    const drawn = surviveRowMarkup(row({ name: '<script>alert(1)</script>' }), 0, false);
    expect(drawn).not.toContain('<script>');
    expect(drawn).toContain('&lt;script&gt;');
  });

  it('lights the blows where the battering is what put it under the row above', () => {
    // The ladder's last rung is the meter, and the meter has no column. Two
    // rows level on everything a scorecard holds read as an arbitrary order
    // until something points at the reason, so the blows beside it are lit —
    // the same thing the other sheet does with the figure that settled a tie.
    const above = innings({ runs: 23, balls: SURVIVE.totalBalls, blows: 2, health: 72 });
    const below = innings({ runs: 23, balls: SURVIVE.totalBalls, blows: 7, health: 20 });
    expect(splitOnBattering(above, below)).toBe(true);
    expect(surviveRowMarkup(row(below), 1, false, above)).toContain('<em class="is-split">7<b>blows</b></em>');
  });

  it('lights nothing where the row already shows what split it', () => {
    const drew = innings({ runs: 23, balls: SURVIVE.totalBalls });
    expect(splitOnBattering(innings({ runs: 40, balls: SURVIVE.totalBalls }), drew)).toBe(false);
    expect(splitOnBattering(innings({ runs: SURVIVE.target, balls: 30 }), drew)).toBe(false);
    expect(splitOnBattering(null, drew)).toBe(false);
    // Level even on the meter: the clock decided, and no figure on the row can
    // say so. The footer says it instead.
    expect(splitOnBattering(drew, drew)).toBe(false);
  });

  it('shows the blows, which are what the innings cost', () => {
    const drawn = surviveRowMarkup(row({ runs: 12, balls: 44, blows: 7, wickets: 1 }), 3, true);
    expect(drawn).toContain('<em>7<b>blows</b></em>');
    expect(drawn).toContain('aria-current="true"');
  });

  it('bands the sheet with a letter, and says the word behind it to a reader', () => {
    // Four letters, not three: a loss comes two ways, and telling them apart is
    // the whole of what the injury bar is for. The word is what a screen reader
    // hears, which is the only voice a row has now that the prose is gone.
    const letter = (over: Partial<SurviveRow>) => surviveRowMarkup(row(over), 0, false);
    expect(letter({ runs: SURVIVE.target, balls: 30 })).toContain('<i aria-hidden="true">W</i><b>Won</b>');
    expect(letter({ runs: 20, balls: SURVIVE.totalBalls })).toContain('<i aria-hidden="true">D</i><b>Drew the match</b>');
    expect(letter({ runs: 20, balls: 30, wickets: 1 })).toContain('<i aria-hidden="true">L</i><b>Bowled out</b>');
    expect(letter({ runs: 20, balls: 30, wickets: 0 })).toContain('<i aria-hidden="true">R</i><b>Retired hurt</b>');
    expect(outcomeOf(innings({ runs: 20, balls: 30, wickets: 0 })).letter).toBe('R');
  });
});

describe('the sheet', () => {
  const full = Array.from({ length: SURVIVE_BOARD_SIZE }, (_, i) =>
    row({ playerId: `p${i}`, name: `P${i}`, runs: 80 - i, balls: SURVIVE.totalBalls }));

  it('names no cutoff while the board is filling', () => {
    expect(surviveCutoff(full.slice(0, 10))).toBeNull();
    expect(surviveCutoff(full)).toBe(full[SURVIVE_BOARD_SIZE - 1]);
  });

  it('says what it takes to get on in the terms of the contest the fiftieth is in', () => {
    // "You are 12 short" is meaningless against a row that won: what stands in
    // the way there is the clock, not the runs.
    expect(surviveCutLabel(row({ runs: SURVIVE.target, balls: 40 }))).toBe('A win inside 40 balls gets you on the board');
    expect(surviveCutLabel(row({ runs: 33, balls: SURVIVE.totalBalls }))).toBe('A draw with 33 gets you on the board');
    expect(surviveCutLabel(row({ runs: 4, balls: 19, wickets: 1 }))).toBe('19 balls faced gets you on the board');
  });

  it('says nobody has batted rather than drawing an empty fifty', () => {
    expect(surviveBoardMarkup({ rows: [], atMs: AT })).toContain('Nobody has batted yet');
  });

  it('says the board is fetching, and says when it could not be', () => {
    expect(surviveBoardMarkup({ rows: [], state: 'loading', atMs: AT })).toContain('Fetching the board');
    const offline = surviveBoardMarkup({ rows: [], state: 'offline', yours: innings({ runs: 7, balls: 9, wickets: 1 }), atMs: AT });
    expect(offline).toContain('could not be reached');
    // The innings is still the thing they came to look at.
    expect(offline).toContain('not sent yet');
    expect(offline).toContain('7<i></i>');
  });

  it('shows a place waiting to be taken as a place, not as a dash', () => {
    // A loss, under three draws: fourth, and fourth is a place rather than a
    // miss while there is still room on the board.
    const drawn = surviveBoardMarkup({ rows: full.slice(0, 3), yours: innings({ runs: 20, balls: 40, wickets: 1 }), atMs: AT });
    expect(drawn).toContain('>4</span>');
    expect(drawn).toContain('yours to claim');
    expect(drawn).not.toContain('not good enough yet');
  });

  it('says a chase that goes straight to the top takes it', () => {
    const drawn = surviveBoardMarkup({ rows: full.slice(0, 3), yours: innings({ runs: SURVIVE.target, balls: 20 }), atMs: AT });
    expect(drawn).toContain('takes the top');
  });

  it('tells an innings that missed that it missed', () => {
    const drawn = surviveBoardMarkup({ rows: full, yours: innings({ runs: 0, balls: 1, wickets: 1 }), atMs: AT });
    expect(drawn).toContain('not good enough yet');
  });

  it('carries the innings-end keys only when it was opened as one', () => {
    expect(surviveBoardMarkup({ rows: full, atMs: AT })).not.toContain('board-again');
    const withKeys = surviveBoardMarkup({ rows: full, actions: true, atMs: AT });
    expect(withKeys).toContain('board-again');
    expect(withKeys).toContain('board-modes');
  });

  it('answers where you are when one of the rows is yours', () => {
    const drawn = surviveBoardMarkup({ rows: full, youId: 'p3', atMs: AT });
    expect(drawn).toContain('You are <b>4th</b>');
    expect(drawn).toContain('drew the match');
  });
});

describe('the peek on the card', () => {
  const rows = Array.from({ length: 6 }, (_, i) =>
    row({ playerId: `p${i}`, name: `P${i}`, runs: 60 - i, balls: SURVIVE.totalBalls }));

  it('shows the row above and the row below, which is what makes a place mean anything', () => {
    const drawn = survivePeekMarkup(rows, 3, innings({ runs: 58, balls: SURVIVE.totalBalls }), 2);
    expect(drawn).toContain('>2<');
    expect(drawn).toContain('>3<');
    expect(drawn).toContain('>4<');
  });

  it('stands the board’s second row in when there is nothing above the top', () => {
    const drawn = survivePeekMarkup(rows, 1, innings({ runs: SURVIVE.target, balls: 20 }), 0);
    expect(drawn).toContain('is-won');
    expect(drawn).toContain('>3<');
  });

  it('takes a held row out and puts it back where it was', () => {
    const drawn = surviveStandingPeek(rows, 2);
    // Theirs is the only name on it — everybody else is a bar, the same way the
    // other card's peek draws them. Removed and re-inserted at the same place
    // cancels out, so the rows either side are the ones that were either side.
    expect(drawn).toContain('P1');
    expect(drawn).toContain('60<i>*</i>');
    expect(drawn).toContain('59<i>*</i>');
    expect(drawn).toContain('58<i>*</i>');
  });

  it('names what a held row still stands for, rather than quoting a number', () => {
    expect(surviveBest([row({ runs: SURVIVE.target, balls: 44 })], 1)).toBe('won off 44 balls');
  });
});

describe('whether the card says anything about the board', () => {
  const full = Array.from({ length: SURVIVE_BOARD_SIZE }, (_, i) =>
    row({ playerId: `p${i}`, runs: 80 - i, balls: SURVIVE.totalBalls }));

  it('says the board could not be reached when it never answered', () => {
    expect(surviveOffer(false, [], innings({ runs: SURVIVE.target, balls: 20 }), AT).kind).toBe('offline');
  });

  it('offers a duck that lasted, which the other board would have thrown away', () => {
    // Nought off forty is not nothing here: it is forty balls the last man kept
    // them out. The other card is silent on a duck, and it is right to be.
    expect(surviveOffer(true, [], innings({ runs: 0, balls: 40, wickets: 1 }), AT))
      .toEqual({ kind: 'claim', place: 1 });
  });

  it('tells an innings that cannot reach the fiftieth row what it would take', () => {
    expect(surviveOffer(true, full, innings({ runs: 0, balls: 1, wickets: 1 }), AT).kind).toBe('missed');
  });

  it('never goes silent on a Test innings that was played', () => {
    const played = [
      innings({ runs: 0, balls: 1, wickets: 1 }),
      innings({ runs: 0, balls: 40, wickets: 1 }),
      innings({ runs: SURVIVE.target, balls: 20 }),
    ];
    for (const yours of played) {
      for (const rows of [[], full]) {
        expect(surviveOffer(true, rows, yours, AT).kind).not.toBe('silent');
      }
    }
  });

  /**
   * "Eleven short" cannot be said on this ladder: an innings misses by losing,
   * by being slower or by not lasting. The cut-off line already names whichever
   * contest the fiftieth row is in, so the card quotes it rather than inventing
   * an arithmetic the board does not rank on.
   */
  it('borrows the sheet\'s own cut-off sentence for the card', () => {
    expect(surviveMissedLabel(surviveCutoff(full))).toBe(surviveCutLabel(full[SURVIVE_BOARD_SIZE - 1]));
    expect(surviveMissedLabel(null)).toBe('Any ball faced gets you on the board');
  });

  it('shows the Test innings below the line with the figures the board ranks it on', () => {
    const yours = innings({ runs: 4, balls: 9, wickets: 1 });
    const markup = surviveMissedMarkup(yours);
    expect(markup).toContain('not good enough yet');
    expect(markup).toContain('9<small>balls</small>');
  });

  it('tells a player their own row still stands rather than offering one it would not take', () => {
    const offer = surviveOffer(true, full, innings({ runs: 3, balls: SURVIVE.totalBalls }), AT, 'p0');
    expect(offer).toEqual({ kind: 'standing', runs: 80, place: 1 });
  });

  it('works out the place an innings would take', () => {
    expect(survivePlaceOf(full, innings({ runs: SURVIVE.target, balls: 20 }), AT)).toBe(1);
    expect(survivePlaceOf(full, innings({ runs: 0, balls: 2, wickets: 1 }), AT)).toBe(SURVIVE_BOARD_SIZE + 1);
  });
});

describe('the innings, as the board takes it', () => {
  it('keeps the five figures inside what the mode can produce', () => {
    // A scorecard reading two wickets is one the store would refuse outright,
    // and the number the screen holds is not the one the ladder ranks.
    const taken = asSurvive({ runs: 40, balls: SURVIVE.totalBalls + 4, wickets: 3 }, 90, -8);
    expect(taken).toEqual({
      runs: 40, balls: SURVIVE.totalBalls, wickets: SURVIVE.maxWickets,
      blows: SURVIVE.totalBalls, health: 0,
    });
  });

  it('carries the blows, which are the innings and not a decoration', () => {
    expect(asSurvive({ runs: 12, balls: 30, wickets: 0 }, 9, 40).blows).toBe(9);
  });

  it('carries what was left on the meter, which is what the ladder ranks', () => {
    expect(asSurvive({ runs: 12, balls: 30, wickets: 0 }, 9, 41).health).toBe(41);
    // Read off a live meter, so it is rounded and held inside the bar.
    expect(asSurvive({ runs: 12, balls: 30, wickets: 0 }, 0, HEALTH.full + 9).health).toBe(HEALTH.full);
  });
});

describe('the two ladders, through the store the endpoints run', () => {
  const offer = (over: Partial<Submission<SurviveInnings>> = {}): Submission<SurviveInnings> => ({
    playerId: 'abcdef-abcdefghijkl', name: 'Rohit', avatar: 0, address: '1.2.3.4',
    innings: innings({ runs: SURVIVE.target, balls: 38, blows: 3 }), ...over,
  });

  it('takes a Test innings and hands back the Test board', async () => {
    const store = memoryStore<SurviveInnings>();
    const outcome = await submitScore(store, SURVIVE_LADDER, offer(), AT);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.board.size).toBe(SURVIVE_BOARD_SIZE);
    expect(outcome.board.rows[0]).toMatchObject({ name: 'Rohit', runs: SURVIVE.target, balls: 38, blows: 3 });
  });

  it('keeps only the five figures the Test ladder ranks', async () => {
    const store = memoryStore<SurviveInnings>();
    await submitScore(store, SURVIVE_LADDER, offer(), AT);
    const board = await readBoard(store, SURVIVE_LADDER);
    // Nothing the browser sent beyond the five gets written down.
    expect(Object.keys(board.rows[0]).sort())
      .toEqual(['avatar', 'balls', 'blows', 'health', 'name', 'playerId', 'runs', 'score', 'wickets']);
  });

  it('puts a win above a draw above a loss, whatever the runs say', async () => {
    const store = memoryStore<SurviveInnings>();
    const seed = (id: string, figures: SurviveInnings) =>
      submitScore(store, SURVIVE_LADDER, offer({ playerId: id, name: id.slice(0, 6), innings: figures }), AT);
    await seed('aaaaaa-aaaaaaaaaaaa', innings({ runs: 82, balls: 30, wickets: 1 }));
    await seed('bbbbbb-bbbbbbbbbbbb', innings({ runs: 40, balls: SURVIVE.totalBalls }));
    await seed('cccccc-cccccccccccc', innings({ runs: SURVIVE.target, balls: 55 }));
    const board = await readBoard(store, SURVIVE_LADDER);
    expect(board.rows.map(r => r.runs)).toEqual([SURVIVE.target, 40, 82]);
  });

  it('refuses a Test innings nobody could have batted', async () => {
    const store = memoryStore<SurviveInnings>();
    const outcome = await submitScore(store, SURVIVE_LADDER, offer({ innings: innings({ runs: 61, balls: 10 }) }), AT);
    expect(outcome.ok).toBe(false);
  });

  it('keeps the two boards on separate keys, so neither ranks the other', async () => {
    // The scoping the dev server and the deployed keys both do. One store for
    // both would let a chase be ranked against a five-over slog.
    expect(SURVIVE_LADDER.scope).not.toBe('');
    expect(CLASSIC_LADDER.scope).toBe('');
    const test = memoryStore<SurviveInnings>();
    await submitScore(test, SURVIVE_LADDER, offer(), AT);
    expect((await readBoard(test, SURVIVE_LADDER)).rows).toHaveLength(1);
    expect((await readBoard(memoryStore<SurviveInnings>(), SURVIVE_LADDER)).rows).toHaveLength(0);
  });

  it('shares one name registry across both, because a name is a person', async () => {
    // Scoping the names as well would have let two people bat as one Rohit,
    // one on each board — and would have taken a returning player's own name
    // away from them the first time they played the other mode.
    const names = new Map<string, string>();
    const test = memoryStore<SurviveInnings>(names);
    const classic = memoryStore(names);
    const taken = await submitScore(classic, CLASSIC_LADDER, {
      playerId: 'aaaaaa-aaaaaaaaaaaa', name: 'Rohit', avatar: 0, address: '1.2.3.4',
      innings: { runs: 40, sixes: 6, fours: 0, wickets: 1, dots: 19, balls: 30 },
    }, AT);
    expect(taken.ok).toBe(true);

    // Somebody else cannot pick it up on the other board.
    const stolen = await submitScore(test, SURVIVE_LADDER, offer({ playerId: 'bbbbbb-bbbbbbbbbbbb' }), AT);
    expect(stolen.ok).toBe(false);
    if (stolen.ok) return;
    expect(stolen.status).toBe(409);

    // And the player who holds it carries it across.
    const mine = await submitScore(test, SURVIVE_LADDER, offer({ playerId: 'aaaaaa-aaaaaaaaaaaa' }), AT);
    expect(mine.ok).toBe(true);
  });
});

describe('which board the browser asks for', () => {
  const calls: string[] = [];
  const answer = (body: unknown) => vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push(String(url));
    if (init?.body) calls.push(String(init.body));
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));

  beforeEach(() => { calls.length = 0; forgetBoard(); vi.stubEnv('DEV', false); });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); forgetBoard(); });

  it('names the mode on the way out, rather than leaving it to be guessed', async () => {
    answer({ rows: [], cutoff: null, size: SURVIVE_BOARD_SIZE });
    await fetchSurviveBoard(true);
    expect(calls[0]).toContain('?mode=survive');
  });

  it('sends the mode with the innings too', async () => {
    answer({ improved: true, score: 1, board: { rows: [], cutoff: null, size: SURVIVE_BOARD_SIZE } });
    await submitSurvive('p', 'Rohit', 0, innings({ runs: SURVIVE.target, balls: 30 }));
    expect(calls[1]).toContain('"mode":"survive"');
    expect(calls[1]).toContain('"blows":0');
  });

  it('never hands the Test board the invented fifty, even in development', async () => {
    // The fixture stands in for the other board while there is no database. A
    // ladder of people who never batted is worse here than an empty screen.
    vi.stubEnv('DEV', true);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 503 })));
    expect(await fetchSurviveBoard(true)).toBeNull();
  });
});

describe('the figures, in three fixed columns', () => {
  it('draws them at one size, in one place, on every row', () => {
    // There is no hero number on this board: a win is judged on balls used, a
    // draw on runs and a loss on balls faced. A row that blew up whichever
    // figure it was judged on blew up a different one every few rows, and the
    // moving emphasis read as the ranking itself.
    const won = surviveRowMarkup(row({ runs: SURVIVE.target, balls: 38, blows: 1 }), 0, false);
    const lost = surviveRowMarkup(row({ runs: 72, balls: 47, wickets: 1, blows: 5 }), 6, false);
    for (const markup of [won, lost]) {
      expect(markup).toMatch(/<em>\d+(<i>\*<\/i>)?<b>runs<\/b><\/em>\s*<em>\d+<b>balls<\/b><\/em>/);
    }
    // Said once at the head of the list rather than fifty times down it.
    const sheet = surviveBoardMarkup({ rows: [row({ runs: 20, balls: 30, wickets: 1 })], atMs: AT });
    expect(sheet).toContain('<em>runs</em><em>balls</em><em>blows</em>');
  });

  it('keeps the not-out star on the runs', () => {
    expect(surviveRowMarkup(row({ runs: 44, balls: SURVIVE.totalBalls }), 0, false)).toContain('44<i>*</i><b>runs</b>');
    expect(surviveRowMarkup(row({ runs: 44, balls: 30, wickets: 1 }), 0, false)).toContain('44<b>runs</b>');
  });

  it('puts the longer rearguard above the bigger score, under one letter', () => {
    // The pair that started this. Both bowled out, so both read L, and what
    // orders them is the balls column running down the block.
    const rows = [row({ playerId: 'a', runs: 72, balls: 47, wickets: 1 }), row({ playerId: 'b', runs: 86, balls: 35, wickets: 1 })]
      .sort((x, y) => y.score - x.score);
    expect(rows[0].runs).toBe(72);
    expect(outcomeOf(rows[0]).letter).toBe('L');
    expect(outcomeOf(rows[1]).letter).toBe('L');
  });

  it('names the block the rows below it belong to, and what it is judged on', () => {
    const sheet = surviveBoardMarkup({
      rows: [row({ playerId: 'a', runs: SURVIVE.target, balls: 30 }), row({ playerId: 'b', runs: 20, balls: 30, wickets: 1 })],
      atMs: AT,
    });
    expect(sheet).toContain('Wins &middot; fewest balls used');
    expect(sheet).toContain('Losses &middot; longest innings');
    // One band per block, not one per row.
    expect(sheet.match(/board-band/g)).toHaveLength(2);
  });
});
