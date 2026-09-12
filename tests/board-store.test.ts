import { describe, expect, it } from 'vitest';
import { GAME } from '../src/config/gameplay';
import { BOARD_SIZE, LAUNCH_MS, packScore, plausible, unpackScore, type Innings } from '../src/game/leaderboard';
import {
  AVATARS, NAME_MAX, RATE_LIMIT, cleanName, foldName, readBoard, submitScore,
  type BoardStore, type Submission,
} from '../src/server/board-store';
import { memoryStore } from '../src/server/memory-store';

/**
 * The same in-memory store the dev server runs on, wrapped so a test can look
 * at what was actually written. One implementation rather than two: a second
 * copy would drift from the one the endpoints are developed against.
 */
function fakeStore() {
  const store = memoryStore();
  return {
    store,
    /** What the ranking holds for a player, read back through the store. */
    async runsFor(id: string) {
      const [row] = await store.rows([id]);
      return row?.runs ?? null;
    },
  };
}

/**
 * An innings that adds up: the runs are made out of sixes and singles, the
 * wickets cost balls, and whatever is left over is dots.
 *
 * Written down as figures instead, a fixture like `{ runs: 90, sixes: 2 }`
 * ranks perfectly well and is a score nobody could have made in thirty balls —
 * which is exactly how one gets into a test file and stays there until
 * something actually checks. `plausible` is asserted here so a bad fixture
 * fails where it was written rather than somewhere downstream.
 */
const innings = (runs = 50, wickets = 1): Innings => {
  const sixes = Math.floor(runs / 6);
  const singles = runs % 6;
  const balls = Math.min(GAME.totalBalls, sixes + singles + wickets);
  const figures: Innings = {
    runs, sixes, fours: 0, wickets,
    dots: GAME.totalBalls - sixes - singles - wickets,
    balls: wickets >= GAME.maxWickets ? balls : GAME.totalBalls,
  };
  if (wickets >= GAME.maxWickets) figures.dots = balls - sixes - singles - wickets;
  if (!plausible(figures)) throw new Error(`fixture could not have happened: ${JSON.stringify(figures)}`);
  return figures;
};

const ID = 'abcdef-abcdefghijkl';
const OTHER = 'abcdeg-mnopqrstuvwx';
const submission = (over: Partial<Submission> = {}): Submission =>
  ({ playerId: ID, name: 'Rohit', avatar: 0, innings: innings(), address: '1.2.3.4', ...over });

/** Puts a player on the board directly, the way an earlier submission would have. */
const seed = async (store: BoardStore, id: string, runs = 50, at = LAUNCH_MS + 1000) => {
  const figures = innings(runs);
  await store.record(id, packScore(figures, at), { ...figures, name: id.slice(0, 6), avatar: 0, at });
};

describe('reading the board', () => {
  it('says nothing rather than nothing-shaped when no one has batted', async () => {
    const { store } = fakeStore();
    expect(await readBoard(store)).toEqual({ rows: [], cutoff: null, size: BOARD_SIZE });
  });

  it('puts the rows in board order and names no cutoff while it fills', async () => {
    const { store } = fakeStore();
    await seed(store, ID, 40);
    await seed(store, OTHER, 90);
    const board = await readBoard(store);
    expect(board.rows.map(r => r.runs)).toEqual([90, 40]);
    expect(board.cutoff).toBeNull();
  });

  it('names the cutoff once the board is full', async () => {
    const { store } = fakeStore();
    for (let i = 0; i < BOARD_SIZE; i++) {
      await seed(store, `aaaaaa-${i.toString().padStart(12, 'x')}`, 20 + i);
    }
    const board = await readBoard(store);
    expect(board.rows).toHaveLength(BOARD_SIZE);
    expect(board.cutoff).toBe(board.rows[BOARD_SIZE - 1].score);
    expect(board.rows[BOARD_SIZE - 1].runs).toBe(20);
  });

  it('leaves out a ranked id with no row behind it', async () => {
    // A half-written submission. A blank line on the board is worse than a
    // board of forty-nine.
    const { store } = fakeStore();
    await seed(store, ID, 40);
    // A ranked id with nothing written beside it, which is what a submission
    // interrupted between its two writes leaves behind.
    await store.record('ghost0-aaaaaaaaaaaa', packScore(innings(99), LAUNCH_MS), null as never);
    const board = await readBoard(store);
    expect(board.rows.map(r => r.playerId)).toEqual([ID]);
  });
});

describe('submitting an innings', () => {
  it('takes a real one and hands back the board it made', async () => {
    const { store } = fakeStore();
    const outcome = await submitScore(store, submission(), LAUNCH_MS + 60_000);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.improved).toBe(true);
    expect(outcome.board.rows[0]).toMatchObject({ playerId: ID, name: 'Rohit', runs: 50 });
  });

  it('stamps the submission from the store, never from the browser', async () => {
    // A laptop running fast would otherwise win every tiebreak it entered.
    const { store } = fakeStore();
    const now = LAUNCH_MS + 7 * 60_000;
    const outcome = await submitScore(store, submission(), now);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.at).toBe(now);
    expect(unpackScore(outcome.score).seconds).toBe(7 * 60);
  });

  it('keeps a better innings when a worse one follows it', async () => {
    const { store, runsFor } = fakeStore();
    await submitScore(store, submission({ innings: innings(90) }), LAUNCH_MS + 1000);
    const second = await submitScore(store, submission({ innings: innings(40) }), LAUNCH_MS + 2000);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.improved).toBe(false);
    expect(second.board.rows[0].runs).toBe(90);
    // And the figures beside the ranking still describe the innings that earned
    // it — not the latest one played.
    expect(await runsFor(ID)).toBe(90);
  });

  it('replaces a row when the innings does beat it', async () => {
    const { store } = fakeStore();
    await submitScore(store, submission({ innings: innings(40) }), LAUNCH_MS + 1000);
    const better = await submitScore(store, submission({ innings: innings(90) }), LAUNCH_MS + 2000);
    expect(better.ok).toBe(true);
    if (!better.ok) return;
    expect(better.improved).toBe(true);
    expect(better.board.rows).toHaveLength(1);
    expect(better.board.rows[0].runs).toBe(90);
  });

  it('gives one player one row however many innings they play', async () => {
    const { store } = fakeStore();
    for (const runs of [30, 70, 50, 90, 20]) {
      await submitScore(store, submission({ innings: innings(runs) }), LAUNCH_MS + runs * 1000);
    }
    const board = await readBoard(store);
    expect(board.rows).toHaveLength(1);
    expect(board.rows[0].runs).toBe(90);
  });

  it('turns down an innings that could not have happened', async () => {
    const { store } = fakeStore();
    // Thirty balls, and every one of them a six, would be 180.
    const outcome = await submitScore(store, submission({ innings: { ...innings(60), runs: 200 } }));
    expect(outcome).toMatchObject({ ok: false, status: 400 });
  });

  it('turns down anything that is not a player', async () => {
    const { store } = fakeStore();
    for (const playerId of ['', 'nope', 'abc-def', '<script>']) {
      expect(await submitScore(store, submission({ playerId })), playerId).toMatchObject({ ok: false, status: 400 });
    }
  });

  it('turns down a kit that does not exist', async () => {
    const { store } = fakeStore();
    for (const avatar of [-1, AVATARS, 1.5, NaN]) {
      expect(await submitScore(store, submission({ avatar })), String(avatar)).toMatchObject({ ok: false, status: 400 });
    }
  });

  it('turns down a name that is nothing once it is cleaned up', async () => {
    const { store } = fakeStore();
    for (const name of ['', '   ', '​​']) {
      expect(await submitScore(store, submission({ name }))).toMatchObject({ ok: false, status: 400 });
    }
  });
});

describe('one name, one player', () => {
  it('keeps a name for whoever claimed it first', async () => {
    const { store } = fakeStore();
    await submitScore(store, submission({ name: 'Hitman' }), LAUNCH_MS + 1000);
    const stolen = await submitScore(store, submission({ playerId: OTHER, name: 'Hitman' }), LAUNCH_MS + 2000);
    expect(stolen).toMatchObject({ ok: false, status: 409 });
  });

  it('sees through spacing, case and punctuation', async () => {
    const { store } = fakeStore();
    await submitScore(store, submission({ name: 'Big Show' }), LAUNCH_MS + 1000);
    for (const name of ['bigshow', 'BIG  SHOW', 'B.i.g-Show', 'Bíg Shów']) {
      expect(await submitScore(store, submission({ playerId: OTHER, name })), name)
        .toMatchObject({ ok: false, status: 409 });
    }
  });

  it('lets the holder go on using their own name', async () => {
    const { store } = fakeStore();
    await submitScore(store, submission({ name: 'Hitman' }), LAUNCH_MS + 1000);
    const again = await submitScore(store, submission({ name: 'hitman', innings: innings(80) }), LAUNCH_MS + 2000);
    expect(again.ok).toBe(true);
  });

  it('does not release a name when the holder has a bad day', async () => {
    // A name once held stays held. Letting one go free would let the next
    // person pick up somebody else's reputation.
    const { store } = fakeStore();
    await submitScore(store, submission({ name: 'Hitman', innings: innings(90) }), LAUNCH_MS + 1000);
    await submitScore(store, submission({ name: 'Hitman', innings: innings(10, GAME.maxWickets) }), LAUNCH_MS + 2000);
    expect(await submitScore(store, submission({ playerId: OTHER, name: 'Hitman' }), LAUNCH_MS + 3000))
      .toMatchObject({ ok: false, status: 409 });
  });
});

describe('the rate limit', () => {
  it('lets a real player submit as often as they can play', async () => {
    const { store } = fakeStore();
    for (let i = 0; i < RATE_LIMIT; i++) {
      expect((await submitScore(store, submission(), LAUNCH_MS + i * 1000)).ok, `innings ${i}`).toBe(true);
    }
  });

  it('turns an address away once it is past the limit', async () => {
    const { store } = fakeStore();
    for (let i = 0; i <= RATE_LIMIT; i++) await submitScore(store, submission(), LAUNCH_MS + i * 1000);
    expect(await submitScore(store, submission())).toMatchObject({ ok: false, status: 429 });
  });

  it('counts each address on its own, because one address is many people', async () => {
    const { store } = fakeStore();
    for (let i = 0; i <= RATE_LIMIT; i++) await submitScore(store, submission(), LAUNCH_MS + i * 1000);
    expect((await submitScore(store, submission({ address: '5.6.7.8', playerId: OTHER, name: 'Gilly' }))).ok).toBe(true);
  });

  it('charges a bad submission nothing to be turned away', async () => {
    // The limit is read before anything else, so a script pays for its attempts.
    const { store } = fakeStore();
    await submitScore(store, submission({ playerId: 'nope' }));
    expect(await store.hits('1.2.3.4', 3600)).toBe(2);
  });
});

describe('cleaning up a name', () => {
  it('trims, collapses and cuts to what a row holds', () => {
    expect(cleanName('  Rohit   Sharma  ')).toBe('Rohit Sharma');
    expect(cleanName('x'.repeat(40))).toHaveLength(NAME_MAX);
  });

  it('drops the invisible marks that make one name look like another', () => {
    expect(cleanName('Roh​it')).toBe('Rohit');
    expect(cleanName('Ro‮hit')).toBe('Rohit');
    expect(cleanName('Ro hit')).toBe('Rohit');
  });

  it('cuts by character, so a name never ends in half an emoji', () => {
    const cut = cleanName('12345678901234\u{1F3CF}');
    expect([...cut]).toHaveLength(NAME_MAX);
    expect(cut.endsWith('\uD83C')).toBe(false);
  });

  it('turns anything that is not a string into no name at all', () => {
    for (const raw of [null, undefined, 42, {}, []]) expect(cleanName(raw)).toBe('');
  });

  it('folds two spellings of the same name together', () => {
    expect(foldName('Big Show')).toBe(foldName('bigshow'));
    expect(foldName('José')).toBe(foldName('Jose'));
    expect(foldName('Rohit')).not.toBe(foldName('Rohan'));
  });
});
