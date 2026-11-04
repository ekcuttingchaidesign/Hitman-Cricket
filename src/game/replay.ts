import type { TimingGrade } from './types';
import type { CameraPose } from './ShotReel';

/**
 * The action replay: a stroke worth watching again, played again once the
 * ball is dead, from an angle the game's camera behind the bat never has.
 *
 * It is the ball that was just played, not a picture of one. The game keeps
 * what it told the scene — the ball, the swing and when, the outcome — and
 * tells it the same again, shifted on to now (`Game.replayFrame`), with the
 * camera here and the clock slowed through the bat meeting the ball as the
 * stroke films are (`reelPace`). Nothing is scored, counted or sent again,
 * and no ball of the innings moves: whether one is shown is drawn off the
 * page's dice, never the seed.
 *
 * Which balls: a stroke on `REPLAY_STROKES`, timed GOOD or PERFECT, that went
 * for four or six. How often (`replayDue`): the first of each stroke an
 * innings always, after that one in three (`REPLAY_ODDS`), never within an
 * over of the last (`REPLAY_GAP`) and no more than `REPLAYS_PER_INNINGS`; a
 * player who skips two running is shown only a stroke they have not had
 * replayed yet that innings. Never over anything else the ball brings — a
 * milestone, a chase passed, a new batter, the innings' last ball — which the
 * game says with `blocked`.
 */
export type ReplayStroke = 'cover';
export const REPLAY_STROKES: readonly ReplayStroke[] = ['cover'];

/** What the game says about the ball just played. `stroke` is null for one that is not on the list. */
export interface ReplayBall {
  stroke: ReplayStroke | null;
  grade: TimingGrade;
  runs: number;
  wicket: boolean;
  /** Its place in the innings, from nought. */
  index: number;
}

/** What an innings has had replayed so far. A new innings starts from `freshLog()`. */
export interface ReplayLog {
  shown: number;
  /** The ball the last replay was of, or -Infinity. */
  lastAt: number;
  /** The strokes replayed this innings. */
  seen: readonly ReplayStroke[];
  /** Replays skipped one after another, the last of them the latest replay. */
  skipped: number;
}
export const freshLog = (): ReplayLog => ({ shown: 0, lastAt: -Infinity, seen: [], skipped: 0 });

export const REPLAYS_PER_INNINGS = { super10: 5, blast: 3 } as const;
/** Balls from one replay to the next at the least: an over. */
export const REPLAY_GAP = 6;
/** A stroke already replayed this innings comes round again this often. */
export const REPLAY_ODDS = 1 / 3;
/** Skipped this many running, only a stroke not yet replayed is shown. */
export const SKIPS_TO_QUIET = 2;

export function qualifies(ball: ReplayBall) {
  return !!ball.stroke && !ball.wicket && ball.runs >= 4 && (ball.grade === 'PERFECT' || ball.grade === 'GOOD');
}

/**
 * Whether this ball is replayed. `roll` is the page's dice in [0, 1);
 * `every` (`?replay=1`) shows every ball that qualifies, for looking at it.
 */
export function replayDue(ball: ReplayBall, log: ReplayLog, opts: { cap: number; blocked: boolean; roll: number; every?: boolean }) {
  if (!qualifies(ball) || opts.blocked) return false;
  if (opts.every) return true;
  if (log.shown >= opts.cap || ball.index - log.lastAt < REPLAY_GAP) return false;
  const fresh = !log.seen.includes(ball.stroke!);
  if (fresh) return true;
  if (log.skipped >= SKIPS_TO_QUIET) return false;
  return opts.roll < REPLAY_ODDS;
}

/** The log once a replay of `ball` has been shown. */
export function shownLog(log: ReplayLog, ball: ReplayBall): ReplayLog {
  return { ...log, shown: log.shown + 1, lastAt: ball.index, seen: log.seen.includes(ball.stroke!) ? log.seen : [...log.seen, ball.stroke!] };
}
/** And once it has ended: watched to the end, or skipped. */
export const endedLog = (log: ReplayLog, skipped: boolean): ReplayLog => ({ ...log, skipped: skipped ? log.skipped + 1 : 0 });

// ---------------------------------------------------------------------------
// The timeline
// ---------------------------------------------------------------------------

/**
 * The wipe that cuts into it and out of it, on the page's clock: the band
 * covers the screen at its middle, which is where the cut is made, so the
 * game's view is never seen jumping to the replay's or back.
 */
export const WIPE_MS = 560;
/** It picks the ball up this far into the bowler's run, a stride or two from the crease. */
export const RUNUP_FROM = .6;
/** After the bat meets the ball: the ball away and his finish held, and out on it, before he is home in his guard. */
export const AFTER_MS = 800;

/** When things happen in a replay, on the game's clock from its start: the run-up picked up, the ball out, the bat on it, the end. */
export interface ReplayTimes { release: number; swing: number; contact: number; end: number }
/**
 * From what was kept of the ball: how long after release he swung and the
 * bat met it, and the bowler's run-up.
 */
export function replayTimes(kept: { swingAfter: number; contactAfter: number }, runupMs: number): ReplayTimes {
  const release = (1 - RUNUP_FROM) * runupMs, contact = release + kept.contactAfter;
  return { release, swing: release + kept.swingAfter, contact, end: contact + AFTER_MS };
}

/**
 * How fast the game's clock runs through a replay against the page's, at
 * `since` milliseconds from contact: full speed in, a quarter through the bat
 * meeting the ball, his follow-through and the finish held, and full speed
 * again for the wipe out.
 * Smooth both ways.
 */
export const REPLAY_SLOW = { pace: .26, inFrom: -460, inTo: -180, outFrom: 900, outTo: 1400 } as const;
export function replayPace(since: number) {
  const ease = (x: number) => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };
  const into = ease((since - REPLAY_SLOW.inFrom) / (REPLAY_SLOW.inTo - REPLAY_SLOW.inFrom));
  const out = ease((since - REPLAY_SLOW.outFrom) / (REPLAY_SLOW.outTo - REPLAY_SLOW.outFrom));
  return 1 - (1 - REPLAY_SLOW.pace) * into * (1 - out);
}

// ---------------------------------------------------------------------------
// The camera
// ---------------------------------------------------------------------------

type Vec = readonly [number, number, number];
const mix = (a: Vec, b: Vec, k: number): Vec => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const smooth = (x: number) => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };

interface Angle {
  /** Where the lens stands as the replay picks up, and where it has crept to by the end. */
  from: Vec; to: Vec;
  /** What it looks at: him, about the waist, where his stride takes him. */
  at: Vec;
  fov: number;
  /** How far it turns after the ball once it is struck, nought to one, and how high it looks at most. */
  follow: number; ceiling: number;
}

/**
 * Each stroke's angle, in the game's frame (+x the off side, +z towards the
 * bowler), for a right-hander; the scene mirrors it for a left-hander.
 *
 * The cover drive from in front on the off side, low, between mid-off and
 * extra cover: the stride comes towards the lens, the bat comes down straight
 * and through, the ball goes away past the lens's shoulder, and the finish is
 * held facing it. It does not turn after the ball: going past the lens, a
 * camera turning after it ended up looking at the turf at its own feet. Side on from point, the shot a broadcast uses, a phone held
 * upright sees a slice of him a metre wide and loses the stride.
 */
const ANGLES: Record<ReplayStroke, Angle> = {
  cover: { from: [3.3, 1.25, 7.0], to: [2.5, 1.05, 5.6], at: [-.3, .92, 1.35], fov: 33, follow: 0, ceiling: 2.2 },
};

/**
 * The replay's camera at `t` on the game's clock from its start, `ball` where
 * the ball is now or was last drawn. Creeping in on him all the way; once the
 * ball is struck, turning a little after it and back to him by the time his
 * finish is held, so a replay ends on the batter and not on an empty field.
 */
export function replayCamera(stroke: ReplayStroke, t: number, times: ReplayTimes, ball: Vec | null): CameraPose {
  const a = ANGLES[stroke];
  const eye = mix(a.from, a.to, smooth(t / times.end));
  const since = t - times.contact;
  const chase = ball && since > 0 ? smooth(since / 450) * a.follow * (1 - smooth((since - 700) / 700)) : 0;
  const at = ball ? mix(a.at, [ball[0], Math.min(ball[1], a.ceiling), ball[2]], chase) : a.at;
  return { eye, at, fov: a.fov + chase * 6 };
}
