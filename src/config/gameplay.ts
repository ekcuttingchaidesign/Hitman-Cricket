import type { BallLine, DeliveryStyle, ShotType, TimingGrade } from '../game/types';
export const GAME = {
  totalBalls: 30, maxWickets: 3, ballsPerOver: 6, comboMs: 100,
  contactZ: 0.65, releaseZ: 18, bounceZ: 8.3, stumpZone: 0.18, stumpHeight: 0.76,
  // Arcade time scaling gives the player time to read a 3D ball on a small screen.
  travelScale: 2.05, readyMs: 550, runupMs: 900, resultMs: 1050, hitAnimationMs: 1250,
  timing: { perfect: 90, good: 170, ok: 260, poor: 360 }, fastTimingScale: 0.9,
  catchChance: { OK: 0.2, POOR: 0.55 }, lbwChance: 0.6,
  movement: 0.13, boundaryRadius: 30,
} as const;
export const LINES: BallLine[] = ['OUTSIDE_LEG', 'LEG', 'MIDDLE', 'OFF', 'OUTSIDE_OFF'];
export const SHOTS: ShotType[] = ['LEG', 'LONG_ON', 'STRAIGHT', 'COVER_LONG_OFF', 'OFF'];
export const LINE_X: Record<BallLine, number> = { OUTSIDE_LEG: -0.42, LEG: -0.14, MIDDLE: 0, OFF: 0.14, OUTSIDE_OFF: 0.42 };
export const STYLES: Record<DeliveryStyle, { weight: number; min: number; max: number; label: string }> = {
  NORMAL: { weight: 0.3, min: 115, max: 130, label: 'SEAM' },
  FAST: { weight: 0.18, min: 132, max: 150, label: 'FAST' },
  SLOWER: { weight: 0.14, min: 85, max: 110, label: 'SLOWER BALL' },
  SWING_IN: { weight: 0.12, min: 110, max: 135, label: 'INSWINGER' },
  SWING_OUT: { weight: 0.1, min: 110, max: 135, label: 'OUTSWINGER' },
  OFF_SPIN: { weight: 0.08, min: 72, max: 92, label: 'OFF SPIN' },
  LEG_SPIN: { weight: 0.08, min: 72, max: 92, label: 'LEG SPIN' },
};
export const COMPATIBILITY: Record<BallLine, Record<ShotType, number>> = {
  OUTSIDE_LEG: { LEG: 1, LONG_ON: 0.9, STRAIGHT: 0.3, COVER_LONG_OFF: 0.1, OFF: 0 },
  LEG: { LEG: 1, LONG_ON: 1, STRAIGHT: 0.65, COVER_LONG_OFF: 0.25, OFF: 0.1 },
  MIDDLE: { LEG: 0.55, LONG_ON: 0.85, STRAIGHT: 1, COVER_LONG_OFF: 0.85, OFF: 0.55 },
  OFF: { LEG: 0.1, LONG_ON: 0.25, STRAIGHT: 0.65, COVER_LONG_OFF: 1, OFF: 1 },
  OUTSIDE_OFF: { LEG: 0, LONG_ON: 0.1, STRAIGHT: 0.3, COVER_LONG_OFF: 0.9, OFF: 1 },
};
export const TIMING_SCORE: Record<TimingGrade, number> = { PERFECT: 1, GOOD: 0.82, OK: 0.58, POOR: 0.25, MISS: 0 };
export const RUN_BANDS = [
  { min: 0.88, outcomes: [[6, 0.35], [4, 0.65]] },
  { min: 0.72, outcomes: [[4, 0.45], [3, 0.15], [2, 0.4]] },
  { min: 0.55, outcomes: [[2, 0.4], [1, 0.45], [0, 0.15]] },
  { min: 0.35, outcomes: [[1, 0.35], [0, 0.65]] },
] as const;
export const SHOT_ANGLES: Record<ShotType, number> = { LEG: -52, LONG_ON: -24, STRAIGHT: 0, COVER_LONG_OFF: 24, OFF: 52 };
