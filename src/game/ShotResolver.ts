import { ADVANCE, COMPATIBILITY, CUT, DEFENCE, FLAT_SWEEP, GAME, GROUND_RUNS, SOLID_SHOT, SQUARE_DRIVE, STYLES, SWEEP, TIMING_SCORE } from '../config/gameplay';
import { ballPosition, effectiveLine, stumpIntersection } from './DeliveryTrajectory';
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
 * The orthodox sweep: the slog's ball and the slog's body, without the meter
 * and without the arc. It asks nothing of the batter but the right ball and the
 * leg-side swipe — the grade he gets it on decides what it is worth, and there
 * is no grade short of a miss that is worth nothing.
 *
 * Read after `slogSweep`, never before it: with a full meter and the timing to
 * match, the same input is the slog, and this is what that input becomes the
 * rest of the time.
 */
export function flatSweep(delivery: Delivery, attempt: ShotAttempt | null) {
  return !!attempt && FLAT_SWEEP.shots.includes(attempt.shotType) && sweepable(delivery);
}
/**
 * Swept at, and missed.
 *
 * The bat is over his shoulder and travelling across the line, so there is
 * nothing behind it: the ball meets the pad, and the stumps are behind that.
 * Whether the pad saves him is the one law every sweeper leans on — a ball
 * pitched outside leg stump cannot be LBW, however dead in front it strikes
 * him. It can still bowl him, and here it does.
 */
function sweptPast(outcome: ShotOutcome, delivery: Delivery, rng: { next(): number }): ShotOutcome {
  if (!stumpIntersection(delivery)) return { ...outcome, feedback: 'PLAYED AND MISSED' };
  const outsideLeg = delivery.baseTargetX <= FLAT_SWEEP.outsideLegX;
  const lbw = !outsideLeg && rng.next() < FLAT_SWEEP.lbwChance;
  return { ...outcome, isWicket: true, wicketType: lbw ? 'LBW' : 'BOWLED', feedback: lbw ? 'LBW!' : 'BOWLED!' };
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
/** Feathered off the face and taken behind. */
const edge = (outcome: ShotOutcome, feedback: string): ShotOutcome =>
  ({ ...outcome, madeBatContact: true, edged: true, isWicket: true, wicketType: 'CAUGHT', feedback });
/**
 * A stroke played at a ball wide enough to free the arms at, once it is settled
 * that this IS that ball. Timing alone names the result — the line has already
 * done its work in deciding the stroke is on, so reading it twice would only
 * punish him for the width that made the shot available.
 *
 * Middled it goes away square for six or four, held back it is worked along the
 * ground, and anything later or earlier than that takes the edge. Both the cut
 * and the square drive are this bargain; they differ only in which ball brings
 * it about and what the scorecard says afterwards.
 */
function squareStroke(outcome: ShotOutcome, rng: { next(): number },
    spec: { timing: { six: TimingGrade; four: TimingGrade }; edged: string }): ShotOutcome {
  const middled = { ...outcome, compatibility: 1, quality: TIMING_SCORE[outcome.timingGrade], madeBatContact: true };
  if (outcome.timingGrade === spec.timing.six) return { ...middled, quality: 1, runs: 6, feedback: award(6) };
  if (outcome.timingGrade === spec.timing.four) return { ...middled, runs: 4, feedback: award(4) };
  if (outcome.timingGrade === 'OK') { const runs = groundRuns(rng); return { ...middled, runs, feedback: award(runs) }; }
  return edge(middled, spec.edged);
}
/**
 * Whether this is the ball the square drive answers: wide of off, and full
 * enough to get under. Measured off the contact point rather than the line it
 * was aimed on, because that is what the rig measures — if these two ever
 * disagreed the batter would play one stroke and be scored for another.
 */
export function squareDrivable(delivery: Delivery) {
  const contact = ballPosition(delivery, 1);
  return contact.x >= SQUARE_DRIVE.minWidth && contact.y <= SQUARE_DRIVE.maxBallY;
}
export function squareDrive(delivery: Delivery, attempt: ShotAttempt | null) {
  return !!attempt && attempt.shotType === 'COVER_LONG_OFF' && squareDrivable(delivery);
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
  // The same ball without the meter, or with it and mistimed: the orthodox
  // sweep. The blade stays level, so nothing goes up and nothing goes for six —
  // it is paid in singles and boundaries off the timing alone. Miss it and the
  // pads are all that is left behind the bat, which is what playing across a
  // turning ball costs.
  if (flatSweep(delivery, attempt)) {
    if (timingGrade === 'MISS') return sweptPast(outcome, delivery, rng);
    const runs = FLAT_SWEEP.runs[timingGrade];
    return { ...outcome, runs, sweptFlat: true, compatibility: 1, quality: TIMING_SCORE[timingGrade],
      madeBatContact: true, feedback: award(runs) };
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
      return squareStroke(outcome, rng, CUT);
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
  // Wide of off and full: the half-volley. Until now this was the one ball in
  // the game with no stroke worth full value — the cut owns the wide line but
  // only answers a short ball, so a full one left the drive's 0.9 as the
  // ceiling, and width made the easiest ball to hit score WORSE. It is now the
  // same bargain the cut offers, edge and all.
  if (squareDrive(delivery, attempt) && timingGrade !== 'MISS')
    return { ...squareStroke(outcome, rng, SQUARE_DRIVE), squared: true };
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
    if (attempt?.shotType === 'SQUARE_CUT') return edge(outcome, CUT.edged);
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
