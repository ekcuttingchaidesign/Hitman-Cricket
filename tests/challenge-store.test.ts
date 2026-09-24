import { describe, expect, it } from 'vitest';
import { GAME } from '../src/config/gameplay';
import { packScore } from '../src/game/leaderboard';
import { figuresOf } from '../src/game/ball-string';
import {
  CHALLENGE_TTL_SECONDS, CODE_ALPHABET, CODE_LENGTH, CREATE_LIMIT, OPPONENTS, WRITE_LIMIT,
  answerChallenge, challengeRefused, cleanCode, createChallenge, newCode, readChallenge,
  stateOf, type Batter, type ChallengeOutcome, type ChallengeStore,
} from '../src/server/challenge-store';
import { memoryChallenges } from '../src/server/memory-store';

/**
 * A challenge's rules, run against the same in-memory store the dev server uses.
 * One fake rather than two: a second copy written for the tests would drift from
 * the one the endpoint is developed against, and the drift would be invisible.
 */

const HOST = 'abcdef-abcdefghijkl';
const FRIEND = 'abcdeg-mnopqrstuvwx';
const THIRD = 'abcdeh-bcdefghijklm';

/** An innings of `runs`, made of sixes and singles over the full thirty balls. */
const card = (runs: number): string => {
  const sixes = Math.floor(runs / 6);
  const singles = runs % 6;
  const innings = '6'.repeat(sixes) + '1'.repeat(singles);
  if (innings.length > GAME.totalBalls) throw new Error(`${runs} cannot be made in thirty balls`);
  return innings.padEnd(GAME.totalBalls, '0');
};

/** An innings that ended early, because the wickets ran out. */
const allOut = (runs: number): string => {
  const sixes = Math.floor(runs / 6);
  const singles = runs % 6;
  return '6'.repeat(sixes) + '1'.repeat(singles) + 'WWW';
};

const batter = (over: Partial<Batter> = {}): Batter =>
  ({ playerId: HOST, name: 'VK', avatar: 0, address: '1.2.3.4', card: card(102), ...over });

/** The challenge out of an outcome, or a failure naming what was refused instead. */
function took(outcome: ChallengeOutcome) {
  if (challengeRefused(outcome)) throw new Error(`refused: ${outcome.status} ${outcome.reason}`);
  return outcome;
}

/** A challenge, set and ready to be answered. */
async function set(store: ChallengeStore, runs = 102) {
  return took(await createChallenge(store, batter({ card: card(runs) }))).code;
}

describe('codes', () => {
  it('are six characters nobody misreads', () => {
    expect(CODE_LENGTH).toBe(6);
    const code = newCode(() => 0.5);
    expect(code).toHaveLength(6);
    for (const char of code) expect(CODE_ALPHABET).toContain(char);
    // A challenge lives a week with reads uncounted, so the keyspace has to be
    // too big to walk. Six of thirty-two is over a billion.
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

describe('setting a challenge', () => {
  it('holds one innings, open, with the setter as challenger', async () => {
    const store = memoryChallenges();
    const made = took(await createChallenge(store, batter()));
    expect(made.challenge.state).toBe('open');
    expect(made.challenge.host).toBe(HOST);
    expect(made.challenge.size).toBe(OPPONENTS + 1);
    expect(made.challenge.players).toHaveLength(1);
    expect(made.challenge.players[0]).toMatchObject({ playerId: HOST, name: 'VK', runs: 102, challenger: true });
  });

  it('works the score out from the balls rather than being told it', async () => {
    const store = memoryChallenges();
    const made = took(await createChallenge(store, batter({ card: '6'.repeat(30) })));
    expect(made.challenge.players[0]).toMatchObject({ runs: 180, sixes: 30, balls: 30, wickets: 0 });
  });

  it('refuses an innings that never ended', async () => {
    const store = memoryChallenges();
    // Twelve balls with wickets in hand adds up fine and is not a result.
    const outcome = await createChallenge(store, batter({ card: '664466446644' }));
    expect(challengeRefused(outcome) && outcome.status).toBe(400);
  });

  it('refuses anything that is not an innings', async () => {
    const store = memoryChallenges();
    for (const bad of ['', 'not an innings', '6'.repeat(31), 55, null]) {
      const outcome = await createChallenge(store, batter({ card: bad }));
      expect(challengeRefused(outcome) && outcome.status, String(bad)).toBe(400);
    }
  });

  it('refuses a caller who is not a player, or a kit that does not exist', async () => {
    const store = memoryChallenges();
    for (const over of [{ playerId: 'nope' }, { avatar: 99 }, { name: '   ' }]) {
      const outcome = await createChallenge(store, batter(over));
      expect(challengeRefused(outcome) && outcome.status).toBe(400);
    }
  });

  it('redraws a code somebody already holds, and says so rather than looping', async () => {
    const store = memoryChallenges();
    const first = took(await createChallenge(store, batter(), Date.now(), () => 0));
    const draws = [0, 0, 0.5];
    let drawn = 0;
    const second = took(await createChallenge(
      store, batter({ playerId: FRIEND }), Date.now(), () => draws[Math.min(drawn++, 2)]));
    expect(second.code).not.toBe(first.code);

    const stuck = await createChallenge(store, batter({ playerId: THIRD }), Date.now(), () => 0);
    expect(challengeRefused(stuck) && stuck.status).toBe(503);
  });
});

describe('answering a challenge', () => {
  it('puts both innings on one scoreline, best first', async () => {
    const store = memoryChallenges();
    const code = await set(store, 102);
    const done = took(await answerChallenge(store, code, batter({ playerId: FRIEND, name: 'Rahul', card: card(114) })));
    expect(done.challenge.state).toBe('answered');
    expect(done.challenge.players.map(one => [one.name, one.runs])).toEqual([['Rahul', 114], ['VK', 102]]);
  });

  it('hands a dead-level challenge to the challenger', async () => {
    const store = memoryChallenges();
    const early = Date.UTC(2026, 5, 1, 12, 0, 0);
    const code = took(await createChallenge(store, batter({ card: card(102) }), early)).code;
    const done = took(await answerChallenge(
      store, code, batter({ playerId: FRIEND, name: 'Rahul', card: card(102) }), early + 60_000));
    // The chaser had to beat it, not match it — and that falls out of the
    // board's own tiebreak, where the earlier stamp wins.
    expect(done.challenge.players.map(one => one.name)).toEqual(['VK', 'Rahul']);
  });

  it('is refused for the challenger: you cannot chase yourself', async () => {
    const store = memoryChallenges();
    const code = await set(store);
    const outcome = await answerChallenge(store, code, batter({ card: card(150) }));
    expect(challengeRefused(outcome) && outcome.status).toBe(409);
  });

  it('is idempotent, so a lost response never costs an innings', async () => {
    const store = memoryChallenges();
    const code = await set(store, 102);
    const first = took(await answerChallenge(store, code, batter({ playerId: FRIEND, name: 'Rahul', card: card(114) })));
    // The same browser retrying after a dropped response, with anything at all
    // in the body: it gets the result it already has, never a second innings.
    const retry = took(await answerChallenge(store, code, batter({ playerId: FRIEND, name: 'Rahul', card: card(180) })));
    expect(retry.challenge.players).toEqual(first.challenge.players);
    expect(retry.challenge.players.find(one => one.playerId === FRIEND)?.runs).toBe(114);
  });

  it('is refused once somebody else has answered', async () => {
    const store = memoryChallenges();
    const code = await set(store);
    took(await answerChallenge(store, code, batter({ playerId: FRIEND, name: 'Rahul', card: card(114) })));
    const late = await answerChallenge(store, code, batter({ playerId: THIRD, name: 'Priya', card: card(120) }));
    expect(challengeRefused(late) && late.status).toBe(409);
    expect(took(await readChallenge(store, code)).challenge.players).toHaveLength(2);
  });

  it('takes an innings that ended because the wickets ran out', async () => {
    const store = memoryChallenges();
    const code = await set(store, 102);
    const done = took(await answerChallenge(
      store, code, batter({ playerId: FRIEND, name: 'Rahul', card: allOut(40) })));
    const chaser = done.challenge.players.find(one => one.playerId === FRIEND);
    expect(chaser).toMatchObject({ runs: 40, wickets: 3 });
    // All out on the thirteenth ball is a result, and a losing one.
    expect(done.challenge.players[0].name).toBe('VK');
  });

  it('refuses an innings that never ended', async () => {
    const store = memoryChallenges();
    const code = await set(store);
    const outcome = await answerChallenge(store, code, batter({ playerId: FRIEND, card: '664466446644' }));
    expect(challengeRefused(outcome) && outcome.status).toBe(400);
  });

  it('is refused under a code that is not one, or a challenge that has closed', async () => {
    const store = memoryChallenges();
    const code = await set(store);
    const missing = await answerChallenge(store, 'ZZZZZZ', batter({ playerId: FRIEND }));
    expect(challengeRefused(missing) && missing.status).toBe(404);
    const mangled = await answerChallenge(store, 'nope', batter({ playerId: FRIEND }));
    expect(challengeRefused(mangled) && mangled.status).toBe(400);

    store.expire(code);
    const gone = await answerChallenge(store, code, batter({ playerId: FRIEND }));
    expect(challengeRefused(gone) && gone.status).toBe(404);
  });

  it('lasts a week, not an afternoon', async () => {
    // The premise is that the friend was busy and played in the evening — or on
    // Wednesday. Two hours would break it outright.
    expect(CHALLENGE_TTL_SECONDS).toBe(7 * 24 * 60 * 60);
  });
});

describe('reading a challenge', () => {
  it('carries the challenger\'s innings, which is the ghost', async () => {
    const store = memoryChallenges();
    const code = await set(store, 102);
    const read = took(await readChallenge(store, code));
    const setter = read.challenge.players.find(one => one.challenger);
    expect(setter?.card).toBe(card(102));
    expect(figuresOf(setter!.card).runs).toBe(102);
  });

  it('is the same answer for everybody, so it can sit in the cache', async () => {
    const store = memoryChallenges();
    const code = await set(store);
    const a = took(await readChallenge(store, code));
    const b = took(await readChallenge(store, code));
    expect(a).toEqual(b);
  });

  it('says open until it is answered, and never stores that', async () => {
    const store = memoryChallenges();
    const code = await set(store);
    expect(took(await readChallenge(store, code)).challenge.state).toBe('open');
    took(await answerChallenge(store, code, batter({ playerId: FRIEND, name: 'Rahul', card: card(50) })));
    expect(took(await readChallenge(store, code)).challenge.state).toBe('answered');
  });
});

describe('what a challenge costs', () => {
  it('holds down the making of challenges hardest, because that makes keys', async () => {
    const store = memoryChallenges();
    for (let i = 0; i < CREATE_LIMIT; i++) took(await createChallenge(store, batter()));
    const over = await createChallenge(store, batter());
    expect(challengeRefused(over) && over.status).toBe(429);
  });

  it('counts answers separately, so making challenges cannot lock a game up', async () => {
    const store = memoryChallenges();
    const code = await set(store);
    for (let i = 0; i <= CREATE_LIMIT; i++) await createChallenge(store, batter());
    expect(challengeRefused(await createChallenge(store, batter()))).toBe(true);
    // The same address, out of challenges it may make, can still answer the one
    // it was sent. Stranding a player mid-game over a create budget would be
    // collateral nobody asked for.
    const done = took(await answerChallenge(store, code, batter({ playerId: FRIEND, name: 'Rahul', card: card(60) })));
    expect(done.challenge.state).toBe('answered');
    expect(WRITE_LIMIT).toBeGreaterThan(CREATE_LIMIT);
  });

  it('does not count reads at all, so checking costs nothing to police', async () => {
    const store = memoryChallenges();
    const code = await set(store);
    for (let i = 0; i < WRITE_LIMIT + 10; i++) {
      expect(challengeRefused(await readChallenge(store, code))).toBe(false);
    }
  });
});

describe('the scoreline', () => {
  it('is ranked on the board\'s own number, not a second comparator', async () => {
    const store = memoryChallenges();
    const at = Date.UTC(2026, 5, 1, 12, 0, 0);
    const code = took(await createChallenge(store, batter({ card: card(102) }), at)).code;
    const done = took(await answerChallenge(
      store, code, batter({ playerId: FRIEND, name: 'Rahul', card: card(114) }), at));
    expect(done.challenge.players.map(one => one.score))
      .toEqual([packScore(figuresOf(card(114)), at), packScore(figuresOf(card(102)), at)]);
  });

  it('marks which innings set the challenge', async () => {
    const store = memoryChallenges();
    const code = await set(store, 60);
    const done = took(await answerChallenge(store, code, batter({ playerId: FRIEND, name: 'Rahul', card: card(114) })));
    expect(done.challenge.players.find(one => one.challenger)?.name).toBe('VK');
    expect(done.challenge.players.filter(one => one.challenger)).toHaveLength(1);
  });

  it('reads the state off the innings themselves', async () => {
    expect(stateOf({ at: 0, host: HOST, players: {} })).toBe('open');
    expect(stateOf({
      at: 0, host: HOST,
      players: { [HOST]: { name: 'VK', avatar: 0, card: card(10), at: 0 } },
    })).toBe('open');
    expect(stateOf({
      at: 0, host: HOST,
      players: {
        [HOST]: { name: 'VK', avatar: 0, card: card(10), at: 0 },
        [FRIEND]: { name: 'Rahul', avatar: 1, card: card(20), at: 1 },
      },
    })).toBe('answered');
  });
});
