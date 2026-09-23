import { describe, expect, it } from 'vitest';
import { GAME } from '../src/config/gameplay';
import { packScore, plausible, underway, type Innings } from '../src/game/leaderboard';
import {
  CODE_ALPHABET, CODE_LENGTH, ROOM_CREATE_LIMIT, ROOM_MIN, ROOM_SIZE, ROOM_WRITE_LIMIT,
  cleanCode, createRoom, joinRoom, newCode, pushInnings, readRoom, roomRefused, startRoom,
  type RoomCaller, type RoomOutcome, type RoomStore,
} from '../src/server/room-store';
import { memoryRooms } from '../src/server/memory-store';

/**
 * A room's rules, run against the same in-memory store the dev server uses. One
 * fake rather than two: a second copy written for the tests would drift from the
 * one the endpoint is developed against, and the drift would be invisible.
 */

/** Four players, with ids shaped the way `mintPlayerId` shapes them. */
const HOST = 'abcdef-abcdefghijkl';
const SECOND = 'abcdeg-mnopqrstuvwx';
const THIRD = 'abcdeh-bcdefghijklm';
const FOURTH = 'abcdei-cdefghijklmn';
const FIFTH = 'abcdej-defghijklmno';

const caller = (over: Partial<RoomCaller> = {}): RoomCaller =>
  ({ playerId: HOST, name: 'Rohit', avatar: 0, address: '1.2.3.4', ...over });

/**
 * An innings that adds up and ended the way one ends: thirty balls faced, the
 * runs made out of sixes and singles, whatever is left over dots.
 *
 * `plausible` is asserted here so that a fixture nobody could have played fails
 * where it was written rather than somewhere downstream — the same guard the
 * board's own tests keep.
 */
const finished = (runs: number, wickets = 1): Innings => {
  const sixes = Math.floor(runs / 6);
  const singles = runs % 6;
  const figures: Innings = {
    runs, sixes, fours: 0, wickets,
    dots: GAME.totalBalls - sixes - singles - wickets,
    balls: GAME.totalBalls,
  };
  if (!plausible(figures)) throw new Error(`fixture could not have happened: ${JSON.stringify(figures)}`);
  return figures;
};

/** An innings that ended early because the wickets ran out. */
const allOut = (runs: number): Innings => {
  const sixes = Math.floor(runs / 6);
  const singles = runs % 6;
  const figures: Innings = {
    runs, sixes, fours: 0, wickets: GAME.maxWickets, dots: 0,
    balls: sixes + singles + GAME.maxWickets,
  };
  if (!plausible(figures)) throw new Error(`fixture could not have happened: ${JSON.stringify(figures)}`);
  return figures;
};

/** A score partway through: what a push carries while the innings is still running. */
const midway = (runs: number, balls: number): Innings => {
  const sixes = Math.floor(runs / 6);
  const singles = runs % 6;
  const figures: Innings = {
    runs, sixes, fours: 0, wickets: 0, dots: balls - sixes - singles, balls,
  };
  if (!underway(figures)) throw new Error(`fixture could not have happened: ${JSON.stringify(figures)}`);
  if (plausible(figures)) throw new Error('fixture is a finished innings, not a running one');
  return figures;
};

/** The room out of an outcome, or a failure naming what was refused instead. */
function took(outcome: RoomOutcome) {
  if (roomRefused(outcome)) throw new Error(`refused: ${outcome.status} ${outcome.reason}`);
  return outcome;
}

/** A room with its host in it, plus however many others are asked for. */
async function room(store: RoomStore, joining: string[] = []) {
  const made = took(await createRoom(store, caller()));
  for (const [i, playerId] of joining.entries()) {
    took(await joinRoom(store, made.code, caller({ playerId, name: `Player${i + 2}` })));
  }
  return made.code;
}

describe('room codes', () => {
  it('are drawn from characters nobody misreads', () => {
    const code = newCode(() => 0.5);
    expect(code).toHaveLength(CODE_LENGTH);
    for (const char of code) expect(CODE_ALPHABET).toContain(char);
    // The four that get retyped wrong are the whole point of the alphabet.
    for (const char of '01OI') expect(CODE_ALPHABET).not.toContain(char);
  });

  it('are read back however they were typed', () => {
    expect(cleanCode('k7qp')).toBe('K7QP');
    expect(cleanCode('  K7QP  ')).toBe('K7QP');
  });

  it('refuse anything that is not a code rather than guessing at it', () => {
    expect(cleanCode('K7Q')).toBeNull();
    expect(cleanCode('K7QPX')).toBeNull();
    // Not in the alphabet, and which character was meant is anybody's guess.
    expect(cleanCode('K7Q0')).toBeNull();
    expect(cleanCode('K7QI')).toBeNull();
    expect(cleanCode('')).toBeNull();
    expect(cleanCode(null)).toBeNull();
  });
});

describe('making a room', () => {
  it('puts the maker in it, in the lobby, as host', async () => {
    const store = memoryRooms();
    const made = took(await createRoom(store, caller()));
    expect(made.room.state).toBe('lobby');
    expect(made.room.host).toBe(HOST);
    expect(made.room.players).toHaveLength(1);
    expect(made.room.players[0]).toMatchObject({ playerId: HOST, name: 'Rohit', runs: 0, balls: 0, done: false });
  });

  it('redraws a code somebody already holds', async () => {
    const store = memoryRooms();
    // Two draws of the same code, then a different one: the second room must not
    // land on the first one's key.
    const draws = [0, 0, 0.5];
    let drawn = 0;
    const random = () => draws[Math.min(drawn++, draws.length - 1)] ?? 0.5;
    const first = took(await createRoom(store, caller(), Date.now(), () => 0));
    const second = took(await createRoom(store, caller({ playerId: SECOND }), Date.now(), random));
    expect(second.code).not.toBe(first.code);
    const held = took(await readRoom(store, first.code));
    expect(held.room.players.map(one => one.playerId)).toEqual([HOST]);
  });

  it('says so rather than looping when no code can be had', async () => {
    const store = memoryRooms();
    // Every draw lands on the one code, which is already taken.
    await createRoom(store, caller(), Date.now(), () => 0);
    const outcome = await createRoom(store, caller({ playerId: SECOND }), Date.now(), () => 0);
    expect(roomRefused(outcome) && outcome.status).toBe(503);
  });

  it('turns down a caller who is not a player, or a kit that does not exist', async () => {
    const store = memoryRooms();
    const noPlayer = await createRoom(store, caller({ playerId: 'nope' }));
    expect(roomRefused(noPlayer) && noPlayer.status).toBe(400);
    const noKit = await createRoom(store, caller({ avatar: 99 }));
    expect(roomRefused(noKit) && noKit.status).toBe(400);
    const noName = await createRoom(store, caller({ name: '   ' }));
    expect(roomRefused(noName) && noName.status).toBe(400);
  });
});

describe('joining a room', () => {
  it('adds a second player', async () => {
    const store = memoryRooms();
    const code = await room(store);
    const joined = took(await joinRoom(store, code, caller({ playerId: SECOND, name: 'Virat' })));
    expect(joined.room.players.map(one => one.name).sort()).toEqual(['Rohit', 'Virat']);
  });

  it('is the same the second time, and keeps the innings already played', async () => {
    const store = memoryRooms();
    const code = await room(store, [SECOND]);
    took(await startRoom(store, code, HOST, '1.2.3.4'));
    took(await pushInnings(store, code, { ...caller(), innings: midway(24, 8), done: false }));
    // A reload, a dropped connection, a link tapped twice: all of them arrive here.
    const again = took(await joinRoom(store, code, caller()));
    expect(again.room.players).toHaveLength(2);
    expect(again.room.players.find(one => one.playerId === HOST)).toMatchObject({ runs: 24, balls: 8 });
  });

  it('is refused once the room is full', async () => {
    const store = memoryRooms();
    const code = await room(store, [SECOND, THIRD, FOURTH]);
    const outcome = await joinRoom(store, code, caller({ playerId: FIFTH, name: 'Fifth' }));
    expect(roomRefused(outcome) && outcome.status).toBe(409);
    expect(took(await readRoom(store, code)).room.players).toHaveLength(ROOM_SIZE);
  });

  it('is refused once the game has started', async () => {
    const store = memoryRooms();
    const code = await room(store, [SECOND]);
    took(await startRoom(store, code, HOST, '1.2.3.4'));
    const outcome = await joinRoom(store, code, caller({ playerId: THIRD, name: 'Late' }));
    expect(roomRefused(outcome) && outcome.status).toBe(409);
  });

  it('is refused for a name somebody in the room already bats under', async () => {
    const store = memoryRooms();
    const code = await room(store);
    // Folded the way the board folds one, so spacing and case are not a way in.
    const outcome = await joinRoom(store, code, caller({ playerId: SECOND, name: 'r o h i t' }));
    expect(roomRefused(outcome) && outcome.status).toBe(409);
  });

  it('leaves the same name free in another room', async () => {
    const store = memoryRooms();
    const mine = await room(store);
    const theirs = took(await createRoom(store, caller({ playerId: SECOND, name: 'Virat' }))).code;
    // A room lasts two hours. Burning a permanent name on one would cost the
    // board four names every time four friends played.
    took(await joinRoom(store, theirs, caller({ playerId: THIRD, name: 'Rohit' })));
    expect(took(await readRoom(store, mine)).room.players.map(one => one.name)).toEqual(['Rohit']);
  });

  it('is refused under a code that is not a room, or a room that has expired', async () => {
    const store = memoryRooms();
    const code = await room(store);
    const missing = await joinRoom(store, 'ZZZZ', caller({ playerId: SECOND, name: 'Virat' }));
    expect(roomRefused(missing) && missing.status).toBe(404);
    store.expire(code);
    const gone = await joinRoom(store, code, caller({ playerId: SECOND, name: 'Virat' }));
    expect(roomRefused(gone) && gone.status).toBe(404);
  });
});

describe('starting a game', () => {
  it('is the host\'s to do and nobody else\'s', async () => {
    const store = memoryRooms();
    const code = await room(store, [SECOND]);
    const outcome = await startRoom(store, code, SECOND, '1.2.3.4');
    expect(roomRefused(outcome) && outcome.status).toBe(403);
    expect(took(await readRoom(store, code)).room.state).toBe('lobby');
  });

  it('waits for a second player', async () => {
    const store = memoryRooms();
    const code = await room(store);
    const outcome = await startRoom(store, code, HOST, '1.2.3.4');
    expect(roomRefused(outcome) && outcome.status).toBe(409);
    expect(ROOM_MIN).toBe(2);
  });

  it('takes the room live, once', async () => {
    const store = memoryRooms();
    const code = await room(store, [SECOND]);
    expect(took(await startRoom(store, code, HOST, '1.2.3.4')).room.state).toBe('live');
    const again = await startRoom(store, code, HOST, '1.2.3.4');
    expect(roomRefused(again) && again.status).toBe(409);
  });
});

describe('pushing a score', () => {
  /** A room with two in it, already live, which is what a push needs. */
  async function live() {
    const store = memoryRooms();
    const code = await room(store, [SECOND]);
    took(await startRoom(store, code, HOST, '1.2.3.4'));
    return { store, code };
  }

  it('is refused before the game starts', async () => {
    const store = memoryRooms();
    const code = await room(store, [SECOND]);
    const outcome = await pushInnings(store, code, { ...caller(), innings: midway(12, 4), done: false });
    expect(roomRefused(outcome) && outcome.status).toBe(409);
  });

  it('is refused from somebody who is not in the room', async () => {
    const { store, code } = await live();
    const outcome = await pushInnings(store, code, {
      ...caller({ playerId: THIRD, name: 'Outsider' }), innings: midway(12, 4), done: false,
    });
    expect(roomRefused(outcome) && outcome.status).toBe(403);
  });

  it('carries the running figures onto the ladder', async () => {
    const { store, code } = await live();
    const pushed = took(await pushInnings(store, code, { ...caller(), innings: midway(30, 10), done: false }));
    expect(pushed.room.players.find(one => one.playerId === HOST)).toMatchObject({ runs: 30, balls: 10, done: false });
  });

  it('turns down figures that could not have happened', async () => {
    const { store, code } = await live();
    // Ten balls, sixty-one runs: one more than every ball hit for six.
    const outcome = await pushInnings(store, code, {
      ...caller(), innings: { runs: 61, sixes: 10, fours: 0, wickets: 0, dots: 0, balls: 10 }, done: false,
    });
    expect(roomRefused(outcome) && outcome.status).toBe(400);
  });

  it('turns down an innings said to have ended where one cannot', async () => {
    const { store, code } = await live();
    // The figures add up; what they are not is an innings that ended. Twelve
    // balls with a wicket in hand is a score, not a result.
    const outcome = await pushInnings(store, code, { ...caller(), innings: midway(40, 12), done: true });
    expect(roomRefused(outcome) && outcome.status).toBe(400);
  });

  it('takes an innings that ended because the wickets ran out', async () => {
    const { store, code } = await live();
    const pushed = took(await pushInnings(store, code, { ...caller(), innings: allOut(40), done: true }));
    expect(pushed.room.players.find(one => one.playerId === HOST)).toMatchObject({ runs: 40, done: true });
  });

  it('will not let a score go backwards', async () => {
    const { store, code } = await live();
    took(await pushInnings(store, code, { ...caller(), innings: midway(30, 12), done: false }));
    // A request that set out before the last one and arrived after it.
    const stale = await pushInnings(store, code, { ...caller(), innings: midway(12, 6), done: false });
    expect(roomRefused(stale) && stale.status).toBe(409);
    expect(took(await readRoom(store, code)).room.players.find(one => one.playerId === HOST)).toMatchObject({ runs: 30 });
  });

  it('will not take another push once the innings is in', async () => {
    const { store, code } = await live();
    took(await pushInnings(store, code, { ...caller(), innings: finished(60), done: true }));
    const again = await pushInnings(store, code, { ...caller(), innings: finished(120), done: true });
    expect(roomRefused(again) && again.status).toBe(409);
    expect(took(await readRoom(store, code)).room.players.find(one => one.playerId === HOST)).toMatchObject({ runs: 60 });
  });

  it('ends the room when the last innings is in, and not before', async () => {
    const { store, code } = await live();
    const one = took(await pushInnings(store, code, { ...caller(), innings: finished(60), done: true }));
    expect(one.room.state).toBe('live');
    const two = took(await pushInnings(store, code, {
      ...caller({ playerId: SECOND, name: 'Player2' }), innings: finished(48), done: true,
    }));
    expect(two.room.state).toBe('done');
  });

  it('does not flatten a player whose over landed at the same moment', async () => {
    const { store, code } = await live();
    // Each push names only itself, so the two cannot overwrite one another.
    await Promise.all([
      pushInnings(store, code, { ...caller(), innings: midway(24, 8), done: false }),
      pushInnings(store, code, {
        ...caller({ playerId: SECOND, name: 'Player2' }), innings: midway(18, 8), done: false,
      }),
    ]);
    const held = took(await readRoom(store, code)).room.players;
    expect(held.find(one => one.playerId === HOST)).toMatchObject({ runs: 24 });
    expect(held.find(one => one.playerId === SECOND)).toMatchObject({ runs: 18 });
  });
});

describe('the ladder', () => {
  it('ranks the room the way the board ranks the fifty', async () => {
    const store = memoryRooms();
    const code = await room(store, [SECOND, THIRD]);
    took(await startRoom(store, code, HOST, '1.2.3.4'));
    const at = Date.UTC(2026, 5, 1, 12, 0, 0);
    took(await pushInnings(store, code, { ...caller(), innings: finished(60), done: true }, at));
    took(await pushInnings(store, code, {
      ...caller({ playerId: SECOND, name: 'Player2' }), innings: finished(102), done: true,
    }, at));
    const last = took(await pushInnings(store, code, {
      ...caller({ playerId: THIRD, name: 'Player3' }), innings: finished(84), done: true,
    }, at));
    expect(last.room.players.map(one => one.runs)).toEqual([102, 84, 60]);
    // The board's own number, not a second comparator written here. Stamped by
    // the store, which is why the test hands it the moment rather than reading
    // one back: a browser's clock never touches this.
    expect(last.room.players.map(one => one.score))
      .toEqual([packScore(finished(102), at), packScore(finished(84), at), packScore(finished(60), at)]);
  });

  it('splits an identical innings by who got there first', async () => {
    const store = memoryRooms();
    const code = await room(store, [SECOND]);
    took(await startRoom(store, code, HOST, '1.2.3.4'));
    const early = Date.UTC(2026, 5, 1, 12, 0, 0);
    took(await pushInnings(store, code, { ...caller(), innings: finished(60), done: true }, early));
    const outcome = took(await pushInnings(store, code, {
      ...caller({ playerId: SECOND, name: 'Player2' }), innings: finished(60), done: true,
    }, early + 60_000));
    expect(outcome.room.players.map(one => one.playerId)).toEqual([HOST, SECOND]);
  });
});

describe('what a room costs', () => {
  it('holds down the making of rooms hardest, because that is what makes keys', async () => {
    const store = memoryRooms();
    let made = 0;
    for (let i = 0; i < ROOM_CREATE_LIMIT; i++) {
      const outcome = await createRoom(store, caller(), Date.now(), Math.random);
      if (!roomRefused(outcome)) made++;
    }
    expect(made).toBe(ROOM_CREATE_LIMIT);
    const over = await createRoom(store, caller());
    expect(roomRefused(over) && over.status).toBe(429);
  });

  it('counts writes separately, so making rooms cannot lock a game up', async () => {
    const store = memoryRooms();
    const code = await room(store, [SECOND]);
    // The same address, now out of rooms it may make. Playing the one it already
    // has must not be collateral: an exhausted create budget that also stopped
    // scores would strand four friends mid-game.
    for (let i = 0; i <= ROOM_CREATE_LIMIT; i++) await createRoom(store, caller());
    expect(roomRefused(await createRoom(store, caller()))).toBe(true);
    took(await startRoom(store, code, HOST, '1.2.3.4'));
    const pushed = took(await pushInnings(store, code, { ...caller(), innings: finished(60), done: true }));
    expect(pushed.room.players.find(one => one.playerId === HOST)).toMatchObject({ runs: 60 });
    expect(ROOM_WRITE_LIMIT).toBeGreaterThan(ROOM_CREATE_LIMIT);
  });

  it('does not count reads at all, so polling costs nothing to police', async () => {
    const store = memoryRooms();
    const code = await room(store);
    for (let i = 0; i < ROOM_WRITE_LIMIT + 10; i++) {
      const outcome = await readRoom(store, code);
      if (roomRefused(outcome)) throw new Error(`a read was refused: ${outcome.reason}`);
    }
  });
});
