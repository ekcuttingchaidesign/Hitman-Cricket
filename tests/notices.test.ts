import { describe, expect, it } from 'vitest';
import { handleOf } from '../src/game/handle';
import { bellLabel, noticeGroups, noticesOf, unseenCount } from '../src/game/notices';
import type { Challenge, ChallengeRow, InviteView } from '../src/game/challenge-api';
import type { OwnActivity } from '../src/game/profile-api';

const ME = 'abcdef-abcdefghijkl', KABIR = 'abcdeg-mnopqrstuvwx';
const HOUR = 3_600_000, DAY = 24 * HOUR, NOW = Date.UTC(2026, 9, 1, 12);

const row = (id: string, over: Partial<ChallengeRow> = {}): ChallengeRow => ({
  handle: handleOf(id), name: id === ME ? 'Me' : 'Kabir', avatar: 0, card: '', host: false, status: 'joined', joined: NOW, at: NOW,
  seen: false, score: 0, runs: 0, sixes: 0, fours: 0, wickets: 0, dots: 0, balls: 0, ...over,
});
function room(host: string, to: string, invite: Partial<InviteView>, over: Partial<Challenge> = {}): Challenge {
  return {
    code: 'ABCDEF', state: 'live', host: handleOf(host), at: NOW - 2 * HOUR, expiresAt: NOW + 7 * DAY, v: 1, rematchOf: null, size: 2,
    players: [row(host, { host: true, status: 'done', runs: 128, card: '6'.repeat(30), at: NOW - HOUR })],
    mode: 'classic',
    invite: { to: handleOf(to), name: 'Kabir', avatar: 2, state: 'waiting', sentAt: NOW - HOUR, answerBy: NOW + 23 * HOUR, nudged: null, ...invite },
    ...over,
  };
}
const event = (over: Partial<OwnActivity['events'][number]>): OwnActivity['events'][number] => ({
  kind: 'passed', handle: handleOf(KABIR), name: 'Kabir', avatar: 2, mode: 'classic', runs: 140, target: 128, place: 9, at: NOW - 5 * HOUR, ...over,
});
const activity = (events: OwnActivity['events']): OwnActivity => ({ views: 0, events, bio: null });

describe('notifications', () => {
  it('puts a challenge waiting on you first, with ANSWER', () => {
    const notices = noticesOf([room(KABIR, ME, { nudged: NOW })], activity([event({ at: NOW - 60_000 })]), ME, NOW);
    expect(notices[0]).toMatchObject({ kind: 'challenges', needsYou: true, title: 'Kabir challenged you', sub: 'chase 128 · 23h left · nudged', key: { kind: 'answer' } });
    expect(notices[1]).toMatchObject({ kind: 'board', title: 'Kabir surpassed you', sub: 'You’re #9 now · 1m', key: { kind: 'winback', event: 0 } });
  });

  it('tells the setter what became of theirs', () => {
    const batting = room(ME, KABIR, { state: 'accepted' }, { players: [row(ME, { host: true, status: 'done' }), row(KABIR, { status: 'batting', joined: NOW - 60_000 })] });
    expect(noticesOf([batting], null, ME, NOW)[0]).toMatchObject({ title: 'Kabir is batting your challenge', sub: '1m' });
    const declined = room(ME, KABIR, { state: 'declined' }, { players: [row(ME, { host: true, status: 'done' }), row(KABIR, { status: 'declined', at: NOW - 4 * HOUR })] });
    expect(noticesOf([declined], null, ME, NOW)[0]).toMatchObject({ title: 'Kabir declined your challenge', sub: 'again in 20h', key: null });
    expect(noticesOf([room(ME, KABIR, { state: 'unanswered', answerBy: NOW - 2 * DAY })], null, ME, NOW)[0])
      .toMatchObject({ title: 'Kabir didn’t answer', sub: '2d', key: { kind: 'again', handle: handleOf(KABIR) } });
    // Their own: still being set, or waiting on the other one, says nothing here.
    expect(noticesOf([room(ME, KABIR, {}), room(ME, KABIR, { state: 'setting' })], null, ME, NOW)).toHaveLength(0);
  });

  it('settles a match as a result, with the verdict', () => {
    const done = room(ME, KABIR, { state: 'accepted' }, {
      state: 'done', mode: 'super10',
      players: [row(ME, { host: true, status: 'done', runs: 87, score: 87, at: NOW - 3 * HOUR }), row(KABIR, { status: 'done', runs: 64, score: 64, at: NOW - 2 * HOUR })],
    });
    expect(noticesOf([done], null, ME, NOW)[0]).toMatchObject({ kind: 'results', mode: 'super10', title: 'You beat Kabir · 87–64', chip: 'W', sub: '2h' });
  });

  it('names the top taken, and chases fallen short', () => {
    const notices = noticesOf([], activity([event({ place: 2 }), event({ kind: 'short', runs: 164, target: 172, at: NOW - 2 * DAY })]), ME, NOW);
    expect(notices.map(one => one.title)).toEqual(['Kabir took #1 from you', 'Kabir chased your 172']);
    expect(notices[1]).toMatchObject({ sub: 'Fell 8 short · 2d', key: null });
  });

  it('keeps thirty days and groups them', () => {
    const notices = noticesOf([room(KABIR, ME, {})], activity([event({}), event({ at: NOW - 3 * DAY }), event({ at: NOW - 31 * DAY })]), ME, NOW);
    expect(notices).toHaveLength(3);
    expect(noticeGroups(notices, 'all', NOW).map(group => [group.title, group.notices.length])).toEqual([['NEEDS YOU', 1], ['TODAY', 1], ['EARLIER', 1]]);
    expect(noticeGroups(notices, 'board', NOW).map(group => group.title)).toEqual(['TODAY', 'EARLIER']);
    expect(noticeGroups(notices, 'results', NOW)).toHaveLength(0);
  });

  it('counts what is new and what waits on you, 9 at most', () => {
    const notices = noticesOf([room(KABIR, ME, { sentAt: NOW - 3 * DAY })], activity([event({}), event({ at: NOW - 3 * DAY })]), ME, NOW);
    expect(unseenCount(notices, 0)).toBe(3);
    // Opened since: only the challenge still waiting counts.
    expect(unseenCount(notices, NOW - HOUR)).toBe(1);
    expect([bellLabel(0), bellLabel(4), bellLabel(12)]).toEqual(['', '4', '9+']);
  });
});
