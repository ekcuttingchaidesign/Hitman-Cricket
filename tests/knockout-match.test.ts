import { describe, expect, it } from 'vitest';
import { handleOf } from '../src/game/handle';
import { codeIn } from '../src/game/match-code';
import {
  AWAY_MS, STALL_MS, MATCH_SEATS, START_IN_MS, awayInMatch, ballInMatch, beatInMatch, cleanMatchCode, hostMatch, inviteToMatch, joinMatch, leaveMatch, matchRefused,
  memoryKnockouts, readInvites, readMatch, readyMatch, removeFromMatch, startMatch,
  type MatchOutcome, type MatchView, type Member,
} from '../src/server/knockout-store';

/**
 * Super Knockout with friends (`knockout-store.ts`, Figma section 53): the
 * host, the code, the lobby, the start, and the balls each phone sends,
 * against the dev server's own memory store.
 */
const ids = Array.from({ length: 14 }, (_, i) => `abcd${String(i).padStart(2, '0')}-abcdefghijkl${i}`);
const names = ['Kabir', 'Riya', 'Zoya', 'Arjun', 'Meera', 'Dev', 'Sana', 'Ishaan', 'Rohan', 'Aanya', 'Vikram', 'Sam', 'Tara', 'Neel'];
const as = (i: number): Member => ({ playerId: ids[i], name: names[i], avatar: i % 5, address: `10.0.0.${i}` });
const T0 = Date.UTC(2026, 10, 18, 18, 0, 0);

function setup() {
  const byHandle = new Map(ids.map(id => [handleOf(id), id]));
  return memoryKnockouts(handle => byHandle.get(handle) ?? null);
}
const ok = (outcome: MatchOutcome): MatchView => {
  if (matchRefused(outcome)) throw new Error(outcome.reason);
  return outcome.match;
};

describe('a match with friends', () => {
  it('is hosted on a four-character code, with the host in and ready', async () => {
    const store = setup();
    const match = ok(await hostMatch(store, as(0), T0));
    expect(match.code).toMatch(/^[2-9A-HJ-NP-Z]{4}$/);
    expect(match.state).toBe('lobby');
    expect(match.members).toHaveLength(1);
    expect(match.members[0]).toMatchObject({ name: 'Kabir', host: true, ready: true, handle: handleOf(ids[0]) });
    expect(match.host).toBe(handleOf(ids[0]));
  });

  it('never answers with a player id', async () => {
    const store = setup();
    const { code } = ok(await hostMatch(store, as(0), T0));
    ok(await joinMatch(store, code, as(1), T0 + 1000));
    const read = JSON.stringify(await readMatch(store, code, T0 + 2000));
    for (const id of ids) expect(read).not.toContain(id);
  });

  it('reads a code typed in lower case, or pasted as a whole link', () => {
    expect(cleanMatchCode('k7q2')).toBe('K7Q2');
    expect(cleanMatchCode('https://hitmancricket.in/?k=K7Q2')).toBe('K7Q2');
    expect(cleanMatchCode('K7Q')).toBeNull();
    expect(cleanMatchCode('K0Q2')).toBeNull();
  });

  it('finds the code in whatever was pasted: INVITE’s whole line, a link, a code with spaces round it', () => {
    const shared = 'Bat with me in Super Knockout. Code K7Q2 https://hitman-cricket-git-claude-confident-faraday-puyn02-ek.vercel.app/?k=K7Q2';
    expect(codeIn(shared)).toBe('K7Q2');
    expect(codeIn('Bat with me in Super Knockout. Code k7q2')).toBe('K7Q2');
    expect(codeIn('  k7q2\n')).toBe('K7Q2');
    expect(codeIn('https://hitmancricket.in/?k=K7Q2&x=1')).toBe('K7Q2');
    expect(codeIn('join K7Q2 now')).toBe('K7Q2');
    // Nothing that says which, or nothing at all.
    expect(codeIn('K7Q2 or WXYZ')).toBeNull();
    expect(codeIn('Bat with me in Super Knockout')).toBeNull();
    expect(codeIn('')).toBeNull();
  });

  it('says plainly when the code is no match', async () => {
    const store = setup();
    const out = await joinMatch(store, 'ZZZZ', as(1), T0);
    expect(matchRefused(out) && out.status).toBe(404);
  });

  it('seats twelve and turns the thirteenth away', async () => {
    const store = setup();
    const { code } = ok(await hostMatch(store, as(0), T0));
    for (let i = 1; i < MATCH_SEATS; i++) ok(await joinMatch(store, code, as(i), T0 + i));
    const full = await joinMatch(store, code, as(12), T0 + 100);
    expect(matchRefused(full) && full.status).toBe(409);
    // Somebody already in comes back without a seat being counted twice.
    expect(ok(await joinMatch(store, code, as(5), T0 + 200)).members).toHaveLength(MATCH_SEATS);
  });

  it('lets guests say they are ready', async () => {
    const store = setup();
    const { code } = ok(await hostMatch(store, as(0), T0));
    ok(await joinMatch(store, code, as(1), T0 + 10));
    const match = ok(await readyMatch(store, code, as(1), true, T0 + 20));
    expect(match.members.find(m => m.name === 'Riya')!.ready).toBe(true);
  });

  it('hands the match on when the host leaves the lobby', async () => {
    const store = setup();
    const { code } = ok(await hostMatch(store, as(0), T0));
    ok(await joinMatch(store, code, as(1), T0 + 10));
    ok(await joinMatch(store, code, as(2), T0 + 20));
    const match = ok(await leaveMatch(store, code, as(0), T0 + 30));
    expect(match.host).toBe(handleOf(ids[1]));
    expect(match.members.map(m => m.name)).toEqual(['Riya', 'Zoya']);
  });

  it('lets the host take somebody out: back once, kept out the second time', async () => {
    const store = setup();
    const { code } = ok(await hostMatch(store, as(0), T0));
    ok(await joinMatch(store, code, as(1), T0 + 10));
    ok(await removeFromMatch(store, code, as(0), handleOf(ids[1]), T0 + 20));
    ok(await joinMatch(store, code, as(1), T0 + 30));
    ok(await removeFromMatch(store, code, as(0), handleOf(ids[1]), T0 + 40));
    const again = await joinMatch(store, code, as(1), T0 + 50);
    expect(matchRefused(again) && again.status).toBe(403);
    // Only the host may.
    ok(await joinMatch(store, code, as(2), T0 + 60));
    const notHost = await removeFromMatch(store, code, as(2), handleOf(ids[0]), T0 + 70);
    expect(matchRefused(notHost) && notHost.status).toBe(403);
  });

  it('sends an invite into the other player’s list, and drops it once they join', async () => {
    const store = setup();
    const { code } = ok(await hostMatch(store, as(0), T0));
    const match = ok(await inviteToMatch(store, code, as(0), handleOf(ids[3]), T0 + 10));
    expect(match.invited).toEqual([handleOf(ids[3])]);
    const listed = await readInvites(store, ids[3]);
    expect(listed.ok && listed.invites).toEqual([{ code, by: 'Kabir', byAvatar: 0, at: T0 + 10, size: 1 }]);
    const joined = ok(await joinMatch(store, code, as(3), T0 + 20));
    expect(joined.invited).toEqual([]);
    const after = await readInvites(store, ids[3]);
    expect(after.ok && after.invites).toEqual([]);
  });

  it('starts at the host’s word with a friend in, the seats fixed in join order and the walk-out a moment ahead', async () => {
    const store = setup();
    const { code } = ok(await hostMatch(store, as(0), T0));
    const alone = await startMatch(store, code, as(0), T0 + 5);
    expect(matchRefused(alone) && alone.reason).toMatch(/one friend/);
    ok(await joinMatch(store, code, as(1), T0 + 10));
    ok(await joinMatch(store, code, as(2), T0 + 20));
    const guest = await startMatch(store, code, as(1), T0 + 25);
    expect(matchRefused(guest) && guest.status).toBe(403);
    const match = ok(await startMatch(store, code, as(0), T0 + 30));
    expect(match.state).toBe('live');
    expect(match.startAt).toBe(T0 + 30 + START_IN_MS);
    expect(match.seats).toEqual([0, 1, 2].map(i => handleOf(ids[i])));
    expect(match.members.map(m => m.seat)).toEqual([0, 1, 2]);
    // Started once: a second tap changes nothing.
    expect(ok(await startMatch(store, code, as(0), T0 + 900)).startAt).toBe(T0 + 30 + START_IN_MS);
    // And nobody new gets in after it.
    const late = await joinMatch(store, code, as(5), T0 + 1000);
    expect(matchRefused(late) && late.status).toBe(409);
  });

  async function started() {
    const store = setup();
    const { code } = ok(await hostMatch(store, as(0), T0));
    ok(await joinMatch(store, code, as(1), T0 + 10));
    ok(await startMatch(store, code, as(0), T0 + 20));
    return { store, code };
  }

  it('takes each ball in order, and nothing after a wicket', async () => {
    const { store, code } = await started();
    ok(await ballInMatch(store, code, as(0), 0, '4', T0 + 5000));
    const skipped = await ballInMatch(store, code, as(0), 2, '1', T0 + 6000);
    expect(matchRefused(skipped) && skipped.status).toBe(409);
    ok(await ballInMatch(store, code, as(0), 1, 'W', T0 + 7000));
    const after = await ballInMatch(store, code, as(0), 2, '6', T0 + 8000);
    expect(matchRefused(after) && after.reason).toMatch(/out/);
    const match = ok(await readMatch(store, code, T0 + 9000));
    expect(match.members[0].card).toBe('4W');
    // A ball sent twice is the same ball.
    ok(await ballInMatch(store, code, as(1), 0, '2', T0 + 5000));
    ok(await ballInMatch(store, code, as(1), 0, '6', T0 + 5100));
    expect(ok(await readMatch(store, code, T0 + 9000)).members[1].card).toBe('2');
  });

  it('refuses what a ball cannot be worth, and a player who is not batting', async () => {
    const { store, code } = await started();
    const five = await ballInMatch(store, code, as(0), 0, '5', T0 + 5000);
    expect(matchRefused(five) && five.status).toBe(400);
    const sub = await ballInMatch(store, code, as(0), 0, 'S', T0 + 5000);
    expect(matchRefused(sub) && sub.status).toBe(400);
    const stranger = await ballInMatch(store, code, as(6), 0, '1', T0 + 5000);
    expect(matchRefused(stranger) && stranger.status).toBe(403);
  });

  it('lets a sub bat out the over of somebody gone quiet, by the store’s clock, and keeps any ball of theirs that landed first', async () => {
    const { store, code } = await started();
    ok(await ballInMatch(store, code, as(1), 0, '1', T0 + 5000));
    ok(await ballInMatch(store, code, as(1), 1, '2', T0 + 6000));
    // Too soon: nothing happens.
    ok(await awayInMatch(store, code, as(0), handleOf(ids[1]), 0, T0 + 6000 + AWAY_MS - 1));
    expect(ok(await readMatch(store, code, T0 + 30_000)).members[1].card).toBe('12');
    // Quiet long enough: the rest of their first over is the sub's.
    ok(await awayInMatch(store, code, as(0), handleOf(ids[1]), 0, T0 + 6000 + AWAY_MS));
    expect(ok(await readMatch(store, code, T0 + 30_000)).members[1].card).toBe('12SSSS');
    // Their late ball for that over changes nothing; the next over is theirs again.
    ok(await ballInMatch(store, code, as(1), 2, '6', T0 + 31_000));
    ok(await ballInMatch(store, code, as(1), 6, '4', T0 + 32_000));
    expect(ok(await readMatch(store, code, T0 + 33_000)).members[1].card).toBe('12SSSS4');
  });

  it('subs a player still checking in who has sent no ball for a minute, and only then', async () => {
    const { store, code } = await started();
    ok(await ballInMatch(store, code, as(1), 0, '1', T0 + 6000));
    // Checking in all along, but no ball after the first: the page's game stopped, or its balls were lost.
    for (let at = T0 + 10_000; at <= T0 + 6000 + STALL_MS; at += 5000) ok(await beatInMatch(store, code, as(1), at));
    const just = ok(await awayInMatch(store, code, as(0), handleOf(ids[1]), 0, T0 + 6000 + STALL_MS - 1));
    expect(just.members[1].card).toBe('1');
    expect(just.members[1].idle).toBe(STALL_MS - 1);
    ok(await awayInMatch(store, code, as(0), handleOf(ids[1]), 0, T0 + 6000 + STALL_MS));
    expect(ok(await readMatch(store, code, T0 + 70_000)).members[1].card).toBe('1SSSSS');
  });

  it('counts a stall from the walk-out for a player yet to send a ball', async () => {
    const { store, code } = await started();
    const start = ok(await readMatch(store, code, T0 + 5000));
    const walkOut = start.startAt!;
    ok(await beatInMatch(store, code, as(1), walkOut + STALL_MS - 1000));
    expect(ok(await awayInMatch(store, code, as(0), handleOf(ids[1]), 0, walkOut + STALL_MS - 1)).members[1].card).toBe('');
    expect(ok(await awayInMatch(store, code, as(0), handleOf(ids[1]), 0, walkOut + STALL_MS)).members[1].card).toBe('SSSSSS');
  });

  it('subs a player who ran away at once', async () => {
    const { store, code } = await started();
    const left = ok(await leaveMatch(store, code, as(1), T0 + 5000));
    expect(left.members[1].left).toBe(true);
    ok(await awayInMatch(store, code, as(0), handleOf(ids[1]), 0, T0 + 5001));
    expect(ok(await readMatch(store, code, T0 + 6000)).members[1].card).toBe('SSSSSS');
  });
});
