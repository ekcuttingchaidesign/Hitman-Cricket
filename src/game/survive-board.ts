import { HEALTH, SURVIVE } from '../config/survive.js';

/**
 * How Test-match innings are put in order, and why it cannot be the other board.
 *
 * The five-over ladder ranks on runs and reads everything else as a tiebreak,
 * because in that innings runs are the only thing anybody is trying to get. A
 * Test match is not one contest, it is three, and a hundred is not the best
 * score in it — a hundred is a *win*, and a win off fewer balls is a better win
 * than the same hundred off more. Ranking the two boards on one number would
 * put a man who scored eighty and lost above a man who blocked sixty balls and
 * saved the match, which is exactly backwards.
 *
 * So the ladder is tiered, and each tier is ranked on the figure that tier was
 * actually about:
 *
 *   won      — chased the hundred. Fewer balls first: a chase is a race.
 *   drawn    — batted out the ten overs. Most runs first: he had nothing left
 *              to chase, so what he made while surviving is the measure.
 *   lost     — neither. Most balls faced first: how long he kept them out is
 *              the only thing left to be proud of.
 *
 * Runs sit under all three as a tiebreak, so two identical chases are split by
 * what was scored on the way — and under runs sits the meter, so two innings
 * that are level on everything a scorecard holds are split by how much of a
 * battering they took to get there.
 *
 * That last rung earns its place in the drawn tier, where the two above it are
 * the same figure: a draw is ranked on runs and then tied on runs, so before
 * this every pair of players who batted out the overs for the same score fell
 * straight through to the clock — and batting out ten overs for a modest score
 * is the *common* innings here, not a rare one. It is also the one tier where
 * damage costs nothing by itself: he survived, so the meter never ended
 * anything, and a man who was worked over for sixty balls sat level with one
 * who was barely touched. Under a loss it says less, because there the meter
 * has usually already had its say by ending the innings early.
 *
 * The clock stays at the bottom. It is the only key the store stamps itself,
 * so it is the one figure a submitted row cannot lie about.
 */

/** Which of the three contests an innings ended up in. */
export type Standing = 'WON' | 'DRAWN' | 'LOST';

/** The figures the Test board ranks and shows, and nothing else. */
export interface SurviveInnings {
  runs: number;
  balls: number;
  /** One at most: he is the last man in. */
  wickets: number;
  /** Blows taken, shown beside the row. Counted, never ranked: see `health`. */
  blows: number;
  /**
   * What was left on the meter when the innings ended, out of `HEALTH.full`.
   *
   * This is what the ladder ranks, and not the blow count beside it, because
   * the meter is what the player watched: one on the helmet costs more than
   * two on the pad, and a row ranked on the tally would have said the opposite.
   */
  health: number;
}

/** A Test row, once it has a place and an owner. */
export interface SurviveRow extends SurviveInnings {
  playerId: string;
  name: string;
  avatar: number;
  score: number;
}

/** How many rows the Test board holds. The same fifty as the other one. */
export const SURVIVE_BOARD_SIZE = 50;

/**
 * Which tier an innings belongs to, read off the figures rather than carried
 * beside them.
 *
 * The store has to be able to decide this from a row somebody posted, so it
 * cannot trust an ending sent along with it. The order matches `endingOf`: the
 * hundred is checked before the overs, so a chase completed on the last ball is
 * a win and not a draw.
 */
export function standingOf(innings: SurviveInnings): Standing {
  if (innings.runs >= SURVIVE.target) return 'WON';
  if (innings.balls >= SURVIVE.totalBalls) return 'DRAWN';
  return 'LOST';
}

const TIER: Record<Standing, number> = { LOST: 0, DRAWN: 1, WON: 2 };

/**
 * Field widths, low to high. `PRIMARY` holds whichever figure this tier ranks
 * on, which is why it is sized for the largest of the three rather than for any
 * one of them: sixty balls saved, sixty balls faced, or every ball hit for six.
 */
const HEALTH_BITS = 5;
const RUNS_BITS = 9;
const PRIMARY_BITS = 9;
const TIER_BITS = 2;
const TIME_BITS = 28;

/**
 * The meter, in steps of four points out of a hundred, which is what makes it
 * fit: twenty-five steps need five bits and a hundred would need seven, and
 * seven is two more than the key has to spare.
 *
 * Nothing is lost by the rounding. The cheapest blow in the mode is a thigh at
 * the slowest pace and it still costs several points, so any two innings that
 * took a different battering are at least one step apart — and four points is a
 * twenty-fifth of a bar nobody could read that finely anyway.
 */
const HEALTH_STEP = 4;

const RUNS_SHIFT = 2 ** HEALTH_BITS;
const PRIMARY_SHIFT = RUNS_SHIFT * 2 ** RUNS_BITS;
const TIER_SHIFT = PRIMARY_SHIFT * 2 ** PRIMARY_BITS;
const TIME_SPAN = 2 ** TIME_BITS;
const MAX_SECONDS = TIME_SPAN - 1;

/**
 * Twenty-five bits of rank over twenty-eight of time. Fifty-three is exactly a
 * double's mantissa, and the meter's five bits are what took the last of the
 * room this board used to have spare, so it now sits where the other one does:
 * at the line, with nothing left. A test holds it there, because a field added
 * after this cannot be paid for out of the rank — it would have to come out of
 * the clock, and shortening the clock reshuffles ties that are already settled.
 */
export const SURVIVE_PACKED_BITS =
  TIER_BITS + PRIMARY_BITS + RUNS_BITS + HEALTH_BITS + TIME_BITS;

/** Second zero, shared with the other board so the two stamps mean one thing. */
export { LAUNCH_MS } from './leaderboard.js';
import { LAUNCH_MS } from './leaderboard.js';

/** The most runs a Test innings can hold: every ball hit for six. */
export function maxSurviveRuns() {
  return SURVIVE.totalBalls * 6;
}

/**
 * The figure this innings is ranked on inside its own tier. Higher is better in
 * all three, which is what lets one field carry all of them — the chase stores
 * what it *saved* rather than what it spent.
 */
export function primaryOf(innings: SurviveInnings): number {
  const standing = standingOf(innings);
  if (standing === 'WON') return clamp(SURVIVE.totalBalls - innings.balls, 0, SURVIVE.totalBalls);
  if (standing === 'DRAWN') return clamp(innings.runs, 0, maxSurviveRuns());
  return clamp(innings.balls, 0, SURVIVE.totalBalls);
}

/**
 * What is left on the meter, in steps, which is the figure the key carries.
 * Rounded down, so a step is only ever claimed when it was fully earned.
 */
export function healthStepOf(innings: SurviveInnings): number {
  return clamp(Math.floor(innings.health / HEALTH_STEP), 0, 2 ** HEALTH_BITS - 1);
}

/** The tier, its figure, the runs and the meter, packed into twenty-five bits. */
export function surviveRankKey(innings: SurviveInnings): number {
  return TIER[standingOf(innings)] * TIER_SHIFT
    + primaryOf(innings) * PRIMARY_SHIFT
    + clamp(innings.runs, 0, 2 ** RUNS_BITS - 1) * RUNS_SHIFT
    + healthStepOf(innings);
}

/**
 * The whole ladder as one number, with the stamp inverted underneath it so an
 * exact tie is settled by who got there first. The stamp comes from the store,
 * never the browser, or a wrong clock would decide a place.
 */
export function packSurvive(innings: SurviveInnings, atMs: number): number {
  const seconds = clamp(Math.floor((atMs - LAUNCH_MS) / 1000), 0, MAX_SECONDS);
  return surviveRankKey(innings) * TIME_SPAN + (MAX_SECONDS - seconds);
}

/** A packed Test score taken apart again, for tests and for reading a row. */
export function unpackSurvive(score: number) {
  const rank = Math.floor(score / TIME_SPAN);
  const seconds = MAX_SECONDS - (score - rank * TIME_SPAN);
  const tier = Math.floor(rank / TIER_SHIFT);
  const primary = Math.floor(rank / PRIMARY_SHIFT) % 2 ** PRIMARY_BITS;
  const runs = Math.floor(rank / RUNS_SHIFT) % 2 ** RUNS_BITS;
  const health = rank % 2 ** HEALTH_BITS;
  const standing = (Object.keys(TIER) as Standing[]).find(k => TIER[k] === tier) ?? 'LOST';
  return { rank, seconds, standing, primary, runs, health, atMs: LAUNCH_MS + seconds * 1000 };
}

/**
 * The rungs, in the order they are read. `primary` is whichever figure the
 * tier is ranked on, so it is named for the job rather than for one of the
 * three figures that can fill it.
 */
const LADDER = [
  { key: 'tier', of: (i: SurviveInnings) => TIER[standingOf(i)] },
  { key: 'primary', of: primaryOf },
  { key: 'runs', of: (i: SurviveInnings) => i.runs },
  { key: 'health', of: healthStepOf },
] as const;

export type SurviveLadderKey = (typeof LADDER)[number]['key'];

/**
 * Which figure actually put one innings above another, or null where the two
 * agree on every rung and only the clock split them. The board uses it to say
 * so on the row: two innings that read identically, one above the other, look
 * like a bug until they are labelled.
 */
export function surviveDecidedBy(a: SurviveInnings, b: SurviveInnings): SurviveLadderKey | null {
  for (const rung of LADDER) if (rung.of(a) !== rung.of(b)) return rung.key;
  return null;
}

/** Board order: sort with this and the best innings comes first. */
export function compareSurviveRows(a: SurviveRow, b: SurviveRow) {
  return b.score - a.score;
}

/** Whether an innings is worth asking a name for. */
export function surviveQualifies(innings: SurviveInnings, atMs: number, board: readonly { score: number }[]) {
  if (board.length < SURVIVE_BOARD_SIZE) return true;
  return packSurvive(innings, atMs) > board[SURVIVE_BOARD_SIZE - 1].score;
}

/** Whether it would actually replace the row this player is already holding. */
export function surviveImprovesOn(innings: SurviveInnings, atMs: number, standing: { score: number } | null): boolean {
  return !standing || packSurvive(innings, atMs) > standing.score;
}

/**
 * Whether a Test innings could have happened at all. The same floor the other
 * board has, and not an anti-cheat measure: the game is a static page, so a
 * determined person can post anything that passes. It rejects what could not
 * exist.
 *
 * The rules this mode adds are its own, and they are looser than they look,
 * because three of the four endings stop short of the tenth over. He has one
 * wicket; he can also be carried off with balls remaining and no wicket at all,
 * which is the one shape the five-over board would have rejected out of hand.
 * So a short innings proves nothing either way and there is no rule about the
 * length here — only about the ceilings, and about the hundred, which really
 * does end the match the moment it is reached.
 */
export function survivePlausible(innings: SurviveInnings): boolean {
  const { runs, balls, wickets, blows, health } = innings;
  if ([runs, balls, wickets, blows, health].some(n => !Number.isInteger(n) || n < 0)) return false;
  if (balls > SURVIVE.totalBalls || wickets > SURVIVE.maxWickets) return false;
  if (blows > balls || health > HEALTH.full) return false;
  // Damage comes from blows and from nothing else, so a meter that moved with
  // no blow against it never happened. The other way round is deliberately not
  // asserted: it would be a rule about the cheapest blow still costing a point,
  // which is a tuning figure in another file and not this function's business.
  if (health < HEALTH.full && blows === 0) return false;
  // Carried off is the one ending the meter causes, and it is read off the
  // shape: balls left to bowl and no wicket against him. An innings that ended
  // that way with something still on the meter has no way to have ended.
  if (standingOf(innings) === 'LOST' && wickets === 0 && health > 0) return false;
  // Six an over is the ceiling, and the chase stops the moment it is reached.
  if (runs > balls * 6) return false;
  // A wicket on the sixtieth ball is a real scorecard and a drawn one: the
  // innings reads the overs before it reads the wicket, because a man who is
  // out on the last ball had no batting left to fail to do. So there is no rule
  // here about a wicket and a full ten overs — that shape is one the mode
  // produces, and refusing it would refuse an innings somebody actually played.
  //
  // A hundred does end it, though, so an innings that carried on past the
  // target and then lost its wicket never happened.
  if (wickets >= SURVIVE.maxWickets && runs >= SURVIVE.target) return false;
  return true;
}

function clamp(value: number, low: number, high: number) {
  return value < low ? low : value > high ? high : value;
}
