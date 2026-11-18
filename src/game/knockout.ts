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
import { COMPATIBILITY, SHOTS } from '../config/gameplay';
import { effectiveLine } from './DeliveryTrajectory';
import { resolveShot } from './ShotResolver';
import { SeededRandom } from './SeededRandom';
import type { Delivery, ShotOutcome, ShotType } from './types';

export const KNOCKOUT = {
  seats: 12,
  ballsPerOver: 6,
  /** How many go at the end of each over (K2b's ladder: 12, 10, 8, 6, then 3). After the last, sudden death. */
  cuts: [2, 2, 2, 3] as const,
  /**
   * Five overs: four with a cut at the end, then sudden death in the fifth.
   * Sudden death with three left is over in two balls; only ties that keep
   * letting everybody through could reach the fifth over's last ball, and
   * there the top total wins (fewer balls faced, then the seat, if level).
   * Four thousand rooms of subs never went past it.
   */
  maxBalls: 30,
  /**
   * The free hit (K2b's rules, `PRODUCT.md`): after each over's cut, the top
   * three still standing bat the next over's first ball as a free hit, then
   * the top two, then the top one, tapering as the room shrinks; none in
   * sudden death, where every ball is a cut. Anybody level with the last of
   * them gets one too. On it a wicket does not count; the runs do.
   */
  freeHits: [3, 2, 1] as const,
} as const;

/** The eleven subs' names. Never a real player's: they are labelled SUB wherever they show. */
const SUB_NAMES = ['Riya', 'Arjun', 'Kabir', 'Meera', 'Ishaan', 'Zoya', 'Rohan', 'Dev', 'Sam', 'Aanya', 'Vikram'];
/**
 * How well each sub times the ball: the spread of the timing error in
 * milliseconds, and how much a quicker ball adds to it, as `super10-sim.ts`
 * models a player. Against the Blast's ball the best of them scores between
 * three and four a ball and the weakest about two, so the cut has somebody to
 * take early. The room's winner makes about 85 in some 24 balls, the middle of
 * it 65 to 100 (`scripts/knockout-sim.ts`): a good innings wins it.
 */
const SKILLS = [65, 72, 80, 86, 92, 98, 105, 112, 120, 130, 140].map(sigma => ({ sigma, pressure: Math.round(sigma / 7) }));
/**
 * A sub plays for their wicket: this share of the balls that would have had
 * them out are seen off for a dot instead. Batting the Blast's ball with one
 * wicket each, a room of subs played to the letter was down to its last one
 * by the third over; this keeps most rooms going to sudden death, which is
 * the match the player came for.
 */
const KEEP = 0.65;
const NOMINAL_MS = 830;

export interface Seat {
  /** 0 is the player. */
  readonly id: number;
  readonly name: string;
  readonly sub: boolean;
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

/** What one ball did to the room. */
export interface BallNews {
  /** Who went after this ball, worst first. */
  gone: Seat[];
  /** An over's cut, or sudden death's one-a-ball. */
  kind: 'cut' | 'sudden' | null;
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
  /** Sudden death: last place goes after every ball. */
  sudden: boolean;
  /** The ball's in the over, 0 to 5, and the over, 1-based. */
  over: number;
  ball: number;
}

/** Ahead in the room: not out before out, then more runs. Ties are equal. */
const ahead = (a: Seat, b: Seat) => Number(a.out) - Number(b.out) || b.runs - a.runs;
/** Ties broken the one fair way left: fewer balls faced, then the seat. Only ever for the winner and for places. */
const settled = (a: Seat, b: Seat) => ahead(a, b) || a.balls - b.balls || a.id - b.id;

/**
 * Who the cut takes from `alive` when `count` go: anybody out first (out once
 * and you are out of the match, so all of them, whatever the count), then the
 * lowest totals, where a tie at the line takes both through. Never everybody:
 * if the whole room is out, the best of them stays and wins.
 */
export function cutOf(alive: readonly Seat[], count: number): { gone: Seat[]; level: Set<Seat> } {
  const level = new Set<Seat>();
  const out = alive.filter(s => s.out);
  if (out.length >= alive.length) {
    const best = [...alive].sort(settled)[0];
    return { gone: alive.filter(s => s !== best).sort(settled).reverse(), level };
  }
  const gone = [...out];
  const left = count - gone.length;
  if (left > 0) {
    const standing = alive.filter(s => !s.out).sort((a, b) => a.runs - b.runs);
    // Never the last one standing.
    const take = Math.min(left, standing.length - 1);
    if (take > 0) {
      const line = standing[take - 1].runs, above = standing[take];
      const tied = above && above.runs === line;
      for (const seat of standing.slice(0, take)) {
        if (tied && seat.runs === line) level.add(seat); else gone.push(seat);
      }
      if (tied) for (const seat of standing) if (seat.runs === line) level.add(seat);
    }
  }
  return { gone: gone.sort(settled).reverse(), level };
}

export class KnockoutRoom {
  readonly seats: Seat[];
  private balls = 0;
  private readonly dice: SeededRandom[];
  /** Who bats the next ball as a free hit, by seat id: granted at an over's cut, spent on the ball after it. */
  private free = new Set<number>();
  winner: Seat | null = null;

  constructor(seed: number, you: { name: string; face: number }) {
    this.seats = [{ id: 0, name: you.name, sub: false, face: you.face }, ...SUB_NAMES.map((name, i) => ({ id: i + 1, name, sub: true, face: (you.face + i + 1) % 5 }))]
      .slice(0, KNOCKOUT.seats)
      .map(seat => ({ ...seat, runs: 0, balls: 0, fours: 0, sixes: 0, out: false, place: null, wentAt: null }));
    // Each sub's dice are their own, off the seed and their seat, so one sub's luck never moves another's.
    this.dice = this.seats.map(seat => new SeededRandom((seed ^ Math.imul(seat.id + 1, 0x9E3779B1)) >>> 0));
  }

  get you() { return this.seats[0]; }
  get alive() { return this.seats.filter(s => s.place === null); }
  get bowled() { return this.balls; }
  /** The overs with a cut at their end are done: from here last place goes every ball. */
  get sudden() { return Math.floor(this.balls / KNOCKOUT.ballsPerOver) >= KNOCKOUT.cuts.length; }
  /** The player's part is over: knocked out, or the winner. */
  get finished() { return this.you.place !== null; }
  /** Whether this seat bats the next ball as a free hit: the player's, unless asked about another. */
  freeHit(id = 0) { return this.free.has(id); }

  /**
   * One ball: the player's outcome (null once they are out and the room plays
   * on without them), and every sub still batting plays the same delivery.
   */
  ball(delivery: Delivery, yours: ShotOutcome | null): BallNews {
    this.balls++;
    const free = this.free;
    this.free = new Set();
    for (const seat of this.alive) {
      if (seat.out) continue;
      const outcome = seat.id === 0 ? yours : this.subPlays(seat, delivery);
      if (!outcome) continue;
      seat.runs += outcome.runs; seat.balls++;
      seat.fours += Number(outcome.runs === 4); seat.sixes += Number(outcome.runs === 6);
      // On a free hit the wicket does not count (the game has already said so for the player: `freeHitOf`).
      if (outcome.isWicket && !free.has(seat.id)) seat.out = true;
    }
    return this.afterBall();
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
    const place = 1 + alive.filter(s => ahead(s, you) < 0).length;
    const sudden = this.sudden;
    const count = sudden ? 1 : KNOCKOUT.cuts[over];
    const { gone, level } = cutOf(alive, count);
    const drop = gone.includes(you);
    let need = 0;
    if (drop && !you.out) {
      // To draw level with the lowest who would be safe is enough: a tie at the line takes both through.
      const safe = alive.filter(s => !s.out && !gone.includes(s) && s !== you).sort((a, b) => a.runs - b.runs)[0];
      need = safe ? Math.max(1, safe.runs - you.runs) : 1;
    }
    return { place: you.place ?? place, left: alive.length, drop, level: level.has(you) && !drop && this.balls > 0, need, sudden, over: over + 1, ball };
  }

  /** Everybody, in the order the room stands: the alive by `ahead`, then the gone by where they finished. */
  table(): Seat[] {
    const alive = [...this.alive].sort(settled);
    const gone = this.seats.filter(s => s.place !== null).sort((a, b) => a.place! - b.place!);
    return [...alive.filter(s => s !== this.winner), ...gone];
  }

  private afterBall(): BallNews {
    const none: BallNews = { gone: [], kind: null, over: null, winner: null };
    if (this.winner) return none;
    const overDone = this.balls % KNOCKOUT.ballsPerOver === 0;
    const over = this.balls / KNOCKOUT.ballsPerOver;
    let news = none;
    if (overDone && over <= KNOCKOUT.cuts.length) news = this.cut(KNOCKOUT.cuts[over - 1], 'cut', over);
    else if (this.sudden) news = this.cut(1, 'sudden', null);
    // The backstop: the top total wins.
    if (!news.winner && this.balls >= KNOCKOUT.maxBalls) {
      const [best, ...rest] = [...this.alive].sort(settled);
      news = { ...news, gone: [...news.gone, ...this.knock(rest.reverse())], winner: this.crown(best) };
    }
    return news;
  }

  private cut(count: number, kind: 'cut' | 'sudden', over: number | null): BallNews {
    const { gone } = cutOf(this.alive, count);
    const went = this.knock(gone);
    const left = this.alive;
    const winner = left.length === 1 ? this.crown(left[0]) : null;
    if (!winner && kind === 'cut' && over) this.grantFreeHits(KNOCKOUT.freeHits[over - 1] ?? 0);
    return { gone: went, kind: went.length ? kind : null, over: went.length ? over : null, winner };
  }

  /** The top `count` still standing, and anybody level with the last of them. Never in sudden death: it follows the last over with a cut. */
  private grantFreeHits(count: number) {
    if (count <= 0 || this.sudden) return;
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
    const rng = this.dice[seat.id], skill = SKILLS[(seat.id - 1) % SKILLS.length];
    const rush = (NOMINAL_MS - delivery.durationMs) / 100;
    const shot: ShotType = delivery.style === 'SHORT' ? (rng.next() < 0.4 ? 'LEG' : 'DEFEND') : bestShot(delivery);
    const input = delivery.idealContactTimeMs + rush * 6 + gauss(rng) * (skill.sigma + Math.max(0, rush) * skill.pressure);
    const outcome = resolveShot(delivery, { shotType: shot, inputTimeMs: input, flicked: shot === 'LEG' && delivery.style !== 'SHORT' }, rng);
    return outcome.isWicket && rng.next() < KEEP ? { ...outcome, isWicket: false, wicketType: undefined, runs: 0 } : outcome;
  }
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
 * drop; and the drop in sudden death, where every ball is a cut.
 */
export type TrackMood = 'calm' | 'edge' | 'level' | 'drop' | 'sudden';
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
  place: number;
  /** How many are left in the room. */
  of: number;
  /** Runs clear of the best in the drop still batting, or null when nobody there can pass. */
  clear: number | null;
  /** Balls left in the over, the next one included: six at its start. In sudden death every one of them is a cut. */
  ballsLeft: number;
  /** Over the player's face, or null when there is nothing to say. */
  say: { words: string; tone: 'drop' | 'level' | 'edge' } | null;
}
export function trackOf(room: KnockoutRoom): Track {
  const alive = room.alive, standing = room.standing();
  const gone = room.seats.filter(s => s.place !== null && s !== room.winner).sort((a, b) => b.place! - a.place!);
  const count = standing.sudden ? 1 : KNOCKOUT.cuts[Math.min(KNOCKOUT.cuts.length - 1, Math.floor(room.bowled / KNOCKOUT.ballsPerOver))];
  const drop = new Set(cutOf(alive, count).gone);
  const standingOrder = [...alive].sort(settled).reverse();
  const row = [...gone, ...standingOrder];
  const pips = row.map((seat, at) => ({ at, you: seat.id === 0, out: seat.out || seat.place !== null, zone: seat.place !== null ? 'gone' as const : drop.has(seat) ? 'drop' as const : 'safe' as const }));
  const chasers = [...drop].filter(s => !s.out && s !== room.you);
  const clear = standing.drop || !chasers.length ? null : room.you.runs - Math.max(...chasers.map(s => s.runs));
  const mood: TrackMood = standing.drop ? (standing.sudden ? 'sudden' : 'drop')
    : standing.level ? 'level' : clear !== null && clear <= EDGE_RUNS ? 'edge' : 'calm';
  const runs = (n: number) => `${n} ${n === 1 ? 'RUN' : 'RUNS'}`;
  const say = standing.drop && standing.need > 0
    ? { words: `NEED ${runs(standing.need)} TO ${standing.sudden ? 'STAY IN' : 'BE SAFE'}`, tone: 'drop' as const }
    : mood === 'level' ? { words: 'LEVEL ON THE LINE · SAFE', tone: 'level' as const }
    : mood === 'edge' && clear! > 0 ? { words: `${runs(clear!)} CLEAR`, tone: 'edge' as const } : null;
  return {
    seats: row.length, gone: gone.length, drop: drop.size, pips, you: row.findIndex(seat => seat.id === 0), mood,
    eyebrow: standing.sudden ? 'SUDDEN DEATH · LAST PLACE GOES EVERY BALL' : `END OF OVER ${standing.over} · ${count} GO`,
    place: standing.place, of: standing.left, clear,
    ballsLeft: KNOCKOUT.ballsPerOver - standing.ball, say,
  };
}

/**
 * A made-up room standing in each mood, as the Final page's frames draw them
 * (R, P2, P4, P3, P7), for photographing the bar without batting to it
 * (`__cricket.knockoutMood`). Nothing in a real room reads it.
 */
export function sampleTrack(mood: TrackMood, ballsLeft = 2): Track {
  const rooms = {
    calm: { gone: 0, drop: 2, you: 9, place: 3, of: 12, eyebrow: 'END OF OVER 1 · 2 GO', say: null, clear: 9 },
    edge: { gone: 2, drop: 2, you: 5, place: 6, of: 10, eyebrow: 'END OF OVER 2 · 2 GO', say: { words: '2 RUNS CLEAR', tone: 'edge' as const }, clear: 2 },
    level: { gone: 2, drop: 2, you: 4, place: 7, of: 10, eyebrow: 'END OF OVER 2 · 2 GO', say: { words: 'LEVEL ON THE LINE · SAFE', tone: 'level' as const }, clear: 0 },
    drop: { gone: 2, drop: 2, you: 3, place: 9, of: 10, eyebrow: 'END OF OVER 2 · 2 GO', say: { words: 'NEED 5 RUNS TO BE SAFE', tone: 'drop' as const }, clear: null },
    sudden: { gone: 9, drop: 1, you: 9, place: 3, of: 3, eyebrow: 'SUDDEN DEATH · LAST PLACE GOES EVERY BALL', say: { words: 'NEED 2 RUNS TO STAY IN', tone: 'drop' as const }, clear: null },
  };
  const r = rooms[mood];
  const pips = Array.from({ length: KNOCKOUT.seats }, (_, at) => ({ at, you: at === r.you, out: at < r.gone, zone: at < r.gone ? 'gone' as const : at < r.gone + r.drop ? 'drop' as const : 'safe' as const }));
  return { seats: KNOCKOUT.seats, gone: r.gone, drop: r.drop, pips, you: r.you, mood, eyebrow: r.eyebrow, place: r.place, of: r.of, clear: r.clear, ballsLeft, say: r.say };
}

/**
 * The scoreboard's line under the overs: which over, of the four with a cut
 * and the one after them, or SUDDEN DEATH once those are bowled.
 */
export function overLine(bowled: number): string {
  const over = Math.floor(bowled / KNOCKOUT.ballsPerOver) + 1;
  return over > KNOCKOUT.cuts.length ? 'SUDDEN DEATH' : `OVER ${over} OF ${KNOCKOUT.cuts.length + 1}`;
}

/** The call when people go: the big screen's line, from the player's side. */
export function cutLine(news: BallNews, left: number): string | null {
  if (!news.gone.length) return null;
  const names = news.gone.map(s => (s.id === 0 ? 'YOU' : s.name.toUpperCase()));
  const who = names.length > 2 ? `${names.length} PLAYERS` : names.join(' AND ');
  const head = news.kind === 'cut' ? `END OF OVER ${news.over}` : 'SUDDEN DEATH';
  return `${head} · ${who} OUT · ${left} LEFT`;
}
