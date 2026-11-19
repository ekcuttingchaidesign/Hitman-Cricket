import { describe, expect, it } from 'vitest';
import { handleOf } from '../src/game/handle';
import { codeIn } from '../src/game/match-code';
import {
  AWAY_MS, INVITE_FRESH_MS, STALL_MS, MATCH_SEATS, START_IN_MS, awayInMatch, backToRoom, doneMatch, settleMatch, ballInMatch, beatInMatch, cleanMatchCode, hostMatch, inviteToMatch, joinMatch, leaveMatch, matchRefused,
  memoryKnockouts, reactInMatch, readInvites, readMatch, readyMatch, removeFromMatch, startMatch, REACTION_FRESH_MS, REACTION_GAP_MS,
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
    ok(await startMatch(store, code, as(0), T0 + 20));
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
      ok(await startMatch(store, code, as(0), T0 + 20));
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
      ok(await startMatch(store, code, as(0), T0 + 20));
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
      const next = ok(await startMatch(store, code, as(0), T0 + 9000));
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
      ok(await startMatch(store, code, as(0), T0 + 9000));
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
      const over = ok(await doneMatch(store, code, as(0), 1, T0 + 9000));
      expect(over.over).toBe(true);
      expect(over.busy).toBe(0);
      expect(tags(over)).toBe('Kabir:in Riya:back Zoya:in');
      const lobby = ok(await settleMatch(store, code, as(1), T0 + 9500));
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
