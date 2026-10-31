import { describe, expect, it } from 'vitest';
import { handleOf } from '../src/game/handle';
import { aimFor, footState, inviteRow, leftBehind, recordIn, roomSeed, waitingOnMe } from '../src/game/invite';
import type { Challenge, ChallengeRow, InviteView } from '../src/game/challenge-api';

const ME = 'abcdef-abcdefghijkl', KABIR = 'abcdeg-mnopqrstuvwx';
const HOUR = 3_600_000, NOW = Date.UTC(2026, 9, 1, 12);

const row = (id: string, over: Partial<ChallengeRow> = {}): ChallengeRow => ({
  handle: handleOf(id), name: id === ME ? 'Me' : 'Kabir', avatar: 0, card: '', host: false, status: 'joined', joined: NOW, at: NOW,
  seen: false, score: 0, runs: 0, sixes: 0, fours: 0, wickets: 0, dots: 0, balls: 0, ...over,
});
function room(host: string, to: string, invite: Partial<InviteView>, over: Partial<Challenge> = {}): Challenge {
  return {
    code: 'ABCDEF', state: 'live', host: handleOf(host), at: NOW, expiresAt: NOW + 7 * 24 * HOUR, v: 1, rematchOf: null, size: 2,
    players: [row(host, { host: true, status: 'done', runs: 128, card: '6'.repeat(30), at: NOW - HOUR })],
    mode: 'classic',
    invite: { to: handleOf(to), name: 'X', avatar: 0, state: 'waiting', sentAt: NOW - HOUR, answerBy: NOW + 23 * HOUR, nudged: null, ...invite },
    ...over,
  };
}

describe('a challenge from a profile, on screen', () => {
  it('waits on the player it is for, nudged first', () => {
    const a = room(KABIR, ME, { answerBy: NOW + 2 * HOUR }, { code: 'AAAAAA' });
    const b = room(KABIR, ME, { nudged: NOW, answerBy: NOW + 9 * HOUR }, { code: 'BBBBBB' });
    const sentByMe = room(ME, KABIR, {}, { code: 'CCCCCC' });
    expect(waitingOnMe([a, b, sentByMe], ME).map(r => r.code)).toEqual(['BBBBBB', 'AAAAAA']);
  });

  it('says on a row what each side needs to know', () => {
    expect(inviteRow(room(KABIR, ME, { nudged: NOW }), ME, NOW)).toEqual({ note: 'chase 128 · 23h left · nudged', answer: true });
    expect(inviteRow(room(ME, KABIR, { sentAt: NOW - HOUR }), ME, NOW)?.nudge).toEqual({ ready: false, label: 'Nudge in 2h' });
    expect(inviteRow(room(ME, KABIR, { sentAt: NOW - 4 * HOUR }), ME, NOW)?.nudge).toEqual({ ready: true, label: 'Nudge' });
    expect(inviteRow(room(ME, KABIR, { state: 'unanswered' }), ME, NOW)).toMatchObject({ verdict: 'No answer', again: true });
    expect(inviteRow(room(KABIR, ME, { state: 'setting' }), ME, NOW)).toBeNull();
    const declined = room(ME, KABIR, { state: 'declined' }, { players: [row(ME, { host: true, status: 'done' }), row(KABIR, { status: 'declined', at: NOW - 4 * HOUR })] });
    expect(inviteRow(declined, ME, NOW)).toMatchObject({ verdict: 'Declined', note: 'again in 20h', again: false });
    expect(inviteRow(room(KABIR, ME, {}, { mode: 'super10' }), ME, NOW)?.note).toMatch(/^Super10 · chase 128/);
  });

  it('gives a profile’s foot the one state that applies', () => {
    expect(footState([], ME, handleOf(KABIR), NOW)).toEqual({ kind: 'challenge' });
    expect(footState([room(KABIR, ME, {})], ME, handleOf(KABIR), NOW).kind).toBe('answer');
    expect(footState([room(ME, KABIR, {})], ME, handleOf(KABIR), NOW).kind).toBe('sent');
    expect(footState([room(ME, KABIR, { state: 'accepted' })], ME, handleOf(KABIR), NOW).kind).toBe('batting');
    const declined = room(ME, KABIR, { state: 'declined' }, { players: [row(ME, { host: true, status: 'done' }), row(KABIR, { status: 'declined', at: NOW - HOUR })] });
    expect(footState([declined], ME, handleOf(KABIR), NOW)).toEqual({ kind: 'declined', wait: 23 * HOUR });
    const five = Array.from({ length: 5 }, (_, i) => room(ME, `abcde${i}-aaaaaaaaaaaa`, {}, { code: `ROOM${i}A` }));
    expect(footState(five, ME, handleOf(KABIR), NOW)).toEqual({ kind: 'full' });
  });

  it('aims a little past their average, near your best, never past the mode', () => {
    expect(aimFor(112, 175, 'classic')).toBe(140);
    expect(aimFor(112, 60, 'classic')).toBe(80);
    expect(aimFor(170, 400, 'classic')).toBe(180);
    expect(aimFor(null, 175, 'classic')).toBeNull();
  });

  it('keeps the record between two players by mode', () => {
    const entry = (outcome: 'W' | 'L', at: number, mode?: 'classic' | 'super10') => ({
      code: String(at), them: { handle: handleOf(KABIR), name: 'Kabir', avatar: 0 },
      mine: { runs: 0, sixes: 0, fours: 0 }, theirs: { runs: 0, sixes: 0, fours: 0 }, outcome, at, mode,
    });
    const entries = [entry('W', 1), entry('L', 2), entry('L', 3), entry('W', 4, 'super10')];
    expect(recordIn(entries, handleOf(KABIR), 'classic')).toEqual({ won: 1, lost: 2, drawn: 0, form: ['L', 'L', 'W'] });
    expect(recordIn(entries, handleOf(KABIR), 'super10')).toEqual({ won: 1, lost: 0, drawn: 0, form: ['W'] });
  });

  it('seeds both innings alike, and finds an innings left behind', () => {
    expect(roomSeed('K7QPX2')).toBe(roomSeed('K7QPX2'));
    expect(roomSeed('K7QPX2')).not.toBe(roomSeed('K7QPX3'));
    const accepted = room(KABIR, ME, { state: 'accepted' }, { players: [row(KABIR, { host: true, status: 'done' }), row(ME, { status: 'batting', card: '61' })] });
    expect(leftBehind([accepted], ME, null)).toHaveLength(1);
    expect(leftBehind([accepted], ME, 'ABCDEF')).toHaveLength(0);
  });
});
