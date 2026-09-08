import type { BallLine, DeliveryStyle, ShotType, TimingGrade } from '../game/types';
export const GAME = {
  totalBalls: 30, maxWickets: 3, ballsPerOver: 6, comboMs: 100,
  swipeDistance: 24,
  contactZ: 1.30, releaseZ: 18, bounceZ: 8.3, stumpZone: 0.18, stumpHeight: 0.76,
  // Where the batter stands: side of the stumps, and back down the crease. The
  // popping crease is 1.2m in front of the wicket, and a batter stands inside it
  // rather than over the stumps, so the ball is met about a metre in front of
  // them and there is daylight between his back foot and the bails.
  stanceX: -0.36, stanceZ: 1.00, creaseZ: 1.20,
  // Arcade time scaling gives the player time to read a 3D ball on a small
  // screen. It carries the shorter flight the deeper crease leaves, so every
  // delivery keeps the duration it was tuned to.
  travelScale: 1.79, readyMs: 550, runupMs: 900, resultMs: 1050, hitAnimationMs: 1250,
  timing: { perfect: 40, good: 78, ok: 135, poor: 205 }, fastTimingScale: 0.82,
  // How steeply a normal ball climbs off the pitch; specials override it.
  rise: 1.25,
  lbwChance: 0.6, aerialFlightMs: 1900, mishitCaught: 0.75,
  movement: 0.13, boundaryRadius: 30,
} as const;
export const LINES: BallLine[] = ['OUTSIDE_LEG', 'LEG', 'MIDDLE', 'OFF', 'OUTSIDE_OFF'];
export const SHOTS: ShotType[] = ['LEG', 'LONG_ON', 'STRAIGHT', 'COVER_LONG_OFF', 'OFF'];
export const LINE_X: Record<BallLine, number> = { OUTSIDE_LEG: -0.42, LEG: -0.14, MIDDLE: 0, OFF: 0.14, OUTSIDE_OFF: 0.42 };
// `rush` shortens the flight beyond what the speed alone buys and `tight`
// squeezes the timing windows, so a quick ball is a jolt rather than a number.
// `bounce` and `rise` set the length: a yorker pitches at the toes and skids,
// a bouncer lands short and rears. Zero-weight styles are only ever bowled as
// specials, by the state of the innings.
export const STYLES: Record<DeliveryStyle, { weight: number; min: number; max: number; label: string; rush?: number; tight?: boolean; bounce?: number; rise?: number }> = {
  NORMAL: { weight: 0.30, min: 115, max: 130, label: 'SEAM' },
  FAST: { weight: 0.18, min: 132, max: 150, label: 'FAST', rush: 0.80, tight: true },
  EXPRESS: { weight: 0.09, min: 148, max: 162, label: 'EXPRESS', rush: 0.62, tight: true },
  SLOWER: { weight: 0.10, min: 78, max: 98, label: 'SLOWER BALL', rush: 1.15 },
  SWING_IN: { weight: 0.11, min: 110, max: 135, label: 'INSWINGER' },
  SWING_OUT: { weight: 0.10, min: 110, max: 135, label: 'OUTSWINGER' },
  OFF_SPIN: { weight: 0.06, min: 72, max: 92, label: 'OFF SPIN' },
  LEG_SPIN: { weight: 0.06, min: 72, max: 92, label: 'LEG SPIN' },
  YORKER: { weight: 0, min: 148, max: 158, label: 'YORKER', rush: 0.64, tight: true, bounce: 1.6, rise: 0.28 },
  SHORT: { weight: 0, min: 118, max: 134, label: 'BOUNCER', rush: 0.95, bounce: 10.4, rise: 2.9 },
};
// The bowler answers being hit, and mixes his pace up when he has been quick.
export const SPECIALS = { sixesForYorker: 3, quickForSlower: 4, shortChance: 0.13 };
export const QUICK_STYLES: readonly DeliveryStyle[] = ['FAST', 'EXPRESS', 'YORKER'];
export const COMPATIBILITY: Record<BallLine, Record<ShotType, number>> = {
  OUTSIDE_LEG: { LEG: 1, LONG_ON: 0.9, STRAIGHT: 0.3, COVER_LONG_OFF: 0.1, OFF: 0 },
  LEG: { LEG: 1, LONG_ON: 1, STRAIGHT: 0.65, COVER_LONG_OFF: 0.25, OFF: 0.1 },
  MIDDLE: { LEG: 0.55, LONG_ON: 0.85, STRAIGHT: 1, COVER_LONG_OFF: 0.85, OFF: 0.55 },
  OFF: { LEG: 0.1, LONG_ON: 0.25, STRAIGHT: 0.65, COVER_LONG_OFF: 1, OFF: 1 },
  OUTSIDE_OFF: { LEG: 0, LONG_ON: 0.1, STRAIGHT: 0.3, COVER_LONG_OFF: 0.9, OFF: 1 },
};
export const TIMING_SCORE: Record<TimingGrade, number> = { PERFECT: 1, GOOD: 0.82, OK: 0.58, POOR: 0.25, MISS: 0 };
// A shot at least this compatible with the line counts as middled; below it the
// batter is reaching, and the ball goes up off the edge.
export const SOLID_SHOT = 0.55;
// Middled, the timing grade alone names the shot: perfect is six, good is four,
// and ok keeps it along the ground for these.
export const GROUND_RUNS = [[1, 0.45], [2, 0.35], [3, 0.20]] as const;
export const SHOT_ANGLES: Record<ShotType, number> = { LEG: -52, LONG_ON: -24, STRAIGHT: 0, COVER_LONG_OFF: 24, OFF: 52 };
