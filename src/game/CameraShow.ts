import { GAME, STYLES } from '../config/gameplay';
import { SURVIVE } from '../config/survive';
import type { CameraId } from './camera';
import { flightProgress } from './DeliveryTrajectory';
import { resolveShot } from './ShotResolver';
import type { Delivery, ShotOutcome } from './types';

/**
 * The batting cams' What's new story: one card, about ten seconds, filmed in
 * the game through the game's own cameras (`GameScene.useCamera`), so what the
 * player sees is what they would see batting under each. Storyboard D on the
 * claude.ai design canvas "Batting Cams Story", in the handover's language.
 *
 *  - **intro**: the classic view, darkened, a viewfinder frame with REC:
 *    NEW BATTING CAMS.
 *  - **close**: the Close cam, the frame round him and a tag: BAT CLOSER.
 *  - **band**: the chase card's blue band with PRO CAM sweeps across, and
 *    under it the picture cuts to his eyes.
 *  - **speed**: the sling bowler's three quick ones from Pro Cam (`SPEEDS`),
 *    left alone, each read off on a gauge: FEEL THE SPEED. Never slowed.
 *  - **where**: the pause menu itself with its Camera row lit: FIND IT IN
 *    PAUSE MENU, and GOT IT. It holds there.
 *
 * Each ball is bowled through the scene's own calls and what it comes to is
 * asked of `resolveShot`, so the leaves are the rules' leaves. Nothing is
 * scored, counted or sent.
 */
export type CamShow = 'cams';
export type CamBeat = 'intro' | 'close' | 'band' | 'speed' | 'where';

/** What the speed gun reads on the three balls, as the owner set them. */
export const SPEEDS: readonly number[] = [158, 156, 154];

/** When each beat begins, from the story's start, on the game's clock. */
export const BEATS = { close: 1300, band: 2900, cut: 3150, speed: 3500 } as const;
/** How far through his run-up each ball starts: the first from his mark, the others already running, so they come quick. */
export const RUN_FROM: readonly number[] = [0, .55, .55];
/** After a ball is past him, until the next is on its way; and after the last, until the pause menu. */
export const BETWEEN = 250;
export const WHERE_AFTER = 700;

/**
 * Just outside off at a width of its own each ball, so he leaves them and
 * they flash past. Never on the stumps: left alone, that one bowls him.
 */
const WIDTHS: readonly number[] = [.42, .34, .5];

/** A ball, released at `releaseTimeMs`, as the bowling plans build theirs: the Tests' own pace through the air. */
export function showDelivery(go: number, releaseTimeMs: number): Delivery {
  const shape = STYLES.FAST, kph = SPEEDS[go], x = WIDTHS[go];
  const durationMs = (GAME.releaseZ - GAME.contactZ) / (kph / 3.6) * 1000 * SURVIVE.travelScale * (shape.rush ?? 1);
  return {
    line: 'OUTSIDE_OFF', style: 'FAST', speedKph: kph, baseTargetX: x, finalTargetX: x,
    bounceZ: shape.bounce ?? GAME.bounceZ, rise: shape.rise ?? GAME.rise,
    durationMs, releaseTimeMs, idealContactTimeMs: releaseTimeMs + durationMs, express: true,
  };
}

/** A ball left alone, by the rules every innings is scored by. */
export const showOutcome = (delivery: Delivery): ShotOutcome => resolveShot(delivery, null, { next: () => .5 });

/** How long after release a ball reaches the crease: `flightProgress` turned round. */
function arrives(delivery: Delivery) {
  let low = 0, high = delivery.durationMs * 2;
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2;
    if (flightProgress(delivery, mid) < 1) low = mid; else high = mid;
  }
  return high;
}

/** A ball's moments, from the story's start: the run-up begins, he lets go, it is past him. */
export interface ShowBall { go: number; start: number; release: number; past: number; end: number; runFrom: number }
export interface ShowPlan { balls: readonly ShowBall[]; where: number }

export function showPlan(): ShowPlan {
  const balls: ShowBall[] = [];
  let at = BEATS.speed;
  for (let go = 0; go < SPEEDS.length; go++) {
    const runFrom = RUN_FROM[go], release = at + (1 - runFrom) * GAME.runupMs;
    const past = release + arrives(showDelivery(go, 0));
    balls.push({ go, start: at, release, past, end: past + BETWEEN, runFrom });
    at = past + BETWEEN;
  }
  return { balls, where: balls[balls.length - 1].past + WHERE_AFTER };
}

/** Which beat the story is on `t` milliseconds in. */
export function beatAt(t: number, plan = showPlan()): CamBeat {
  return t >= plan.where ? 'where' : t >= BEATS.speed ? 'speed' : t >= BEATS.band ? 'band' : t >= BEATS.close ? 'close' : 'intro';
}

/** The camera the picture is through `t` milliseconds in: cut to his eyes under the band. */
export const cameraAt = (t: number): CameraId => (t >= BEATS.cut ? 'pro' : t >= BEATS.close ? 'close' : 'classic');

/** What the show tells the card as it goes: a beat beginning, a ball let go and its speed, and where he stands for the frame round him. */
export interface ShowBeat {
  beat: CamBeat;
  /** The speed gun on the ball just let go, and which of the three. */
  kph?: number;
  go?: number;
  /** Where he stands on the screen, for the frame round him on the Close cam: CSS pixels of the canvas. */
  box?: { x: number; y: number; w: number; h: number };
}
