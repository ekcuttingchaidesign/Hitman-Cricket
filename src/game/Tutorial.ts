import { GAME, LINE_X } from '../config/gameplay';
import { gradeTiming } from './ShotResolver';
import type { BallLine, Delivery, ShotAttempt, ShotOutcome, ShotType } from './types';
export interface TutorialStep {
  line: BallLine;
  shot: ShotType;
  /** Which way the on-screen cue sweeps. */
  cue: 'up' | 'left' | 'right';
  key: string;
  swipe: string;
  brief: string;
  praise: string;
}
export const TUTORIAL: readonly TutorialStep[] = [
  { line: 'MIDDLE', shot: 'STRAIGHT', cue: 'up', key: 'W', swipe: 'Swipe up',
    brief: 'On the stumps. Drive it straight back past the bowler.', praise: 'Straight drive!' },
  { line: 'LEG', shot: 'LEG', cue: 'left', key: 'A', swipe: 'Swipe right to left',
    brief: 'Coming down the leg side. Whip it away square.', praise: 'Flicked away!' },
  { line: 'OUTSIDE_OFF', shot: 'OFF', cue: 'right', key: 'D', swipe: 'Swipe left to right',
    brief: 'Wide outside off. Cut it hard behind point.', praise: 'Square cut!' },
];
// Gentle and dead straight: the tutorial teaches the gesture, not the reading.
const TUTORIAL_KPH = 88;
export function tutorialDelivery(step: TutorialStep, releaseTimeMs: number): Delivery {
  const durationMs = (GAME.releaseZ - GAME.contactZ) / (TUTORIAL_KPH / 3.6) * 1000 * GAME.travelScale;
  return { line: step.line, style: 'SLOWER', speedKph: TUTORIAL_KPH,
    baseTargetX: LINE_X[step.line], finalTargetX: LINE_X[step.line], bounceZ: GAME.bounceZ,
    durationMs, releaseTimeMs, idealContactTimeMs: releaseTimeMs + durationMs };
}
/** Nobody gets out in the tutorial; the taught shot always finds the rope. */
export function tutorialOutcome(step: TutorialStep, delivery: Delivery, attempt: ShotAttempt | null): ShotOutcome {
  const timingDeltaMs = attempt ? attempt.inputTimeMs - delivery.idealContactTimeMs : null;
  const timingGrade = timingDeltaMs === null ? 'MISS' : gradeTiming(timingDeltaMs);
  const chosen = attempt?.shotType === step.shot;
  const played = chosen && timingGrade !== 'MISS';
  return {
    runs: played ? 4 : 0, isWicket: false, quality: played ? 1 : 0,
    feedback: played ? 'FOUR!' : attempt ? 'NOT THAT ONE' : 'LET IT GO',
    timingGrade, timingDeltaMs, compatibility: chosen ? 1 : 0, madeBatContact: played, aerial: false,
  };
}
