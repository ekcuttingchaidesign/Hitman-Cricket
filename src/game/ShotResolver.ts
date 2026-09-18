import { ADVANCE, COMPATIBILITY, CUT, DEFENCE, GAME, GROUND_RUNS, SOLID_SHOT, STYLES, SWEEP, TIMING_SCORE } from '../config/gameplay';
import { effectiveLine, stumpIntersection } from './DeliveryTrajectory';
import type { Delivery, ShotAttempt, ShotOutcome, TimingGrade } from './types';
/**
 * How well a stroke was timed, by the size of the error and nothing else. The
 * sign is thrown away here and always has been: which side of the ball a
 * classic stroke was played on has never changed what it was worth. Survive
 * reads the sign separately, in `timingSide`, and leaves this exactly as it is.
 *
 * `windows` and `scale` default to the classic innings', so every existing call
 * means what it has always meant.
 */
export function gradeTiming(
  delta: number,
  fast = false,
  windows: { perfect: number; good: number; ok: number; poor: number } = GAME.timing,
  scale: number = GAME.fastTimingScale,
): TimingGrade {
  const value = Math.abs(delta) / (fast ? scale : 1);
  return value <= windows.perfect ? 'PERFECT' : value <= windows.good ? 'GOOD'
    : value <= windows.ok ? 'OK' : value <= windows.poor ? 'POOR' : 'MISS';
}
const award = (runs: ShotOutcome['runs']) =>
  runs === 6 ? 'SIX!' : runs === 4 ? 'FOUR!' : runs ? `${runs} RUN${runs > 1 ? 'S' : ''}` : 'DOT BALL';
/** What a ball kept along the ground is worth, by the weights in the config. */
function groundRuns(rng: { next(): number }): ShotOutcome['runs'] {
  let roll = rng.next();
  for (const [value, weight] of GROUND_RUNS) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return GROUND_RUNS[GROUND_RUNS.length - 1][0];
}
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
/**
 * Whether this ball can be swept: the turning ball, pitched up enough to get
 * under. A sweep at one dropped short is a top edge, and there is no sweeping
 * a quick at all.
 */
export function sweepable(delivery: Delivery) {
  return SWEEP.styles.includes(delivery.style) && delivery.bounceZ >= SWEEP.minBounceZ;
}
/**
 * The slog sweep: a full meter, the spinner's ball, a leg-side input, and
 * timing good enough to have middled it. Known the moment the player swings,
 * so the stroke he watches and the runs he is given come from one rule.
 *
 * Mistime it past `GOOD` and this returns false, the meter is not spent, and
 * what he played is the ordinary leg-side stroke — the same bargain the charge
 * offers.
 */
export function slogSweep(delivery: Delivery, attempt: ShotAttempt | null, charged: boolean) {
  return charged && !!attempt && SWEEP.shots.includes(attempt.shotType) && sweepable(delivery)
    && SWEEP.timing.includes(gradeTiming(attempt.inputTimeMs - delivery.idealContactTimeMs, STYLES[delivery.style].tight));
}
/**
 * Whether a straight drive is going to be middled for six.
 *
 * The batter has to commit to a follow-through at the moment he plays, and the
 * two straight drives finish differently — the four is checked and controlled,
 * the six goes up and over the shoulder. So the animation has to read the same
 * rule the score does, from the same inputs, rather than guessing: middled on
 * a line that suits the stroke is the six, and everything short of that is the
 * classic drive, which is also everything that is not worth six.
 */
export function loftedDrive(delivery: Delivery, attempt: ShotAttempt | null) {
  if (!attempt || attempt.shotType !== 'STRAIGHT' || delivery.style === 'SHORT') return false;
  if (COMPATIBILITY[effectiveLine(delivery)][attempt.shotType] < SOLID_SHOT) return false;
  return gradeTiming(attempt.inputTimeMs - delivery.idealContactTimeMs, STYLES[delivery.style].tight) === 'PERFECT';
}
/**
 * Whether there is room to cut: the ball has to be far enough outside off that
 * the arms can be freed at it. Read off where the ball finishes rather than the
 * line it was bowled on, so a ball that swings away into the cut is cuttable and
 * one that comes back in is not.
 */
export function cuttable(delivery: Delivery) {
  return delivery.finalTargetX >= CUT.minWidth;
}
/** Feathered off the face and taken behind: the cut's own way of getting out. */
const edge = (outcome: ShotOutcome): ShotOutcome =>
  ({ ...outcome, madeBatContact: true, edged: true, isWicket: true, wicketType: 'CAUGHT', feedback: CUT.edged });
/**
 * The cut, once it is established that the ball is short and wide enough to
 * play it. Timing alone names the result: middled it goes square for six or
 * four, held back it is worked away along the ground, and anything later or
 * earlier than that takes the edge.
 */
function cutOutcome(outcome: ShotOutcome, rng: { next(): number }): ShotOutcome {
  const middled = { ...outcome, compatibility: 1, quality: TIMING_SCORE[outcome.timingGrade], madeBatContact: true };
  if (outcome.timingGrade === CUT.timing.six) return { ...middled, quality: 1, runs: 6, feedback: award(6) };
  if (outcome.timingGrade === CUT.timing.four) return { ...middled, runs: 4, feedback: award(4) };
  if (outcome.timingGrade === 'OK') { const runs = groundRuns(rng); return { ...middled, runs, feedback: award(runs) }; }
  return edge(middled);
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
  // Off the knee at the spinner. Middled it goes over midwicket; a shade under
  // and it still beats the field, on the bounce.
  if (slogSweep(delivery, attempt, charged)) {
    const six = timingGrade === 'PERFECT';
    return { ...outcome, runs: six ? 6 : 4, swept: true, compatibility: 1, quality: six ? 1 : TIMING_SCORE.GOOD,
      madeBatContact: true, feedback: six ? SWEEP.feedback.six : SWEEP.feedback.four };
  }
  // A bouncer is over the stumps, so it can never bowl you — but it can only be
  // pulled, and only if it is middled. Anything else and it flies through.
  if (delivery.style === 'SHORT') {
    if (attempt?.shotType === 'LEG' && timingGrade === 'PERFECT')
      return { ...outcome, runs: 6, feedback: award(6), compatibility: 1, quality: 1, madeBatContact: true };
    // Short and wide is the cut's ball: it sits up at chest height with room to
    // free the arms at it, and the stroke is judged on timing alone. Cutting at
    // one too close to the body is cramped, and cramped is the edge.
    if (attempt?.shotType === 'SQUARE_CUT' && cuttable(delivery) && timingGrade !== 'MISS')
      return cutOutcome(outcome, rng);
    return { ...outcome, madeBatContact: false, feedback: attempt ? 'THROUGH TO THE KEEPER' : 'LEFT ALONE' };
  }
  // The block. Get the bat down in time and the ball dies at his feet: a dot,
  // and nothing off the middle of a dead bat carries to a fielder, so it can
  // never be caught. Get it down late and the ball simply goes past — and a
  // ball going past a bat that is on the stumps' line bowls him.
  if (attempt?.shotType === 'DEFEND') {
    if (DEFENCE.timing.includes(timingGrade))
      return { ...outcome, defended: true, madeBatContact: true, feedback: DEFENCE.feedback };
    if (!stumpIntersection(delivery)) return { ...outcome, madeBatContact: false, feedback: 'PLAYED AND MISSED' };
    const lbw = Math.abs(delivery.finalTargetX) < 0.12 && rng.next() < GAME.lbwChance;
    return { ...outcome, madeBatContact: false, isWicket: true, wicketType: lbw ? 'LBW' : 'BOWLED', feedback: lbw ? 'LBW!' : 'BOWLED!' };
  }
  if (!madeBatContact) {
    if (!stumpIntersection(delivery)) return outcome;
    const lbw = attempt && Math.abs(delivery.finalTargetX) < 0.12 && rng.next() < GAME.lbwChance;
    return { ...outcome, isWicket: true, wicketType: lbw ? 'LBW' : 'BOWLED', feedback: lbw ? 'LBW!' : 'BOWLED!' };
  }
  // Poor timing skies it, and so does reaching for a shot the line does not
  // suit. A ball in the air is only ever six or a catch — never a nudged single.
  if (timingGrade === 'POOR' || compatibility < SOLID_SHOT) {
    // A cut that is not middled does not go up: the face is square to a ball
    // going across it, so it feathers off the edge and the keeper takes it.
    if (attempt?.shotType === 'SQUARE_CUT') return edge(outcome);
    const taken = timingGrade === 'POOR' || rng.next() < GAME.mishitCaught;
    return taken
      ? { ...outcome, aerial: true, isWicket: true, wicketType: 'CAUGHT', feedback: 'CAUGHT!' }
      : { ...outcome, aerial: true, runs: 6, feedback: award(6) };
  }
  // Middled it: the timing grade names the shot.
  if (timingGrade === 'PERFECT') return { ...outcome, runs: 6, feedback: award(6) };
  if (timingGrade === 'GOOD') return { ...outcome, runs: 4, feedback: award(4) };
  const runs = groundRuns(rng);
  return { ...outcome, runs, feedback: award(runs) };
}
