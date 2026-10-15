import { describe, expect, it } from 'vitest';
import { keepPassword, passwordMatches } from '../src/server/career-password';
import { memoryRecovery } from '../src/server/memory-recovery';
import { PASSWORD_MIN, passwordProblem } from '../src/server/password-rules';
import {
  FIND_MAX, FIND_TRIES_FROM, RESTORE_TRIES_AT, RESTORE_TRIES_FROM, describeFrom, findPlayers, keyOnClaim, listOnClaim,
  passwordSet, restore, restoreWithPassword, setPassword,
} from '../src/server/recovery-store';

const GAURAV = 'p-gaurav';
const held = (names: [string, string][] = [['gauravrana', GAURAV]]) => memoryRecovery(new Map(names));
const at = { address: '10.0.0.1' };

describe('the password a player picks', () => {
  it('is long enough to be worth guessing at', () => {
    expect(passwordProblem('ab3d5')).toContain(`${PASSWORD_MIN}`);
    expect(passwordProblem('ab3d5f')).toBeNull();
  });

  it('is not the first thing a stranger would try', () => {
    for (const easy of ['123456', 'Password!', 'qwerty', 'cricket123', 'aaaaaaa', '1111111']) {
      expect(passwordProblem(easy), easy).not.toBeNull();
    }
  });

  /** The name is printed down the board, so it is no secret, with a number on it or not. */
  it('is not the name it goes with', () => {
    expect(passwordProblem('GauravRana', 'gauravrana')).toContain('name');
    expect(passwordProblem('gaurav rana 99', 'gauravrana')).toContain('name');
    expect(passwordProblem('rana-gaurav', 'gauravrana')).toBeNull();
  });

  it('forgives the space a keyboard adds, and keeps case', () => {
    const kept = keepPassword('Square Cut 9');
    expect(passwordMatches(' Square Cut 9 ', kept)).toBe(true);
    expect(passwordMatches('square cut 9', kept)).toBe(false);
  });

  it('keeps no trace of the password, and salts each of its own', () => {
    const one = keepPassword('square-cut-9');
    const two = keepPassword('square-cut-9');
    expect(JSON.stringify(one)).not.toContain('square');
    expect(one.hash).not.toBe(two.hash);
  });

  it('answers no to a record it cannot read rather than throwing', () => {
    expect(passwordMatches('square-cut-9', { salt: '', hash: 'not-hex', at: 0 })).toBe(false);
  });
});

describe('a password set', () => {
  it('opens the career for the name it was set under', async () => {
    const store = held();
    expect(await setPassword(store, { name: 'Gaurav Rana', playerId: GAURAV, password: 'square-cut-9' })).toMatchObject({ ok: true });
    expect(await restoreWithPassword(store, { name: 'gaurav rana', password: 'square-cut-9', ...at }))
      .toEqual({ ok: true, playerId: GAURAV });
  });

  /** Kept against the player, so every name they hold opens with it. */
  it('opens every name the player holds', async () => {
    const store = held([['gauravrana', GAURAV], ['grana', GAURAV]]);
    await setPassword(store, { name: 'Gaurav Rana', playerId: GAURAV, password: 'square-cut-9' });
    expect(await restoreWithPassword(store, { name: 'G Rana', password: 'square-cut-9', ...at }))
      .toEqual({ ok: true, playerId: GAURAV });
  });

  it('is never set by somebody who does not hold the name', async () => {
    const store = held();
    expect(await setPassword(store, { name: 'Gaurav Rana', playerId: 'p-other', password: 'square-cut-9' }))
      .toMatchObject({ ok: false, status: 403 });
    expect(store.passwords.size).toBe(0);
  });

  it('is held to the rules on the server too', async () => {
    const store = held();
    expect(await setPassword(store, { name: 'Gaurav Rana', playerId: GAURAV, password: '123456' }))
      .toMatchObject({ ok: false, status: 400 });
  });

  it('can be changed, and the old one stops opening it', async () => {
    const store = held();
    await setPassword(store, { name: 'Gaurav Rana', playerId: GAURAV, password: 'square-cut-9' });
    await setPassword(store, { name: 'Gaurav Rana', playerId: GAURAV, password: 'late-cut-11' });
    expect(await restoreWithPassword(store, { name: 'Gaurav Rana', password: 'square-cut-9', ...at })).toMatchObject({ ok: false });
    expect(await restoreWithPassword(store, { name: 'Gaurav Rana', password: 'late-cut-11', ...at })).toMatchObject({ ok: true });
  });

  it('is said to be set only to the player who set it', async () => {
    const store = held();
    expect(await passwordSet(store, { name: 'Gaurav Rana', playerId: GAURAV })).toEqual({ ok: true, password: false });
    await setPassword(store, { name: 'Gaurav Rana', playerId: GAURAV, password: 'square-cut-9' });
    expect(await passwordSet(store, { name: 'Gaurav Rana', playerId: GAURAV })).toEqual({ ok: true, password: true });
    expect(await passwordSet(store, { name: 'Gaurav Rana', playerId: 'p-other' })).toMatchObject({ ok: false, status: 403 });
  });

  /** A key still works beside it: it is how somebody who forgot their password gets back in. */
  it('leaves the career key working', async () => {
    const store = held();
    const key = await keyOnClaim(store, 'gauravrana');
    await setPassword(store, { name: 'Gaurav Rana', playerId: GAURAV, password: 'square-cut-9' });
    expect(await restore(store, { name: 'Gaurav Rana', key: key!, ...at })).toEqual({ ok: true, playerId: GAURAV });
  });
});

describe('a name and a password that do not go together', () => {
  it('say the same thing however it failed', async () => {
    const store = held([['gauravrana', GAURAV], ['nopass', 'p-nopass']]);
    await setPassword(store, { name: 'Gaurav Rana', playerId: GAURAV, password: 'square-cut-9' });
    const wrong = await restoreWithPassword(store, { name: 'Gaurav Rana', password: 'square-cut-8', ...at });
    const nobody = await restoreWithPassword(store, { name: 'Nobody Here', password: 'square-cut-9', ...at });
    const none = await restoreWithPassword(store, { name: 'No Pass', password: 'square-cut-9', ...at });
    expect(wrong).toMatchObject({ ok: false, status: 403 });
    expect(nobody).toEqual(wrong);
    expect(none).toEqual(wrong);
  });

  it('share the key\'s tries, from one address and at one name', async () => {
    const store = held();
    await setPassword(store, { name: 'Gaurav Rana', playerId: GAURAV, password: 'square-cut-9' });
    for (let i = 0; i < RESTORE_TRIES_FROM; i++) await restore(store, { name: 'Gaurav Rana', key: 'yorker-sprint-cover-47', ...at });
    expect(await restoreWithPassword(store, { name: 'Gaurav Rana', password: 'square-cut-9', ...at }))
      .toMatchObject({ ok: false, status: 429 });

    const other = held();
    await setPassword(other, { name: 'Gaurav Rana', playerId: GAURAV, password: 'square-cut-9' });
    let last;
    for (let i = 0; i <= RESTORE_TRIES_AT; i++) {
      last = await restoreWithPassword(other, { name: 'Gaurav Rana', password: 'guess-guess', address: `10.0.1.${i}` });
    }
    expect(last).toMatchObject({ ok: false, status: 429 });
  });
});

describe('the names a restore picks from', () => {
  const many = () => held([
    ['gauravrana', GAURAV], ['gaurav7', 'p-g7'], ['gaurav', 'p-g'], ['gauri', 'p-gauri'], ['rohit', 'p-rohit'],
  ]);
  const withPasswords = async () => {
    const store = many();
    for (const [name, id] of [['Gaurav Rana', GAURAV], ['Gaurav7', 'p-g7'], ['Gaurav', 'p-g'], ['Rohit', 'p-rohit']]) {
      await setPassword(store, { name, playerId: id, password: 'square-cut-9' });
    }
    return store;
  };

  it('lists the names that begin with what was typed, the name itself first', async () => {
    const found = await findPlayers(await withPasswords(), { name: 'Gaurav', ...at });
    expect(found).toMatchObject({ ok: true });
    expect((found as { players: { name: string }[] }).players.map(one => one.name)).toEqual(['Gaurav', 'Gaurav7', 'Gaurav Rana']);
  });

  it('lists nobody without a password, since there would be nothing to type', async () => {
    const found = await findPlayers(await withPasswords(), { name: 'Gauri', ...at });
    expect(found).toEqual({ ok: true, players: [] });
  });

  it('never says who the player is behind a name', async () => {
    const found = await findPlayers(await withPasswords(), { name: 'Gaurav', ...at });
    expect(JSON.stringify(found)).not.toContain('p-');
  });

  it('runs on three letters or more, so one letter is not a way through every name', async () => {
    expect(await findPlayers(await withPasswords(), { name: 'Ga', ...at })).toEqual({ ok: true, players: [] });
  });

  it('shows a player once, under whichever name of theirs comes first', async () => {
    const store = held([['gauravrana', GAURAV], ['gaurav', GAURAV]]);
    await setPassword(store, { name: 'Gaurav Rana', playerId: GAURAV, password: 'square-cut-9' });
    await listOnClaim(store, { name: 'Gaurav', playerId: GAURAV });
    const found = await findPlayers(store, { name: 'gaurav', ...at });
    expect((found as { players: { name: string }[] }).players.map(one => one.name)).toEqual(['Gaurav']);
  });

  it('shows no more than a handful', async () => {
    const names: [string, string][] = Array.from({ length: 12 }, (_, i) => [`gaurav${i}`, `p-${i}`]);
    const store = held(names);
    for (const [name, id] of names) await setPassword(store, { name, playerId: id, password: 'square-cut-9' });
    const found = await findPlayers(store, { name: 'gaurav', ...at });
    expect((found as { players: unknown[] }).players).toHaveLength(FIND_MAX);
  });

  it('says the kit and the innings, from the careers', async () => {
    const career = (avatar: number, innings: number, when: number) => ({ avatar, at: when, career: { innings } });
    const describe = describeFrom([
      { many: async ids => ids.map(id => (id === GAURAV ? career(3, 12, 10) : null)) },
      { many: async ids => ids.map(id => (id === GAURAV ? career(5, 4, 20) : null)) },
    ]);
    const store = held();
    await setPassword(store, { name: 'Gaurav Rana', playerId: GAURAV, password: 'square-cut-9' });
    const found = await findPlayers(store, { name: 'gaurav', ...at }, describe);
    expect(found).toEqual({ ok: true, players: [{ name: 'Gaurav Rana', avatar: 5, innings: 16 }] });
  });

  /** Found by a name they have moved on from, they come back as who they are now. */
  it('lists a player under the name they bat under now', async () => {
    const store = held([['gaurav', GAURAV], ['gauravrana', GAURAV]]);
    await setPassword(store, { name: 'Gaurav', playerId: GAURAV, password: 'square-cut-9' });
    const describe = describeFrom([{ many: async ids => ids.map(() => ({ name: 'Gaurav Rana', avatar: 2, at: 5, career: { innings: 3 } })) }]);
    const found = await findPlayers(store, { name: 'gaurav', ...at }, describe);
    expect(found).toEqual({ ok: true, players: [{ name: 'Gaurav Rana', avatar: 2, innings: 3 }] });
  });

  it('is counted from one address', async () => {
    const store = await withPasswords();
    let last;
    for (let i = 0; i <= FIND_TRIES_FROM; i++) last = await findPlayers(store, { name: 'Gaurav', ...at });
    expect(last).toMatchObject({ ok: false, status: 429 });
  });

  it('takes a new name onto the list when its player has a password', async () => {
    const store = held([['gauravrana', GAURAV], ['grana', GAURAV], ['other', 'p-other']]);
    await setPassword(store, { name: 'Gaurav Rana', playerId: GAURAV, password: 'square-cut-9' });
    await listOnClaim(store, { name: 'G Rana', playerId: GAURAV });
    await listOnClaim(store, { name: 'Other', playerId: 'p-other' });
    expect([...store.listed].sort()).toEqual(['gauravrana Gaurav Rana', 'grana G Rana']);
  });
});
