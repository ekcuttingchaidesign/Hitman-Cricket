import type { TimingGrade } from './types';
import type { CameraPose } from './ShotReel';

type Vec = readonly [number, number, number];

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
 * Which balls: a stroke on `REPLAY_STROKES`, timed any way but missed, that
 * went for four or six, or a batter bowled. How often (`replayDue`): every
 * one, up to `REPLAYS_PER_INNINGS`; the special strokes, bowled and a pull or
 * hook for six past that too (`always`); a player who skips two running is
 * shown only a stroke they have not had replayed yet that innings. Never over
 * anything else the ball brings — a milestone, a chase passed, a new batter,
 * the innings' last ball, bowled aside — which the
 * game says with `blocked`.
 */
export type ReplayStroke = 'cover' | 'pull' | 'cut' | 'latecut' | 'scoop' | 'reverse'
  | 'straight' | 'on' | 'flick' | 'sweep' | 'slog' | 'charge' | 'bowled' | 'punch' | 'mistimed';
/**
 * The strokes worth seeing again: the cover drive, lofted or along the
 * ground; the pull, with the hook and the pull off the spinner; the square
 * cut, at pace or off the spinner; the late cut; the two scoops; the lofted
 * straight drive (`straight`, either version) and the on drive's six (`on`);
 * the flick, version two; the orthodox sweep and the slog sweep; and the
 * charge, lofted over cover or straight. The drives along the ground down the
 * ground, the punch and the other flicks are not replayed.
 */
export const REPLAY_STROKES: readonly ReplayStroke[] = ['cover', 'pull', 'cut', 'latecut', 'scoop', 'reverse', 'straight', 'on', 'flick', 'sweep', 'slog', 'charge', 'bowled', 'punch', 'mistimed'];
/**
 * Shown every time: the meter's strokes — the scoops, the slog sweep, the
 * charge — whenever they come off, and a batter bowled, from the bowler's
 * end. No dice, no gap and no cap for these, as the owner asked.
 */
export const ALWAYS: readonly ReplayStroke[] = ['scoop', 'reverse', 'slog', 'charge', 'bowled'];
/** And a pull or a hook for six, every time (the owner's ask). */
export const always = (ball: ReplayBall) => ALWAYS.includes(ball.stroke!) || (ball.stroke === 'pull' && ball.runs === 6);
/**
 * The runs a stroke has to make to be replayed: four, and six for the lofted
 * drives, which are only ever played for it. The meter's strokes — the scoops,
 * the slog sweep, the charge — are replayed for four as well as six: shown
 * for six alone, a scoop's replay was so rare nobody saw one.
 */
export const REPLAY_RUNS: Record<ReplayStroke, number> = {
  cover: 4, pull: 4, cut: 4, latecut: 4, scoop: 4, reverse: 4, straight: 6, on: 6, flick: 4, sweep: 4, slog: 4, charge: 6, bowled: 0, punch: 4, mistimed: 4,
};

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

/**
 * Raised twice when the owner found replays too rare: from five and three,
 * one in three and an over apart, to ten and six, two in three and two balls
 * apart, and now every one that qualifies, on the next ball as well.
 */
export const REPLAYS_PER_INNINGS = { super10: 16, blast: 10 } as const;
/** Balls from one replay to the next at the least: none between them now. */
export const REPLAY_GAP = 1;
/** A stroke already replayed this innings comes round again this often: every time. */
export const REPLAY_ODDS = 1;
/** Skipped this many running, only a stroke not yet replayed is shown. */
export const SKIPS_TO_QUIET = 2;

export function qualifies(ball: ReplayBall) {
  if (ball.stroke === 'bowled') return ball.wicket;
  // Any timing: a stroke a shade mistimed that still went for four or six is worth the camera too.
  return !!ball.stroke && !ball.wicket && ball.grade !== 'MISS' && ball.runs >= REPLAY_RUNS[ball.stroke];
}

/**
 * Whether this ball is replayed. `roll` is the page's dice in [0, 1);
 * `every` (`?replay=1`) shows every ball that qualifies, for looking at it.
 */
export function replayDue(ball: ReplayBall, log: ReplayLog, opts: { cap: number; blocked: boolean; roll: number; every?: boolean }) {
  if (!qualifies(ball) || opts.blocked) return false;
  if (opts.every || always(ball)) return true;
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
/** After the bat meets the ball, at the least: his finish, and the ball on its way. */
export const AFTER_MS = 800;
/**
 * Then it cuts to the ball going away (`fieldCamera`), this long after the
 * bat met it on the game's clock — the bat through the ball — and holds where the
 * ball got to this long: the fielder's take, dive or chase, the rope, the
 * stand.
 */
export const CUT_AFTER = 260;
/**
 * Each stroke's cut, after the bat met the ball, on the game's clock: once he
 * has reached his finish and held it a beat. The square cut wraps over the
 * front shoulder three tenths of a second after the ball, and cut at 260 it
 * went before the wrap was there, which read as a stroke left unfinished; the
 * sixes down the ground and the slog sweep finish later still.
 */
export const CUT_AFTERS: Record<ReplayStroke, number> = {
  cover: CUT_AFTER, pull: 320, cut: 380, latecut: 320, scoop: 300, reverse: 300,
  straight: 380, on: 400, flick: 300, sweep: 340, slog: 420, charge: 380, bowled: Infinity, punch: 340, mistimed: CUT_AFTER,
};
export const ARRIVED_MS = 650;
/** A six is let go sooner once it is over the rope: the camera looks up after it, and there is nothing but sky to hold on. */
export const OVER_MS = 300;
/**
 * How long after the bat a six is over the rope, from how long it takes to
 * land and where it lands (`to`, from `from`): its line is laid out evenly in
 * time, so the share of the way to the rope is the share of the time.
 */
export function overRope(from: Vec, to: Vec, arrives: number) {
  const length = Math.hypot(to[0], to[2]) || 1, rope = ropeAt(to[0] / length, to[2] / length);
  const along = Math.hypot(to[0] - from[0], to[2] - from[2]) || 1, start = Math.hypot(from[0], from[2]);
  return arrives * Math.min(1, Math.max(0, (rope - start) / along));
}

/**
 * When things happen in a replay, on the game's clock from its start: the
 * ball out of the hand (before the start, so less than nought), the swing, the
 * ball resolved, the bat on it, the end.
 */
export interface ReplayTimes { release: number; swing: number; resolve: number; contact: number; end: number }
/**
 * From what was kept of the ball: how long after release he swung, it was
 * resolved and the bat met it, and how long after the bat it got where it
 * was going (`arrives`).
 */
/**
 * A batter bowled is shown from the bowler's last strides, the ball out of
 * his hand and all the way to the stumps, and held on the bails going and the
 * batter after.
 */
export const BOWLED_LEAD = 520;
export const BOWLED_AFTER = 1300;
export function replayTimes(kept: { swingAfter: number; resolveAfter: number; contactAfter: number; arrives?: number; held?: number; bowled?: boolean }): ReplayTimes {
  if (kept.bowled) {
    const release = BOWLED_LEAD, contact = release + kept.contactAfter;
    return { release, swing: release + kept.swingAfter, resolve: release + kept.resolveAfter, contact, end: contact + BOWLED_AFTER };
  }
  const release = LEAD_IN - kept.swingAfter, contact = release + kept.contactAfter;
  return { release, swing: LEAD_IN, resolve: release + kept.resolveAfter, contact, end: contact + Math.max(AFTER_MS, (kept.arrives ?? 0) + (kept.held ?? ARRIVED_MS)) };
}

/**
 * How fast the game's clock runs through a replay against the page's, at
 * `since` milliseconds from contact: full speed in, two fifths through the bat
 * meeting the ball and his follow-through, and back to full speed by the cut
 * to the ball going away.
 * Smooth both ways.
 */
export const REPLAY_SLOW = { pace: .42, inFrom: -460, inTo: -180, outFrom: 380, outTo: 700 } as const;
export function replayPace(since: number) {
  const ease = (x: number) => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };
  const into = ease((since - REPLAY_SLOW.inFrom) / (REPLAY_SLOW.inTo - REPLAY_SLOW.inFrom));
  const out = ease((since - REPLAY_SLOW.outFrom) / (REPLAY_SLOW.outTo - REPLAY_SLOW.outFrom));
  return 1 - (1 - REPLAY_SLOW.pace) * into * (1 - out);
}

// ---------------------------------------------------------------------------
// The camera
// ---------------------------------------------------------------------------

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
 * Two from the bowler's end, straight down the ground at him, for the sixes
 * down it and for a batter bowled: at the sightscreen, low, where it stands
 * on the rope, a long lens a little to leg of the line so the bowler's
 * follow-through to the off side is not in front of it; and the umpire's
 * eyes, behind the stumps at the bowler's end. The first pair, high over the
 * sightscreen and from the big screen, did not look good, the owner said.
 */
const BEHIND: readonly ReplayAngle[] = [
  { id: 'sightscreen', name: 'At the sightscreen', eye: [-1.2, 3.2, 44], at: AT, fov: 14 },
  { id: 'umpire', name: "The umpire's eyes", eye: [-.9, 1.75, 22.6], at: AT, fov: 20 },
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
  // Down the ground, from the bowler's end, as the owner asked.
  straight: ['sightscreen', 'umpire'],
  on: ['sightscreen', 'umpire'],
  charge: ['sightscreen', 'umpire', 'midoff'],
  bowled: ['umpire', 'sightscreen'],
  // Through cover off the back foot, so from the off side.
  punch: ['off-side', 'midoff', 'midoff-ground', 'spider-umpire'],
  // Any other stroke a shade mistimed that went for four or six: from above, wherever it went.
  mistimed: ['spider-umpire', 'spider-legslip', 'midoff'],
  flick: ['leg-side', 'midon-ground', 'spider-umpire'],
  sweep: ['leg-side', 'spider-legslip', 'midon-ground'],
  slog: ['leg-side', 'midon-ground', 'spider-umpire'],
};
/** Every camera there is, by its id. */
export const CAMERAS: readonly ReplayAngle[] = [...SEVEN, ...BEHIND];
export const REPLAY_ANGLES: Record<ReplayStroke, readonly ReplayAngle[]> = Object.fromEntries(
  REPLAY_STROKES.map(stroke => [stroke, STROKE_CAMERAS[stroke].map(id => CAMERAS.find(angle => angle.id === id)!)]),
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

/**
 * How far out the rope is along a line from the bat: thirty metres round a
 * point ten up the pitch (`ropeAlong` in `field.ts`, `ropeAt` in
 * `super10-field.ts`), so forty straight, twenty-eight square and twenty
 * behind. It was taken for forty straight and thirty-five square all round,
 * which put the six's camera inside the boards and the stand for a ball sent
 * square or behind — the reverse scoop's, the square drive's.
 */
export const ropeAt = (dx: number, dz: number) => {
  const c = dz / (Math.hypot(dx, dz) || 1);
  return 10 * c + Math.sqrt(100 * c * c + 800);
};
/**
 * The second camera: after the stroke, the ball going away. A camera up high
 * behind the bat on the side towards the bowler's end, looking down at the
 * ball and following it, zoomed so that a patch of ground about fourteen
 * metres high is always in the picture (`FOLLOW_FRAME`): the ball crosses it
 * against the grass, with the man who goes for it — the chase, the dive, the
 * take — and the rope ahead of it. Stood near the rope looking out, the stand
 * was behind the ball and the ball was lost in it. Past the rope a four has
 * stopped at the boards and gone, and the camera holds, wider, inside the rope;
 * a six is followed into the stand, never higher than its front rows. `to` is
 * where the ball finishes, `ball` where it is now, in the game's frame.
 */
export const FOLLOW_FRAME = 14;
export function fieldCamera(to: Vec, ball: Vec | null, six = false): CameraPose {
  const length = Math.hypot(to[0], to[2]) || 1;
  const dx = to[0] / length, dz = to[2] / length;
  const rope = ropeAt(dx, dz), r = Math.min(length, rope - .5);
  // Across the ball's line, on the side towards the bowler's end.
  let px = dz, pz = -dx;
  if (pz < 0) { px = -px; pz = -pz; }
  if (six) return sixCamera(dx, dz, px, pz, rope, ball);
  const eye: Vec = [-dx * 8 + px * 10, 14, -dz * 8 + pz * 10];
  // Held once the ball has gone: a four a little inside the rope it crossed,
  // wider, so the rope and the man who chased it are in the picture and not
  // the boards; a six on the front of the stand it landed in.
  const there: Vec = six ? [dx * (rope + 4), 4, dz * (rope + 4)] : [dx * (r - 4), .4, dz * (r - 4)];
  const inside = ball && Math.hypot(ball[0], ball[2]) < rope - .5;
  const at: Vec = inside ? [ball[0], Math.min(Math.max(ball[1], .3), 8), ball[2]] : there;
  const away = Math.hypot(at[0] - eye[0], at[1] - eye[1], at[2] - eye[2]);
  const frame = inside || six ? FOLLOW_FRAME : FOLLOW_FRAME * 1.6;
  const fov = Math.min(40, Math.max(12, 2 * Math.atan(frame / 2 / away) * 180 / Math.PI));
  return { eye, at, fov };
}

/**
 * A six's camera: down by the rope it is going over, a little off its line,
 * low, looking back up at it as it comes — so behind the ball is the sky, and
 * the stand it lands in is behind the lens. Followed into the sky until it is
 * a few strides short of the rope, then held there as it climbs out of the
 * top of the picture and over. Followed from up behind the bat, it went down
 * into the stand on a long lens and showed the crowd up close, which a crowd
 * of this detail does not stand. Not zoomed in: a picture about twenty metres
 * high where the ball is, wide when it is near.
 */
export const SIX_HOLD = 9;
function sixCamera(dx: number, dz: number, px: number, pz: number, rope: number, ball: Vec | null): CameraPose {
  const eye: Vec = [dx * (rope - 3) + px * 5, 1.3, dz * (rope - 3) + pz * 5];
  const near = rope - SIX_HOLD;
  const along = ball ? ball[0] * dx + ball[2] * dz : near;
  const at: Vec = !ball ? [dx * near, 8, dz * near]
    : along < near ? [ball[0], Math.max(ball[1], 1), ball[2]] : [dx * near, Math.max(ball[1], 1), dz * near];
  const away = Math.hypot(at[0] - eye[0], at[1] - eye[1], at[2] - eye[2]);
  const fov = Math.min(55, Math.max(24, 2 * Math.atan(22 / 2 / away) * 180 / Math.PI));
  return { eye, at, fov };
}
