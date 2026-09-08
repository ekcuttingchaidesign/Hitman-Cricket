export type BallLine = 'OUTSIDE_LEG' | 'LEG' | 'MIDDLE' | 'OFF' | 'OUTSIDE_OFF';
export type DeliveryStyle = 'NORMAL' | 'FAST' | 'EXPRESS' | 'YORKER' | 'SHORT' | 'SLOWER' | 'SWING_IN' | 'SWING_OUT' | 'OFF_SPIN' | 'LEG_SPIN';
/** The five scoring strokes, plus the forward defensive. */
export type ShotType = 'LEG' | 'LONG_ON' | 'STRAIGHT' | 'COVER_LONG_OFF' | 'OFF' | 'DEFEND';
export type TimingGrade = 'PERFECT' | 'GOOD' | 'OK' | 'POOR' | 'MISS';
export type WicketType = 'BOWLED' | 'LBW' | 'CAUGHT';
export type GamePhase = 'START' | 'READY' | 'BOWLER_RUNUP' | 'BALL_IN_FLIGHT' | 'SHOT_RESOLVE' | 'RESULT' | 'INNINGS_END' | 'PAUSED';
export interface Delivery {
  line: BallLine; style: DeliveryStyle; speedKph: number;
  baseTargetX: number; finalTargetX: number; bounceZ: number;
  /** How steeply the ball climbs off the pitch: low skids a yorker in, high rears a bouncer up. */
  rise: number;
  durationMs: number; releaseTimeMs: number; idealContactTimeMs: number;
}
export interface ShotAttempt { shotType: ShotType; inputTimeMs: number }
export interface ShotOutcome {
  runs: 0 | 1 | 2 | 3 | 4 | 6; isWicket: boolean; wicketType?: WicketType;
  quality: number; feedback: string; timingGrade: TimingGrade;
  timingDeltaMs: number | null; compatibility: number; madeBatContact: boolean;
  /** Mistimed contact that goes up: the result is only known when it lands. */
  aerial: boolean;
  /** Charged down the pitch and hit out of the ground. */
  advance?: boolean;
  /** Killed under the eyes: it goes nowhere, and it cannot be caught. */
  defended?: boolean;
}
