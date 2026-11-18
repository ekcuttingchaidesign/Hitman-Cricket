/**
 * Super Knockout's free hit ball (the owner's word, 18 November 2026): not the
 * first ball of the over after a cut but one drawn off the room's seed, the
 * second to the sixth, and never an easy one — a hard ball for whoever is
 * bowling that over: the seamer's yorker, bouncer, slower ball, a full one or
 * a swinging one; the spinner's ball tossed up or his arm ball; the swing
 * bowler's swinging ones and his yorker; the sling bowler's yorker, bouncer
 * and slower ball. The room reads it to know which ball is free
 * (`KnockoutRoom`), and the bowling plan to bowl it (`knockoutPlan`), so every
 * seat faces the same ball. Pure: nothing here reads the page or the clock.
 */
import { SeededRandom } from './SeededRandom';
import type { DeliveryStyle } from './types';

/** The free hit ball of an over: which ball (0 to 5, never 0), what it is, and its name on the call. */
export interface HardBall { ball: number; style: DeliveryStyle; full?: boolean; name: string }

type Kind = Omit<HardBall, 'ball'>;
const SEAMER: Kind[] = [
  { style: 'YORKER', name: 'YORKER' }, { style: 'SHORT', name: 'BOUNCER' }, { style: 'SLOWER', name: 'SLOWER BALL' },
  { style: 'NORMAL', full: true, name: 'FULL ONE' }, { style: 'SWING_IN', name: 'INSWINGER' }, { style: 'SWING_OUT', name: 'OUTSWINGER' },
];
const SPINNER: Kind[] = [{ style: 'OFF_SPIN', name: 'TOSSED UP' }, { style: 'LEG_SPIN', name: 'TOSSED UP' }, { style: 'ARM_BALL', name: 'ARM BALL' }];
const SWINGER: Kind[] = [{ style: 'SWING_IN', name: 'INSWINGER' }, { style: 'SWING_OUT', name: 'OUTSWINGER' }, { style: 'YORKER', name: 'YORKER' }];
const SLINGER: Kind[] = [{ style: 'YORKER', name: 'YORKER' }, { style: 'SHORT', name: 'BOUNCER' }, { style: 'SLOWER', name: 'SLOWER BALL' }];

/** Whether the fourth over is the swing bowler's rather than the sling bowler's: the room's coin, as `knockoutPlan` takes it. */
export function swingFourthOf(seed: number): boolean { return new SeededRandom((seed ^ 0x4b4f4e4b) >>> 0).next() < 0.5; }

/**
 * Over `over`'s free hit ball (0-based: the second, third and fourth overs,
 * those that follow a cut and come before the final), or null for an over
 * that has none.
 */
export function freeHitBall(seed: number, over: number): HardBall | null {
  if (over < 1 || over > 3) return null;
  const rng = new SeededRandom(((seed ^ 0x46484954) + Math.imul(over, 0x9E3779B1)) >>> 0);
  const ball = 1 + Math.floor(rng.next() * 5);
  const pool = over === 1 ? SEAMER : over === 2 ? SPINNER : swingFourthOf(seed) ? SWINGER : SLINGER;
  return { ball, ...pool[Math.floor(rng.next() * pool.length)] };
}
