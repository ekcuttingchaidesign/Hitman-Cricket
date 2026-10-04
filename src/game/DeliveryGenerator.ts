import { CLASSIC_SPIN, GAME, LINES, LINE_X, QUICK_STYLES, SPECIALS, STYLES } from '../config/gameplay';
import {
  BOUNCERS, SPECIALS as SURVIVE_SPECIALS, SPIN, STYLES as SURVIVE_STYLES, SURVIVE,
} from '../config/survive';
import {
  EXPRESS_OVER, MARATHON, BLOCK_OVERS, REVERSE, ROUND, SWING_FROM, SWING_LINES, isReverse, levelAt as marathonLevelAt, levelOf, type Level, type OverKind,
} from '../config/marathon';
import { SeededRandom } from './SeededRandom';
import type { BallLine, Delivery, DeliveryStyle, ShotOutcome } from './types';
/** What a mode's bowling is made of: the table to roll on and the two counters. */
export interface BowlingPlan {
  styles: typeof STYLES;
  specials: { sixesForYorker: number; quickForSlower: number; shortChance: number };
  /** How much arcade padding the flight carries. Survive uses less of it. */
  travelScale: number;
  /**
   * Whether a delivery may be aimed rather than drawn from the bag of lines.
   *
   * The bag deals all five lines evenly, which is right for a bowler trying to
   * take a wicket and wrong for one trying to hit somebody. A bouncer bowled at
   * fifth stump is a wide; the whole point of one is that it is coming at the
   * batter's head. Styles carrying `aimBody` or `aimWide` take that line instead
   * of the bag's, and the bag goes on dealing the rest — so the lines a batter
   * actually faces stay varied while the short ball stops being a free one.
   */
  aimed?: boolean;
  /** The spinner's spell, if this mode has one. See `SpinSpell`. */
  spin?: SpinSpell;
  /**
   * The short-pitched plan, when the mode bowls to one. Placed rather than
   * rolled for — see `ShortPlan` — and the two are mutually exclusive: a mode
   * with a plan takes the bouncer out of its weight table, or it gets both.
   */
  short?: ShortPlan;
  /**
   * Who bowls each over, when the mode plans it by blocks rather than by one
   * spell. See `BlockPlan`. A mode with blocks takes its spinner's overs from
   * them, and `spin` is then only how he bowls, not when.
   */
  blocks?: BlockPlan;
}

/**
 * The innings planned ten overs at a time: how many of each block are pace,
 * spin and the express bowler's, and how much the pace bowlers swing it. The
 * Marathon's, and only the Marathon's — see `LEVELS` in `config/marathon.ts`.
 */
export interface BlockPlan {
  size: number;
  /** How many overs the innings can run to, so every block is drawn up front. */
  ofOvers: number;
  levelOf(block: number): Level;
  /** The level one over is bowled at, where it is not simply its block's. */
  levelAt?(over: number): Level;
  express: typeof EXPRESS_OVER;
  /**
   * Which overs are bowled round the wicket: none before `from`, and each one
   * after it with this chance. Absent, every over is bowled over the wicket.
   * See `ROUND` in `config/marathon.ts`.
   */
  round?: { from: number; chance: number };
}

/**
 * A bouncer quota per over, and a bigger one at the death.
 *
 * The count is placed rather than rolled for, which is the whole point: a
 * probability leaves innings with no short ball in them at all, and this
 * promises one an over and never two the same. `deathOvers` are the last overs
 * of the innings, which the spinner is kept out of so the quicks can finish.
 */
export interface ShortPlan {
  perOver: number;
  atTheDeath: number;
  deathOvers: number;
  ofOvers: number;
  ballsPerOver: number;
}

/** Whether this over is one of the last ones, which the quick bowlers keep. */
export function atTheDeath(over: number, plan: ShortPlan): boolean {
  return over >= plan.ofOvers - plan.deathOvers;
}

/**
 * A spell of spin measured in overs rather than in deliveries.
 *
 * Every other change in this game is per-ball: a yorker is earned, a bouncer is
 * rolled for, a slower ball is owed. Spin is not a ball, it is a bowler — so it
 * comes in whole overs, and inside one the seam bowler does not bowl at all.
 */
export interface SpinSpell {
  /** How many overs of the innings he is given. */
  overs: number;
  /** The first over he can have, counting from nought. */
  notBefore: number;
  /** How many overs the innings runs to. */
  ofOvers: number;
  ballsPerOver: number;
  /** How far the ball turns off the pitch, least and most. */
  minTurn: number;
  maxTurn: number;
  /** How wide a turning ball may finish, either side. */
  maxFinalX: number;
  /** How many of the six go straight on, and the chance of one more. */
  armBallsPerOver: number;
  secondArmBallChance: number;
}

/** The two that turn. The arm ball is his too, and does neither. */
const TURNING: readonly DeliveryStyle[] = ['OFF_SPIN', 'LEG_SPIN'];
export const SPIN_STYLES: readonly DeliveryStyle[] = [...TURNING, 'ARM_BALL'];

/**
 * Whether this is one of the spinner's three, the arm ball included.
 *
 * It lives here rather than with Survive's rules because both innings need it
 * now — the stationary action is the bowler's, not the mode's — and Survive.ts
 * says in its own first paragraph that nothing in it is reachable from the
 * classic innings, which has to stay true.
 */
export function spun(delivery: { style: DeliveryStyle }): boolean {
  return SPIN_STYLES.includes(delivery.style);
}
const clampX = (v: number, limit: number) => Math.min(limit, Math.max(-limit, v));

/**
 * The lines a ball turning this way can be pitched on and still bite.
 *
 * `sign` is -1 for the off break, which finishes further to leg, and +1 for the
 * leg break. A line qualifies when the gap between it and the tramline on the
 * side the ball is heading for is at least the smallest turn he bowls — so each
 * direction rules out exactly one line, the far one behind it, and keeps the
 * other four.
 */
function turnable(sign: number, spell: SpinSpell): BallLine[] {
  return LINES.filter(line => spell.maxFinalX - sign * LINE_X[line] >= spell.minTurn);
}

/**
 * Which overs the spinner gets, drawn once at the top of the innings.
 *
 * The first of them is not drawn at all: `notBefore` is always his, so the
 * change always comes at the same moment. Two overs of pace and then the ball
 * is tossed to the spinner — the batter has felt the quick bowling by then, and
 * taking it away is the point.
 *
 * The other two are drawn from everything after it, so when he comes *back* is
 * still an open question and nobody can bat to a timetable. They are shuffled
 * rather than rolled for independently, which would sometimes hand him the same
 * over twice and quietly bowl one of pace instead.
 */
export function spinOvers(rng: SeededRandom, spell: SpinSpell, keepForPace = 0): Set<number> {
  if (spell.overs <= 0) return new Set();
  const later: number[] = [];
  // The last overs are the quick bowlers'. A side nine down with two overs left
  // does not turn to spin, and the short-ball plan needs somewhere to land.
  for (let over = spell.notBefore + 1; over < spell.ofOvers - keepForPace; over++) later.push(over);
  return new Set([spell.notBefore, ...rng.shuffle(later).slice(0, spell.overs - 1)]);
}
/**
 * Who bowls which over of one block.
 *
 * The counts are the level's and always exact; only where they fall is drawn.
 * An over the spinner always has (`spinFirst`) is his, the overs before it are
 * pace — two of pace and then the ball tossed to him, as in Survival — and his
 * others come after it. The express bowler's first over (`expressFirst`) is
 * placed the same way: Level 2 opens with him. And the express bowler never has two overs running,
 * this block or across the join with the last, because no bowler does: the
 * ends change every over and he cannot bowl from both.
 *
 * Shuffled and drawn again until it holds, rather than built: four of ten with
 * none adjacent comes up about one shuffle in six, and a shuffle is the only
 * draw that makes every legal pattern as likely as every other.
 */
export function drawBlock(level: Level, size: number, rng: SeededRandom, expressBefore = false): OverKind[] {
  // The overs the level always gives one bowler, and pace before them.
  const fixed = new Map<number, OverKind>();
  if (level.spinFirst !== undefined && level.spin > 0) fixed.set(level.spinFirst, 'SPIN');
  if (level.expressFirst !== undefined && level.express > 0) fixed.set(level.expressFirst, 'EXPRESS');
  const head: OverKind[] = Array.from({ length: fixed.size ? Math.max(...fixed.keys()) + 1 : 0 }, (_, i) => fixed.get(i) ?? 'PACE');
  const used = (kind: OverKind) => head.filter(k => k === kind).length;
  const rest: OverKind[] = [
    ...Array<OverKind>(level.pace - used('PACE')).fill('PACE'),
    ...Array<OverKind>(level.spin - used('SPIN')).fill('SPIN'),
    ...Array<OverKind>(level.express - used('EXPRESS')).fill('EXPRESS'),
  ];
  let overs: OverKind[] = [];
  for (let tries = 0; tries < 200; tries++) {
    overs = [...head, ...rng.shuffle(rest)].slice(0, size);
    const back = overs.some((kind, i) => kind === 'EXPRESS' && (i === 0 ? expressBefore : overs[i - 1] === 'EXPRESS'));
    if (!back) break;
  }
  return overs;
}

export const CLASSIC_PLAN: BowlingPlan = {
  styles: STYLES, specials: SPECIALS, travelScale: GAME.travelScale, spin: CLASSIC_SPIN,
};

/**
 * How the Test match is bowled, beside the innings it is bowled in.
 *
 * It lives here rather than in `Game.ts` because it is not only the game that
 * bowls it: `scripts/survive-sim.ts` plays the mode a few hundred thousand
 * times to tune it, and when the plan was declared privately in `Game.ts` the
 * simulator kept a copy. The copy drifted the moment the short ball moved out
 * of the weight table and into a plan — the simulator went on reporting a mode
 * with no bouncers in it at all, which is the one number the change was made
 * to move. One declaration, imported by both, and that cannot happen again.
 */
export const SURVIVE_PLAN: BowlingPlan = {
  styles: SURVIVE_STYLES, specials: SURVIVE_SPECIALS, travelScale: SURVIVE.travelScale,
  // This bowler is aiming: the bouncer goes at the head and the express ball at
  // fifth stump, rather than both being dealt whatever line comes next.
  aimed: true,
  // The spell and the short-ball plan, each composed from the two halves that
  // know about it: SPIN and BOUNCERS say how they are bowled, SURVIVE says how
  // long the innings is, and neither has any business importing the other.
  spin: { ...SPIN, ofOvers: SURVIVE.totalBalls / SURVIVE.ballsPerOver, ballsPerOver: SURVIVE.ballsPerOver },
  short: { ...BOUNCERS, ofOvers: SURVIVE.totalBalls / SURVIVE.ballsPerOver, ballsPerOver: SURVIVE.ballsPerOver },
};

/**
 * The Marathon: Survival's bowling in Survival's first ten overs, and harder in
 * every ten after. The bouncer is placed in every pace over as Survival places
 * it, but with no death overs — Survival's last two are the end of its innings
 * and here they are the middle of one.
 */
const MARATHON_OVERS = Math.ceil(MARATHON.maxBalls / MARATHON.ballsPerOver);
export const MARATHON_PLAN: BowlingPlan = {
  ...SURVIVE_PLAN,
  spin: { ...SPIN, ofOvers: MARATHON_OVERS, ballsPerOver: MARATHON.ballsPerOver },
  short: { ...BOUNCERS, deathOvers: 0, ofOvers: MARATHON_OVERS, ballsPerOver: MARATHON.ballsPerOver },
  blocks: { size: BLOCK_OVERS, ofOvers: MARATHON_OVERS, levelOf, levelAt: marathonLevelAt, express: EXPRESS_OVER, round: ROUND },
};

/**
 * The Marathon with every over bowled round the wicket, from the first, for
 * `?round=1`: the side is otherwise drawn, from the sixth over, so seeing it
 * the honest way takes some batting.
 */
export function roundEvery(plan: BowlingPlan): BowlingPlan {
  return plan.blocks ? { ...plan, blocks: { ...plan.blocks, round: { from: 0, chance: 1 } } } : plan;
}

/**
 * The Marathon with only the bowler being tested, from the first over, for
 * `?swing=1` and `?express=1`. Reaching either the honest way takes ten or
 * twenty overs of batting first.
 *
 *   - **swing**: every over is the Level 2 swing bowler's, as he bowls it —
 *     inswingers, outswingers and straight ones, the bouncer included.
 *   - **express**: every over is the express bowler's, as he bowls it.
 *   - **reverse**: every over the swing bowler's, and every ball of it reverse
 *     swing — no bouncer, no yorker owed and no slower ball in its place.
 *   - **both**: half the overs each, never two of his running.
 */
export function marathonOnly({ swing = false, express = false, reverse = false }: { swing?: boolean; express?: boolean; reverse?: boolean }): BowlingPlan {
  const pace = swing || reverse;
  const share = pace && express ? 5 : BLOCK_OVERS;
  const level: Level = {
    ...levelOf(express && !pace ? 2 : 1), pace: pace ? share : 0, spin: 0, express: express ? share : 0,
    // Level 2's opening over is his; here he has half of every block, and a
    // fixed first over would put him in two running across the join.
    expressFirst: undefined,
  };
  const plan: BowlingPlan = { ...MARATHON_PLAN, blocks: { ...MARATHON_PLAN.blocks!, levelOf: () => level, levelAt: () => level } };
  if (!reverse) return plan;
  return {
    ...plan, short: undefined,
    blocks: { ...plan.blocks!, levelOf: () => level, levelAt: () => ({ ...level, reverse: { perOver: MARATHON.ballsPerOver, secondChance: 0 } }) },
    specials: { sixesForYorker: Infinity, quickForSlower: Infinity, shortChance: 0 },
  };
}

/**
 * The Marathon with the pitch wearing five times as fast, for `?wear=fast`:
 * every step of the innings in a fifth of the overs, so the whole of it can be
 * felt in one sitting. Blocks of two overs instead of ten — the swing from the
 * second over instead of the sixth, the express bowler's first over the third
 * instead of the eleventh, and Level 3, four of every ten his, from the fifth
 * instead of the twenty-first. Each bowler bowls as he would in the real
 * innings; only when he comes on is changed.
 */
export const FAST_WEAR = 5;
export function marathonFastWear(): BowlingPlan {
  const size = BLOCK_OVERS / FAST_WEAR;
  const swingFrom = Math.max(1, Math.round(SWING_FROM / FAST_WEAR));
  const levelAt = (over: number): Level => {
    const block = Math.floor(over / size);
    if (block > 0 || over < swingFrom) return levelOf(block);
    const swinging = levelOf(1);
    return { ...levelOf(0), level: 2, swing: swinging.swing, late: swinging.late, swingShare: swinging.swingShare, reverse: swinging.reverse };
  };
  return { ...MARATHON_PLAN, blocks: { ...MARATHON_PLAN.blocks!, size, levelAt, round: { ...ROUND, from: swingFrom } } };
}

/** The lines that are at the batter rather than at the stumps: he stands outside leg. */
const BODY_LINES: BallLine[] = ['OUTSIDE_LEG', 'LEG'];
/** The lines that invite a drive at a ball he should be leaving. */
const WIDE_LINES: BallLine[] = ['OFF', 'OUTSIDE_OFF'];
export class DeliveryGenerator {
  private bag: BallLine[] = [];
  /** Sixes conceded since the last yorker, quick balls since the last change-up. */
  private punished = 0;
  private quick = 0;
  /** Deliveries bowled, which is how the generator knows which over it is in. */
  private bowled = 0;
  /** Which balls of the over now in progress go straight on. Drawn at its top. */
  private armBalls = new Set<number>();
  /** Which balls of the over now in progress are short. Drawn at its top. */
  private shortBalls = new Set<number>();
  /** The over those were drawn for, so they are drawn once and not per ball. */
  private shortOver = -1;
  /** Which balls of the over now in progress are reverse swing, and the over they were drawn for. */
  private reverseBalls = new Map<number, DeliveryStyle>();
  private reverseOver = -1;
  /** What each ball of the express bowler's over is. Drawn at its top. */
  private expressBalls = new Map<number, DeliveryStyle>();
  private readonly spinning: Set<number>;
  /** Who bowls every over, when the plan is by blocks. Drawn whole, up front. */
  private readonly schedule: OverKind[] = [];
  /** Which overs are bowled round the wicket, drawn up front the same way. */
  private readonly sides: boolean[] = [];
  constructor(private rng: SeededRandom, private plan: BowlingPlan = CLASSIC_PLAN) {
    const blocks = plan.blocks;
    if (blocks) {
      // Every block now rather than each as it comes, so the draw sits at the
      // same place in the seed's sequence whatever is asked of it on the way.
      for (let block = 0; block * blocks.size < blocks.ofOvers; block++) {
        const before = this.schedule[this.schedule.length - 1] === 'EXPRESS';
        this.schedule.push(...drawBlock(blocks.levelOf(block), blocks.size, rng, before));
      }
      // From a stream of its own, forked off the seed rather than drawn from
      // it: the side came after everything else, and taking it from the seed
      // would have moved every ball each seed bowled before it.
      const round = blocks.round;
      if (round) {
        const sides = rng.fork(0x726f756e);
        for (let over = 0; over < blocks.ofOvers; over++) this.sides.push(over >= round.from && sides.next() < round.chance);
      }
    }
    this.spinning = plan.spin && !blocks ? spinOvers(rng, plan.spin, plan.short?.deathOvers ?? 0) : new Set();
  }
  /** The over the next ball belongs to, counting from nought. */
  private get over() { return Math.floor(this.bowled / (this.plan.spin?.ballsPerOver ?? GAME.ballsPerOver)); }
  /** Who bowls over `over`: always pace, spin or express in a plan by blocks, and null otherwise. */
  overKind(over: number): OverKind | null {
    return this.plan.blocks ? this.schedule[over] ?? 'PACE' : null;
  }
  /** The level over `over` is bowled at, in a plan by blocks. */
  levelAt(over: number): Level | null {
    const blocks = this.plan.blocks;
    if (!blocks) return null;
    return blocks.levelAt ? blocks.levelAt(over) : blocks.levelOf(Math.floor(over / blocks.size));
  }
  /** Whether the ball about to be bowled belongs to the spinner. */
  get spinnerOn() {
    if (this.plan.blocks) return this.overKind(this.over) === 'SPIN';
    return !!this.plan.spin && this.spinning.has(Math.floor(this.bowled / this.plan.spin.ballsPerOver));
  }
  /** Whether it belongs to the express bowler. */
  get expressOn() { return this.overKind(this.over) === 'EXPRESS'; }
  /** Whether over `over` is bowled round the wicket. */
  roundAt(over: number): boolean { return this.sides[over] ?? false; }
  /** And the ball about to be bowled. */
  get roundOn() { return this.roundAt(this.over); }
  /** The overs he was given, for the HUD and for a test that there are three. */
  get spell(): readonly number[] { return [...this.spinning].sort((a, b) => a - b); }
  /** The bowler watches what happens to him and answers it next ball. */
  record(outcome: ShotOutcome) { if (outcome.runs === 6) this.punished++; }
  /**
   * Where this delivery is being *put*, as opposed to where the bag would have
   * dealt it. Answers null for anything the bowler is not aiming, which is most
   * of the over.
   */
  private aim(style: DeliveryStyle): BallLine | null {
    if (!this.plan.aimed) return null;
    const shape = this.plan.styles[style];
    if (shape.aimBody && this.rng.next() < shape.aimBody) return this.pick(BODY_LINES);
    if (shape.aimWide && this.rng.next() < shape.aimWide) return this.pick(WIDE_LINES);
    return null;
  }
  private pick(lines: BallLine[]): BallLine { return lines[Math.floor(this.rng.next() * lines.length)]; }
  /**
   * Where in the over the ball that goes straight on comes. Placed rather than
   * rolled for, so it is never the whole over and never absent from it — and at
   * a position drawn fresh each time, so it is not the last ball every over.
   */
  private placeArmBalls(spell: SpinSpell): Set<number> {
    const positions = [];
    for (let ball = 0; ball < spell.ballsPerOver; ball++) positions.push(ball);
    const wanted = spell.armBallsPerOver + (this.rng.next() < spell.secondArmBallChance ? 1 : 0);
    return new Set(this.rng.shuffle(positions).slice(0, Math.min(wanted, spell.ballsPerOver)));
  }
  /**
   * Which balls of this over are short. The arm ball's idiom exactly: a count
   * placed at positions drawn fresh, so the over always has its quota and never
   * has it in the same place twice.
   */
  private placeShort(over: number, plan: ShortPlan): Set<number> {
    const positions = [];
    for (let ball = 0; ball < plan.ballsPerOver; ball++) positions.push(ball);
    const wanted = atTheDeath(over, plan) ? plan.atTheDeath : plan.perOver;
    return new Set(this.rng.shuffle(positions).slice(0, Math.min(wanted, plan.ballsPerOver)));
  }
  /**
   * The express bowler's over, planned at the top of it: one bouncer, a second
   * one over in three, the yorker, one over in two the slower ball, and the
   * rest full and quick.
   */
  private placeExpress(express: typeof EXPRESS_OVER, ballsPerOver: number): Map<number, DeliveryStyle> {
    const positions = [];
    for (let ball = 0; ball < ballsPerOver; ball++) positions.push(ball);
    const order = this.rng.shuffle(positions);
    const bouncers = express.bouncers + (this.rng.next() < express.secondBouncerChance ? 1 : 0);
    const planned = new Map<number, DeliveryStyle>();
    const slower = this.rng.next() < express.slowerChance ? 1 : 0;
    const plan: DeliveryStyle[] = [
      ...Array<DeliveryStyle>(bouncers).fill('SHORT'),
      ...Array<DeliveryStyle>(express.yorkers).fill('YORKER'),
      ...Array<DeliveryStyle>(slower).fill('SLOWER'),
    ];
    plan.slice(0, ballsPerOver).forEach((style, i) => planned.set(order[i], style));
    return planned;
  }
  /**
   * Which balls of this over are reverse swing, and which way each goes. The
   * bouncer's ball is not on offer: it was placed first and keeps its place.
   */
  private placeReverse(plan: { perOver: number; secondChance: number }, ballsPerOver: number): Map<number, DeliveryStyle> {
    const free = [];
    for (let ball = 0; ball < ballsPerOver; ball++) if (!(this.shortOver === this.over && this.shortBalls.has(ball))) free.push(ball);
    const wanted = plan.perOver + (this.rng.next() < plan.secondChance ? 1 : 0);
    const placed = new Map<number, DeliveryStyle>();
    for (const ball of this.rng.shuffle(free).slice(0, wanted)) placed.set(ball, this.rng.next() < 0.5 ? 'REVERSE_IN' : 'REVERSE_OUT');
    return placed;
  }
  private chooseStyle(): DeliveryStyle {
    const { specials, styles } = this.plan;
    // His over is all his. The owed yorker and the owed change-up wait for the
    // next bowler: he bowls his own of each, and only those.
    if (this.expressOn) {
      const ballsPerOver = this.plan.spin?.ballsPerOver ?? GAME.ballsPerOver;
      const ballInOver = this.bowled % ballsPerOver;
      if (ballInOver === 0) this.expressBalls = this.placeExpress(this.plan.blocks!.express, ballsPerOver);
      return this.expressBalls.get(ballInOver) ?? 'EXPRESS';
    }
    // His over is his. None of what follows — the yorker owed for a six, the
    // change-up owed for a spell of pace — belongs to a spinner, and a bouncer
    // least of all.
    if (this.spinnerOn) {
      const spell = this.plan.spin!;
      const ballInOver = this.bowled % spell.ballsPerOver;
      // The over is planned at the top of it rather than ball by ball, which is
      // the only way to promise the quicker one is in there somewhere.
      if (ballInOver === 0) this.armBalls = this.placeArmBalls(spell);
      if (this.armBalls.has(ballInOver)) return 'ARM_BALL';
      // And which way it turns is a coin, every ball. Nothing carries over from
      // the last one: two off breaks say nothing about the third.
      return this.rng.next() < 0.5 ? 'OFF_SPIN' : 'LEG_SPIN';
    }
    // The short ball is planned rather than rolled for where the mode says so,
    // and the plan is asked first — before the two owed deliveries, not after.
    // Asked after, a yorker earned by four sixes displaced the bouncer and the
    // over finished without one, which is the exact failure placing it was
    // meant to end. Neither debt is cleared by standing aside, so the yorker
    // simply arrives next ball.
    const short = this.plan.short;
    if (short) {
      const over = Math.floor(this.bowled / short.ballsPerOver);
      if (over !== this.shortOver) { this.shortOver = over; this.shortBalls = this.placeShort(over, short); }
      if (this.shortBalls.has(this.bowled % short.ballsPerOver)) return 'SHORT';
    }
    // His reverse swing is placed too, after the bouncer and in the balls it
    // left: one an over, sometimes two.
    const placed = this.levelAt(this.over)?.reverse;
    if (placed) {
      const ballsPerOver = this.plan.spin?.ballsPerOver ?? GAME.ballsPerOver;
      if (this.over !== this.reverseOver) { this.reverseOver = this.over; this.reverseBalls = this.placeReverse(placed, ballsPerOver); }
      const reverse = this.reverseBalls.get(this.bowled % ballsPerOver);
      if (reverse) return reverse;
    }
    if (this.punished >= specials.sixesForYorker) { this.punished = 0; return 'YORKER'; }
    // A change of pace only surprises once the batter has been fed quick ones.
    // Counting them consecutively would almost never fire, so they accumulate.
    if (this.quick >= specials.quickForSlower) { this.quick = 0; return 'SLOWER'; }
    if (specials.shortChance > 0 && this.rng.next() < specials.shortChance) return 'SHORT';
    // From Level 2 the pace bowler swings it: the two that swing take the
    // level's share between them and everything else shares what is left, in
    // the proportions Survival gave it.
    const level = this.levelAt(this.over);
    const share = level?.swingShare;
    const swingWeight = Object.entries(styles).reduce((t, [key, v]) => t + (SWING_LINES[key as DeliveryStyle] ? v.weight : 0), 0);
    const weightOf = (key: string, weight: number) => share === undefined ? weight
      : SWING_LINES[key as DeliveryStyle] ? share / 2
      : weight * (1 - share) / (1 - swingWeight);
    let roll = this.rng.next();
    for (const [key, value] of Object.entries(styles)) {
      roll -= weightOf(key, value.weight);
      if (roll <= 0) return key as DeliveryStyle;
    }
    return 'NORMAL';
  }
  next(releaseTimeMs: number): Delivery {
    if (!this.bag.length) this.bag = this.rng.shuffle(LINES);
    const style = this.chooseStyle();
    const spell = this.plan.spin;
    const turning = !!spell && TURNING.includes(style);
    const sign = style === 'SWING_IN' || style === 'OFF_SPIN' || style === 'REVERSE_IN' ? -1
      : style === 'SWING_OUT' || style === 'LEG_SPIN' || style === 'REVERSE_OUT' ? 1 : 0;
    // A turning ball picks its line from the ones with somewhere to turn *to*,
    // rather than taking whatever the bag deals and being cut off at the
    // tramline afterwards. Clamping after the fact looked fine on the average
    // and was quietly broken at the edges: an off break dealt outside leg tried
    // to turn further into leg, lost all of it to the clamp, and came out dead
    // straight — a ball the over promises will turn, going nowhere, and not
    // even the arm ball. Three of the five lines are common to both directions,
    // so where it pitches still does not say which way it is going.
    // The swing bowler starts each of his two where it swings from. Asked
    // before the bag, so it neither takes a line from it nor leaves a gap.
    const swingFrom = this.levelAt(this.over)?.swingShare !== undefined && !this.expressOn
      ? SWING_LINES[style] ?? REVERSE.lines[style] : undefined;
    const line = turning ? this.pick(turnable(sign, spell!))
      : swingFrom ? this.pick([...swingFrom])
      : (this.aim(style) ?? this.bag.pop()!);
    if (QUICK_STYLES.includes(style)) this.quick++;
    const shape = this.plan.styles[style];
    const express = this.expressOn;
    const round = this.roundOn;
    const pace = express ? style === 'SLOWER' ? this.plan.blocks!.express.slower : this.plan.blocks!.express : shape;
    const speedKph = Math.round(this.rng.range(pace.min, pace.max));
    // A plan by blocks swings it harder as the innings goes on, on the same
    // two deliveries: further, and later in the flight. Survival's level is
    // one and nought, which leaves its ball exactly as it was.
    const level = this.levelAt(this.over);
    const reversing = isReverse(style);
    const swung = !turning && !reversing && sign !== 0 && !!level;
    // How much room this line leaves before the ball would finish wide, which
    // is what the turn is drawn against: every turning ball gets at least
    // `minTurn`, because the lines that could not offer that were not offered.
    const room = turning ? spell!.maxFinalX - sign * LINE_X[line] : 0;
    const movement = sign * (turning
      ? this.rng.range(spell!.minTurn, Math.min(spell!.maxTurn, room))
      : reversing ? this.rng.range(REVERSE.min, REVERSE.max)
      : this.rng.range(GAME.movement * 0.65, GAME.movement) * (swung ? level!.swing : 1));
    // Belt and braces: the line choice above already makes this unreachable.
    // A ball swinging harder is held to the widest a gentle one could finish,
    // so more swing is more of a test and never a wide.
    const finalTargetX = turning
      ? clampX(LINE_X[line] + movement, spell!.maxFinalX)
      : reversing ? clampX(LINE_X[line] + movement, LINE_X.OUTSIDE_OFF)
      : swung ? clampX(LINE_X[line] + movement, LINE_X.OUTSIDE_OFF + GAME.movement)
      : LINE_X[line] + movement;
    const durationMs = (GAME.releaseZ - GAME.contactZ) / (speedKph / 3.6) * 1000 * this.plan.travelScale * (shape.rush ?? 1);
    this.bowled++;
    return { line, style, speedKph, baseTargetX: LINE_X[line], finalTargetX,
      bounceZ: shape.bounce ?? GAME.bounceZ, rise: shape.rise ?? GAME.rise,
      durationMs, releaseTimeMs, idealContactTimeMs: releaseTimeMs + durationMs,
      ...(swung && level!.late ? { late: level!.late } : {}),
      ...(express ? { express: true } : {}),
      ...(round ? { round: true } : {}) };
  }
}
