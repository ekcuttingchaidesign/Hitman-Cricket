import { describe, expect, it } from 'vitest';
import { GAME } from '../src/config/gameplay';
import { handleOf } from '../src/game/handle';
import {
  ANSWER_MS, DECLINE_WAIT_MS, INVITES_OPEN, NUDGE_AFTER_MS, challengeRefused, createChallenge, declineChallenge,
  joinChallenge, nudgeChallenge, readMine, recordBalls, walkOut,
  type Batter, type ChallengeListOutcome, type ChallengeOutcome, type ChallengeRefusal, type ChallengeStore,
} from '../src/server/challenge-store';
import { memoryChallenges } from '../src/server/memory-store';

/**
 * A challenge from a profile (Figma section 23): sent to one player by their
 * handle, set by the host's innings, accepted, declined, nudged, run out or
 * walked out of. Run against the dev server's own memory store.
 */

const KABIR = 'abcdef-abcdefghijkl';
const RIYA = 'abcdeg-mnopqrstuvwx';
const ZOYA = 'abcdeh-bcdefghijklm';
const T0 = Date.UTC(2026, 9, 1, 12, 0, 0);
const HOUR = 3_600_000;

const card = (runs: number) => ('6'.repeat(Math.floor(runs / 6)) + '1'.repeat(runs % 6)).padEnd(GAME.totalBalls, '0');
const as = (playerId: string, name: string, avatar = 0): Batter => ({ playerId, name, avatar, address: '1.2.3.4' });
const kabir = as(KABIR, 'Kabir', 3), riya = as(RIYA, 'Riya', 1), zoya = as(ZOYA, 'Zoya', 2);

function setup() {
  const names = new Map([['kabir', KABIR], ['riya', RIYA], ['zoya', ZOYA]]);
  const handles = new Map([[handleOf(KABIR), KABIR], [handleOf(RIYA), RIYA], [handleOf(ZOYA), ZOYA]]);
  return memoryChallenges(names, handle => handles.get(handle) ?? null);
}
function took<T extends ChallengeOutcome | ChallengeListOutcome>(outcome: T): Exclude<T, ChallengeRefusal> {
  if (challengeRefused(outcome)) throw new Error(`refused: ${outcome.status} ${outcome.reason}`);
  return outcome as Exclude<T, ChallengeRefusal>;
}
const refusal = (outcome: ChallengeOutcome) => (challengeRefused(outcome) ? outcome : null);

/** Kabir challenges Riya, and bats the total. */
async function sent(store: ChallengeStore, runs = 64, now = T0, mode = 'classic') {
  const made = took(await createChallenge(store, { ...kabir, to: handleOf(RIYA), toName: 'Riya', toAvatar: 1, mode }, now));
  took(await recordBalls(store, made.code, { ...kabir, card: card(runs) }, now + 60_000));
  return made.code;
}

describe('a challenge from a profile', () => {
  it('is for one player, by handle, and names no id', async () => {
    const store = setup();
    const made = took(await createChallenge(store, { ...kabir, to: handleOf(RIYA), toName: 'Riya', toAvatar: 1, mode: 'super10' }, T0));
    expect(made.challenge.invite).toMatchObject({ to: handleOf(RIYA), name: 'Riya', avatar: 1, state: 'setting', sentAt: null });
    expect(made.challenge.mode).toBe('super10');
    expect(JSON.stringify(made)).not.toContain(RIYA);
  });

  it('reaches them only once the total is set', async () => {
    const store = setup();
    const made = took(await createChallenge(store, { ...kabir, to: handleOf(RIYA), toName: 'Riya' }, T0));
    expect(took(await readMine(store, RIYA, T0)).challenges).toHaveLength(0);
    expect(refusal(await joinChallenge(store, made.code, riya, T0))?.status).toBe(409);
    took(await recordBalls(store, made.code, { ...kabir, card: card(64) }, T0 + 60_000));
    const theirs = took(await readMine(store, RIYA, T0 + 120_000)).challenges;
    expect(theirs).toHaveLength(1);
    expect(theirs[0].invite).toMatchObject({ state: 'waiting', sentAt: T0 + 60_000, answerBy: T0 + 60_000 + ANSWER_MS });
    // The total is not hidden.
    expect(theirs[0].players.find(row => row.host)?.runs).toBe(64);
  });

  it('is accepted by them alone, and played out as a match', async () => {
    const store = setup();
    const code = await sent(store, 64);
    expect(refusal(await joinChallenge(store, code, zoya, T0 + HOUR))?.status).toBe(403);
    took(await joinChallenge(store, code, riya, T0 + HOUR));
    took(await recordBalls(store, code, { ...riya, card: card(70) }, T0 + 2 * HOUR));
    const mine = took(await readMine(store, RIYA, T0 + 3 * HOUR));
    expect(mine.record).toEqual({ won: 1, lost: 0, drawn: 0 });
    expect(took(await readMine(store, KABIR, T0 + 3 * HOUR)).record).toEqual({ won: 0, lost: 1, drawn: 0 });
  });

  it('declined, closes with no result, and makes the sender wait a day', async () => {
    const store = setup();
    const code = await sent(store);
    const declined = took(await declineChallenge(store, code, riya, T0 + HOUR));
    expect(declined.challenge.invite?.state).toBe('declined');
    expect(took(await readMine(store, KABIR, T0 + 2 * HOUR)).record).toEqual({ won: 0, lost: 0, drawn: 0 });
    expect(took(await readMine(store, RIYA, T0 + 2 * HOUR)).record).toEqual({ won: 0, lost: 0, drawn: 0 });
    const again = refusal(await createChallenge(store, { ...kabir, to: handleOf(RIYA) }, T0 + 2 * HOUR));
    expect(again?.reason).toMatch(/declined\. Challenge them again in 23h/);
    took(await createChallenge(store, { ...kabir, to: handleOf(RIYA) }, T0 + HOUR + DECLINE_WAIT_MS + 1));
  });

  it('runs out a day after it is sent, with no result', async () => {
    const store = setup();
    const code = await sent(store);
    const late = T0 + 60_000 + ANSWER_MS;
    expect(refusal(await joinChallenge(store, code, riya, late))?.reason).toBe('This challenge ran out.');
    const theirs = took(await readMine(store, RIYA, late)).challenges[0];
    expect(theirs.invite?.state).toBe('unanswered');
    expect(theirs.state).toBe('expired');
    // And the pair is free again.
    took(await createChallenge(store, { ...kabir, to: handleOf(RIYA) }, late));
  });

  it('allows one going between two players, either way round, and five waiting a sender', async () => {
    const store = setup();
    await sent(store);
    expect(refusal(await createChallenge(store, { ...kabir, to: handleOf(RIYA) }, T0 + HOUR))?.reason).toMatch(/already have a challenge/);
    expect(refusal(await createChallenge(store, { ...riya, to: handleOf(KABIR) }, T0 + HOUR))?.reason).toMatch(/already challenged you/);
    expect(refusal(await createChallenge(store, { ...kabir, to: handleOf(KABIR) }, T0))?.status).toBe(400);
    const many = setup();
    const others = ['abcdei-aaaaaaaaaaaa', 'abcdej-aaaaaaaaaaaa', 'abcdek-aaaaaaaaaaaa', 'abcdel-aaaaaaaaaaaa', 'abcdem-aaaaaaaaaaaa', 'abcden-aaaaaaaaaaaa'];
    const lookup = new Map(others.map(id => [handleOf(id), id]));
    const store6 = memoryChallenges(many.names, handle => lookup.get(handle) ?? null);
    for (const id of others.slice(0, INVITES_OPEN)) took(await createChallenge(store6, { ...kabir, to: handleOf(id) }, T0));
    expect(refusal(await createChallenge(store6, { ...kabir, to: handleOf(others[INVITES_OPEN]) }, T0))?.reason).toMatch(/5 challenges out/);
  });

  it('is nudged once, from three hours after it is sent', async () => {
    const store = setup();
    const code = await sent(store);
    expect(refusal(await nudgeChallenge(store, code, kabir, T0 + HOUR))?.reason).toMatch(/nudge in 3h/);
    expect(refusal(await nudgeChallenge(store, code, riya, T0 + 4 * HOUR))?.status).toBe(403);
    const nudged = took(await nudgeChallenge(store, code, kabir, T0 + 60_000 + NUDGE_AFTER_MS));
    expect(nudged.challenge.invite?.nudged).toBe(T0 + 60_000 + NUDGE_AFTER_MS);
    // A nudge buys no time.
    expect(nudged.challenge.invite?.answerBy).toBe(T0 + 60_000 + ANSWER_MS);
  });

  it('walked out of mid-chase is a loss there and then', async () => {
    const store = setup();
    const code = await sent(store, 64);
    took(await joinChallenge(store, code, riya, T0 + HOUR));
    took(await recordBalls(store, code, { ...riya, card: '6461' }, T0 + HOUR + 60_000));
    took(await walkOut(store, code, riya, T0 + HOUR + 120_000));
    expect(took(await readMine(store, RIYA, T0 + HOUR + 180_000)).record).toEqual({ won: 0, lost: 1, drawn: 0 });
    expect(took(await readMine(store, KABIR, T0 + HOUR + 180_000)).record).toEqual({ won: 1, lost: 0, drawn: 0 });
  });

  it('left by the sender before the total is set is never sent', async () => {
    const store = setup();
    const made = took(await createChallenge(store, { ...kabir, to: handleOf(RIYA) }, T0));
    took(await recordBalls(store, made.code, { ...kabir, card: '66' }, T0 + 30_000));
    const left = took(await walkOut(store, made.code, kabir, T0 + 60_000));
    expect(left.challenge.invite?.state).toBe('withdrawn');
    expect(took(await readMine(store, RIYA, T0 + HOUR)).challenges).toHaveLength(0);
    took(await createChallenge(store, { ...kabir, to: handleOf(RIYA) }, T0 + HOUR));
  });
});
