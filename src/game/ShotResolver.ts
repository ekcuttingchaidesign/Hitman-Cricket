import { AERIAL, CLEAN_SHOT, COMPATIBILITY, GAME, SOLID_SHOT, TIMING_SCORE } from '../config/gameplay';
import { effectiveLine, stumpIntersection } from './DeliveryTrajectory';
import type { Delivery, ShotAttempt, ShotOutcome, TimingGrade } from './types';
export function gradeTiming(delta: number, fast = false): TimingGrade {
  const value = Math.abs(delta) / (fast ? GAME.fastTimingScale : 1);
  return value <= GAME.timing.perfect ? 'PERFECT' : value <= GAME.timing.good ? 'GOOD'
    : value <= GAME.timing.ok ? 'OK' : value <= GAME.timing.poor ? 'POOR' : 'MISS';
}
const award = (runs: ShotOutcome['runs']) =>
  runs === 6 ? 'SIX!' : runs === 4 ? 'FOUR!' : runs ? `${runs} RUN${runs > 1 ? 'S' : ''}` : 'DOT BALL';
export function resolveShot(delivery: Delivery, attempt: ShotAttempt | null, rng: { next(): number }): ShotOutcome {
  const delta = attempt ? attempt.inputTimeMs - delivery.idealContactTimeMs : null;
  const timingGrade = delta === null ? 'MISS' : gradeTiming(delta, delivery.style === 'FAST');
  const compatibility = attempt ? COMPATIBILITY[effectiveLine(delivery)][attempt.shotType] : 0;
  const quality = TIMING_SCORE[timingGrade] * compatibility;
  const madeBatContact = !!attempt && timingGrade !== 'MISS' && compatibility >= 0.25;
  const outcome: ShotOutcome = { runs: 0, isWicket: false, quality, feedback: 'DOT BALL', timingGrade,
    timingDeltaMs: delta, compatibility, madeBatContact, aerial: false };

  if (!madeBatContact) {
    if (!stumpIntersection(delivery)) return outcome;
    const lbw = attempt && Math.abs(delivery.finalTargetX) < 0.12 && rng.next() < GAME.lbwChance;
    return { ...outcome, isWicket: true, wicketType: lbw ? 'LBW' : 'BOWLED', feedback: lbw ? 'LBW!' : 'BOWLED!' };
  }
  // Middled it: the timing grade names the shot outright.
  if (timingGrade === 'PERFECT' && compatibility >= CLEAN_SHOT) return { ...outcome, runs: 6, feedback: award(6) };
  if (timingGrade === 'PERFECT' && compatibility >= SOLID_SHOT) return { ...outcome, runs: 4, feedback: award(4) };
  if (timingGrade === 'GOOD' && compatibility >= CLEAN_SHOT) return { ...outcome, runs: 4, feedback: award(4) };
  if (timingGrade === 'GOOD' && compatibility >= SOLID_SHOT) return { ...outcome, runs: 2, feedback: award(2) };

  // Everything else goes up. A thin edge off poor timing never carries the rope.
  const band = AERIAL[timingGrade === 'POOR' ? 'THIN'
    : compatibility >= CLEAN_SHOT ? 'CLEAN' : compatibility >= SOLID_SHOT ? 'SOLID' : 'THIN'];
  if (rng.next() < band.caught) return { ...outcome, aerial: true, isWicket: true, wicketType: 'CAUGHT', feedback: 'CAUGHT!' };
  let roll = rng.next();
  let runs: ShotOutcome['runs'] = band.outcomes[band.outcomes.length - 1][0];
  for (const [value, weight] of band.outcomes) {
    roll -= weight;
    if (roll <= 0) { runs = value; break; }
  }
  return { ...outcome, aerial: true, runs, feedback: award(runs) };
}
