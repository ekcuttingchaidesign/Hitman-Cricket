import { describe, expect, it } from 'vitest';
import { DeliveryGenerator, knockoutPlan } from '../src/game/DeliveryGenerator';
import { KNOCKOUT, KnockoutRoom, type SeatBall, type SeatSpec } from '../src/game/knockout';
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
