import { describe, expect, it } from 'vitest';
import { handleOf } from '../src/game/handle';
import { codeIn } from '../src/game/match-code';
import {
  AWAY_MS, INVITE_FRESH_MS, LOBBY_AWAY_MS, STALL_MS, MATCH_SEATS, START_IN_MS, awayInMatch, backToRoom, doneMatch, settleMatch, ballInMatch, beatInMatch, cleanMatchCode, hostMatch, inviteToMatch, joinMatch, leaveMatch, matchRefused,
  memoryKnockouts, namesOf, nudgeInMatch, reactInMatch, readInvites, NUDGE_GAP_MS, readMatch, readyMatch, removeFromMatch, startMatch, REACTION_FRESH_MS, REACTION_GAP_MS,
  type MatchOutcome, type MatchView, type Member,
} from '../src/server/knockout-store';
import { playMatch } from './knockout-play';

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
/** START with everybody in the room ready, as the host can only start it: each friend says so a moment before. */
async function begin(store: ReturnType<typeof setup>, code: string, at: number): Promise<MatchOutcome> {
  const lobby = ok(await readMatch(store, code, at));
  for (const m of lobby.members) if (!m.host && !m.ready && !m.left) ok(await readyMatch(store, code, as(names.indexOf(m.name)), true, at));
  return startMatch(store, code, as(names.indexOf(lobby.members.find(m => m.host)!.name)), at);
}

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
    const listed = await readInvites(store, ids[3], T0 + 15);
    expect(listed.ok && listed.invites).toEqual([{ code, by: 'Kabir', byAvatar: 0, at: T0 + 10, size: 1 }]);
    const joined = ok(await joinMatch(store, code, as(3), T0 + 20));
    expect(joined.invited).toEqual([]);
    const after = await readInvites(store, ids[3], T0 + 25);
    expect(after.ok && after.invites).toEqual([]);
  });

  it('keeps an invite through the match it was for, and lets it go after half an hour', async () => {
    const store = setup();
    const { code } = ok(await hostMatch(store, as(0), T0));
    ok(await joinMatch(store, code, as(1), T0 + 5));
    ok(await inviteToMatch(store, code, as(0), handleOf(ids[3]), T0 + 10));
    ok(await begin(store, code, T0 + 20));
    // Asked in while it is being played, too.
    ok(await inviteToMatch(store, code, as(1), handleOf(ids[4]), T0 + 6000));
    for (const i of [3, 4]) {
      const listed = await readInvites(store, ids[i], T0 + 7000);
      expect(listed.ok && listed.invites.map(invite => invite.code)).toEqual([code]);
    }
    const stale = await readInvites(store, ids[3], T0 + 10 + INVITE_FRESH_MS + 1);
    expect(stale.ok && stale.invites).toEqual([]);
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
    ok(await readyMatch(store, code, as(1), true, T0 + 26));
    ok(await readyMatch(store, code, as(2), true, T0 + 27));
    const match = ok(await startMatch(store, code, as(0), T0 + 30));
    expect(match.state).toBe('live');
    expect(match.startAt).toBe(T0 + 30 + START_IN_MS);
    expect(match.seats).toEqual([0, 1, 2].map(i => handleOf(ids[i])));
    expect(match.members.map(m => m.seat)).toEqual([0, 1, 2]);
    // Started once: a second tap changes nothing.
    expect(ok(await startMatch(store, code, as(0), T0 + 900)).startAt).toBe(T0 + 30 + START_IN_MS);
    // Somebody new after it waits in the room for the next one: in, with no seat in this match.
    const late = ok(await joinMatch(store, code, as(5), T0 + 1000));
    expect(late.seats).toHaveLength(3);
    expect(late.members.find(m => m.name === 'Dev')).toMatchObject({ seat: null, playing: false });
  });

  async function started() {
    const store = setup();
    const { code } = ok(await hostMatch(store, as(0), T0));
    ok(await joinMatch(store, code, as(1), T0 + 10));
    ok(await begin(store, code, T0 + 20));
    return { store, code };
  }

  describe('a friend whose phone has gone quiet in the lobby', () => {
    async function room() {
      const store = setup();
      const { code } = ok(await hostMatch(store, as(0), T0));
      for (const i of [1, 2]) ok(await joinMatch(store, code, as(i), T0 + 10 * i));
      return { store, code };
    }
    const away = (match: MatchView) => match.members.map(m => `${m.name}:${m.away ? 'away' : 'here'}`).join(' ');

    it('is away once unheard for long enough, never the host, and here again at their next check-in', async () => {
      const { store, code } = await room();
      expect(away(ok(await readMatch(store, code, T0 + LOBBY_AWAY_MS)))).toBe('Kabir:here Riya:here Zoya:here');
      // Riya's phone checks in; Zoya's has gone quiet.
      ok(await beatInMatch(store, code, as(1), T0 + LOBBY_AWAY_MS));
      const later = ok(await readMatch(store, code, T0 + LOBBY_AWAY_MS + 1000));
      expect(away(later)).toBe('Kabir:here Riya:here Zoya:away');
      expect(away(ok(await beatInMatch(store, code, as(2), T0 + LOBBY_AWAY_MS + 2000)))).toBe('Kabir:here Riya:here Zoya:here');
    });

    it('is not waited for: START wakes on everybody still here, and somebody away who never said ready sits the match out', async () => {
      const { store, code } = await room();
      const at = T0 + LOBBY_AWAY_MS + 5000;
      ok(await readyMatch(store, code, as(1), true, at));
      const started = ok(await startMatch(store, code, as(0), at + 100));
      expect(started.state).toBe('live');
      expect(started.seats).toEqual([handleOf(ids[0]), handleOf(ids[1])]);
      // Still in the room, for the next one.
      expect(started.members.map(m => m.name)).toEqual(['Kabir', 'Riya', 'Zoya']);
      expect(started.members[2]).toMatchObject({ seat: null, playing: false, left: false });
    });

    it('keeps the seat of somebody who had said ready before going quiet: a sub bats until they are back', async () => {
      const { store, code } = await room();
      ok(await readyMatch(store, code, as(2), true, T0 + 100));
      const at = T0 + LOBBY_AWAY_MS + 5000;
      ok(await readyMatch(store, code, as(1), true, at));
      const started = ok(await startMatch(store, code, as(0), at + 100));
      expect(started.seats).toEqual([handleOf(ids[0]), handleOf(ids[1]), handleOf(ids[2])]);
    });

    it('still holds START for a friend who is here and not ready, and says so of nobody but them', async () => {
      const { store, code } = await room();
      const at = T0 + LOBBY_AWAY_MS + 5000;
      ok(await beatInMatch(store, code, as(1), at));
      const refused = await startMatch(store, code, as(0), at + 100);
      expect(matchRefused(refused) && refused.reason).toBe('Waiting for Riya to be ready.');
      // With everybody else away and none of them ready, there is nobody to bat with.
      const alone = await startMatch(store, code, as(0), at + LOBBY_AWAY_MS + 5000);
      expect(matchRefused(alone) && alone.reason).toBe('Nobody else is here and ready.');
    });

    it('is not nudged, and does not count toward what the match is worth unless they said ready', async () => {
      const { store, code } = await room();
      const at = T0 + LOBBY_AWAY_MS + 5000;
      ok(await beatInMatch(store, code, as(1), at));
      const nudged = ok(await nudgeInMatch(store, code, as(0), undefined, at + 100));
      expect(nudged.members.map(m => m.nudged > 0)).toEqual([false, true, false]);
      // Three in the room, one of them away and not ready: worth what two are.
      expect(nudged.worth).toEqual([3, 1, 0]);
    });

    it('is nobody the moment a room comes back to its lobby', async () => {
      const store = setup();
      const { code } = ok(await hostMatch(store, as(0), T0));
      ok(await joinMatch(store, code, as(1), T0 + 10));
      ok(await begin(store, code, T0 + 20));
      for (const i of [0, 1]) ok(await ballInMatch(store, code, as(i), 0, 'W', T0 + 5000));
      const later = T0 + 10 * 60_000;
      for (const i of [0, 1]) ok(await backToRoom(store, code, as(i), later + i));
      const lobby = ok(await readMatch(store, code, later + 1000));
      expect(lobby.state).toBe('lobby');
      expect(lobby.members.every(m => !m.away)).toBe(true);
    });
  });

  describe('everybody ready before the start', () => {
    async function room() {
      const store = setup();
      const { code } = ok(await hostMatch(store, as(0), T0));
      for (const i of [1, 2, 3]) ok(await joinMatch(store, code, as(i), T0 + 10 * i));
      return { store, code };
    }
    it('refuses the host’s START while anybody is not ready, and says who', async () => {
      const { store, code } = await room();
      const none = await startMatch(store, code, as(0), T0 + 100);
      expect(matchRefused(none) && none.status).toBe(409);
      expect(matchRefused(none) && none.reason).toBe('Waiting for Riya, Zoya and 1 more to be ready.');
      ok(await readyMatch(store, code, as(1), true, T0 + 110));
      const two = await startMatch(store, code, as(0), T0 + 120);
      expect(matchRefused(two) && two.reason).toBe('Waiting for Zoya and Arjun to be ready.');
      ok(await readyMatch(store, code, as(2), true, T0 + 130));
      const one = await startMatch(store, code, as(0), T0 + 140);
      expect(matchRefused(one) && one.reason).toBe('Waiting for Arjun to be ready.');
      expect(ok(await readMatch(store, code, T0 + 150)).state).toBe('lobby');
      ok(await readyMatch(store, code, as(3), true, T0 + 160));
      expect(ok(await startMatch(store, code, as(0), T0 + 170)).state).toBe('live');
    });
    it('puts START back to sleep when somebody steps back, or a friend arrives', async () => {
      const { store, code } = await room();
      for (const i of [1, 2, 3]) ok(await readyMatch(store, code, as(i), true, T0 + 100 + i));
      ok(await readyMatch(store, code, as(2), false, T0 + 200));
      const back = await startMatch(store, code, as(0), T0 + 210);
      expect(matchRefused(back) && back.reason).toBe('Waiting for Zoya to be ready.');
      ok(await readyMatch(store, code, as(2), true, T0 + 220));
      ok(await joinMatch(store, code, as(4), T0 + 230));
      const arrived = await startMatch(store, code, as(0), T0 + 240);
      expect(matchRefused(arrived) && arrived.reason).toBe('Waiting for Meera to be ready.');
    });
    it('does not wait for somebody the host took out, or who left', async () => {
      const { store, code } = await room();
      ok(await readyMatch(store, code, as(1), true, T0 + 100));
      ok(await removeFromMatch(store, code, as(0), handleOf(ids[2]), T0 + 110));
      ok(await leaveMatch(store, code, as(3), T0 + 120));
      expect(ok(await startMatch(store, code, as(0), T0 + 130)).state).toBe('live');
    });
    it('asks again every match: back in the lobby nobody but the host is ready', async () => {
      const { store, code } = await room();
      ok(await begin(store, code, T0 + 100));
      for (const i of [0, 1, 2, 3]) ok(await backToRoom(store, code, as(i), T0 + 7000 + i));
      const lobby = ok(await readMatch(store, code, T0 + 8000));
      expect(lobby.round).toBe(2);
      expect(lobby.members.map(m => m.ready)).toEqual([true, false, false, false]);
      const again = await startMatch(store, code, as(0), T0 + 8100);
      expect(matchRefused(again) && again.status).toBe(409);
    });
    it('lets the host nudge whoever is not ready: one of them or all, each no more often than the gap, and only the host', async () => {
      const { store, code } = await room();
      ok(await readyMatch(store, code, as(1), true, T0 + 100));
      const guest = await nudgeInMatch(store, code, as(1), handleOf(ids[2]), T0 + 200);
      expect(matchRefused(guest) && guest.status).toBe(403);
      // One, by handle: the others are left alone, and somebody ready is never nudged.
      const one = ok(await nudgeInMatch(store, code, as(0), handleOf(ids[2]), T0 + 1000));
      expect(one.members.map(m => m.nudged)).toEqual([0, 0, T0 + 1000, 0]);
      expect(ok(await nudgeInMatch(store, code, as(0), handleOf(ids[1]), T0 + 1100)).members[1].nudged).toBe(0);
      // All of them: Zoya was nudged a moment ago and is not nudged again until the gap is up.
      const all = ok(await nudgeInMatch(store, code, as(0), undefined, T0 + 2000));
      expect(all.members.map(m => m.nudged)).toEqual([0, 0, T0 + 1000, T0 + 2000]);
      const later = ok(await nudgeInMatch(store, code, as(0), undefined, T0 + 1000 + NUDGE_GAP_MS));
      expect(later.members.map(m => m.nudged)).toEqual([0, 0, T0 + 1000 + NUDGE_GAP_MS, T0 + 2000]);
      // A nudge never writes over what they said: ready a moment before it lands is still ready.
      ok(await readyMatch(store, code, as(3), true, T0 + 30_000));
      expect(ok(await nudgeInMatch(store, code, as(0), undefined, T0 + 40_000)).members.map(m => m.ready)).toEqual([true, true, false, true]);
      expect(JSON.stringify(later)).not.toContain(ids[2]);
    });
    it('names who is waited for: one, two, or two and how many more', () => {
      expect(namesOf(['Kabir'])).toBe('Kabir');
      expect(namesOf(['Kabir', 'Meera'])).toBe('Kabir and Meera');
      expect(namesOf(['Kabir', 'Meera', 'Dev', 'Sana'])).toBe('Kabir, Meera and 2 more');
    });
  });

  it('keeps how a ball was played beside it, and tells a player’s latest few to whoever is watching', async () => {
    // Only a ball's figure used to travel, so a watcher's phone made up a stroke to fit: a helicopter for one was shown as
    // a cover drive for one. The how is the picture alone: the card is what the room counts.
    const { store, code } = await started();
    const how = (n: number) => JSON.stringify({ s: 'STRAIGHT', f: 64, v: 2, m: 1, a: 500 + n, r: 800, o: { runs: 1, isWicket: false, timingGrade: 'OK' } });
    for (let i = 0; i < 5; i++) ok(await ballInMatch(store, code, as(0), i, '1', T0 + 5000 + i * 1000, undefined, how(i)));
    // A ball sent with none, and one too long to keep: the ball counts all the same.
    ok(await ballInMatch(store, code, as(1), 0, '4', T0 + 5000));
    ok(await ballInMatch(store, code, as(1), 1, '2', T0 + 6000, undefined, 'x'.repeat(2000)));
    const view = ok(await readMatch(store, code, T0 + 12_000));
    const [kabir, riya] = view.members;
    expect(kabir.card).toBe('11111');
    // The last three, from where they start: a story never shows an older ball.
    expect(kabir.hows).toEqual({ from: 2, list: [how(2), how(3), how(4)] });
    expect(riya.card).toBe('42');
    expect(riya.hows).toBeNull();
    // Told once: a ball sent again does not change how it was played.
    ok(await ballInMatch(store, code, as(0), 4, '1', T0 + 13_000, undefined, how(99)));
    expect(ok(await readMatch(store, code, T0 + 14_000)).members[0].hows!.list[2]).toBe(how(4));
    // Nobody's id rides on it.
    expect(JSON.stringify(view)).not.toContain(ids[0]);
  });
  it('lets the hows go with the balls when the room goes back to its lobby', async () => {
    const { store, code } = await started();
    ok(await ballInMatch(store, code, as(0), 0, 'W', T0 + 5000, undefined, '{"r":700,"o":{"runs":0,"isWicket":true,"timingGrade":"MISS"}}'));
    ok(await ballInMatch(store, code, as(1), 0, 'W', T0 + 5000));
    expect(ok(await readMatch(store, code, T0 + 6000)).members[0].hows).not.toBeNull();
    ok(await doneMatch(store, code, as(0), 1));
    const lobby = ok(await settleMatch(store, code, as(0), T0 + 8000));
    expect(lobby.state).toBe('lobby');
    expect(lobby.members.every(m => m.hows === null && m.card === '')).toBe(true);
  });

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

  it('takes everybody seated as there at the walk-out: a guest who waited in the lobby is not away as the match begins', async () => {
    const store = setup();
    const { code } = ok(await hostMatch(store, as(0), T0));
    // Ready, and then a minute in the lobby with nothing to say: a phone checks in only once it is batting.
    ok(await joinMatch(store, code, as(1), T0 + 10));
    ok(await readyMatch(store, code, as(1), true, T0 + 20));
    const begun = T0 + 60_000;
    const live = ok(await startMatch(store, code, as(0), begun));
    expect(live.members[1].quiet).toBe(0);
    expect(live.busy).toBe(2);
    // The host's phone asks the moment it walks out, before the guest's first check-in has landed: nobody is subbed.
    const walkOut = begun + START_IN_MS;
    expect(ok(await awayInMatch(store, code, as(0), handleOf(ids[1]), 0, walkOut + 50)).members[1].card).toBe('');
    expect(ok(await awayInMatch(store, code, as(0), handleOf(ids[1]), 0, walkOut + AWAY_MS - 1)).members[1].card).toBe('');
    // Still nothing from them a full wait after the walk-out: then they are away, and a sub bats the over.
    expect(ok(await awayInMatch(store, code, as(0), handleOf(ids[1]), 0, walkOut + AWAY_MS)).members[1].card).toBe('SSSSSS');
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

  describe('a reaction, from somebody watching to the batter they watch', () => {
    async function three() {
      const store = setup();
      const { code } = ok(await hostMatch(store, as(0), T0));
      ok(await joinMatch(store, code, as(1), T0 + 10));
      ok(await joinMatch(store, code, as(2), T0 + 15));
      ok(await begin(store, code, T0 + 20));
      return { store, code };
    }
    it('is told to every phone for a few seconds: who it is for and who sent it by handle, the sender by name, never an id', async () => {
      const { store, code } = await three();
      const sent = ok(await reactInMatch(store, code, as(1), handleOf(ids[0]), '🔥', T0 + 5000));
      expect(sent.reactions).toHaveLength(1);
      expect(sent.reactions[0]).toMatchObject({ to: handleOf(ids[0]), by: handleOf(ids[1]), from: 'Riya', emoji: '🔥', at: T0 + 5000 });
      expect(JSON.stringify(sent)).not.toContain(ids[1]);
      // Still news to a phone that reads a moment later, and gone once it is old.
      expect(ok(await readMatch(store, code, T0 + 5000 + REACTION_FRESH_MS - 1)).reactions).toHaveLength(1);
      expect(ok(await readMatch(store, code, T0 + 5000 + REACTION_FRESH_MS)).reactions).toHaveLength(0);
    });
    it('keeps two sent in the same moment by two watchers, oldest first, each under an id of its own', async () => {
      const { store, code } = await three();
      ok(await reactInMatch(store, code, as(1), handleOf(ids[0]), '😂', T0 + 5000));
      const both = ok(await reactInMatch(store, code, as(2), handleOf(ids[0]), '🦆', T0 + 5000));
      expect(both.reactions.map(rx => `${rx.from}${rx.emoji}`)).toEqual(['Riya😂', 'Zoya🦆']);
      expect(new Set(both.reactions.map(rx => rx.id)).size).toBe(2);
    });
    it('lets one watcher send no faster than the gap, and nothing that is not on the tray', async () => {
      const { store, code } = await three();
      ok(await reactInMatch(store, code, as(1), handleOf(ids[0]), '👏', T0 + 5000));
      expect(ok(await reactInMatch(store, code, as(1), handleOf(ids[0]), '👏', T0 + 5000 + REACTION_GAP_MS - 1)).reactions).toHaveLength(1);
      expect(ok(await reactInMatch(store, code, as(1), handleOf(ids[0]), '👏', T0 + 5000 + REACTION_GAP_MS)).reactions).toHaveLength(2);
      const odd = await reactInMatch(store, code, as(1), handleOf(ids[0]), '<b>hi</b>', T0 + 9000);
      expect(matchRefused(odd) && odd.status).toBe(400);
    });
    it('goes only to a player seated in the match, never to oneself, and only from somebody in it', async () => {
      const { store, code } = await three();
      const self = await reactInMatch(store, code, as(1), handleOf(ids[1]), '🔥', T0 + 5000);
      expect(matchRefused(self) && self.status).toBe(400);
      const nobody = await reactInMatch(store, code, as(1), handleOf(ids[9]), '🔥', T0 + 5000);
      expect(matchRefused(nobody) && nobody.status).toBe(400);
      const outsider = await reactInMatch(store, code, as(9), handleOf(ids[0]), '🔥', T0 + 5000);
      expect(matchRefused(outsider) && outsider.status).toBe(403);
    });
    it('is the match’s own: none are carried into the room’s next one', async () => {
      const { store, code } = await three();
      ok(await reactInMatch(store, code, as(1), handleOf(ids[0]), '🔥', T0 + 5000));
      for (const i of [0, 1, 2]) ok(await backToRoom(store, code, as(i), T0 + 6000 + i));
      const lobby = ok(await settleMatch(store, code, as(0), T0 + 7000));
      expect(lobby.round).toBe(2);
      expect(lobby.reactions).toHaveLength(0);
    });
  });

  describe('the room, between matches', () => {
    async function three() {
      const store = setup();
      const { code } = ok(await hostMatch(store, as(0), T0));
      ok(await joinMatch(store, code, as(1), T0 + 10));
      ok(await joinMatch(store, code, as(2), T0 + 15));
      ok(await begin(store, code, T0 + 20));
      return { store, code };
    }
    const tags = (match: MatchView) => match.members.map(m => `${m.name}:${m.playing ? 'playing' : m.back ? 'back' : 'in'}`).join(' ');

    it('tags everybody batting the match as playing, and somebody out who goes back as back', async () => {
      const { store, code } = await three();
      const live = ok(await readMatch(store, code, T0 + 5000));
      expect(live.round).toBe(1);
      expect(tags(live)).toBe('Kabir:playing Riya:playing Zoya:playing');
      expect(live.busy).toBe(3);
      ok(await ballInMatch(store, code, as(1), 0, 'W', T0 + 6000, 1));
      const back = ok(await backToRoom(store, code, as(1), T0 + 7000));
      expect(back.state).toBe('live');
      expect(tags(back)).toBe('Kabir:playing Riya:back Zoya:playing');
      expect(back.busy).toBe(2);
      // Their card stands: the match the others are batting still has it.
      expect(back.members[1].card).toBe('W');
    });

    it('goes back to its lobby once nobody is still batting, a round on, on a new seed, everybody in it kept', async () => {
      const { store, code } = await three();
      const before = ok(await readMatch(store, code, T0 + 5000));
      for (const i of [0, 1, 2]) ok(await ballInMatch(store, code, as(i), 0, 'W', T0 + 6000, 1));
      ok(await backToRoom(store, code, as(1), T0 + 7000));
      ok(await backToRoom(store, code, as(2), T0 + 7100));
      expect(ok(await readMatch(store, code, T0 + 7200)).state).toBe('live');
      const lobby = ok(await backToRoom(store, code, as(0), T0 + 7300));
      expect(lobby.state).toBe('lobby');
      expect(lobby.round).toBe(2);
      expect(lobby.seed).not.toBe(before.seed);
      expect(lobby.seats).toEqual([]);
      expect(lobby.members.map(m => [m.name, m.card, m.ready, m.playing])).toEqual([['Kabir', '', true, false], ['Riya', '', false, false], ['Zoya', '', false, false]]);
      // And the next match is the host's to start, on fresh cards.
      const next = ok(await begin(store, code, T0 + 9000));
      expect(next.state).toBe('live');
      expect(next.round).toBe(2);
      ok(await ballInMatch(store, code, as(0), 0, '4', T0 + 15_000, 2));
      expect(ok(await readMatch(store, code, T0 + 16_000)).members[0].card).toBe('4');
    });

    it('turns away a ball of the match before, so it is never read as the next one’s', async () => {
      const { store, code } = await three();
      for (const i of [0, 1, 2]) ok(await backToRoom(store, code, as(i), T0 + 7000 + i));
      const late = await ballInMatch(store, code, as(1), 0, '6', T0 + 8000, 1);
      expect(matchRefused(late) && late.status).toBe(403);
      ok(await begin(store, code, T0 + 9000));
      const stale = await ballInMatch(store, code, as(1), 0, '6', T0 + 15_000, 1);
      expect(matchRefused(stale) && stale.status).toBe(410);
      expect(ok(await readMatch(store, code, T0 + 16_000)).members[1].card).toBe('');
    });

    it('goes back to its lobby when the match is said to be over, whoever has not come back yet', async () => {
      const { store, code } = await three();
      ok(await backToRoom(store, code, as(1), T0 + 7000));
      // Still two batting: asking changes nothing.
      expect(ok(await settleMatch(store, code, as(1), T0 + 8000)).state).toBe('live');
      const stranger = await doneMatch(store, code, as(6), 1, T0 + 8500);
      expect(matchRefused(stranger) && stranger.status).toBe(403);
      // Said too soon, with two still to bat: the store plays the room back itself, and nothing changes.
      const soon = ok(await doneMatch(store, code, as(0), 1, T0 + 9000));
      expect(soon.over).toBe(false);
      expect(tags(soon)).toBe('Kabir:playing Riya:back Zoya:playing');
      // Batted to its end (Riya went back still batting: a sub has her seat), it is over when a phone says so.
      const played = await playMatch(store, code, [as(0), as(1), as(2)], T0 + 9000, () => '1', new Set([1]));
      const over = ok(await doneMatch(store, code, as(0), 1, played.at + 100));
      expect(over.over).toBe(true);
      expect(over.busy).toBe(0);
      expect(tags(over)).toBe('Kabir:in Riya:back Zoya:in');
      const lobby = ok(await settleMatch(store, code, as(1), played.at + 500));
      expect(lobby.state).toBe('lobby');
      expect(lobby.members).toHaveLength(3);
    });

    it('does not wait for a phone that has gone quiet', async () => {
      const { store, code } = await three();
      ok(await backToRoom(store, code, as(0), T0 + 7000));
      ok(await backToRoom(store, code, as(1), T0 + 7000));
      // Zoya has not been heard from since she joined. She is taken as there at the walk-out, and has a full wait from it:
      // until then the room is hers to bat in, and after it the room is free.
      const walkOut = T0 + 20 + START_IN_MS;
      expect(ok(await settleMatch(store, code, as(0), walkOut + AWAY_MS - 1)).state).toBe('live');
      const lobby = ok(await settleMatch(store, code, as(0), walkOut + AWAY_MS));
      expect(lobby.state).toBe('lobby');
      expect(lobby.members.map(m => m.name)).toEqual(['Kabir', 'Riya', 'Zoya']);
    });

    it('drops somebody who ran away, and hands the room on if that was the host', async () => {
      const { store, code } = await three();
      const ran = ok(await leaveMatch(store, code, as(0), T0 + 6000));
      expect(ran.members.find(m => m.name === 'Kabir')?.left).toBe(true);
      expect(ran.host).toBe(handleOf(ids[1]));
      for (const i of [1, 2]) ok(await backToRoom(store, code, as(i), T0 + 7000 + i));
      const lobby = ok(await readMatch(store, code, T0 + 8000));
      expect(lobby.state).toBe('lobby');
      expect(lobby.members.map(m => [m.name, m.host, m.ready])).toEqual([['Riya', true, true], ['Zoya', false, false]]);
    });

    it('lets somebody back in the room leave it without a sub being asked for', async () => {
      const { store, code } = await three();
      ok(await ballInMatch(store, code, as(1), 0, 'W', T0 + 6000, 1));
      ok(await backToRoom(store, code, as(1), T0 + 7000));
      const gone = ok(await leaveMatch(store, code, as(1), T0 + 8000));
      expect(gone.members.map(m => m.name)).toEqual(['Kabir', 'Zoya']);
      // Their seat in the match being played is still theirs, out on nothing.
      expect(gone.seats).toHaveLength(3);
    });
  });
});
