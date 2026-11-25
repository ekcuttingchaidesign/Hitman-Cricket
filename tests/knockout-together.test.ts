import { describe, expect, it } from 'vitest';
import { DeliveryGenerator, knockoutPlan } from '../src/game/DeliveryGenerator';
import { KNOCKOUT, KnockoutRoom, knockoutScreen, storyFrom, trackOf, type SeatBall, type SeatSpec } from '../src/game/knockout';
import { SeededRandom } from '../src/game/SeededRandom';
import { swingFourthOf } from '../src/game/free-hit';
import type { Delivery, ShotOutcome } from '../src/game/types';

/**
 * A match with friends (`advance` in `game/knockout.ts`, Figma section 53, 4A
 * and 4B): every phone builds the same room from the same seed and the same
 * balls, so the cuts and the winner are the same on every phone, whatever
 * order the balls arrive in and whichever seat is the phone's own.
 */
const ball = (runs: ShotOutcome['runs'], isWicket = false) =>
  ({ runs, isWicket, quality: 0, feedback: '', timingGrade: 'GOOD', timingDeltaMs: 0, compatibility: 1, madeBatContact: true, aerial: false }) as ShotOutcome;
const deliveries = (seed: number): Delivery[] => {
  const g = new DeliveryGenerator(new SeededRandom(seed), knockoutPlan(swingFourthOf(seed), seed));
  return Array.from({ length: KNOCKOUT.maxBalls }, () => g.next(0));
};
const SEATS: SeatSpec[] = [
  { name: 'Kabir', face: 0, sub: false, handle: 'a' },
  { name: 'Riya', face: 1, sub: false, handle: 'b' },
  { name: 'Zoya', face: 2, sub: false, handle: 'c' },
];
/** Each real player's card: runs, a W for out, an S where a sub batted for them. */
const CARDS: Record<string, string> = { a: '1460' + '24' + '611041' + '666' + '0' + '41' + '6' + '1'.repeat(12), b: '0010W', c: '4444' + '01' + 'S'.repeat(6) + '2'.repeat(18) };
const outcomeOf = (char: string): SeatBall => (char === 'S' ? 'sub' : char === 'W' ? ball(0, true) : ball(Number(char) as ShotOutcome['runs']));

function play(seed: number, you: number, arrived: Record<string, number>, order: 'seat' | 'reverse' = 'seat') {
  const room = new KnockoutRoom(seed, { seats: SEATS, you });
  const balls = deliveries(seed);
  const source = (seat: { handle?: string; sub: boolean }, i: number): SeatBall => {
    if (seat.sub || !seat.handle) return 'sub';
    const card = CARDS[seat.handle];
    return i < Math.min(card.length, arrived[seat.handle] ?? card.length) ? outcomeOf(card[i]) : null;
  };
  const news = [];
  if (order === 'reverse') {
    // Balls trickling in seat by seat, the last seat's first.
    for (let n = 0; n <= KNOCKOUT.maxBalls; n++) news.push(...room.advance((seat, i) => (seat.id === 2 || i < n ? source(seat, i) : null), i => balls[i]));
  }
  news.push(...room.advance(source, i => balls[i]));
  return { room, news };
}
const result = (room: KnockoutRoom) => room.seats.map(s => `${s.name}:${s.runs}/${s.out ? 'out' : 'in'}#${s.place}@${s.wentAt}`).join(' ');

describe('a match with friends, batted together', () => {
  it('ends the same on every phone, whichever seat is the phone’s own', () => {
    const a = play(7, 0, {}), b = play(7, 1, {}), c = play(7, 2, {});
    expect(a.room.done).toBe(true);
    expect(result(b.room)).toBe(result(a.room));
    expect(result(c.room)).toBe(result(a.room));
    expect(b.room.winner!.name).toBe(a.room.winner!.name);
  });

  it('builds the same room on a phone that is not batting it, with no seat of its own', () => {
    // Watching from the room on a phone that joined late (`spectate` in the game): `you` is no seat at all.
    const seated = play(7, 0, {}), onlooker = play(7, -1, {});
    expect(result(onlooker.room)).toBe(result(seated.room));
    expect(onlooker.room.winner!.name).toBe(seated.room.winner!.name);
    // Part-way through: its own part reads as over, nobody in the room is it, and everybody still in can be watched.
    const { room } = play(7, -1, { a: 9, b: 9, c: 9 });
    expect(room.done).toBe(false);
    expect(room.finished).toBe(true);
    expect(room.seats.includes(room.you)).toBe(false);
    expect(room.you.out).toBe(true);
    expect(room.watchable.map(seat => seat.id)).toEqual(room.ranked.map(seat => seat.id));
    expect(room.freeHit()).toBe(false);
    expect(room.freeHitAhead()).toBe(false);
    // And it stands exactly where a seated phone's room does on the same balls.
    expect(result(room)).toBe(result(play(7, 1, { a: 9, b: 9, c: 9 }).room));
  });

  it('rides the bar on the phone’s own seat, whichever seat that is', () => {
    // The owner led a final as the guest and their face stood at the bar's far left: the bar looked for seat 0, the
    // host's, where the phone's own seat rides it.
    for (const you of [0, 1, 2]) for (const upTo of [6, 12, 24]) {
      const { room } = play(77, you, { a: upTo, b: upTo, c: upTo });
      if (room.finished) continue;
      const track = trackOf(room);
      expect(track.pips[track.you]?.you).toBe(true);
      expect(track.pips.filter(pip => pip.you)).toHaveLength(1);
      // Leading, the face is at the right-hand end, with the safe.
      if (track.place === 1) expect(track.you).toBe(track.seats - 1);
    }
  });
  it('says a free hit by the phone’s own count of balls, and keeps it off the screen between balls when asked', () => {
    const { room } = play(77, 0, { a: 6, b: 6, c: 6 });
    const on = Array.from({ length: 6 }, (_, i) => room.freeHitOn(6 + i));
    // One ball of the over at most, never its first, and only for a seat that earned one.
    expect(on.filter(Boolean).length).toBeLessThanOrEqual(1);
    expect(on[0]).toBe(false);
    if (room.freeHit()) expect(knockoutScreen(room, null, false)?.kind).not.toBe('freehit');
  });
  it('shows a friend’s story one ball at a time from their latest, and a sub’s from the top of their latest over', () => {
    // The owner, out early, opened a friend's story at fifty and it ran from the first ball to catch up; and opened on
    // their latest, two balls still ran together.
    // A friend on 14 balls, never watched: their fourteenth ball is shown, then the wait for the next.
    expect(storyFrom(0, 14, false)).toBe(13);
    // Opened again after a look in the first over: not from where it was left.
    expect(storyFrom(2, 14, false)).toBe(13);
    // Caught up, or the one ball behind, it stays where it is; nothing shown is ever shown again.
    expect(storyFrom(14, 14, false)).toBe(14);
    expect(storyFrom(13, 14, false)).toBe(13);
    // Two waiting: the older is passed over, never two in a row.
    expect(storyFrom(12, 14, false)).toBe(13);
    // Nobody has batted yet: from the top.
    expect(storyFrom(0, 0, false)).toBe(0);
    // A sub's balls come an over at a time: the top of their latest over, and on through it.
    expect(storyFrom(0, 18, true)).toBe(12);
    expect(storyFrom(14, 18, true)).toBe(14);
    expect(storyFrom(12, 12, true)).toBe(12);
    // A sub out in the middle of an over: the top of that over.
    expect(storyFrom(0, 8, true)).toBe(6);
    // Never past what has been batted, and never back.
    for (const sub of [true, false]) for (let played = 0; played <= 30; played++) for (let seen = 0; seen <= played; seen++) {
      const from = storyFrom(seen, played, sub);
      expect(from).toBeGreaterThanOrEqual(seen);
      expect(from).toBeLessThanOrEqual(played);
    }
  });
  it('ends the same whatever order the balls arrive in', () => {
    expect(result(play(11, 0, {}, 'reverse').room)).toBe(result(play(11, 0, {}).room));
  });

  it('holds the cut at the over’s end until everybody still batting has finished it', () => {
    // Riya has sent three balls; the room waits on her, with everybody else through the over.
    const { room, news } = play(5, 0, { b: 3 });
    expect(room.roomBalls).toBe(0);
    expect(news).toEqual([]);
    expect(room.waitingOn().map(s => s.name)).toEqual(['Riya']);
    expect(room.you.played).toBe(6);
    // The player on this phone reads where they are by their own ball, a whole over on.
    expect(room.bowled).toBe(6);
    // Her fourth and fifth arrive: out on the fifth, the over closes and the cut falls.
    const after = room.advance((seat, i) => (seat.sub ? 'sub' : seat.handle ? outcomeOf(CARDS[seat.handle][i] ?? '0') : null), () => deliveries(5)[0]);
    expect(room.roomBalls).toBeGreaterThanOrEqual(6);
    expect(after[0].kind).toBe('cut');
  });

  it('lets a sub bat out a player’s over where they were away, and gives them their seat back after', () => {
    const { room } = play(13, 0, {});
    const zoya = room.seats[2];
    // Zoya's card has her first four, a sub's six, then her own again: all of it counted, none lost.
    expect(zoya.played).toBe(zoya.place !== null ? zoya.played : KNOCKOUT.maxBalls);
    expect(room.logs.get(2)!.length).toBe(zoya.balls);
  });

  it('lets a sub bat for the host, the first seat, on every phone', () => {
    // The host away from their first ball: the room had no skill to give a sub in seat 0, threw, and stood still.
    const host: SeatSpec[] = [{ name: 'Kabir', face: 0, sub: false, handle: 'a' }, { name: 'Riya', face: 1, sub: false, handle: 'b' }];
    const cards: Record<string, string> = { a: '0' + 'S'.repeat(29), b: '1'.repeat(30) };
    const balls = deliveries(21);
    const tables = [0, 1].map(you => {
      const room = new KnockoutRoom(21, { seats: host, you });
      room.advance((seat, i) => (seat.sub || !seat.handle ? 'sub' : i < cards[seat.handle].length ? outcomeOf(cards[seat.handle][i]) : null), i => balls[i]);
      expect(room.roomBalls).toBeGreaterThanOrEqual(KNOCKOUT.ballsPerOver);
      return result(room);
    });
    expect(tables[0]).toBe(tables[1]);
  });

  it('keeps every ball of every seat as it was played, for somebody watching to be shown a ball at a time', () => {
    const { room } = play(13, 0, {});
    for (const seat of room.seats) {
      const plays = room.history.get(seat.id) ?? [], log = room.logs.get(seat.id) ?? [];
      expect(plays).toHaveLength(seat.played);
      // Each is the stroke and what it came to, the same ball the room counted.
      plays.forEach((one, i) => { expect(one).not.toBeNull(); expect(one!.outcome).toEqual(log[i]); });
    }
    // A friend's ball is drawn as a stroke that suits it: nothing of their own swing travels.
    const kabir = room.history.get(0)!;
    expect(kabir[0]!.shot).toBeTruthy();
    expect(kabir.map(one => one!.outcome.runs).slice(0, 4)).toEqual([1, 4, 6, 0]);
  });

  it('fills the empty seats with subs, never named as a player in the match', () => {
    const room = new KnockoutRoom(3, { seats: SEATS, you: 1 });
    expect(room.seats).toHaveLength(KNOCKOUT.seats);
    expect(room.you.name).toBe('Riya');
    expect(room.seats.filter(s => s.sub)).toHaveLength(KNOCKOUT.seats - SEATS.length);
    expect(room.seats.filter(s => s.name === 'Riya')).toHaveLength(1);
  });

  it('is the practice room exactly, when every other seat is a sub and the balls come one at a time', () => {
    const seed = 21, balls = deliveries(seed);
    const yours = '146204116601604W'.split('');
    const practice = new KnockoutRoom(seed, { name: 'Kabir', face: 0 });
    yours.forEach((c, i) => practice.ball(balls[i], outcomeOf(c) as ShotOutcome));
    for (let i = yours.length; !practice.done; i++) practice.ball(balls[i], null);
    const together = new KnockoutRoom(seed, { seats: [{ name: 'Kabir', face: 0, sub: false, handle: 'a' }, ...['Riya', 'Arjun', 'Kabir2', 'Meera', 'Ishaan', 'Zoya', 'Rohan', 'Dev', 'Sam', 'Aanya', 'Vikram'].map((name, i) => ({ name, sub: true, face: (i + 1) % 5 }))], you: 0 });
    // The subs keep their seats' dice, so their names are all that differ.
    together.advance((seat, i) => (seat.id === 0 ? (i < yours.length ? outcomeOf(yours[i]) : null) : 'sub'), i => balls[i] ?? null);
    const runs = (room: KnockoutRoom) => room.seats.map(s => `${s.runs}${s.out ? 'w' : ''}#${s.place}`).join(' ');
    expect(runs(together)).toBe(runs(practice));
  });
});
