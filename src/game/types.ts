export type BallLine = 'OUTSIDE_LEG' | 'LEG' | 'MIDDLE' | 'OFF' | 'OUTSIDE_OFF';
export type DeliveryStyle = 'NORMAL' | 'FAST' | 'SLOWER' | 'SWING_IN' | 'SWING_OUT' | 'OFF_SPIN' | 'LEG_SPIN';
export type ShotType = 'LEG' | 'LONG_ON' | 'STRAIGHT' | 'COVER_LONG_OFF' | 'OFF';
export type TimingGrade = 'PERFECT' | 'GOOD' | 'OK' | 'POOR' | 'MISS';
export type WicketType = 'BOWLED' | 'LBW' | 'CAUGHT';
export type GamePhase = 'START' | 'READY' | 'BOWLER_RUNUP' | 'BALL_IN_FLIGHT' | 'SHOT_RESOLVE' | 'RESULT' | 'INNINGS_END' | 'PAUSED';
export interface Delivery {
  line: BallLine; style: DeliveryStyle; speedKph: number;
  baseTargetX: number; finalTargetX: number; bounceZ: number;
  durationMs: number; releaseTimeMs: number; idealContactTimeMs: number;
}
export interface ShotAttempt { shotType: ShotType; inputTimeMs: number }
export interface ShotOutcome {
  runs: 0 | 1 | 2 | 3 | 4 | 6; isWicket: boolean; wicketType?: WicketType;
  quality: number; feedback: string; timingGrade: TimingGrade;
  timingDeltaMs: number | null; compatibility: number; madeBatContact: boolean;
}
