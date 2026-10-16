import { GAME, LINE_X, STYLES } from '../config/gameplay';
import { HOOK_CONTACT_MS, HOOK_MEETS_AT, LATE_CUT_CONTACT_MS, LATE_CUT_MEETS_AT } from '../entities/Batter';
import { flightProgress } from './DeliveryTrajectory';
import { resolveShot } from './ShotResolver';
import type { Delivery, ShotOutcome, ShotType } from './types';

/**
 * A new stroke, filmed: the What's new story for the hook and the late cut.
 *
 * It is the game, not a picture of it. The ground the innings is played on,
 * the player's own batter in their own kit and hand, the bowler running in and
 * the ball bowled through the scene's own calls — `reset`, `runup`,
 * `delivery`, `swing`, `hit`, `result` — at the ball the stroke answers, played
 * perfectly in time. What it comes to is asked of `resolveShot`, the rules
 * every innings is scored by, so the six and the four are the game's answers
 * and not a script's. Only the camera and the clock are the film's own: a
 * camera that cuts in to the stroke and follows the ball away, and the clock
 * slowed through the moment the bat meets it.
 */
export type ReelShot = 'hook' | 'latecut';
/** What the film tells the card as it goes: the swipe as the bat starts down, the ball met, a go beginning again. */
export type ReelBeat = 'swipe' | 'hit' | 'again';

interface Reel {
  shot: ShotType;
  /** The ball: the bouncer outside off the hook answers, or the pace bowler's ball going past off stump. */
  style: 'SHORT' | 'NORMAL';
  kph: number;
  /** How far down the pitch the stroke meets it, ahead of the crease (`Game.shoot`'s `meetsAt`). */
  ahead: number;
  /** From the swing to the ball, the stroke's own. */
  contactMs: number;
}

const REELS: Record<ReelShot, Reel> = {
  hook: { shot: 'HOOK', style: 'SHORT', kph: 142, ahead: HOOK_MEETS_AT, contactMs: HOOK_CONTACT_MS },
  latecut: { shot: 'LATE_CUT', style: 'NORMAL', kph: 134, ahead: LATE_CUT_MEETS_AT, contactMs: LATE_CUT_CONTACT_MS },
};

export const reelStroke = (shot: ReelShot) => REELS[shot].shot;

/** The ball the stroke answers, released at `releaseTimeMs`, built as the bowling plans build theirs. */
export function reelDelivery(shot: ReelShot, releaseTimeMs: number): Delivery {
  const { style, kph } = REELS[shot], shape = STYLES[style];
  const durationMs = (GAME.releaseZ - GAME.contactZ) / (kph / 3.6) * 1000 * GAME.travelScale * (shape.rush ?? 1);
  return {
    line: 'OUTSIDE_OFF', style, speedKph: kph, baseTargetX: LINE_X.OUTSIDE_OFF, finalTargetX: LINE_X.OUTSIDE_OFF,
    bounceZ: shape.bounce ?? GAME.bounceZ, rise: shape.rise ?? GAME.rise,
    durationMs, releaseTimeMs, idealContactTimeMs: releaseTimeMs + durationMs,
  };
}

/** How far along its flight the stroke meets the ball, as `Game.shoot` works it out. */
export const reelMeets = (shot: ReelShot) => 1 - REELS[shot].ahead / (GAME.releaseZ - GAME.contactZ);

/** How long after release the ball reaches where the stroke meets it: `flightProgress` turned round. */
export function reelContactAfterRelease(shot: ReelShot, delivery: Delivery) {
  const meets = reelMeets(shot);
  let low = 0, high = delivery.durationMs * 2;
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2;
    if (flightProgress(delivery, mid) < meets) low = mid; else high = mid;
  }
  return high;
}

/** The stroke played perfectly in time, judged by the rules every innings is: the hook goes for six, the late cut for four. */
export function reelOutcome(shot: ReelShot, delivery: Delivery): ShotOutcome {
  return resolveShot(delivery, { shotType: REELS[shot].shot, inputTimeMs: delivery.idealContactTimeMs }, { next: () => .5 });
}

/** When things happen in a go of the reel, on its own (slowed) clock, from the go's start. */
export interface ReelTimes {
  /** The bowler sets off. */
  runup: number;
  release: number;
  /** He starts the stroke, which is when the swipe is drawn. */
  swing: number;
  /** Bat on ball. */
  contact: number;
}

/** Standing at his mark, the camera settling, before he sets off. */
const LEAD_MS = 500;

export function reelTimes(shot: ReelShot): ReelTimes {
  const delivery = reelDelivery(shot, 0);
  const release = LEAD_MS + GAME.runupMs, contact = release + reelContactAfterRelease(shot, delivery);
  return { runup: LEAD_MS, release, swing: contact - REELS[shot].contactMs, contact };
}

/**
 * How fast the reel's clock runs against the page's at `since` milliseconds of
 * it from contact: full speed in, a third through the bat meeting the ball,
 * and full speed again as it goes away. Smooth both ways, so nothing lurches.
 */
export const SLOW = { pace: .32, inFrom: -420, inTo: -200, outFrom: 380, outTo: 760 } as const;
export function reelPace(since: number) {
  const ease = (x: number) => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };
  const into = ease((since - SLOW.inFrom) / (SLOW.inTo - SLOW.inFrom));
  const out = ease((since - SLOW.outFrom) / (SLOW.outTo - SLOW.outFrom));
  return 1 - (1 - SLOW.pace) * into * (1 - out);
}

/** After the ball is met, how long the go runs on: the ball away to the rope, the stands up, a beat after. */
export const AFTER_MS = 2300;

/** One go of the reel, start to start, on its own clock. */
export function reelLength(shot: ReelShot) { return reelTimes(shot).contact + AFTER_MS; }

/** And on the page's: what the story holds for. */
export function reelSeconds(shot: ReelShot) {
  let real = 0;
  const { contact } = reelTimes(shot), length = reelLength(shot);
  for (let t = 0; t < length; t += 4) real += 4 / reelPace(t - contact);
  return real;
}

/** A camera, in the game's frame: +x the off side, +z towards the bowler; `fov` up and down, in degrees. */
export interface CameraPose { eye: readonly [number, number, number]; at: readonly [number, number, number]; fov: number }

type Vec = readonly [number, number, number];
const mix = (a: Vec, b: Vec, k: number): Vec => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const smooth = (x: number) => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };

/**
 * The film's camera. First the game's own view from behind him, pushing in as
 * the bowler runs; then, a beat before he plays, a cut to the stroke — in
 * front of him on the off side and a little above for the hook, so he faces
 * it and the ball goes away over his shoulder, and low at gully for the late
 * cut, so he goes down to it and the ball comes off the open face and past the
 * lens to third man — the camera turning to follow the ball once it is
 * struck, at the height of the stands rather than up into the sky after it.
 * `ball` is where the ball is now, or was last drawn, in the same frame.
 */
const CUT_BEFORE = 520;
/** As high as the camera looks after a struck ball: the top of the stands, not the sky over them. */
const STANDS = 3.2;
/** When the camera comes back to him after the ball, from contact, and over how long. */
const BACK = { from: 1450, over: 750 } as const;
const SHOTS: Record<ReelShot, { eye: Vec; at: Vec; drift: Vec; fov: number; follow: number }> = {
  hook: { eye: [5.2, 2.0, 4.4], at: [-.2, 1.05, 1.2], drift: [-.4, .35, -.7], fov: 38, follow: .72 },
  latecut: { eye: [2.7, 1.05, -2.5], at: [-.15, .6, 1.1], drift: [.35, .2, -.3], fov: 40, follow: .55 },
};
export function reelCamera(shot: ReelShot, t: number, ball: Vec | null): CameraPose {
  const { contact } = reelTimes(shot);
  if (t < contact - CUT_BEFORE) {
    const k = smooth(t / (contact - CUT_BEFORE));
    return { eye: mix([.15, 2.7, -5.4], [.05, 2.1, -3.9], k), at: mix([-.1, 1.0, 9], [-.15, 1.0, 6], k), fov: 44 };
  }
  const s = SHOTS[shot], since = t - (contact - CUT_BEFORE);
  // Drifting slowly round him through the stroke, and up a little as the ball goes.
  const drift = smooth(since / (CUT_BEFORE + AFTER_MS));
  const eye = mix(s.eye, [s.eye[0] + s.drift[0], s.eye[1] + s.drift[1], s.eye[2] + s.drift[2]], drift);
  // Turning after the ball once it is on its way, never all the way: he stays
  // in the picture as long as he can. And back to him as it reaches the rope,
  // holding his finish, so a go ends on the batter and not on an empty field.
  const chase = ball && t > contact ? smooth((t - contact) / 650) * s.follow * (1 - smooth((t - contact - BACK.from) / BACK.over)) : 0;
  const at = ball ? mix(s.at, [ball[0], Math.min(ball[1], STANDS), ball[2]], chase) : s.at;
  return { eye, at, fov: s.fov + chase * 8 };
}
