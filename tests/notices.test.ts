import { describe, expect, it } from 'vitest';
import { handleOf } from '../src/game/handle';
import { bellLabel, knockoutNotices, noticeGroups, noticesOf, unseenCount } from '../src/game/notices';
import { noticesBodyMarkup } from '../src/ui/Notices';
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

describe('Super Knockout on Notifications', () => {
  const NOW = Date.UTC(2026, 10, 20, 12);
  const news = {
    invites: [{ code: 'K7Q2', by: 'Riya', byAvatar: 2, at: NOW - 60_000, size: 4 }],
    recent: [{ at: NOW - 2 * 3_600_000, place: 2, points: 5 }, { at: NOW - 26 * 3_600_000, place: 9, points: 0 }, { at: NOW - 3 * 3_600_000, place: 0, points: 0 }, { at: 0, place: 4, points: 0 }],
    you: { name: 'Mojo', avatar: 1 },
  };

  it('puts an invite waiting under NEEDS YOU with JOIN, and counts it on the bell until it is answered', () => {
    const [invite] = knockoutNotices(news, NOW);
    expect(invite).toMatchObject({ id: 'ko-invite:K7Q2', kind: 'challenges', needsYou: true, mode: 'knockout', title: 'Riya invited you to a match', sub: '4 in · code K7Q2', key: { kind: 'join', code: 'K7Q2' } });
    expect(invite.face).toEqual({ handle: '', name: 'Riya', avatar: 2 });
    const all = noticesOf([], null, 'abcdef-abcdefghijkl', NOW, news);
    expect(all[0].id).toBe('ko-invite:K7Q2');
    expect(unseenCount(all, NOW)).toBe(1);
    expect(noticeGroups(all, 'challenges', NOW)[0]).toMatchObject({ title: 'NEEDS YOU' });
  });

  it('makes a match played a result with the place it ended in and what it paid', () => {
    const results = knockoutNotices(news, NOW).filter(one => one.kind === 'results');
    expect(results.map(one => [one.title, one.sub, one.finish?.word ?? null, one.finish?.top ?? null])).toEqual([
      ['You finished 2nd of 12', '+5 points · 2h', '2nd', true],
      ['You finished 9th of 12', 'no points · 1d', '9th', false],
      ['You ran away from a match', 'no points · 3h', null, null],
    ]);
    // One from before the time was kept is left out: it would say "now" for ever.
    expect(results).toHaveLength(3);
    const groups = noticeGroups(noticesOf([], null, 'abcdef-abcdefghijkl', NOW, news), 'results', NOW);
    expect(groups.map(group => [group.title, group.notices.length])).toEqual([['TODAY', 2], ['EARLIER', 1]]);
  });

  it('draws JOIN and the finish on their rows, in the knockout’s name', () => {
    const markup = noticesBodyMarkup({ notices: noticesOf([], null, 'abcdef-abcdefghijkl', NOW, news), filter: 'all', seenAt: 0, you: { avatar: 1 }, now: NOW });
    expect(markup).toContain('class="nt-key is-join"');
    expect(markup).toContain('>JOIN<');
    expect(markup).toMatch(/class="nt-chip is-finish is-W"[^>]*>2nd</);
    expect(markup).toMatch(/class="nt-chip is-finish is-D"[^>]*>9th</);
    expect(markup).toContain('Super Knockout');
  });

  it('adds nothing where matches with friends are not played', () => {
    expect(noticesOf([], null, 'abcdef-abcdefghijkl', NOW)).toEqual([]);
  });
});
