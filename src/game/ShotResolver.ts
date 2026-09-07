import { COMPATIBILITY, GAME, RUN_BANDS, TIMING_SCORE } from '../config/gameplay';
import { effectiveLine, stumpIntersection } from './DeliveryTrajectory';
import type { Delivery, ShotAttempt, ShotOutcome, TimingGrade } from './types';
export function gradeTiming(delta: number, fast = false): TimingGrade {
  const value = Math.abs(delta) / (fast ? GAME.fastTimingScale : 1);
  return value <= GAME.timing.perfect ? 'PERFECT' : value <= GAME.timing.good ? 'GOOD'
    : value <= GAME.timing.ok ? 'OK' : value <= GAME.timing.poor ? 'POOR' : 'MISS';
}
export function resolveShot(delivery: Delivery, attempt: ShotAttempt | null, rng: { next(): number }): ShotOutcome {
  const delta = attempt ? attempt.inputTimeMs - delivery.idealContactTimeMs : null;
  const timingGrade = delta === null ? 'MISS' : gradeTiming(delta, delivery.style === 'FAST');
  const compatibility = attempt ? COMPATIBILITY[effectiveLine(delivery)][attempt.shotType] : 0;
  const quality = TIMING_SCORE[timingGrade] * compatibility;
  const madeBatContact = !!attempt && timingGrade !== 'MISS' && compatibility >= 0.25;
  const outcome: ShotOutcome = { runs: 0, isWicket: false, quality, feedback: 'DOT BALL', timingGrade, timingDeltaMs: delta, compatibility, madeBatContact };
  if (madeBatContact && (timingGrade === 'OK' || timingGrade === 'POOR') && quality < 0.55 && rng.next() < GAME.catchChance[timingGrade]) {
    return { ...outcome, isWicket: true, wicketType: 'CAUGHT', feedback: 'CAUGHT!' };
  }
  if (!madeBatContact && stumpIntersection(delivery)) {
    const lbw = attempt && Math.abs(delivery.finalTargetX) < 0.12 && rng.next() < GAME.lbwChance;
    return { ...outcome, isWicket: true, wicketType: lbw ? 'LBW' : 'BOWLED', feedback: lbw ? 'LBW!' : 'BOWLED!' };
  }
  if (madeBatContact) {
    const band = RUN_BANDS.find(b => quality >= b.min);
    if (band) {
      let roll = rng.next();
      for (const [runs, weight] of band.outcomes) {
        roll -= weight;
        if (roll <= 0) { outcome.runs = runs; break; }
      }
    }
  }
  outcome.feedback = outcome.runs === 6 ? 'SIX!' : outcome.runs === 4 ? 'FOUR!' : outcome.runs ? `${outcome.runs} RUN${outcome.runs > 1 ? 'S' : ''}` : 'DOT BALL';
  return outcome;
}
