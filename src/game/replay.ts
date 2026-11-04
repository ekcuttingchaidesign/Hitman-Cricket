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
export type ReplayStroke = 'cover' | 'pull' | 'cut' | 'latecut' | 'scoop' | 'reverse';
/**
 * The strokes worth seeing again: the cover drive; the pull, with the hook and
 * the pull off the spinner; the square cut, at pace or off the spinner; the
 * late cut; and the two scoops. The charge, the drives down the ground, the
 * flick and the sweeps are not replayed.
 */
export const REPLAY_STROKES: readonly ReplayStroke[] = ['cover', 'pull', 'cut', 'latecut', 'scoop', 'reverse'];
/**
 * The runs a stroke has to make to be replayed: four, but six for the scoops,
 * which have had the special stroke's flash live already.
 */
export const REPLAY_RUNS: Record<ReplayStroke, number> = { cover: 4, pull: 4, cut: 4, latecut: 4, scoop: 6, reverse: 6 };

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
  return !!ball.stroke && !ball.wicket && ball.runs >= REPLAY_RUNS[ball.stroke] && (ball.grade === 'PERFECT' || ball.grade === 'GOOD');
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
/**
 * It opens on the stroke: this long before he starts the swing, with the
 * bowler already in his follow-through and the ball out of sight until the bat
 * meets it. Picked up in the run-up, the ball came in slowed to the replay's
 * pace and hung in front of him before the bat came down, which looked wrong.
 */
export const LEAD_IN = 160;
/** After the bat meets the ball: the ball away and his finish held, and out on it, before he is home in his guard. */
export const AFTER_MS = 800;

/**
 * When things happen in a replay, on the game's clock from its start: the
 * ball out of the hand (before the start, so less than nought), the swing, the
 * ball resolved, the bat on it, the end.
 */
export interface ReplayTimes { release: number; swing: number; resolve: number; contact: number; end: number }
/** From what was kept of the ball: how long after release he swung, it was resolved and the bat met it. */
export function replayTimes(kept: { swingAfter: number; resolveAfter: number; contactAfter: number }): ReplayTimes {
  const release = LEAD_IN - kept.swingAfter;
  return { release, swing: LEAD_IN, resolve: release + kept.resolveAfter, contact: release + kept.contactAfter, end: release + kept.contactAfter + AFTER_MS };
}

/**
 * How fast the game's clock runs through a replay against the page's, at
 * `since` milliseconds from contact: full speed in, two fifths through the bat
 * meeting the ball, his follow-through and the finish held, and full speed
 * again for the wipe out.
 * Smooth both ways.
 */
export const REPLAY_SLOW = { pace: .42, inFrom: -460, inTo: -180, outFrom: 900, outTo: 1400 } as const;
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

/** One camera a replay can be shown from, held still for the whole of it. */
export interface ReplayAngle { id: string; name: string; eye: Vec; at: Vec; fov: number }

/**
 * Each stroke's cameras, in the game's frame (+x the off side, +z towards the
 * bowler), for a right-hander; the scene mirrors them for a left-hander.
 *
 * The cover drive's seven were set by the owner in the replay camera lab
 * (`replay-camera.html`), all looking at him where his stride takes him, all
 * well back: the batter fills a sixth or so of the picture, where a model of
 * this detail reads well (the first build crept in from in front on the off
 * side until he filled two thirds of it, and showed him up). Mid-off and the
 * two at ground level are long lenses from near the rope, a broadcast's; the
 * spider cams look down from over the umpire and over leg slip; the two
 * square ones are side on from either side. None turns after the ball.
 */
const AT: Vec = [-.2, .85, 1.6];
const SEVEN: readonly ReplayAngle[] = [
  { id: 'midoff', name: 'Mid-off', eye: [3.89, 2.30, 21.88], at: AT, fov: 40 },
  { id: 'spider-umpire', name: 'Spider cam over the umpire', eye: [.21, 5.28, 23.51], at: AT, fov: 40 },
  { id: 'spider-legslip', name: 'Spider cam over leg slip', eye: [-8.98, 8.14, -9.39], at: AT, fov: 40 },
  { id: 'leg-side', name: 'Leg side', eye: [-20.58, 3.91, -.18], at: AT, fov: 40 },
  { id: 'off-side', name: 'Off side', eye: [20.38, 2.83, 1.6], at: AT, fov: 40 },
  { id: 'midon-ground', name: 'Mid-on, at ground level', eye: [-1.12, .51, 28.41], at: AT, fov: 26 },
  { id: 'midoff-ground', name: 'Mid-off, at ground level', eye: [2.5, .39, 28.28], at: AT, fov: 26 },
];
/**
 * Which of the seven each stroke is shown from: a camera on the side the ball
 * goes, or in front of him, never one that sees his back while the ball goes
 * away from it (the square cut from the leg side, the owner said, does not
 * look good). The cover drive keeps all seven, as the owner chose them; the
 * rest are a first cut, set again in the lab (`replay-camera.html`, Shown
 * for this stroke). Every stroke has two at least, so `pickAngle` can always
 * show another than the last.
 */
export const STROKE_CAMERAS: Record<ReplayStroke, readonly string[]> = {
  cover: ['midoff', 'spider-umpire', 'spider-legslip', 'leg-side', 'off-side', 'midon-ground', 'midoff-ground'],
  pull: ['leg-side', 'midon-ground', 'spider-umpire', 'spider-legslip'],
  cut: ['off-side', 'midoff', 'midoff-ground', 'spider-umpire'],
  latecut: ['off-side', 'spider-legslip', 'midoff'],
  scoop: ['spider-legslip', 'leg-side', 'spider-umpire'],
  reverse: ['off-side', 'spider-legslip', 'midoff'],
};
/** Every camera there is, by its id. */
export const CAMERAS: readonly ReplayAngle[] = SEVEN;
export const REPLAY_ANGLES: Record<ReplayStroke, readonly ReplayAngle[]> = Object.fromEntries(
  REPLAY_STROKES.map(stroke => [stroke, STROKE_CAMERAS[stroke].map(id => SEVEN.find(angle => angle.id === id)!)]),
) as unknown as Record<ReplayStroke, readonly ReplayAngle[]>;

/**
 * Which camera a replay is shown from: any of the stroke's but the one the
 * last replay of it used, off `roll` in [0, 1) — the page's dice, never the
 * seed. `asked` (`?replayangle=`) names one, for looking at it.
 */
export function pickAngle(stroke: ReplayStroke, last: string | null, roll: number, asked: string | null = null): ReplayAngle {
  const all = REPLAY_ANGLES[stroke];
  const named = asked ? all.find(angle => angle.id === asked) : undefined;
  if (named) return named;
  const left = all.length > 1 ? all.filter(angle => angle.id !== last) : all;
  return left[Math.min(left.length - 1, Math.floor(roll * left.length))];
}

/** The replay's camera: the angle, held. */
export const replayCamera = (angle: ReplayAngle): CameraPose => ({ eye: angle.eye, at: angle.at, fov: angle.fov });
