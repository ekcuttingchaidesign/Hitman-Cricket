/**
 * A match with friends, played back from what the store holds: its seed and
 * each player's card.
 *
 * A room is a pure thing of the seed and the balls (`knockout.ts`), which is
 * what lets every phone build the same one. This is that build with nothing of
 * a phone in it, so the store can run it too (`server/knockout-result.ts`) and
 * say who won without taking any phone's word for it. The game reads its
 * bowling plan and a card's balls through here as well, so the two can never
 * bowl or count a match differently.
 */
import { DeliveryGenerator, knockoutPlan, type BowlingPlan } from './DeliveryGenerator.js';
import { swingFourthOf } from './free-hit.js';
import { KNOCKOUT, KnockoutRoom, type SeatBall, type SeatSpec } from './knockout.js';
import { SeededRandom } from './SeededRandom.js';
import type { Delivery, ShotOutcome } from './types.js';

/**
 * How a match with friends is bowled: the knockout's own overs off the match's
 * seed, and no yorker owed for one player's sixes, which would bowl the next
 * ball differently on their phone than on everybody else's.
 */
export function matchPlan(seed: number): BowlingPlan {
  const plan = knockoutPlan(swingFourthOf(seed), seed);
  return { ...plan, specials: { ...plan.specials, sixesForYorker: Infinity } };
}

/** The match's balls by index, off its own bowler: the same list wherever it is drawn, as far as it is asked for. */
export function matchBowling(seed: number): (ball: number) => Delivery | null {
  const generator = new DeliveryGenerator(new SeededRandom(seed), matchPlan(seed));
  const balls: Delivery[] = [];
  return ball => {
    if (!Number.isInteger(ball) || ball < 0 || ball >= KNOCKOUT.maxBalls) return null;
    while (balls.length <= ball) balls.push(generator.next(0));
    return balls[ball];
  };
}

/**
 * One ball of a card as the room takes it: a figure or a wicket as the
 * player's own, `S` where a sub batted it, nothing where it has not arrived.
 */
export function seatBallOf(char: string | undefined): SeatBall {
  if (char === undefined || char === '') return null;
  if (char === 'S') return 'sub';
  return { runs: char === 'W' ? 0 : Number(char) as ShotOutcome['runs'], isWicket: char === 'W', quality: 0, feedback: '', timingGrade: 'GOOD', timingDeltaMs: 0,
    compatibility: 1, madeBatContact: char !== '0' && char !== 'W', aerial: false } as ShotOutcome;
}

/** A seat of a match as the store holds it: who sits in it, and their balls so far. */
export interface ReplaySeat extends SeatSpec { card: string }

/**
 * The room as it stands on these cards. With `fill`, a ball a player never
 * sent is a sub's, so a match everybody has walked away from still comes to
 * its end; without it the room stops wherever the cards do.
 */
export function replayMatch(seed: number, seats: readonly ReplaySeat[], fill = false): KnockoutRoom {
  const room = new KnockoutRoom(seed, { seats, you: 0 });
  const deliveryAt = matchBowling(seed);
  room.advance((seat, ball) => {
    const card = seats[seat.id]?.card;
    if (seat.sub || card === undefined) return 'sub';
    return seatBallOf(card[ball]) ?? (fill ? 'sub' : null);
  }, deliveryAt);
  return room;
}
