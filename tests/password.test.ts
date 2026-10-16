import { describe, expect, it } from 'vitest';
import { keepPassword, passwordMatches } from '../src/server/career-password';
import { memoryRecovery } from '../src/server/memory-recovery';
import { PASSWORD_MIN, passwordProblem } from '../src/server/password-rules';
import {
  FIND_MAX, FIND_TRIES_FROM, RESTORE_TRIES_AT, RESTORE_TRIES_FROM, describeFrom, findPlayers, keyOnClaim, listOnClaim,
  passwordSet, questionFor, recoverByAnswer, restore, restoreWithPassword, setPassword,
} from '../src/server/recovery-store';
import { answerMatches, foldAnswer, keepAnswer } from '../src/server/career-password';

const GAURAV = 'p-gaurav';
const held = (names: [string, string][] = [['gauravrana', GAURAV]]) => memoryRecovery(new Map(names));
const at = { address: '10.0.0.1' };

describe('the password a player picks', () => {
  it('is long enough to be worth guessing at', () => {
    expect(passwordProblem('ab3d5')).toContain(`${PASSWORD_MIN}`);
    expect(passwordProblem('ab3d5f')).toBeNull();
  });

  it('is not the first thing a stranger would try', () => {
    for (const easy of ['123456', 'abcdef', 'ABCDEF', 'Password!', 'qwerty', 'cricket123', 'aaaaaaa', '1111111']) {
      expect(passwordProblem(easy), easy).not.toBeNull();
    }
  });

  /** The name is printed down the board, so the name itself is no secret. Anything added to it is fine. */
  it('is not exactly the name it goes with', () => {
    expect(passwordProblem('Shashank', 'Shashank')).toContain('name');
    expect(passwordProblem(' shashank ', 'Shashank')).toContain('name');
    expect(passwordProblem('Gaurav Rana', 'Gaurav Rana')).toContain('name');
    expect(passwordProblem('Shashank123', 'Shashank')).toBeNull();
    expect(passwordProblem('Shashank!', 'Shashank')).toBeNull();
    expect(passwordProblem('GauravRana', 'Gaurav Rana')).toBeNull();
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
    expect(await passwordSet(store, { name: 'Gaurav Rana', playerId: GAURAV })).toMatchObject({ ok: true, password: false });
    await setPassword(store, { name: 'Gaurav Rana', playerId: GAURAV, password: 'square-cut-9' });
    expect(await passwordSet(store, { name: 'Gaurav Rana', playerId: GAURAV })).toMatchObject({ ok: true, password: true });
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

describe('the security question', () => {
  const withQuestion = async () => {
    const store = held();
    await setPassword(store, { name: 'Gaurav Rana', playerId: GAURAV, password: 'square-cut-9', question: 0, answer: 'Rahul and Ankit' });
    return store;
  };

  it('forgives capitals, spaces and punctuation in the answer, and nothing else', () => {
    const kept = keepAnswer(0, 'Rahul S.');
    expect(answerMatches('rahul s', kept)).toBe(true);
    expect(answerMatches('RAHULS', kept)).toBe(true);
    expect(answerMatches('rahul', kept)).toBe(false);
    expect(foldAnswer('  Ankit-Ji ')).toBe('ankitji');
  });

  it('keeps no trace of the answer', () => {
    expect(JSON.stringify(keepAnswer(0, 'Rahul and Ankit'))).not.toContain('rahul');
  });

  it('is optional, and said to be set only when it is', async () => {
    const store = held();
    await setPassword(store, { name: 'Gaurav Rana', playerId: GAURAV, password: 'square-cut-9' });
    expect(await passwordSet(store, { name: 'Gaurav Rana', playerId: GAURAV })).toMatchObject({ password: true, question: null });
    expect(await passwordSet(store, { name: 'Gaurav Rana', playerId: GAURAV })).toMatchObject({ question: null });
    const asked = await withQuestion();
    expect(await passwordSet(asked, { name: 'Gaurav Rana', playerId: GAURAV })).toMatchObject({ password: true, question: 0 });
  });

  it('is never kept without an answer, and only from the list', async () => {
    const store = held();
    expect(await setPassword(store, { name: 'Gaurav Rana', playerId: GAURAV, password: 'square-cut-9', question: 2, answer: '' }))
      .toMatchObject({ ok: false, status: 400 });
    expect(await setPassword(store, { name: 'Gaurav Rana', playerId: GAURAV, password: 'square-cut-9', question: 99, answer: 'x' }))
      .toMatchObject({ ok: false, status: 400 });
  });

  /** The change sheet: blank keeps what is there. */
  it('can be changed without the password, and the answer kept for the same question', async () => {
    const store = await withQuestion();
    expect(await setPassword(store, { name: 'Gaurav Rana', playerId: GAURAV, password: '', question: 0, answer: '' })).toMatchObject({ ok: true });
    expect(await restoreWithPassword(store, { name: 'Gaurav Rana', password: 'square-cut-9', ...at })).toMatchObject({ ok: true });
    expect(await recoverByAnswer(store, { name: 'Gaurav Rana', answer: 'rahul and ankit', ...at })).toMatchObject({ ok: true });
    await setPassword(store, { name: 'Gaurav Rana', playerId: GAURAV, password: '', question: 4, answer: 'St Xaviers' });
    expect(await recoverByAnswer(store, { name: 'Gaurav Rana', answer: 'rahul and ankit', ...at })).toMatchObject({ ok: false, status: 403 });
    expect(await recoverByAnswer(store, { name: 'Gaurav Rana', answer: 'st. xaviers', ...at })).toMatchObject({ ok: true });
  });

  it('refuses a blank password where there is none to keep', async () => {
    expect(await setPassword(held(), { name: 'Gaurav Rana', playerId: GAURAV, password: '' })).toMatchObject({ ok: false, status: 400 });
  });

  it('is put to whoever asks, by name, and is null where there is none', async () => {
    const store = await withQuestion();
    expect(await questionFor(store, { name: 'gaurav rana', ...at })).toEqual({ ok: true, question: 0 });
    expect(await questionFor(store, { name: 'Nobody Here', ...at })).toEqual({ ok: true, question: null });
    const plain = held();
    await setPassword(plain, { name: 'Gaurav Rana', playerId: GAURAV, password: 'square-cut-9' });
    expect(await questionFor(plain, { name: 'Gaurav Rana', ...at })).toEqual({ ok: true, question: null });
  });

  it('checks the answer first, then sets the new password and gives the player back', async () => {
    const store = await withQuestion();
    expect(await recoverByAnswer(store, { name: 'Gaurav Rana', answer: 'Rahul and Ankit', ...at })).toEqual({ ok: true, playerId: null });
    expect(await recoverByAnswer(store, { name: 'Gaurav Rana', answer: 'Rahul and Ankit', password: 'late-cut-11', ...at }))
      .toEqual({ ok: true, playerId: GAURAV });
    expect(await restoreWithPassword(store, { name: 'Gaurav Rana', password: 'square-cut-9', ...at })).toMatchObject({ ok: false });
    expect(await restoreWithPassword(store, { name: 'Gaurav Rana', password: 'late-cut-11', ...at })).toMatchObject({ ok: true });
  });

  it('holds the new password to the rules, and a wrong answer changes nothing', async () => {
    const store = await withQuestion();
    expect(await recoverByAnswer(store, { name: 'Gaurav Rana', answer: 'Rahul and Ankit', password: 'Gaurav Rana', ...at }))
      .toMatchObject({ ok: false, status: 400 });
    expect(await recoverByAnswer(store, { name: 'Gaurav Rana', answer: 'Virat', password: 'late-cut-11', ...at }))
      .toMatchObject({ ok: false, status: 403 });
    expect(await restoreWithPassword(store, { name: 'Gaurav Rana', password: 'square-cut-9', ...at })).toMatchObject({ ok: true });
  });

  it('shares the tries with passwords and keys', async () => {
    const store = await withQuestion();
    for (let i = 0; i < RESTORE_TRIES_FROM; i++) await recoverByAnswer(store, { name: 'Gaurav Rana', answer: 'guess', ...at });
    expect(await recoverByAnswer(store, { name: 'Gaurav Rana', answer: 'Rahul and Ankit', ...at })).toMatchObject({ ok: false, status: 429 });
    expect(await restoreWithPassword(store, { name: 'Gaurav Rana', password: 'square-cut-9', ...at })).toMatchObject({ ok: false, status: 429 });
  });
});