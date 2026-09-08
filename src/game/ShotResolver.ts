import { ADVANCE, COMPATIBILITY, GAME, GROUND_RUNS, SOLID_SHOT, STYLES, TIMING_SCORE } from '../config/gameplay';
import { effectiveLine, stumpIntersection } from './DeliveryTrajectory';
import type { Delivery, ShotAttempt, ShotOutcome, TimingGrade } from './types';
export function gradeTiming(delta: number, fast = false): TimingGrade {
  const value = Math.abs(delta) / (fast ? GAME.fastTimingScale : 1);
  return value <= GAME.timing.perfect ? 'PERFECT' : value <= GAME.timing.good ? 'GOOD'
    : value <= GAME.timing.ok ? 'OK' : value <= GAME.timing.poor ? 'POOR' : 'MISS';
}
const award = (runs: ShotOutcome['runs']) =>
  runs === 6 ? 'SIX!' : runs === 4 ? 'FOUR!' : runs ? `${runs} RUN${runs > 1 ? 'S' : ''}` : 'DOT BALL';
/**
 * Whether this ball can be charged at all. Line, length and pace each have to be
 * right: you cannot walk at a yorker or a bouncer, and neither a slower ball nor
 * an express one leaves you the time.
 */
export function chargeable(delivery: Delivery) {
  return Math.abs(delivery.finalTargetX) <= GAME.stumpZone
    && delivery.speedKph >= ADVANCE.minKph && delivery.speedKph <= ADVANCE.maxKph
    && delivery.bounceZ >= ADVANCE.minBounceZ && delivery.bounceZ <= ADVANCE.maxBounceZ;
}
/**
 * The charge itself: a full meter, the right ball, the straight-drive input, and
 * perfect timing. Known the moment the player swings, so the animation and the
 * result read it from the same place.
 */
export function advanceShot(delivery: Delivery, attempt: ShotAttempt | null, charged: boolean) {
  return charged && !!attempt && ADVANCE.shots.includes(attempt.shotType) && chargeable(delivery)
    && ADVANCE.timing.includes(gradeTiming(attempt.inputTimeMs - delivery.idealContactTimeMs, STYLES[delivery.style].tight));
}
/** `charged` is the batter's confidence being full — the shot still has to be played. */
export function resolveShot(delivery: Delivery, attempt: ShotAttempt | null, rng: { next(): number }, charged = false): ShotOutcome {
  const delta = attempt ? attempt.inputTimeMs - delivery.idealContactTimeMs : null;
  const timingGrade = delta === null ? 'MISS' : gradeTiming(delta, STYLES[delivery.style].tight);
  const compatibility = attempt ? COMPATIBILITY[effectiveLine(delivery)][attempt.shotType] : 0;
  const quality = TIMING_SCORE[timingGrade] * compatibility;
  const madeBatContact = !!attempt && timingGrade !== 'MISS' && compatibility >= 0.25;
  const outcome: ShotOutcome = { runs: 0, isWicket: false, quality, feedback: 'DOT BALL', timingGrade,
    timingDeltaMs: delta, compatibility, madeBatContact, aerial: false };

  // Full of confidence, on the right ball, driven straight and middled: he walks
  // at it and hits it out of the ground. Mistime it and it is just the shot he
  // played, so the meter is spent only on the real thing.
  if (advanceShot(delivery, attempt, charged)) {
    return { ...outcome, runs: 6, advance: true, compatibility: 1, quality: 1, madeBatContact: true, feedback: ADVANCE.feedback };
  }
  // A bouncer is over the stumps, so it can never bowl you — but it can only be
  // pulled, and only if it is middled. Anything else and it flies through.
  if (delivery.style === 'SHORT') {
    const pulled = attempt?.shotType === 'LEG' && timingGrade === 'PERFECT';
    return pulled
      ? { ...outcome, runs: 6, feedback: award(6), compatibility: 1, quality: 1, madeBatContact: true }
      : { ...outcome, madeBatContact: false, feedback: attempt ? 'THROUGH TO THE KEEPER' : 'LEFT ALONE' };
  }
  if (!madeBatContact) {
    if (!stumpIntersection(delivery)) return outcome;
    const lbw = attempt && Math.abs(delivery.finalTargetX) < 0.12 && rng.next() < GAME.lbwChance;
    return { ...outcome, isWicket: true, wicketType: lbw ? 'LBW' : 'BOWLED', feedback: lbw ? 'LBW!' : 'BOWLED!' };
  }
  // Poor timing skies it, and so does reaching for a shot the line does not
  // suit. A ball in the air is only ever six or a catch — never a nudged single.
  if (timingGrade === 'POOR' || compatibility < SOLID_SHOT) {
    const taken = timingGrade === 'POOR' || rng.next() < GAME.mishitCaught;
    return taken
      ? { ...outcome, aerial: true, isWicket: true, wicketType: 'CAUGHT', feedback: 'CAUGHT!' }
      : { ...outcome, aerial: true, runs: 6, feedback: award(6) };
  }
  // Middled it: the timing grade names the shot.
  if (timingGrade === 'PERFECT') return { ...outcome, runs: 6, feedback: award(6) };
  if (timingGrade === 'GOOD') return { ...outcome, runs: 4, feedback: award(4) };
  let roll = rng.next();
  let runs: ShotOutcome['runs'] = GROUND_RUNS[GROUND_RUNS.length - 1][0];
  for (const [value, weight] of GROUND_RUNS) {
    roll -= weight;
    if (roll <= 0) { runs = value; break; }
  }
  return { ...outcome, runs, feedback: award(runs) };
}
