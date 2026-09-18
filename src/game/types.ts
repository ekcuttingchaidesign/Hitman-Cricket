export type BallLine = 'OUTSIDE_LEG' | 'LEG' | 'MIDDLE' | 'OFF' | 'OUTSIDE_OFF';
export type DeliveryStyle = 'NORMAL' | 'FAST' | 'EXPRESS' | 'YORKER' | 'SHORT' | 'RIB' | 'SLOWER' | 'SWING_IN' | 'SWING_OUT' | 'OFF_SPIN' | 'LEG_SPIN' | 'ARM_BALL';
/** The five scoring strokes, plus the forward defensive. */
export type ShotType = 'LEG' | 'LONG_ON' | 'STRAIGHT' | 'COVER_LONG_OFF' | 'SQUARE_CUT' | 'DEFEND';
export type TimingGrade = 'PERFECT' | 'GOOD' | 'OK' | 'POOR' | 'MISS';
export type WicketType = 'BOWLED' | 'LBW' | 'CAUGHT' | 'STUMPED';
/**
 * Which side of the ball a stroke was played. The magnitude of a timing error
 * says how badly it was misjudged; this says which way, and in Survive the two
 * are different mistakes with different prices — late the ball beats the bat and
 * finds the edge or the glove, early the bat is through the shot and the ball
 * goes off the top of it or on into the body.
 *
 * Classic never reads it. `gradeTiming` throws the sign away, and that is still
 * the whole of that mode's timing model.
 */
export type TimingSide = 'EARLY' | 'CLEAN' | 'LATE';
/** Where a ball that beat the bat hit the batter. */
export type BodyPart = 'HELMET' | 'RIBS' | 'GLOVES' | 'THIGH';
/** How a Survive innings finished. Classic innings have no ending but the score. */
export type Ending = 'CHASED' | 'DRAWN' | 'BOWLED_OUT' | 'RETIRED';
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
  /** Slog-swept off the knee, over midwicket. Six middled, four on the bounce. */
  swept?: boolean;
  /** Killed under the eyes: it goes nowhere, and it cannot be caught. */
  defended?: boolean;
  /** Feathered off the face of the bat and taken by the keeper. */
  edged?: boolean;
  /** Which side of the ball it was played, where a rule read the sign. */
  side?: TimingSide;
  /** A ball that missed the bat and hit the batter instead. Survive only. */
  hit?: { where: BodyPart; damage: number };
  /** How long a skied ball should hang before it is judged. Defaults to the classic hang. */
  hangMs?: number;
  /** Skied, reached, and put down: the fielder gets hands to it and it does not stick. */
  dropped?: boolean;
}
