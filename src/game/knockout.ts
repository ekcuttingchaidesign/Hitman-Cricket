/**
 * Super Knockout: up to twelve batting the same balls at the same time, one
 * wicket each, the lowest totals knocked out at the end of every over until
 * three are left, then last place out after every ball until one is
 * (`PRODUCT.md`, Figma "Super Knockout · Final", K2b's rules).
 *
 * Stage one is a practice room behind `?knockout=1`: the player and eleven
 * subs, nothing on a server. The subs bat the ball the player was bowled, so
 * the room is the same balls for everybody even with nobody else in it. The
 * room is a pure thing of the seed and the balls: nothing here reads the page,
 * the clock or `Math.random`, and `tests/knockout.test.ts` holds every rule.
 */
import { COMPATIBILITY, SHOTS } from '../config/gameplay.js';
import { effectiveLine } from './DeliveryTrajectory.js';
import { resolveShot } from './ShotResolver.js';
import { SeededRandom } from './SeededRandom.js';
import type { Delivery, ShotOutcome, ShotType } from './types.js';
import type { KnockoutScreen } from './knockout-screen.js';
import { freeHitBall, type HardBall } from './free-hit.js';

export const KNOCKOUT = {
  seats: 12,
  ballsPerOver: 6,
  /**
   * How many go at the end of each over (K2b's ladder: 12, 10, 8, 5, then
   * the last two). A cut takes exactly its count, never more: those out go
   * first, and if more are out than it takes, the best of them stay on their
   * totals. So two are always left for the fifth over, the final (the owner's
   * rule, 18 November 2026: a room won in the fourth over had cut everybody
   * else who was out in one go).
   */
  cuts: [2, 2, 3, 3] as const,
  /**
   * Five overs: four with a cut at the end, then the final, the last two
   * batting the fifth for the highest total. It ends early only once it is
   * settled: one of them out and the other past them. Otherwise on its last
   * ball, where the higher total wins, then not out, then fewer balls.
   */
  maxBalls: 30,
  /**
   * The free hit (K2b's rules, `PRODUCT.md`): after each over's cut, the top
   * three still standing bat one ball of the next over as a free hit — which
   * one, and what it is, is the room's (`freeHitBall`: never the first, and a
   * hard ball) — then the top two, then the top one, tapering as the room shrinks; none in
   * the final, where one ball could settle the match. Anybody level with the last of
   * them gets one too. On it a wicket does not count; the runs do.
   */
  freeHits: [3, 2, 1] as const,
} as const;

/** The eleven subs' names. Never a real player's: they are labelled SUB wherever they show. */
const SUB_NAMES = ['Riya', 'Arjun', 'Kabir', 'Meera', 'Ishaan', 'Zoya', 'Rohan', 'Dev', 'Sam', 'Aanya', 'Vikram'];
/** More for a match with friends, whose players may already have some of those names: a sub never shares a name with a player in the match. */
const SUB_RESERVE = ['Neel', 'Tara', 'Kiran', 'Om', 'Isha', 'Yash', 'Nisha', 'Aditya', 'Rhea', 'Kunal', 'Pooja', 'Varun'];
/**
 * How well each sub times the ball: the spread of the timing error in
 * milliseconds, and how much a quicker ball adds to it, as `super10-sim.ts`
 * models a player. Against the Blast's ball the best of them scores between
 * three and four a ball and the weakest about two, so the cut has somebody to
 * take early. The room's winner makes about 100 in some 24 balls, the middle of
 * it 86 to 113 (`scripts/knockout-sim.ts`): a good innings wins it.
 */
const SKILLS = [65, 72, 80, 86, 92, 98, 105, 112, 120, 130, 140].map(sigma => ({ sigma, pressure: Math.round(sigma / 7) }));
/**
 * A sub plays for their wicket: this share of the balls that would have had
 * them out are seen off for a dot instead. Batting the Blast's ball with one
 * wicket each, a room of subs played to the letter was down to its last one
 * by the third over; this keeps most rooms close to the final, which is the
 * match the player came for. At 0.65 the final's two were mostly out before
 * it began and one room in six was settled on its first ball, which the owner
 * watching the room saw as ending early: at 0.8 both are still batting in six
 * finals of seven, and the winner makes about 100.
 */
const KEEP = 0.8;
const NOMINAL_MS = 830;

export interface Seat {
  /** The seat, 0 to 11. In a practice room 0 is the player; in a match with friends, the seat the start gave them. */
  readonly id: number;
  readonly name: string;
  readonly sub: boolean;
  /** A real player's handle, in a match with friends: whose balls these are. */
  readonly handle?: string;
  /** Balls this seat has batted, which in a match with friends runs ahead of the room's within an over. */
  played: number;
  /** Which of the game's faces (`avatarSrc`). */
  readonly face: number;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  out: boolean;
  /** Where they finished, once they are knocked out or win: 1 is the winner. */
  place: number | null;
  /** The ball after which they went (1-based), and how. */
  wentAt: number | null;
}

/**
 * What a sub did with one ball, kept so it can be watched (`spectate` in
 * `src/Game.ts`): the stroke, how far from the ideal moment they swung, and
 * what came of it, the free hit's wicket already let off.
 */
export interface Play { shot: ShotType; offset: number; flicked: boolean; outcome: ShotOutcome }

/** What one ball did to the room. */
export interface BallNews {
  /** Who went after this ball, worst first. */
  gone: Seat[];
  /** An over's cut, or the final settled. */
  kind: 'cut' | 'final' | null;
  /** The over that just ended, 1-based, when `kind` is `'cut'`. */
  over: number | null;
  /** Set once one seat is left. */
  winner: Seat | null;
}

/** Where the player stands right now, for the scoreboard. */
export interface Standing {
  place: number;
  left: number;
  /** In the drop: the cut, if it were made now, would take them. */
  drop: boolean;
  /** Safe only because a tie at the line takes both through. */
  level: boolean;
  /** Runs that would make them safe, when in the drop and not out. */
  need: number;
  /** The final: the last two (or more, through a tie) batting the fifth over for the highest total. */
  final: boolean;
  /** The ball's in the over, 0 to 5, and the over, 1-based. */
  over: number;
  ball: number;
}

/** Ahead in the room: not out before out, then more runs. Ties are equal. */
const ahead = (a: Seat, b: Seat) => Number(a.out) - Number(b.out) || b.runs - a.runs;
/** Ahead in the final: the higher total, then not out. */
const aheadInFinal = (a: Seat, b: Seat) => b.runs - a.runs || Number(a.out) - Number(b.out);
type Order = (a: Seat, b: Seat) => number;
/** Ties broken the one fair way left: fewer balls faced, then the seat. Only ever for the winner and for places. */
const settledBy = (by: Order) => (a: Seat, b: Seat) => by(a, b) || a.balls - b.balls || a.id - b.id;

/**
 * Who the cut takes from `alive` when `count` go, worst first: those out
 * first, then the lowest totals (`by` orders them; the final's is the total
 * alone). Exactly `count`, never more: anybody out the cut does not reach
 * stays on their total. A tie at the line takes both through, and the cut
 * never takes the last one standing.
 */
export function cutOf(alive: readonly Seat[], count: number, by: Order = ahead): { gone: Seat[]; level: Set<Seat> } {
  const level = new Set<Seat>();
  const order = [...alive].sort(settledBy(by));
  const take = Math.min(count, order.length - 1);
  if (take <= 0) return { gone: [], level };
  const keep = order.length - take;
  const lastSafe = order[keep - 1], tied = by(lastSafe, order[keep]) === 0;
  const gone: Seat[] = [];
  for (const seat of order.slice(keep)) {
    if (tied && by(seat, lastSafe) === 0) level.add(seat); else gone.push(seat);
  }
  if (tied) for (const seat of order) if (by(seat, lastSafe) === 0) level.add(seat);
  return { gone: gone.reverse(), level };
}

/** A seat as a match with friends hands it over: a real player, or a sub in an empty seat. */
export interface SeatSpec { name: string; face: number; sub: boolean; handle?: string }
/**
 * What a seat did with a ball in a match with friends, as the room's source
 * tells it (`advance`): a real player's outcome, `'sub'` where a sub bats it
 * (an empty seat, or a player away for the rest of the over), or null when
 * that ball has not arrived yet.
 */
export type SeatBall = ShotOutcome | 'sub' | null;

export class KnockoutRoom {
  readonly seats: Seat[];
  /** Which seat is the player on this phone. */
  readonly youId: number;
  private balls = 0;
  private readonly dice: SeededRandom[];
  /** Who has a free hit this over, by seat id: granted at an over's cut, spent on the over's free hit ball. */
  private free = new Set<number>();
  /** Each over's free hit ball, off the seed (`freeHitBall`). */
  private readonly hard: (HardBall | null)[];
  winner: Seat | null = null;
  /** The last ball's plays, by seat: what a watcher is shown. */
  plays = new Map<number, Play>();
  /**
   * Every ball's play, by seat, in order (null where nothing was swung): what
   * somebody watching a match with friends is shown, a ball at a time, however
   * far ahead of them the room has got.
   */
  history = new Map<number, (Play | null)[]>();
  /** Every ball each seat has batted, in order, for a watcher's scoreboard. */
  logs = new Map<number, ShotOutcome[]>();

  /**
   * A practice room (the player and eleven subs), or a match with friends: the
   * seats in the order the start gave them, real players and subs, and which
   * one is the player on this phone. Every phone in a match builds the same
   * room off the same seed, so the subs bat the same on all of them.
   */
  constructor(seed: number, you: { name: string; face: number } | { seats: readonly SeatSpec[]; you: number }) {
    const specs: SeatSpec[] = 'seats' in you
      ? [...you.seats, ...[...SUB_NAMES, ...SUB_RESERVE].filter(name => !you.seats.some(s => s.name.toLowerCase() === name.toLowerCase())).map((name, i) => ({ name, sub: true, face: (i + 1) % 5 }))]
      : [{ name: you.name, sub: false, face: you.face }, ...SUB_NAMES.map((name, i) => ({ name, sub: true, face: (you.face + i + 1) % 5 }))];
    this.youId = 'seats' in you ? you.you : 0;
    this.seats = specs.slice(0, KNOCKOUT.seats)
      .map((seat, id) => ({ ...seat, id, runs: 0, balls: 0, played: 0, fours: 0, sixes: 0, out: false, place: null, wentAt: null }));
    // Each sub's dice are their own, off the seed and their seat, so one sub's luck never moves another's.
    this.dice = this.seats.map(seat => new SeededRandom((seed ^ Math.imul(seat.id + 1, 0x9E3779B1)) >>> 0));
    this.hard = Array.from({ length: KNOCKOUT.cuts.length + 1 }, (_, over) => freeHitBall(seed, over));
  }

  /**
   * The player's seat. A phone watching a match it is not batting (`you: -1`) has none: it gets a seat that is in
   * nobody's room, out and placed after everybody, so the room reads as one whose player's part is over.
   */
  get you() { return this.seats[this.youId] ?? this.ghost; }
  private readonly ghost: Seat = { id: -1, name: 'You', sub: false, face: 0, played: 0, runs: 0, balls: 0, fours: 0, sixes: 0, out: true, place: KNOCKOUT.seats + 1, wentAt: 0 };
  get alive() { return this.seats.filter(s => s.place === null); }
  /**
   * Where the player is in the match: their own next ball while they bat (in
   * a match with friends that can be ahead of the room within an over), and
   * the room's once they are out or gone.
   */
  get bowled() { const you = this.you; return you.place === null && !you.out ? you.played : this.balls; }
  /** The room's own clock: the balls every seat still batting has played, held at the over's end until the cut. */
  get roomBalls() { return this.balls; }
  /** The overs with a cut at their end are done: this is the final. */
  get final() { return Math.floor(this.balls / KNOCKOUT.ballsPerOver) >= KNOCKOUT.cuts.length; }
  /** How the room is ordered now: not out first in the overs with a cut, the total first in the final. */
  get order(): Order { return this.final ? aheadInFinal : ahead; }
  /** How many the next cut takes, and the order it reads: the over's count, or in the final all but one. */
  get nextCut(): { count: number; by: Order } {
    return this.final ? { count: this.alive.length - 1, by: aheadInFinal }
      : { count: KNOCKOUT.cuts[Math.floor(this.balls / KNOCKOUT.ballsPerOver)], by: ahead };
  }
  /** Everybody still in, best first, as the room stands now. */
  get ranked(): Seat[] { return [...this.alive].sort(settledBy(this.order)); }
  /** The room is over: somebody has won it. */
  get done() { return this.winner !== null; }
  /** Those still in after the player has gone, best first: whom a watcher can watch. */
  get watchable(): Seat[] { return this.ranked.filter(seat => seat !== this.you); }
  /** The player's part is over: knocked out, or the winner. */
  get finished() { return this.you.place !== null; }
  /** The free hit ball about to be bowled, or null when the next ball is not the over's free hit. */
  get freeBallNext(): HardBall | null { return this.freeBallAt(this.bowled); }
  /** The free hit ball of an over, if the ball at this index is it. */
  private freeBallAt(index: number): HardBall | null {
    const ball = this.hard[Math.floor(index / KNOCKOUT.ballsPerOver)];
    return ball && ball.ball === index % KNOCKOUT.ballsPerOver ? ball : null;
  }
  /** Whether this seat bats its next ball as a free hit: the player's, unless asked about another. */
  freeHit(id = this.youId) { return this.free.has(id) && this.freeBallAt(this.seats[id].played) !== null; }
  /**
   * Whether the player's ball at this index of their innings is their free hit. The game asks by its own count of balls
   * batted: in a match the room counts a ball only once the store has it, so `freeHit` can be a ball behind the crease.
   */
  freeHitOn(index: number) { return this.free.has(this.youId) && this.freeBallAt(index) !== null; }
  /** Whether this seat has a free hit still to come this over. */
  freeHitAhead(id = this.youId) { return this.free.has(id); }

  /**
   * One ball: the player's outcome (null once they are out and the room plays
   * on without them), and every sub still batting plays the same delivery.
   */
  ball(delivery: Delivery, yours: ShotOutcome | null): BallNews {
    const freeBall = this.freeBallNext !== null;
    this.balls++;
    const free = freeBall ? this.free : new Set<number>();
    if (freeBall) this.free = new Set();
    this.plays = new Map();
    for (const seat of this.alive) {
      if (seat.out) continue;
      const outcome = seat === this.you ? yours : this.subPlays(seat, delivery);
      if (!outcome) continue;
      this.apply(seat, outcome, free.has(seat.id));
    }
    return this.afterBall();
  }

  /** One ball to one seat: the runs, the boundaries, and the wicket unless it was their free hit. */
  private apply(seat: Seat, given: ShotOutcome, free: boolean) {
    const outcome = given.isWicket && free ? freeHitOf(given) : given;
    const play = this.plays.get(seat.id); if (play) play.outcome = outcome;
    this.logs.set(seat.id, [...(this.logs.get(seat.id) ?? []), outcome]);
    this.history.set(seat.id, [...(this.history.get(seat.id) ?? []), play ? { ...play } : null]);
    seat.runs += outcome.runs; seat.balls++; seat.played++;
    seat.fours += Number(outcome.runs === 4); seat.sixes += Number(outcome.runs === 6);
    // On a free hit the wicket does not count (the game has already said so for the player: `freeHitOf`).
    if (outcome.isWicket && !free) seat.out = true;
  }

  /**
   * A match with friends moves on (Figma section 53, 4A): each seat bats at
   * its own pace up to the end of the over the room is in, a real player's
   * balls as they arrive and a sub's off the match's balls, and the cut falls
   * only once everybody still batting has finished the over. Every phone runs
   * this on the same balls in the same order, so every phone cuts the same.
   * The final can be settled before its over is out, as in a practice room.
   */
  advance(source: (seat: Seat, ball: number) => SeatBall, deliveryAt: (ball: number) => Delivery | null): BallNews[] {
    const news: BallNews[] = [];
    for (;;) {
      if (this.winner) return news;
      const overEnd = Math.min(KNOCKOUT.maxBalls, (Math.floor(this.balls / KNOCKOUT.ballsPerOver) + 1) * KNOCKOUT.ballsPerOver);
      let moved = false;
      const take = (seat: Seat): boolean => {
        const index = seat.played, given = source(seat, index);
        if (given === null) return false;
        const delivery = deliveryAt(index);
        if (given === 'sub' && !delivery) return false;
        const free = this.free.has(seat.id) && this.freeBallAt(index) !== null;
        if (free) this.free.delete(seat.id);
        this.plays.delete(seat.id);
        const outcome = given === 'sub' ? this.subPlays(seat, delivery!) : given;
        if (given !== 'sub' && delivery) this.plays.set(seat.id, playOf(delivery, outcome));
        this.apply(seat, outcome, free);
        return moved = true;
      };
      if (this.final) {
        // The final can be settled on any ball, so it is taken a ball at a time across everybody in it: who
        // is out and who is ahead after each ball is then the same on every phone, whatever arrived first.
        for (;;) {
          const batting = this.alive.filter(seat => !seat.out && seat.played < overEnd);
          if (!batting.length) break;
          const next = Math.min(...batting.map(seat => seat.played));
          const due = batting.filter(seat => seat.played === next);
          if (!due.every(seat => source(seat, next) !== null && (source(seat, next) !== 'sub' || deliveryAt(next)))) break;
          for (const seat of due) take(seat);
          const settled = this.settleFinal(false);
          if (settled) { news.push(settled); return news; }
        }
      } else {
        for (const seat of this.alive) while (seat.place === null && !seat.out && seat.played < overEnd && take(seat));
      }
      if (this.winner) return news;
      const behind = this.alive.some(seat => !seat.out && seat.played < overEnd);
      if (!behind && this.balls < overEnd) {
        this.balls = overEnd;
        news.push(this.afterBall());
        continue;
      }
      if (!moved) return news;
    }
  }

  /** Who the room is waiting on at the end of its over, in a match with friends: still batting, behind. */
  waitingOn(): Seat[] {
    const overEnd = Math.min(KNOCKOUT.maxBalls, (Math.floor(this.balls / KNOCKOUT.ballsPerOver) + 1) * KNOCKOUT.ballsPerOver);
    return this.alive.filter(seat => !seat.out && seat.played < overEnd);
  }

  /**
   * The player is out: the room bats on without them until they are cut (or,
   * if everybody else falls too, until they win). `next` bowls each ball.
   */
  playOut(next: () => Delivery): BallNews[] {
    const news: BallNews[] = [];
    while (!this.finished && !this.winner && this.balls < KNOCKOUT.maxBalls) news.push(this.ball(next(), null));
    return news;
  }

  /** Where the player stands, as the cut would fall if it were made now. */
  standing(): Standing {
    const alive = this.alive, you = this.you;
    const over = Math.floor(this.balls / KNOCKOUT.ballsPerOver), ball = this.balls % KNOCKOUT.ballsPerOver;
    const { count, by } = this.nextCut;
    const ranked = this.ranked;
    const place = 1 + alive.filter(s => by(s, you) < 0).length;
    const { gone, level } = cutOf(alive, count, by);
    const drop = gone.includes(you);
    let need = 0;
    if (drop && !you.out) {
      // To draw level with the lowest who would be safe is enough: a tie at the line takes both through.
      // In the final it takes one more: a tie there goes to whoever is not out, then fewer balls.
      const safe = ranked.filter(s => !gone.includes(s) && s !== you).at(-1);
      need = safe ? Math.max(1, safe.runs - you.runs + (this.final ? 1 : 0)) : 1;
    }
    return { place: you.place ?? place, left: alive.length, drop, level: level.has(you) && !drop && this.balls > 0, need, final: this.final, over: over + 1, ball };
  }

  /** Everybody, in the order the room stands: the alive best first, then the gone by where they finished. */
  table(): Seat[] {
    const alive = this.ranked;
    const gone = this.seats.filter(s => s.place !== null).sort((a, b) => a.place! - b.place!);
    return [...alive.filter(s => s !== this.winner), ...gone];
  }

  private afterBall(): BallNews {
    const none: BallNews = { gone: [], kind: null, over: null, winner: null };
    if (this.winner) return none;
    const overDone = this.balls % KNOCKOUT.ballsPerOver === 0;
    const over = this.balls / KNOCKOUT.ballsPerOver;
    if (overDone && over <= KNOCKOUT.cuts.length) return this.cut(cutOf(this.alive, KNOCKOUT.cuts[over - 1]).gone, 'cut', over);
    if (!this.final) return none;
    return this.settleFinal(this.balls >= KNOCKOUT.maxBalls) ?? none;
  }

  /** The final: settled once nobody behind can catch the leader, or on its last ball. */
  private settleFinal(last: boolean): BallNews | null {
    const [leader, ...rest] = this.ranked.sort(settledBy(aheadInFinal));
    const settledNow = last || rest.every(s => s.out && s.runs < leader.runs);
    return settledNow ? this.cut(rest.reverse(), 'final', null) : null;
  }

  /** Knocks out `gone`, worst first, and crowns the one left. */
  private cut(gone: Seat[], kind: 'cut' | 'final', over: number | null): BallNews {
    const went = this.knock(gone);
    const left = this.alive;
    const winner = left.length === 1 ? this.crown(left[0]) : null;
    if (!winner && kind === 'cut' && over) this.grantFreeHits(KNOCKOUT.freeHits[over - 1] ?? 0);
    return { gone: went, kind: went.length ? kind : null, over: went.length ? over : null, winner };
  }

  /** The top `count` still standing, and anybody level with the last of them. Never in the final: it follows the last over with a cut. */
  private grantFreeHits(count: number) {
    // A fresh set each over: a free hit not used (its holder was out first) does not carry on.
    this.free = new Set();
    if (count <= 0 || this.final) return;
    const standing = this.alive.filter(s => !s.out).sort((a, b) => b.runs - a.runs);
    if (!standing.length) return;
    const line = standing[Math.min(count, standing.length) - 1].runs;
    for (const seat of standing) if (seat.runs >= line) this.free.add(seat.id);
  }

  /** Worst first: the worst takes the last place still open. */
  private knock(worstFirst: Seat[]): Seat[] {
    let place = this.alive.length;
    for (const seat of worstFirst) { seat.place = place--; seat.wentAt = this.balls; }
    return worstFirst;
  }

  private crown(seat: Seat): Seat {
    seat.place = 1; seat.wentAt = this.balls; this.winner = seat;
    return seat;
  }

  /** A sub's go at the ball: the stroke that best suits the line, timed with their own spread. */
  private subPlays(seat: Seat, delivery: Delivery): ShotOutcome {
    // Seat 0 is the player in a practice room and never batted by a sub there; in a match it is the host, batted by one when
    // they are away, and `seat.id - 1` read no skill at all, threw, and stood every other phone's room still for good.
    const rng = this.dice[seat.id], skill = SKILLS[(seat.id + SKILLS.length - 1) % SKILLS.length];
    const rush = (NOMINAL_MS - delivery.durationMs) / 100;
    const shot: ShotType = delivery.style === 'SHORT' ? (rng.next() < 0.4 ? 'LEG' : 'DEFEND') : bestShot(delivery);
    const input = delivery.idealContactTimeMs + rush * 6 + gauss(rng) * (skill.sigma + Math.max(0, rush) * skill.pressure);
    const flicked = shot === 'LEG' && delivery.style !== 'SHORT';
    const resolved = resolveShot(delivery, { shotType: shot, inputTimeMs: input, flicked }, rng);
    // Seen off: the same dot it always was, drawn for a watcher as the block that kept it out.
    const kept = resolved.isWicket && rng.next() < KEEP;
    const outcome: ShotOutcome = kept ? { runs: 0, isWicket: false, quality: resolved.quality, feedback: 'DEFENDED', timingGrade: resolved.timingGrade,
      timingDeltaMs: resolved.timingDeltaMs, compatibility: resolved.compatibility, madeBatContact: true, aerial: false, defended: true } : resolved;
    this.plays.set(seat.id, { shot: kept ? 'DEFEND' : shot, offset: input - delivery.idealContactTimeMs, flicked: kept ? false : flicked, outcome });
    return outcome;
  }
}

/**
 * A real player's ball, drawn for somebody watching them: the stroke that best
 * suits the line, in time, and what they got. Their own swing never travels,
 * only what it was worth.
 */
function playOf(delivery: Delivery, outcome: ShotOutcome): Play {
  const shot: ShotType = outcome.defended || outcome.runs === 0 && !outcome.isWicket ? 'DEFEND' : delivery.style === 'SHORT' ? 'LEG' : bestShot(delivery);
  return { shot, offset: outcome.timingDeltaMs ?? 0, flicked: shot === 'LEG' && delivery.style !== 'SHORT', outcome };
}

function bestShot(delivery: Delivery): ShotType {
  const line = effectiveLine(delivery);
  return SHOTS.reduce((a, b) => (COMPATIBILITY[line][a] >= COMPATIBILITY[line][b] ? a : b));
}
function gauss(rng: SeededRandom): number {
  const u = Math.max(1e-9, rng.next());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng.next());
}

/**
 * The player's wicket on a free hit, turned not out before the score sees
 * it. How it would have gone stays on it (`wicketType`), so the picture is
 * the ball that would have had them, the stumps broken or the catch taken;
 * the call says it does not count.
 */
export function freeHitOf(outcome: ShotOutcome): ShotOutcome {
  return outcome.isWicket ? { ...outcome, isWicket: false, feedback: 'FREE HIT · NOT OUT' } : outcome;
}

/**
 * The scoreboard's cell: the place, and out of how many are left. Whether
 * that is safe is the bar's to say (`trackOf`), in words where it matters:
 * "3 TO SAFE" in the cell was read as nothing in particular.
 */
export function chipOf(s: Standing): { place: string; line: string; drop: boolean } {
  return { place: `#${s.place}`, line: `OF ${s.left}`, drop: s.drop };
}

/** One seat on the bar. */
export interface TrackPip { at: number; you: boolean; out: boolean; zone: 'gone' | 'drop' | 'safe' }
/**
 * How the bar feels about where the player stands, which is what it moves
 * to (Figma "Super Knockout · Final", F2; the claude.ai artifact "Knockout
 * Bar Motion"): calm, two seats or more clear; edge, within `EDGE_RUNS` of
 * somebody in the drop who can still pass them; level, tied on the line; the
 * drop; and behind in the final, where the match is settled this over.
 */
export type TrackMood = 'calm' | 'edge' | 'level' | 'drop' | 'final';
/** Close to the cut: this many runs or fewer clear of the best in the drop still batting. */
export const EDGE_RUNS = 3;
/**
 * The knockout bar along the foot of the screen: all the room's seats in a
 * row, worst on the left. Those already knocked out fill it from the left,
 * then those the cut would take now (the drop, in red), then the safe, in
 * green, so the safe stretch shrinks as the match goes on. The player rides it
 * by their place. Over it, only when they are near the knockout, one line of
 * what it takes.
 */
export interface Track {
  seats: number;
  gone: number;
  drop: number;
  pips: TrackPip[];
  you: number;
  mood: TrackMood;
  /** Across the top: when the cut falls and how many it takes. */
  eyebrow: string;
  /** The final: no cut until it is settled, the two stretches being who is behind and who is ahead. */
  final: boolean;
  place: number;
  /** How many are left in the room. */
  of: number;
  /** Runs clear of the best in the drop still batting, or null when nobody there can pass. */
  clear: number | null;
  /** Balls left in the over, the next one included: six at its start. In the final, the balls left to settle it. */
  ballsLeft: number;
  /** Over the player's face, or null when there is nothing to say. */
  say: { words: string; tone: 'drop' | 'level' | 'edge' } | null;
}
export function trackOf(room: KnockoutRoom): Track {
  const alive = room.alive, standing = room.standing();
  const gone = room.seats.filter(s => s.place !== null && s !== room.winner).sort((a, b) => b.place! - a.place!);
  const { count, by } = room.nextCut;
  const drop = new Set(cutOf(alive, count, by).gone);
  const standingOrder = room.ranked.reverse();
  const row = [...gone, ...standingOrder];
  const pips = row.map((seat, at) => ({ at, you: seat === room.you, out: seat.out || seat.place !== null, zone: seat.place !== null ? 'gone' as const : drop.has(seat) ? 'drop' as const : 'safe' as const }));
  const chasers = [...drop].filter(s => !s.out && s !== room.you);
  const clear = standing.drop || !chasers.length ? null : room.you.runs - Math.max(...chasers.map(s => s.runs));
  const mood: TrackMood = standing.drop ? (standing.final ? 'final' : 'drop')
    : standing.level ? 'level' : clear !== null && clear <= EDGE_RUNS ? 'edge' : 'calm';
  const runs = (n: number) => `${n} ${n === 1 ? 'RUN' : 'RUNS'}`;
  const say = standing.drop && standing.need > 0
    ? { words: `NEED ${runs(standing.need)} TO ${standing.final ? 'WIN' : 'BE SAFE'}`, tone: 'drop' as const }
    : mood === 'level' ? { words: 'LEVEL ON THE LINE · SAFE', tone: 'level' as const }
    : mood === 'edge' && clear! > 0 ? { words: `${runs(clear!)} ${standing.final ? 'AHEAD' : 'CLEAR'}`, tone: 'edge' as const } : null;
  const ballsLeft = KNOCKOUT.ballsPerOver - standing.ball;
  return {
    seats: row.length, gone: gone.length, drop: drop.size, pips, you: row.indexOf(room.you), mood,
    eyebrow: eyebrowOf(standing.final, count, ballsLeft), final: standing.final,
    place: standing.place, of: standing.left, clear,
    ballsLeft, say,
  };
}

/**
 * Where a seat's story picks up in a match with friends: how many of its balls count as shown before the next one is
 * played on the ground. The watcher's device plays back what the store holds of a seat, so from an old place it ran
 * through the innings ball after ball to catch up: the owner, out early, opened a friend's story at fifty and watched it
 * from the first ball, and then, opened on their latest, still saw two run together (20 November 2026).
 *
 * A friend's story is one ball at a time: their latest ball, then the wait for the next. Whenever more than that one is
 * waiting, the older are passed over, never played in a row. A sub's balls come a whole over at a time, so theirs is the
 * top of their latest over: on their latest ball it would be one ball and a long wait.
 */
export function storyFrom(seen: number, played: number, sub: boolean): number {
  if (sub) return Math.max(seen, Math.floor(Math.max(0, played - 1) / KNOCKOUT.ballsPerOver) * KNOCKOUT.ballsPerOver);
  return Math.max(seen, played - 1, 0);
}

/**
 * Across the top of the bar, what is at stake and when, in so many words
 * (the owner found END OF OVER 1 · 2 GO said neither): how many are knocked
 * out and how many balls are left before they are; in the final, that the
 * higher total wins and how many balls it has left.
 */
export function eyebrowOf(final: boolean, count: number, ballsLeft: number): string {
  const when = ballsLeft <= 1 ? 'AFTER THIS BALL' : `IN ${ballsLeft} BALLS`;
  if (final) return `THE FINAL · HIGHER TOTAL WINS · ${ballsLeft <= 1 ? 'LAST BALL' : `${ballsLeft} BALLS LEFT`}`;
  return `BOTTOM ${count} KNOCKED OUT ${when}`;
}

/**
 * A made-up room standing in each mood, as the Final page's frames draw them
 * (R, P2, P4, P3, P7), for photographing the bar without batting to it
 * (`__cricket.knockoutMood`). Nothing in a real room reads it.
 */
export function sampleTrack(mood: TrackMood, ballsLeft = 2): Track {
  const rooms = {
    calm: { gone: 0, drop: 2, you: 9, place: 3, of: 12, eyebrow: eyebrowOf(false, 2, ballsLeft), say: null, clear: 9 },
    edge: { gone: 2, drop: 2, you: 5, place: 6, of: 10, eyebrow: eyebrowOf(false, 2, ballsLeft), say: { words: '2 RUNS CLEAR', tone: 'edge' as const }, clear: 2 },
    level: { gone: 2, drop: 2, you: 4, place: 7, of: 10, eyebrow: eyebrowOf(false, 2, ballsLeft), say: { words: 'LEVEL ON THE LINE · SAFE', tone: 'level' as const }, clear: 0 },
    drop: { gone: 2, drop: 2, you: 3, place: 9, of: 10, eyebrow: eyebrowOf(false, 2, ballsLeft), say: { words: 'NEED 5 RUNS TO BE SAFE', tone: 'drop' as const }, clear: null },
    final: { gone: 10, drop: 1, you: 10, place: 2, of: 2, eyebrow: eyebrowOf(true, 1, ballsLeft), say: { words: 'NEED 7 RUNS TO WIN', tone: 'drop' as const }, clear: null },
  };
  const r = rooms[mood];
  const pips = Array.from({ length: KNOCKOUT.seats }, (_, at) => ({ at, you: at === r.you, out: at < r.gone, zone: at < r.gone ? 'gone' as const : at < r.gone + r.drop ? 'drop' as const : 'safe' as const }));
  return { seats: KNOCKOUT.seats, gone: r.gone, drop: r.drop, pips, you: r.you, mood, eyebrow: r.eyebrow, final: mood === 'final', place: r.place, of: r.of, clear: r.clear, ballsLeft, say: r.say };
}

/**
 * The scoreboard's line under the overs: which over, of the four with a cut
 * and the one after them, or THE FINAL once those are bowled.
 */
export function overLine(bowled: number): string {
  const over = Math.floor(bowled / KNOCKOUT.ballsPerOver) + 1;
  return over > KNOCKOUT.cuts.length ? 'THE FINAL' : `OVER ${over} OF ${KNOCKOUT.cuts.length + 1}`;
}

/**
 * The word under the overs in the scoreboard's pill (the owner's frame,
 * `946:7922`): OVERS, or FINAL once the four overs with a cut are bowled.
 */
export function oversWord(bowled: number): string {
  return Math.floor(bowled / KNOCKOUT.ballsPerOver) >= KNOCKOUT.cuts.length ? 'FINAL' : 'OVERS';
}

/** The call when people go: the big screen's line, from the player's side. */
export function cutLine(news: BallNews, left: number, youId = 0): string | null {
  if (!news.gone.length) return null;
  const names = news.gone.map(s => (s.id === youId ? 'YOU' : s.name.toUpperCase()));
  const who = names.length > 2 ? `${names.length} PLAYERS` : names.join(' AND ');
  const head = news.kind === 'cut' ? `END OF OVER ${news.over}` : 'THE FINAL';
  // Two left is the final, and it says so.
  return `${head} · ${who} OUT · ${left === 2 ? 'THE FINAL IS ON' : `${left} LEFT`}`;
}

/**
 * What the ground's screen says between balls (P5, P6): at an over's end
 * who the cut took and how many are left; otherwise the
 * line, the player and the nearest across it (the best in the drop, or if the
 * player is in it, the lowest still safe). Null once the player is done with,
 * or when there is no line to show.
 */
export function knockoutScreen(room: KnockoutRoom, cut: readonly Seat[] | null, freeHit = true): KnockoutScreen | null {
  if (room.finished) return null;
  // The free hit's ball (`953:8055`). The game asks without it between balls (`freeHit` false): the player is told as
  // the bowler sets off, not while he walks back.
  if (freeHit && room.freeHit()) return { kind: 'freehit' };
  if (cut?.length) return { kind: 'cut', out: cut.length, left: room.alive.length, names: cut.map(s => (s === room.you ? 'You' : s.name)) };
  const { count, by } = room.nextCut;
  const alive = room.ranked;
  const drop = new Set(cutOf(alive, count, by).gone);
  const firstDrop = alive.findIndex(s => drop.has(s));
  if (firstDrop <= 0) return null;
  const you = alive.indexOf(room.you);
  const other = drop.has(room.you) ? firstDrop - 1 : firstDrop;
  const pair = [you, other].sort((a, b) => a - b);
  const rows = pair.map(i => ({ place: i + 1, name: alive[i].name, runs: alive[i].runs, you: alive[i] === room.you, out: alive[i].out }));
  return { kind: 'line', rows, cutAfter: drop.has(alive[pair[0]]) ? -1 : 0 };
}
