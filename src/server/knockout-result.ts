import { handleOf } from '../game/handle.js';
import { KNOCKOUT, type Seat } from '../game/knockout.js';
import { pointsFor, winCounts, worthOf, type PointsRules } from '../game/knockout-points.js';
import { replayMatch, type ReplaySeat } from '../game/knockout-replay.js';
import type { KnockoutCredit } from './knockout-ledger.js';
import type { StoredMatch } from './knockout-store.js';

/**
 * A match's result, worked out by the store.
 *
 * Every phone builds the room from the seed and the cards, and so does this,
 * with the same code (`game/knockout-replay.ts`): the store holds the cards,
 * so it needs nobody's word for who won. Points are paid off this and nothing
 * else, which is what makes them worth having: a phone that says it won is not
 * asked.
 *
 * A seat a sub batted to its finish keeps its place and pays nobody
 * (`PRODUCT.md`: a place a stand-in took pays nobody); walked out of while
 * still batting, it is RAN AWAY, with no place shown at all.
 */

/** One seat of a finished match, as any phone may be told: a handle and never an id. */
export interface MatchResultRow {
  /** The real player's handle; null for a sub's seat. */
  handle: string | null;
  name: string;
  face: number;
  sub: boolean;
  /** Where the seat finished, 1 to 12. */
  place: number;
  runs: number;
  balls: number;
  out: boolean;
  /** The over whose cut took them, from 1; null for the two in the final. */
  over: number | null;
  points: number;
  /** A sub batted this player's seat to its finish. */
  stood: boolean;
  /** They walked out of the match while still batting. */
  ran: boolean;
}

export interface MatchResult {
  round: number;
  at: number;
  /** Real players who batted at least one ball of their own. */
  reals: number;
  /** What first, second and third were worth in a match of that many. */
  worth: [number, number, number];
  /** Enough real players for the match to count at all. */
  counted: boolean;
  /** Every seat, the winner first. */
  rows: MatchResultRow[];
}

/** The seats of a match as the replay takes them: every real player by where they sit, with their card. */
function seatsOf(match: StoredMatch, cardOf: (id: string) => string): ReplaySeat[] {
  return (match.start?.seats ?? []).map(id => {
    const m = match.members[id];
    return { name: m?.name ?? 'Player', face: m?.avatar ?? 0, sub: false, handle: handleOf(id), card: cardOf(id) };
  });
}

/**
 * The result of the match being played, or null where it has none yet: not
 * started, or not played to its end on the balls the store holds. With `fill`
 * every ball never sent is a sub's, which is how a match everybody has left is
 * brought to its end.
 */
export function resultOf(match: StoredMatch, cardOf: (id: string) => string, rules: PointsRules, now: number, fill = false):
{ result: MatchResult; credits: KnockoutCredit[] } | null {
  if (!match.start) return null;
  const ids = match.start.seats;
  const seats = seatsOf(match, cardOf);
  const room = replayMatch(match.seed, seats, fill);
  if (!room.done) return null;
  const own = (id: string) => [...cardOf(id)].some(char => char !== 'S');
  const reals = ids.filter(own).length;
  const worth = worthOf(reals, rules);
  const counted = reals >= rules.pointsFrom;
  const credits: KnockoutCredit[] = [];
  const row = (seat: Seat): MatchResultRow => {
    const id = seat.sub ? undefined : ids[seat.id];
    const card = id ? cardOf(id) : '';
    // A sub batted the last ball this seat played: one written for a player who was away, or one never sent at all.
    const stood = !!id && (card.length < seat.played || card[seat.played - 1] === 'S');
    const ran = stood && !!match.members[id!]?.left;
    const place = seat.place ?? KNOCKOUT.seats;
    const points = id && !stood && counted ? pointsFor(place, reals, rules) : 0;
    if (id && counted && own(id)) {
      credits.push({ id, name: seat.name, avatar: seat.face, place, runs: seat.runs, points, win: place === 1 && !stood && winCounts(reals, rules), stood, ran });
    }
    return {
      handle: seat.handle ?? null, name: seat.name, face: seat.face, sub: seat.sub, place, runs: seat.runs, balls: seat.balls, out: seat.out,
      over: seat.wentAt !== null && seat.place !== 1 && seat.wentAt <= KNOCKOUT.cuts.length * KNOCKOUT.ballsPerOver && seat.wentAt % KNOCKOUT.ballsPerOver === 0
        ? seat.wentAt / KNOCKOUT.ballsPerOver : null,
      points, stood, ran,
    };
  };
  const rows = [...room.seats].sort((a, b) => (a.place ?? KNOCKOUT.seats) - (b.place ?? KNOCKOUT.seats)).map(row);
  return { result: { round: match.round, at: now, reals, worth, counted, rows }, credits };
}
