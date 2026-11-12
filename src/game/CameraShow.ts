import { GAME, LINE_X, STYLES } from '../config/gameplay';
import { SURVIVE } from '../config/survive';
import { STROKE_CONTACT_MS } from '../entities/Batter';
import type { CameraId } from './camera';
import { flightProgress } from './DeliveryTrajectory';
import { resolveShot } from './ShotResolver';
import type { BallLine, Delivery, ShotOutcome } from './types';

/**
 * The cameras' What's new stories, filmed in the game through the game's own
 * cameras (`GameScene.useCamera`), not a film's: what the player sees under
 * the card is exactly what they would see batting under each.
 *
 *  - **views**: the same ball and the same six three times over, once through
 *    each camera on the Camera row (`VIEWS`), its name slammed in as it plays.
 *  - **speed**: Pro Cam's, FEEL THE BALL SPEED. A Test match by day, the
 *    express bowler's quick ones on and just outside off, left alone from the
 *    batter's own eyes, so the ball comes at the lens and is gone past him
 *    into the keeper's gloves; the speed gun's figure on each. Played at full
 *    speed and never slowed: the speed is the point.
 *
 * Like the stroke stories (`ShotReel.ts`), the ball is bowled through the
 * scene's own calls and what it comes to is asked of `resolveShot`, so the six
 * is the rules' six. Nothing is scored, counted or sent.
 */
export type CamShow = 'views' | 'speed';

/** The cameras the views story plays through, in order: the Camera row's. */
export const VIEWS: readonly CameraId[] = ['classic', 'close', 'pro'];
/** The speed gun on each of the speed story's balls, in order, then round again. */
export const SPEEDS: readonly number[] = [152, 148, 156, 151];

interface Show {
  /** Standing at his mark, before he sets off. */
  lead: number;
  /** After the ball is met or goes past him: the ball away and a beat after. */
  after: number;
  goes: number;
}
const SHOWS: Record<CamShow, Show> = {
  views: { lead: 350, after: 2100, goes: VIEWS.length },
  // Quick, ball after ball: the gun barely off before the next is on its way.
  speed: { lead: 250, after: 650, goes: SPEEDS.length },
};

/** How many balls make one round of the story. */
export const goesOf = (show: CamShow) => SHOWS[show].goes;
/** The camera a go is watched through. */
export const cameraOf = (show: CamShow, go: number): CameraId => (show === 'views' ? VIEWS[go % VIEWS.length] : 'pro');
/** The figure on the speed gun for a go of the speed story. */
export const speedOf = (go: number) => SPEEDS[go % SPEEDS.length];
/** Every speed ball is the express bowler's: the Test match's quickest man, with his own action. */
export const expressIn = (show: CamShow) => show === 'speed';

/** The views story's ball: a stock ball pitched up on middle, the one the straight six answers. */
const VIEW_BALL = { line: 'MIDDLE' as BallLine, style: 'NORMAL' as const, kph: 132, travel: GAME.travelScale };
/**
 * The speed story's: fast, just outside off at a width of its own each ball,
 * at the Tests' own pace through the air. Never on the stumps: left alone,
 * that one bowls him.
 */
const SPEED_WIDTHS: readonly number[] = [.42, .3, .5, .34];

/** A go's ball, released at `releaseTimeMs`, built as the bowling plans build theirs. */
export function showDelivery(show: CamShow, go: number, releaseTimeMs: number): Delivery {
  const fast = show === 'speed';
  const style = fast ? 'FAST' : VIEW_BALL.style, shape = STYLES[style];
  const kph = fast ? speedOf(go) : VIEW_BALL.kph;
  const line: BallLine = fast ? 'OUTSIDE_OFF' : VIEW_BALL.line;
  const x = fast ? SPEED_WIDTHS[go % SPEED_WIDTHS.length] : LINE_X[line];
  const travel = fast ? SURVIVE.travelScale : VIEW_BALL.travel;
  const durationMs = (GAME.releaseZ - GAME.contactZ) / (kph / 3.6) * 1000 * travel * (shape.rush ?? 1);
  return {
    line, style, speedKph: kph, baseTargetX: x, finalTargetX: x,
    bounceZ: shape.bounce ?? GAME.bounceZ, rise: shape.rise ?? GAME.rise,
    durationMs, releaseTimeMs, idealContactTimeMs: releaseTimeMs + durationMs,
    express: fast || undefined,
  };
}

/** The straight drive meets the ball at the crease, as `Game.shoot` has it for a drive down the ground. */
export const SHOW_MEETS = 1;

/**
 * What a go comes to, by the rules every innings is scored by: the views
 * story's ball driven perfectly in time, lofted, a six; the speed story's
 * left alone.
 */
export function showOutcome(show: CamShow, delivery: Delivery): ShotOutcome {
  if (show === 'speed') return resolveShot(delivery, null, { next: () => .5 });
  return resolveShot(delivery, { shotType: 'STRAIGHT', inputTimeMs: delivery.idealContactTimeMs }, { next: () => .5 });
}

/** When things happen in a go, on its own clock, from the go's start. */
export interface ShowTimes {
  runup: number;
  release: number;
  /** He starts the stroke (the views story only). */
  swing: number;
  /** Bat on ball, or the ball past him. */
  contact: number;
  /** The go is over and the next begins. */
  length: number;
}

/** How long after release the ball reaches the crease: `flightProgress` turned round. */
function arrives(delivery: Delivery) {
  let low = 0, high = delivery.durationMs * 2;
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2;
    if (flightProgress(delivery, mid) < SHOW_MEETS) low = mid; else high = mid;
  }
  return high;
}

export function showTimes(show: CamShow, go: number): ShowTimes {
  const { lead, after } = SHOWS[show];
  const release = lead + GAME.runupMs, contact = release + arrives(showDelivery(show, go, 0));
  return { runup: lead, release, swing: contact - STROKE_CONTACT_MS, contact, length: contact + after };
}

/**
 * How fast the go's clock runs against the page's, `since` milliseconds from
 * contact: the views story slows through the bat meeting the ball, as the
 * stroke stories do, so each camera's picture of the six is seen; the speed
 * story never slows.
 */
export function showPace(show: CamShow, since: number) {
  if (show === 'speed') return 1;
  const ease = (x: number) => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };
  const into = ease((since + 380) / 200), out = ease((since - 420) / 360);
  return 1 - (1 - .4) * into * (1 - out);
}

/** One round of the story on the page's clock: what the card holds for before it moves on. */
export function showSeconds(show: CamShow) {
  let real = 0;
  for (let go = 0; go < goesOf(show); go++) {
    const { contact, length } = showTimes(show, go);
    for (let t = 0; t < length; t += 4) real += 4 / showPace(show, t - contact);
  }
  return real;
}

/** What the show tells the card as it goes: a ball beginning, through which camera and at what speed, and the ball met or gone past. */
export interface ShowBeat { go: number; camera: CameraId; kph: number | null; hit: boolean }
