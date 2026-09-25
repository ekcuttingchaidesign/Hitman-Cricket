import { describe, expect, it } from 'vitest';
import {
  BLAST_CAREER, SURVIVE_CAREER, emptyBlast, emptySurvive, type BlastTally, type SurviveTally,
} from '../src/game/career';
import {
  CAREER_BOARD_SIZE, DAILY_INNINGS, MIN_INNINGS_MS,
  countInnings, nameCareer, readCareer, readCareerBoards, refusedCareer,
} from '../src/server/career-store';
import { memoryCareer } from '../src/server/memory-career';
import { foldName } from '../src/server/board-store';
import { LAUNCH_MS } from '../src/game/leaderboard';

const ROHIT = 'abc123-defghijklmno';
const OTHER = 'abc124-pqrstuvwxyz0';

const blast = (runs = 60, extra: Partial<BlastTally> = {}): BlastTally => ({
  runs, sixes: Math.floor(runs / 6), fours: 0, wickets: 0,
  dots: 30 - Math.floor(runs / 6) - (runs % 6), balls: 30,
  // Nothing lost, so one batsman made the lot.
  individual: runs, hundreds: Number(runs >= 100), ...extra,
});

const test = (extra: Partial<SurviveTally> = {}): SurviveTally =>
  ({ runs: 20, balls: 40, wickets: 0, blows: 3, health: 60, sixes: 2, fours: 2, ...extra });

/**
 * A store with the name registry pre-loaded, because a career is only ever
 * ranked under a name its owner claimed on one of the innings boards — and
 * claiming is the board's job, not this store's.
 */
function fake(names: Record<string, string> = {}) {
  return memoryCareer<ReturnType<typeof emptyBlast>>(
    new Map(Object.entries(names).map(([name, id]) => [foldName(name), id])),
  );
}

const sending = (over: Partial<Parameters<typeof countInnings>[2]> = {}) => ({
  playerId: ROHIT, name: 'Rohit', avatar: 1, nonce: 'aaaabbbbcccc', address: '1.2.3.4', ...over,
});

describe('counting an innings', () => {
  it('counts the first one and answers with the total', async () => {
    const store = fake({ Rohit: ROHIT });
    const out = await countInnings(store, BLAST_CAREER, { ...sending(), tally: blast(60) });
    expect(refusedCareer(out)).toBe(false);
    if (refusedCareer(out)) return;
    expect(out.counted).toBe(true);
    expect(out.career.runs).toBe(60);
    expect(out.career.innings).toBe(1);
  });

  it('adds the next one to it', async () => {
    const store = fake({ Rohit: ROHIT });
    const at = Date.now();
    await countInnings(store, BLAST_CAREER, { ...sending(), tally: blast(60) }, at);
    const out = await countInnings(
      store, BLAST_CAREER, { ...sending({ nonce: 'ddddeeeeffff' }), tally: blast(24) }, at + 60_000,
    );
    if (refusedCareer(out)) throw new Error('refused');
    expect(out.career.runs).toBe(84);
    expect(out.career.innings).toBe(2);
    expect(out.career.highest).toBe(60);
  });

  it('counts the same innings once however many times it arrives', async () => {
    const store = fake({ Rohit: ROHIT });
    const at = Date.now();
    await countInnings(store, BLAST_CAREER, { ...sending(), tally: blast(60) }, at);
    // The retry the browser sends when it never saw the first answer. It must
    // leave the total exactly where it was, and still report it.
    const again = await countInnings(store, BLAST_CAREER, { ...sending(), tally: blast(60) }, at + 90_000);
    if (refusedCareer(again)) throw new Error('refused');
    expect(again.counted).toBe(false);
    expect(again.career.runs).toBe(60);
    expect(again.career.innings).toBe(1);
  });

  it('leaves a career exactly where it stood when an innings is not counted', async () => {
    const store = fake({ Rohit: ROHIT });
    const at = LAUNCH_MS + 10 * 86_400_000;
    await countInnings(store, BLAST_CAREER, { ...sending(), tally: blast(60) }, at);
    const before = (await readCareerBoards(store, BLAST_CAREER)).boards.runs[0].score;
    // A retry a month later. The total has not moved, so neither may its place
    // in a tie — stamping it with the day of the retry would drop this player
    // below anybody who reached the same total in between.
    await countInnings(store, BLAST_CAREER, { ...sending(), tally: blast(60) }, at + 30 * 86_400_000);
    expect((await readCareerBoards(store, BLAST_CAREER)).boards.runs[0].score).toBe(before);
  });

  it('will not count two innings closer together than one takes to play', async () => {
    const store = fake({ Rohit: ROHIT });
    const at = Date.now();
    await countInnings(store, BLAST_CAREER, { ...sending(), tally: blast(60) }, at);
    const rushed = await countInnings(
      store, BLAST_CAREER, { ...sending({ nonce: 'ddddeeeeffff' }), tally: blast(60) }, at + MIN_INNINGS_MS - 1,
    );
    if (refusedCareer(rushed)) throw new Error('refused');
    expect(rushed.counted).toBe(false);
    expect(rushed.career.runs).toBe(60);
  });

  it('counts one sent just after the gap has passed', async () => {
    const store = fake({ Rohit: ROHIT });
    const at = Date.now();
    await countInnings(store, BLAST_CAREER, { ...sending(), tally: blast(60) }, at);
    const out = await countInnings(
      store, BLAST_CAREER, { ...sending({ nonce: 'ddddeeeeffff' }), tally: blast(60) }, at + MIN_INNINGS_MS,
    );
    if (refusedCareer(out)) throw new Error('refused');
    expect(out.counted).toBe(true);
    expect(out.career.runs).toBe(120);
  });

  /**
   * The day's ceiling is a bound on one *player*; the rate limit above is a
   * bound on one *address*, which is shared by a school, an office and everyone
   * behind CGNAT. So this walks the address on, or the two bounds would be
   * tested as one and whichever came first would hide the other.
   */
  it('stops counting past the day, and starts again the next one', async () => {
    const store = fake({ Rohit: ROHIT });
    let at = Date.UTC(2026, 5, 1, 6);
    for (let i = 0; i < DAILY_INNINGS + 5; i++) {
      await countInnings(
        store, BLAST_CAREER,
        { ...sending({ nonce: `nonce${String(i).padStart(7, '0')}`, address: `10.0.0.${i}` }), tally: blast(6) },
        at,
      );
      at += MIN_INNINGS_MS;
    }
    const spent = await readCareer(store, BLAST_CAREER, ROHIT);
    expect(spent.career?.innings).toBe(DAILY_INNINGS);
    // The next day, the count starts over rather than staying spent.
    const tomorrow = await countInnings(
      store, BLAST_CAREER, { ...sending({ nonce: 'tomorrownonce', address: '10.0.1.1' }), tally: blast(6) },
      at + 86_400_000,
    );
    if (refusedCareer(tomorrow)) throw new Error('refused');
    expect(tomorrow.counted).toBe(true);
    expect(tomorrow.career.innings).toBe(DAILY_INNINGS + 1);
  });

  it('turns down an innings that could not have happened', async () => {
    const store = fake({ Rohit: ROHIT });
    const out = await countInnings(
      store, BLAST_CAREER,
      { ...sending(), tally: { runs: 500, sixes: 0, fours: 0, wickets: 0, dots: 0, balls: 30, individual: 500, hundreds: 5 } },
    );
    expect(refusedCareer(out)).toBe(true);
    if (!refusedCareer(out)) return;
    expect(out.status).toBe(400);
  });

  it('turns down an innings with no id of its own', async () => {
    const store = fake({ Rohit: ROHIT });
    const out = await countInnings(store, BLAST_CAREER, { ...sending({ nonce: '' }), tally: blast() });
    expect(refusedCareer(out)).toBe(true);
  });

  it('turns down something that is not a player', async () => {
    const store = fake();
    const out = await countInnings(store, BLAST_CAREER, { ...sending({ playerId: 'nobody' }), tally: blast() });
    expect(refusedCareer(out)).toBe(true);
  });

  it('turns an address away once it has sent too many', async () => {
    const store = fake({ Rohit: ROHIT });
    let last = await countInnings(store, BLAST_CAREER, { ...sending(), tally: blast() });
    for (let i = 0; i < 200 && !refusedCareer(last); i++) {
      last = await countInnings(store, BLAST_CAREER, { ...sending({ nonce: `spam${String(i).padStart(8, '0')}` }), tally: blast() });
    }
    expect(refusedCareer(last)).toBe(true);
    if (!refusedCareer(last)) return;
    expect(last.status).toBe(429);
  });
});

describe('the name a career is ranked under', () => {
  it('counts a player who has never registered, and keeps them off the boards', async () => {
    const store = fake();
    const out = await countInnings(store, BLAST_CAREER, { ...sending({ name: '' }), tally: blast(60) });
    if (refusedCareer(out)) throw new Error('refused');
    expect(out.counted).toBe(true);
    expect(out.name).toBe('');
    const boards = await readCareerBoards(store, BLAST_CAREER);
    expect(boards.boards.runs).toEqual([]);
  });

  it('refuses a name the registry says belongs to somebody else', async () => {
    const store = fake({ Rohit: OTHER });
    const out = await countInnings(store, BLAST_CAREER, { ...sending(), tally: blast(60) });
    if (refusedCareer(out)) throw new Error('refused');
    // The innings still counts — it is theirs. It is the name that is not.
    expect(out.counted).toBe(true);
    expect(out.name).toBe('');
  });

  it('puts every innings already counted onto the boards once a name is claimed', async () => {
    const names = new Map<string, string>();
    const store = memoryCareer<ReturnType<typeof emptyBlast>>(names);
    const at = Date.now();
    // Three innings before registering.
    await countInnings(store, BLAST_CAREER, { ...sending({ name: '', nonce: 'one11111111' }), tally: blast(60) }, at);
    await countInnings(store, BLAST_CAREER, { ...sending({ name: '', nonce: 'two22222222' }), tally: blast(36) }, at + 60_000);
    expect((await readCareerBoards(store, BLAST_CAREER)).boards.runs).toEqual([]);
    // Then the name is claimed on an innings board, and the next innings brings
    // the whole career onto the ladder rather than only what came after it.
    names.set(foldName('Rohit'), ROHIT);
    await countInnings(store, BLAST_CAREER, { ...sending({ nonce: 'three3333333' }), tally: blast(12) }, at + 120_000);
    const rows = (await readCareerBoards(store, BLAST_CAREER)).boards.runs;
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Rohit');
    expect(rows[0].career.runs).toBe(108);
  });

  it('carries a name onto a career even when the innings itself is a retry', async () => {
    const names = new Map<string, string>();
    const store = memoryCareer<ReturnType<typeof emptyBlast>>(names);
    const at = Date.now();
    await countInnings(store, BLAST_CAREER, { ...sending({ name: '' }), tally: blast(60) }, at);
    names.set(foldName('Rohit'), ROHIT);
    // The same innings id, arriving again now that a name is held.
    const again = await countInnings(store, BLAST_CAREER, { ...sending(), tally: blast(60) }, at + 60_000);
    if (refusedCareer(again)) throw new Error('refused');
    expect(again.counted).toBe(false);
    expect(again.name).toBe('Rohit');
    expect((await readCareerBoards(store, BLAST_CAREER)).boards.runs).toHaveLength(1);
  });
});

describe('a name stamped at the moment a place is claimed', () => {
  it('puts a first-time registrant on the career boards without a second innings', async () => {
    const store = fake({ Rohit: ROHIT });
    // The innings is counted before the card is on screen, so at that moment
    // this browser has never batted under a name and sends none.
    await countInnings(store, BLAST_CAREER, { ...sending({ name: '' }), tally: blast(60) });
    expect((await readCareerBoards(store, BLAST_CAREER)).boards.runs).toEqual([]);
    // Then they register, which is the claim path calling this.
    await nameCareer(store, BLAST_CAREER, ROHIT, 'Rohit', 1);
    const rows = (await readCareerBoards(store, BLAST_CAREER)).boards.runs;
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Rohit');
    expect(rows[0].career.runs).toBe(60);
  });

  it('stamps the rank with when the total was reached, not when the name was', async () => {
    const early = fake({ Rohit: ROHIT });
    const late = fake({ Bumrah: OTHER });
    const reached = LAUNCH_MS + 10 * 86_400_000;
    await countInnings(early, BLAST_CAREER, { ...sending(), tally: blast(60) }, reached);
    await countInnings(
      late, BLAST_CAREER, { ...sending({ playerId: OTHER, name: 'Bumrah' }), tally: blast(60) },
      reached + 30 * 86_400_000,
    );
    // The name is claimed the other way round: the player who got there first
    // registers last. Their score must still be the higher one.
    await nameCareer(late, BLAST_CAREER, OTHER, 'Bumrah', 0);
    await nameCareer(early, BLAST_CAREER, ROHIT, 'Rohit', 0);
    const first = (await readCareerBoards(early, BLAST_CAREER)).boards.runs[0].score;
    const after = (await readCareerBoards(late, BLAST_CAREER)).boards.runs[0].score;
    expect(first).toBeGreaterThan(after);
  });

  it('has nothing to stamp for a player who has never finished an innings', async () => {
    const store = fake({ Rohit: ROHIT });
    await nameCareer(store, BLAST_CAREER, ROHIT, 'Rohit', 1);
    expect((await readCareer(store, BLAST_CAREER, ROHIT)).career).toBeNull();
    expect((await readCareerBoards(store, BLAST_CAREER)).boards.runs).toEqual([]);
  });

  it('ignores an empty name and something that is not a player', async () => {
    const store = fake({ Rohit: ROHIT });
    await countInnings(store, BLAST_CAREER, { ...sending({ name: '' }), tally: blast(60) });
    await nameCareer(store, BLAST_CAREER, ROHIT, '', 1);
    await nameCareer(store, BLAST_CAREER, 'nobody', 'Rohit', 1);
    expect((await readCareerBoards(store, BLAST_CAREER)).boards.runs).toEqual([]);
  });
});

describe('the career boards, read', () => {
  it('answers with every ladder of the mode at once', async () => {
    const store = fake({ Rohit: ROHIT });
    await countInnings(store, BLAST_CAREER, { ...sending(), tally: blast(60) }, LAUNCH_MS);
    const payload = await readCareerBoards(store, BLAST_CAREER);
    expect(Object.keys(payload.boards)).toEqual(['runs', 'boundaries', 'individual']);
    expect(payload.size).toBe(CAREER_BOARD_SIZE);
  });

  it('puts the bigger career above the smaller one', async () => {
    const store = fake({ Rohit: ROHIT, Bumrah: OTHER });
    const at = Date.now();
    await countInnings(store, BLAST_CAREER, { ...sending(), tally: blast(60) }, at);
    await countInnings(
      store, BLAST_CAREER,
      { ...sending({ playerId: OTHER, name: 'Bumrah', nonce: 'zzzzyyyyxxxx' }), tally: blast(120) },
      at,
    );
    const rows = (await readCareerBoards(store, BLAST_CAREER)).boards.runs;
    expect(rows.map(row => row.name)).toEqual(['Bumrah', 'Rohit']);
  });

  it('leaves a player off a ladder they have nothing on', async () => {
    const store = fake({ Rohit: ROHIT });
    // A career of singles: runs and a highest score, and not one boundary.
    await countInnings(
      store, BLAST_CAREER,
      { ...sending(), tally: { runs: 10, sixes: 0, fours: 0, wickets: 0, dots: 20, balls: 30, individual: 10, hundreds: 0 } },
    );
    const payload = await readCareerBoards(store, BLAST_CAREER);
    expect(payload.boards.runs).toHaveLength(1);
    expect(payload.boards.boundaries).toHaveLength(0);
  });

  it('keeps the two modes apart', async () => {
    const names = new Map([[foldName('Rohit'), ROHIT]]);
    const blastStore = memoryCareer<ReturnType<typeof emptyBlast>>(names);
    const testStore = memoryCareer<ReturnType<typeof emptySurvive>>(names);
    await countInnings(blastStore, BLAST_CAREER, { ...sending(), tally: blast(60) });
    await countInnings(testStore, SURVIVE_CAREER, { ...sending(), tally: test() });
    expect((await readCareerBoards(blastStore, BLAST_CAREER)).boards.runs[0].career.runs).toBe(60);
    expect((await readCareerBoards(testStore, SURVIVE_CAREER)).boards.runs[0].career.runs).toBe(20);
  });

  it('answers with nothing for a player who has never finished an innings', async () => {
    const store = fake();
    expect((await readCareer(store, BLAST_CAREER, ROHIT)).career).toBeNull();
    expect((await readCareer(store, BLAST_CAREER, 'nobody')).career).toBeNull();
  });
});
