import { describe, expect, it } from 'vitest';
import { GAME } from '../src/config/gameplay';
import {
  CHALLENGE_LIFE_MS, CODE_ALPHABET, CODE_LENGTH, CREATE_LIMIT, FORFEIT_AFTER_MS, PLAYERS_MAX, SCORING_VERSION,
  challengeRefused, cleanCard, cleanCode, createChallenge, joinChallenge, markSeen, newCode, readChallenge,
  readMine, recordBalls, stateOf, statusOf,
  type Batter, type ChallengeListOutcome, type ChallengeOutcome, type ChallengeRefusal, type ChallengeStore,
  type StoredChallenge,
} from '../src/server/challenge-store';
import { challengeRequest } from '../src/server/challenge-endpoint';
import { memoryChallenges } from '../src/server/memory-store';
import { nameBlocked } from '../src/server/name-filter';

/**
 * A match room's rules, run against the same in-memory store the dev server
 * uses. One fake rather than two: a second copy written for the tests would
 * drift from the one the endpoint is developed against, and the drift would be
 * invisible.
 */

const HOST = 'abcdef-abcdefghijkl';
const FRIEND = 'abcdeg-mnopqrstuvwx';
const THIRD = 'abcdeh-bcdefghijklm';
const T0 = Date.UTC(2026, 8, 1, 12, 0, 0);

/** An innings of `runs`, made of sixes and singles over the full thirty balls. */
const card = (runs: number): string => {
  const sixes = Math.floor(runs / 6);
  const singles = runs % 6;
  const innings = '6'.repeat(sixes) + '1'.repeat(singles);
  if (innings.length > GAME.totalBalls) throw new Error(`${runs} cannot be made in thirty balls`);
  return innings.padEnd(GAME.totalBalls, '0');
};

/** An innings that ended early, because the wickets ran out. */
const allOut = (runs: number): string => '6'.repeat(Math.floor(runs / 6)) + '1'.repeat(runs % 6) + 'WWW';

const who = (over: Partial<Batter> = {}): Batter =>
  ({ playerId: HOST, name: 'VK', avatar: 0, address: '1.2.3.4', ...over });
const friend = (over: Partial<Batter> = {}): Batter => who({ playerId: FRIEND, name: 'Rahul', avatar: 1, ...over });

/** The room out of an outcome, or a failure naming what was refused instead. */
function took<T extends ChallengeOutcome | ChallengeListOutcome>(outcome: T): Exclude<T, ChallengeRefusal> {
  if (challengeRefused(outcome)) throw new Error(`refused: ${outcome.status} ${outcome.reason}`);
  return outcome as Exclude<T, ChallengeRefusal>;
}
function refused(outcome: ChallengeOutcome | ChallengeListOutcome): number {
  if (!challengeRefused(outcome)) throw new Error('was taken');
  return outcome.status;
}

/** An empty room, made by the host. */
async function room(store: ChallengeStore, now = T0) {
  return took(await createChallenge(store, who(), now)).code;
}

/** A whole innings, sent the way the game sends it: the card so far, ball by ball. */
async function bat(store: ChallengeStore, code: string, batter: Batter, innings: string, from = T0) {
  let last: ChallengeOutcome | null = null;
  for (let i = 1; i <= innings.length; i++) {
    last = await recordBalls(store, code, { ...batter, card: innings.slice(0, i) }, from + i * 5000);
  }
  return took(last!);
}

describe('codes', () => {
  it('are six characters nobody misreads', () => {
    expect(CODE_LENGTH).toBe(6);
    const code = newCode(() => 0.5);
    expect(code).toHaveLength(6);
    for (const char of code) expect(CODE_ALPHABET).toContain(char);
    expect(CODE_ALPHABET.length ** CODE_LENGTH).toBeGreaterThan(1e9);
    for (const char of '01OI') expect(CODE_ALPHABET).not.toContain(char);
  });

  it('are read back however they were typed, and refused when mangled', () => {
    expect(cleanCode('k7qpx2')).toBe('K7QPX2');
    expect(cleanCode('  K7QPX2 ')).toBe('K7QPX2');
    expect(cleanCode('K7QPX')).toBeNull();
    expect(cleanCode('K7QPX0')).toBeNull();
    expect(cleanCode(null)).toBeNull();
  });
});

describe('cards', () => {
  it('take an empty one, a partial one and a whole one', () => {
    expect(cleanCard('')).toBe('');
    expect(cleanCard('6041W')).toBe('6041W');
    expect(cleanCard(card(102))).toBe(card(102));
    expect(cleanCard(allOut(30))).toBe(allOut(30));
  });
  it('refuse balls after the innings had ended, and anything that is not balls', () => {
    expect(cleanCard(allOut(30) + '4')).toBeNull();
    expect(cleanCard('6'.repeat(31))).toBeNull();
    expect(cleanCard('5')).toBeNull();
    expect(cleanCard(7)).toBeNull();
  });
});

describe('making a room', () => {
  it('is empty, open, with the host joined and not yet batting', async () => {
    const store = memoryChallenges();
    const made = took(await createChallenge(store, who(), T0));
    expect(made.challenge.state).toBe('open');
    expect(made.challenge.host).toBe(HOST);
    expect(made.challenge.size).toBe(PLAYERS_MAX);
    expect(made.challenge.expiresAt).toBe(T0 + CHALLENGE_LIFE_MS);
    expect(made.challenge.v).toBe(SCORING_VERSION);
    expect(made.challenge.rematchOf).toBeNull();
    expect(made.challenge.players).toHaveLength(1);
    expect(made.challenge.players[0]).toMatchObject({ playerId: HOST, name: 'VK', host: true, status: 'joined', card: '' });
  });

  it('can be made from an innings that has just ended, with the score worked out from the balls', async () => {
    const store = memoryChallenges();
    const made = took(await createChallenge(store, { ...who(), card: '6'.repeat(30) }, T0));
    expect(made.challenge.state).toBe('live');
    expect(made.challenge.players[0]).toMatchObject({ runs: 180, sixes: 30, balls: 30, wickets: 0, status: 'done' });
  });

  it('refuses an innings that never ended, and anything that is not one', async () => {
    const store = memoryChallenges();
    for (const bad of ['664466446644', 'not an innings', '6'.repeat(31), 55]) {
      expect(refused(await createChallenge(store, { ...who(), card: bad }, T0)), String(bad)).toBe(400);
    }
  });

  it('remembers what it is a rematch of', async () => {
    const store = memoryChallenges();
    const first = await room(store);
    const again = took(await createChallenge(store, { ...who(), rematchOf: first }, T0));
    expect(again.challenge.rematchOf).toBe(first);
    const junk = took(await createChallenge(store, { ...who(), rematchOf: 'nope' }, T0));
    expect(junk.challenge.rematchOf).toBeNull();
  });

  it('refuses a caller who is not a player, a kit that does not exist, or a name nobody should be sent', async () => {
    const store = memoryChallenges();
    for (const over of [{ playerId: 'nope' }, { avatar: 99 }, { name: '   ' }, { name: 'F.u.c.k' }]) {
      expect(refused(await createChallenge(store, who(over), T0)), JSON.stringify(over)).toBe(400);
    }
  });

  it('holds creation down to a number an hour', async () => {
    const store = memoryChallenges();
    for (let i = 0; i < CREATE_LIMIT; i++) took(await createChallenge(store, who(), T0));
    expect(refused(await createChallenge(store, who(), T0))).toBe(429);
    took(await createChallenge(store, who({ address: '5.6.7.8' }), T0));
  });

  it('redraws a code somebody already holds, and says so rather than looping', async () => {
    const store = memoryChallenges();
    const first = took(await createChallenge(store, who(), T0, () => 0));
    const draws = [0, 0, 0.5];
    let drawn = 0;
    const second = took(await createChallenge(store, friend(), T0, () => draws[Math.min(drawn++, 2)]));
    expect(second.code).not.toBe(first.code);
    expect(refused(await createChallenge(store, who({ playerId: THIRD }), T0, () => 0))).toBe(503);
  });
});

describe('joining', () => {
  it('adds a row, once, however many times the link is opened', async () => {
    const store = memoryChallenges();
    const code = await room(store);
    const joined = took(await joinChallenge(store, code, friend(), T0 + 1000));
    expect(joined.challenge.players.map(row => row.playerId)).toEqual([HOST, FRIEND]);
    const again = took(await joinChallenge(store, code, friend(), T0 + 2000));
    expect(again.challenge.players).toHaveLength(2);
    expect(again.challenge.players[1].joined).toBe(T0 + 1000);
  });

  it('is what puts the room on the player\'s own list', async () => {
    const store = memoryChallenges();
    const code = await room(store);
    took(await joinChallenge(store, code, friend(), T0));
    const mine = took(await readMine(store, FRIEND, T0));
    expect(mine.challenges.map(one => one.code)).toEqual([code]);
    const hosts = took(await readMine(store, HOST, T0));
    expect(hosts.challenges.map(one => one.code)).toEqual([code]);
  });

  it('turns away a full room, and a room that has closed', async () => {
    const store = memoryChallenges();
    const code = await room(store);
    for (let i = 1; i < PLAYERS_MAX; i++) {
      took(await joinChallenge(store, code, friend({ playerId: `abcdef-${String(i).padStart(12, 'x')}` }), T0));
    }
    expect(refused(await joinChallenge(store, code, friend({ playerId: THIRD }), T0))).toBe(409);
    const stale = await room(store);
    expect(refused(await joinChallenge(store, stale, friend(), T0 + CHALLENGE_LIFE_MS))).toBe(410);
  });

  it('still takes a third friend after two have finished — a forwarded link is a leaderboard', async () => {
    const store = memoryChallenges();
    const code = await room(store);
    await bat(store, code, who(), card(102));
    took(await joinChallenge(store, code, friend(), T0));
    await bat(store, code, friend(), card(90));
    expect(took(await readChallenge(store, code, T0 + 3600_000)).challenge.state).toBe('done');
    const third = took(await joinChallenge(store, code, friend({ playerId: THIRD, name: 'Amit' }), T0 + 3600_000));
    expect(third.challenge.state).toBe('live');
    expect(third.challenge.players).toHaveLength(3);
  });
});

describe('batting', () => {
  it('takes the innings a ball at a time and works the figures out as it goes', async () => {
    const store = memoryChallenges();
    const code = await room(store);
    const after = took(await recordBalls(store, code, { ...who(), card: '64' }, T0 + 1));
    expect(after.challenge.players[0]).toMatchObject({ status: 'batting', runs: 10, balls: 2, sixes: 1, fours: 1 });
    expect(after.challenge.state).toBe('live');
    const end = await bat(store, code, who(), '64' + card(96).slice(2));
    expect(end.challenge.players[0]).toMatchObject({ status: 'done', balls: 30 });
    expect(end.challenge.players[0].runs).toBe(10 + 96 - 12);
  });

  it('hands back the room for the same balls again, or fewer — the retry is never refused', async () => {
    const store = memoryChallenges();
    const code = await room(store);
    took(await recordBalls(store, code, { ...who(), card: '6041' }, T0));
    expect(took(await recordBalls(store, code, { ...who(), card: '6041' }, T0)).challenge.players[0].balls).toBe(4);
    expect(took(await recordBalls(store, code, { ...who(), card: '60' }, T0)).challenge.players[0].balls).toBe(4);
  });

  it('refuses an innings that disagrees with the one already in — no replaying a bad over', async () => {
    const store = memoryChallenges();
    const code = await room(store);
    took(await recordBalls(store, code, { ...who(), card: '60W1' }, T0));
    expect(refused(await recordBalls(store, code, { ...who(), card: '6066' }, T0))).toBe(409);
    expect(refused(await recordBalls(store, code, { ...who(), card: '61' }, T0))).toBe(409);
  });

  it('refuses balls from somebody who has not joined, and more balls after the innings ended', async () => {
    const store = memoryChallenges();
    const code = await room(store);
    expect(refused(await recordBalls(store, code, { ...friend(), card: '6' }, T0))).toBe(409);
    await bat(store, code, who(), allOut(30));
    expect(refused(await recordBalls(store, code, { ...who(), card: allOut(30) + '6' }, T0))).toBe(400);
  });

  it('gives up an innings left for a day, and ranks it under every finished one', async () => {
    const store = memoryChallenges();
    const code = await room(store);
    took(await joinChallenge(store, code, friend(), T0));
    took(await recordBalls(store, code, { ...who(), card: '666666' }, T0));
    await bat(store, code, friend(), card(20), T0);
    const soon = took(await readChallenge(store, code, T0 + 3600_000)).challenge;
    expect(soon.players.find(row => row.playerId === HOST)?.status).toBe('batting');
    expect(soon.state).toBe('live');
    const later = took(await readChallenge(store, code, T0 + FORFEIT_AFTER_MS + 1)).challenge;
    expect(later.players.map(row => [row.playerId, row.status])).toEqual([[FRIEND, 'done'], [HOST, 'forfeit']]);
    expect(later.state).toBe('done');
    expect(refused(await recordBalls(store, code, { ...who(), card: '6666666' }, T0 + FORFEIT_AFTER_MS + 1))).toBe(409);
  });
});

describe('the result', () => {
  it('puts the finished innings first, best first, on runs then sixes then fours', async () => {
    const store = memoryChallenges();
    const code = await room(store);
    took(await joinChallenge(store, code, friend(), T0));
    took(await joinChallenge(store, code, friend({ playerId: THIRD, name: 'Amit', avatar: 2 }), T0));
    await bat(store, code, who(), '6'.repeat(4) + '1'.repeat(6) + '0'.repeat(20));        // 30, four sixes
    await bat(store, code, friend(), '4'.repeat(6) + '1'.repeat(6) + '0'.repeat(18));      // 30, no sixes
    const read = took(await readChallenge(store, code, T0 + 60_000)).challenge;
    expect(read.players.map(row => [row.name, row.runs, row.status])).toEqual([
      ['VK', 30, 'done'], ['Rahul', 30, 'done'], ['Amit', 0, 'joined'],
    ]);
    expect(read.state).toBe('live');
  });

  it('leaves two innings level on all three keys level — that is a draw, whoever batted first', async () => {
    const store = memoryChallenges();
    const code = await room(store);
    took(await joinChallenge(store, code, friend(), T0));
    await bat(store, code, who(), card(47));
    await bat(store, code, friend(), card(47), T0 + 3600_000);
    const read = took(await readChallenge(store, code, T0 + 7200_000)).challenge;
    expect(read.players[0].score).toBe(read.players[1].score);
    expect(read.state).toBe('done');
  });

  it('is done for good — a week later it is still the result, not an expiry', async () => {
    const store = memoryChallenges();
    const code = await room(store);
    took(await joinChallenge(store, code, friend(), T0));
    await bat(store, code, who(), card(47));
    await bat(store, code, friend(), card(40));
    expect(took(await readChallenge(store, code, T0 + CHALLENGE_LIFE_MS + 1)).challenge.state).toBe('done');
  });

  it('expires when nobody answered in the week, keeping the innings that was played', async () => {
    const store = memoryChallenges();
    const code = await room(store);
    await bat(store, code, who(), card(47));
    const late = took(await readChallenge(store, code, T0 + CHALLENGE_LIFE_MS + 1)).challenge;
    expect(late.state).toBe('expired');
    expect(late.players[0]).toMatchObject({ runs: 47, status: 'done' });
    expect(refused(await recordBalls(store, code, { ...friend(), card: '6' }, T0 + CHALLENGE_LIFE_MS + 1))).toBe(409);
  });

  it('is void under an older scoring version', () => {
    const stale: StoredChallenge = { at: T0, host: HOST, v: SCORING_VERSION - 1, rematchOf: null, players: {} };
    expect(stateOf(stale, T0)).toBe('void');
  });

  it('notes who has seen it', async () => {
    const store = memoryChallenges();
    const code = await room(store);
    took(await joinChallenge(store, code, friend(), T0));
    await bat(store, code, who(), card(47));
    await bat(store, code, friend(), card(40));
    const seen = took(await markSeen(store, code, friend(), T0)).challenge;
    expect(seen.players.map(row => [row.playerId, row.seen])).toEqual([[HOST, false], [FRIEND, true]]);
  });
});

describe('a player\'s list', () => {
  it('is every room they are in, newest first, and forgets rooms that have gone', async () => {
    const store = memoryChallenges();
    const first = await room(store, T0);
    const second = await room(store, T0 + 1000);
    took(await joinChallenge(store, first, friend(), T0));
    took(await joinChallenge(store, second, friend(), T0));
    const mine = took(await readMine(store, FRIEND, T0));
    expect(mine.challenges.map(one => one.code)).toEqual([second, first]);
    store.expire(first);
    const after = took(await readMine(store, FRIEND, T0));
    expect(after.challenges.map(one => one.code)).toEqual([second]);
    expect(await store.indexed(FRIEND)).toEqual([second]);
  });

  it('is nothing for a stranger, and refused for a non-player', async () => {
    const store = memoryChallenges();
    expect((took(await readMine(store, THIRD, T0)) as ChallengeListOutcome).challenges).toEqual([]);
    expect(refused(await readMine(store, 'nope', T0))).toBe(400);
  });
});

describe('the endpoint', () => {
  it('routes the four writes and the two reads', async () => {
    const store = memoryChallenges();
    const post = (body: Record<string, unknown>) =>
      challengeRequest(store, { method: 'POST', query: {}, body: JSON.stringify(body), address: 'test' });
    const made = took(await post({ action: 'create', ...who() }));
    if (!('code' in made)) throw new Error('no code');
    took(await post({ action: 'join', code: made.code, ...friend() }));
    took(await post({ action: 'ball', code: made.code, ...friend(), card: '6' }));
    took(await post({ action: 'seen', code: made.code, ...friend() }));
    const read = took(await challengeRequest(store, { method: 'GET', query: { code: made.code }, body: undefined, address: 'test' }));
    expect('challenge' in read && read.challenge.players).toHaveLength(2);
    const mine = took(await challengeRequest(store, { method: 'GET', query: { player: FRIEND }, body: undefined, address: 'test' }));
    expect('challenges' in mine && mine.challenges).toHaveLength(1);
    expect(refused(await post({ action: 'dance' }))).toBe(400);
    expect(refused(await challengeRequest(store, { method: 'PUT', query: {}, body: undefined, address: 'test' }))).toBe(405);
  });
});

describe('statuses', () => {
  it('read off the balls and the clock', () => {
    const base = { name: 'x', avatar: 0, joined: T0, at: T0 };
    expect(statusOf({ ...base, card: '' }, T0)).toBe('joined');
    expect(statusOf({ ...base, card: '64' }, T0 + 1000)).toBe('batting');
    expect(statusOf({ ...base, card: '64' }, T0 + FORFEIT_AFTER_MS + 1)).toBe('forfeit');
    expect(statusOf({ ...base, card: card(10) }, T0 + FORFEIT_AFTER_MS + 1)).toBe('done');
    expect(statusOf({ ...base, card: 'WWW' }, T0)).toBe('done');
  });
});

describe('the name filter', () => {
  it('catches the obvious, through spacing and dots, and lets ordinary names by', () => {
    expect(nameBlocked('Rahul')).toBe(false);
    expect(nameBlocked('Big Show')).toBe(false);
    expect(nameBlocked('sh it')).toBe(true);
    expect(nameBlocked('Chutiya')).toBe(true);
    expect(nameBlocked('B.h.e.n.c.h.o.d')).toBe(true);
  });
});
