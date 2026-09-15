import { COMPATIBILITY, CUT, SOLID_SHOT } from '../config/gameplay.js';
import {
  BANDS, BODY_ZONE, OFF_WIDTH, PITCH, RISK, SAFE_MISHIT, STYLES, SURVIVE, SURVIVE_TIMING, damageFor,
} from '../config/survive.js';
import { ballPosition, effectiveLine, stumpIntersection } from './DeliveryTrajectory.js';
import { gradeTiming } from './ShotResolver.js';
import type { BodyPart, Delivery, Ending, ShotAttempt, ShotOutcome, TimingSide } from './types.js';

/**
 * Survive's ball, resolved.
 *
 * The classic innings asks one question of a stroke — how far off was it? — and
 * answers everything from that and the line. This mode asks a second: which
 * *way* was it off? The two are different mistakes and they cost different
 * things, which is the whole of what makes a tailender's innings feel unlike a
 * slog:
 *
 *   - **Late** and the ball has beaten the bat. Blocking, it catches the glove:
 *     it hurts, but he is still there. Playing a shot, it takes the edge, and
 *     an edge off a ball going across him carries to the keeper.
 *   - **Early** and he is through the shot with the ball still coming. Blocking,
 *     it goes past the bat into his body or off the top edge. Attacking, it
 *     goes off the top of the bat and straight up.
 *
 * Which of those he is prone to is decided by the ball rather than by him.
 * Everybody is late against express pace and everybody is early against the
 * slower one — so, with no rule anywhere saying so, quick bowling gets him
 * caught behind and the change-up gets him caught in the deep. Those are the
 * two ways tailenders actually get out, and neither is written down here.
 *
 * `resolveShot` in `ShotResolver.ts` is untouched and still resolves the
 * classic innings. Nothing in this file is reachable from it.
 */

/** Which side of the ball it was played. Reported on the outcome; rules read `contactOf`. */
export function timingSide(delta: number | null): TimingSide {
  if (delta === null) return 'LATE';
  return delta < -BANDS.clean ? 'EARLY' : delta > BANDS.clean ? 'LATE' : 'CLEAN';
}

/**
 * How much bat was on it, which is the sign and the size taken together.
 *
 * `CLEAN` is bat on ball. The two edged bands are bat involved but not enough of
 * it. `BEATEN` is the bat nowhere near, and there the stroke stops mattering —
 * the ball simply does whatever it was going to do.
 */
export type Contact = 'CLEAN' | 'EDGED_EARLY' | 'EDGED_LATE' | 'BEATEN';
export function contactOf(delta: number | null, tight = false): Contact {
  if (delta === null) return 'BEATEN';
  // A quick ball squeezes the block the same way it squeezes a stroke. Without
  // this the express ball was the *easiest* delivery in the mode to bat out:
  // the attacking windows narrowed for it and the defensive band did not, so a
  // batter who simply blocked never felt the pace at all.
  const off = Math.abs(delta) / (tight ? SURVIVE.fastTimingScale : 1);
  if (off <= BANDS.clean) return 'CLEAN';
  if (off > BANDS.beaten) return 'BEATEN';
  return delta < 0 ? 'EDGED_EARLY' : 'EDGED_LATE';
}

/**
 * Whether the ball is coming at the batter rather than at the stumps. He stands
 * outside leg, at `PITCH.stanceX`, so this is read off where the ball finishes
 * and not off the line it was bowled on — a ball that swings in at his hip is
 * at his body however it started.
 */
export function atTheBody(delivery: Delivery): boolean {
  return Math.abs(delivery.finalTargetX - PITCH.stanceX) <= BODY_ZONE;
}

/** Far enough outside off that playing at it is a decision, and missing it is an edge. */
export function outsideOff(delivery: Delivery): boolean {
  return delivery.finalTargetX >= OFF_WIDTH;
}

/**
 * Where a ball that missed the bat hits him, read straight off how high it is
 * when it arrives rather than from a list of delivery names.
 *
 * That is worth doing properly, because it is the same curve that decides
 * whether the ball can go on to hit the stumps — and the one delivery this mode
 * adds, the ball that climbs into the ribs, exists precisely in the gap where
 * those two answers are both yes. Deriving the body part from the trajectory
 * means the geometry can never disagree with itself, and any length added later
 * is handled without touching this.
 */
export function blowSpot(delivery: Delivery): BodyPart {
  const { y } = ballPosition(delivery, 1);
  return y >= 1.0 ? 'HELMET' : y >= 0.72 ? 'RIBS' : 'THIGH';
}

const award = (runs: ShotOutcome['runs']) =>
  runs === 6 ? 'SIX!' : runs === 4 ? 'FOUR!' : runs ? `${runs} RUN${runs > 1 ? 'S' : ''}` : 'DOT BALL';

const SPOT_SAID: Record<BodyPart, string> = {
  HELMET: 'ON THE HELMET', RIBS: 'INTO THE RIBS', GLOVES: 'OFF THE GLOVES', THIGH: 'INTO THE PAD',
};

/** A ball that went through to the body. Never a wicket, never a run, always a mark on the meter. */
function blow(base: ShotOutcome, delivery: Delivery, where: BodyPart): ShotOutcome {
  return {
    ...base, runs: 0, isWicket: false, madeBatContact: where === 'GLOVES', aerial: false,
    hit: { where, damage: damageFor(where, delivery.speedKph) }, feedback: SPOT_SAID[where],
  };
}

/** Beaten on the stumps. The one dismissal this mode shares unchanged with the classic innings. */
function beaten(base: ShotOutcome, delivery: Delivery, rng: { next(): number }): ShotOutcome {
  if (!stumpIntersection(delivery)) {
    if (atTheBody(delivery)) return blow(base, delivery, blowSpot(delivery));
    return { ...base, madeBatContact: false, feedback: base.feedback };
  }
  const lbw = Math.abs(delivery.finalTargetX) < 0.12 && rng.next() < RISK.lbwChance;
  return {
    ...base, madeBatContact: false, isWicket: true,
    wicketType: lbw ? 'LBW' : 'BOWLED', feedback: lbw ? 'LBW!' : 'BOWLED!',
  };
}

/** Feathered off the face and taken behind — or, just as often, missed altogether. */
function nick(base: ShotOutcome, rng: { next(): number }, said = 'EDGED — CAUGHT BEHIND!'): ShotOutcome {
  if (rng.next() >= RISK.nickCarries) return { ...base, madeBatContact: false, feedback: 'PLAYED AND MISSED' };
  return { ...base, madeBatContact: true, edged: true, isWicket: true, wicketType: 'CAUGHT', feedback: said };
}

/**
 * Through the shot with the ball still coming: it goes off the top of the bat
 * and straight up. A tailender is not paid for slicing one, so the version that
 * lands safely is worth a scrambled single at most — never the six the classic
 * innings hands out, which with a single wicket would be a lottery ticket.
 */
function skied(base: ShotOutcome, rng: { next(): number }): ShotOutcome {
  if (rng.next() < RISK.mishitCaught) {
    return { ...base, aerial: true, madeBatContact: true, isWicket: true, wicketType: 'CAUGHT', feedback: 'CAUGHT!' };
  }
  let roll = rng.next();
  for (const [value, weight] of SAFE_MISHIT) {
    roll -= weight;
    if (roll <= 0) return { ...base, aerial: true, madeBatContact: true, runs: value, feedback: value ? award(value) : 'DROPPED SHORT OF THE FIELDER' };
  }
  return { ...base, aerial: true, madeBatContact: true, feedback: 'DOT BALL' };
}

/**
 * Late on one that is straight: the ball catches the inside half and goes down
 * into the pitch. This is the ordinary way to mistime a shot and it has to stay
 * ordinary — the first build of this mode let it bowl him instead, and two
 * innings in three were over inside an over. Very occasionally it comes back off
 * the inside edge onto the stumps, which is the one genuinely unlucky dismissal
 * in the game and is rare enough to be worth having.
 */
function insideEdge(base: ShotOutcome, delivery: Delivery, rng: { next(): number }): ShotOutcome {
  if (stumpIntersection(delivery) && rng.next() < RISK.playedOn) {
    return { ...base, madeBatContact: true, isWicket: true, wicketType: 'BOWLED', feedback: 'PLAYED ON!' };
  }
  return { ...base, madeBatContact: true, feedback: 'INSIDE EDGE' };
}

/** Worked away along the ground. Ones and twos; this mode never runs three. */
function nudged(base: ShotOutcome, rng: { next(): number }): ShotOutcome {
  const runs: 1 | 2 = rng.next() < 0.62 ? 1 : 2;
  return { ...base, runs, madeBatContact: true, feedback: award(runs) };
}

/**
 * The block, which in this mode is a real stroke with a real price rather than
 * a free dot.
 *
 * Getting it down inside the clean band kills the ball as it always has. Late,
 * it catches the glove — that hurts and it is the *safe* mistake, which is what
 * makes a batter who has worked that out block late all innings and arrive at
 * the tenth over with nothing left. Early, the bat is through and the ball goes
 * past it: into him if it was angled at him, off the top edge if it was going
 * across him, and harmlessly into the pitch otherwise.
 */
function defended(base: ShotOutcome, delivery: Delivery, contact: Contact, rng: { next(): number }): ShotOutcome {
  // A bouncer is ducked, and ducking is always right. It is the one answer in
  // the mode that cannot go wrong, which is what makes leaving one alone —
  // doing nothing at all — a mistake rather than the same thing.
  if (delivery.style === 'SHORT') return { ...base, defended: true, madeBatContact: false, feedback: 'DUCKED' };
  if (contact === 'CLEAN') return { ...base, defended: true, madeBatContact: true, feedback: 'DEFENDED' };
  if (contact === 'BEATEN') return beaten({ ...base, feedback: 'PLAYED AND MISSED' }, delivery, rng);
  if (contact === 'EDGED_LATE') return blow(base, delivery, 'GLOVES');
  // Early: the bat has come and gone.
  if (atTheBody(delivery)) return blow(base, delivery, blowSpot(delivery));
  if (outsideOff(delivery)) return nick(base, rng, 'TOP EDGE — CAUGHT BEHIND!');
  return { ...base, madeBatContact: true, feedback: 'SQUEEZED OUT' };
}

/**
 * The bouncer, attacked. The pull is the stroke, and only middled; the cut
 * answers one that is short *and* wide. Everything else is the ball going over
 * the top, which is safe — a bouncer cannot bowl you — except that being late
 * on a pull gets a glove on it.
 */
function shortBall(base: ShotOutcome, delivery: Delivery, shot: string, contact: Contact, rng: { next(): number }): ShotOutcome {
  if (shot === 'LEG') {
    if (base.timingGrade === 'PERFECT') {
      return { ...base, runs: 6, compatibility: 1, quality: 1, madeBatContact: true, feedback: award(6) };
    }
    if (contact === 'EDGED_EARLY') return skied(base, rng);
    if (contact === 'EDGED_LATE') {
      return rng.next() < RISK.nickCarries
        ? { ...base, madeBatContact: true, edged: true, isWicket: true, wicketType: 'CAUGHT', feedback: 'GLOVED — CAUGHT BEHIND!' }
        : blow(base, delivery, 'GLOVES');
    }
    return { ...base, madeBatContact: false, feedback: 'THROUGH TO THE KEEPER' };
  }
  if (shot === 'SQUARE_CUT' && delivery.finalTargetX >= CUT.minWidth && base.timingGrade !== 'MISS') {
    const middled = { ...base, compatibility: 1, quality: SURVIVE_TIMING[base.timingGrade], madeBatContact: true };
    if (base.timingGrade === 'PERFECT') return { ...middled, quality: 1, runs: 6, feedback: award(6) };
    if (base.timingGrade === 'GOOD') return { ...middled, runs: 4, feedback: award(4) };
    if (base.timingGrade === 'OK') return nudged(middled, rng);
    return nick(middled, rng);
  }
  return { ...base, madeBatContact: false, feedback: 'THROUGH TO THE KEEPER' };
}

/**
 * A Survive delivery, resolved. Pure, and takes its randomness as an argument,
 * so `scripts/survive-sim.mjs` can run a hundred thousand innings through it
 * with no browser and no scene — which is how every number in `survive.ts` was
 * settled rather than guessed.
 */
export function resolveSurvive(delivery: Delivery, attempt: ShotAttempt | null, rng: { next(): number }): ShotOutcome {
  const delta = attempt ? attempt.inputTimeMs - delivery.idealContactTimeMs : null;
  const tight = !!STYLES[delivery.style].tight;
  const timingGrade = delta === null ? 'MISS'
    : gradeTiming(delta, tight, SURVIVE.timing, SURVIVE.fastTimingScale);
  const contact = contactOf(delta, tight);
  const compatibility = attempt ? COMPATIBILITY[effectiveLine(delivery)][attempt.shotType] : 0;
  const base: ShotOutcome = {
    runs: 0, isWicket: false, quality: SURVIVE_TIMING[timingGrade] * compatibility, feedback: 'DOT BALL',
    timingGrade, timingDeltaMs: delta, compatibility, madeBatContact: false, aerial: false,
    side: timingSide(delta),
  };

  // Nothing played at all. Leaving a bouncer is not leaving it — it is standing
  // there while it arrives, and this is the only mode where that is answered.
  if (!attempt) {
    if (delivery.style === 'SHORT') return blow(base, delivery, 'HELMET');
    return beaten({ ...base, feedback: 'LEFT ALONE' }, delivery, rng);
  }

  if (attempt.shotType === 'DEFEND') return defended(base, delivery, contact, rng);
  if (delivery.style === 'SHORT') return shortBall(base, delivery, attempt.shotType, contact, rng);

  // Middled: bat on ball, and a stroke the line actually allowed. The grade
  // still names it, but only the top two grades are worth anything real —
  // a tailender does not place the ball, he either times it or he does not.
  const middled = compatibility >= SOLID_SHOT && timingGrade !== 'POOR' && timingGrade !== 'MISS';
  if (middled) {
    if (timingGrade === 'PERFECT') return { ...base, runs: 6, madeBatContact: true, feedback: award(6) };
    if (timingGrade === 'GOOD') return { ...base, runs: 4, madeBatContact: true, feedback: award(4) };
    return nudged(base, rng);
  }

  // Mistimed. The sign says which of the dismissals this game already has it
  // turns into, rather than inventing new ones: through the shot and it goes up,
  // behind it and it finds an edge.
  //
  // Note what decides this and what does not. The *grade* decides whether the
  // bat got anything on the ball at all — only a MISS is genuinely beaten, and
  // only a beaten ball can hit the stumps untouched. The *sign* then picks
  // between the two edges. Reading the defensive bands here instead was the
  // second thing tried and it was wrong twice over: they are far wider than the
  // attacking windows, so a shot could be graded POOR and read CLEAN at the same
  // time, and fall through to being bowled with the bat on the ball.
  if (timingGrade === 'MISS') return beaten({ ...base, feedback: 'PLAYED AND MISSED' }, delivery, rng);
  if (delta !== null && delta < 0) return skied(base, rng);
  return outsideOff(delivery) ? nick(base, rng) : insideEdge(base, delivery, rng);
}

/**
 * How the innings finished, or null while it is still going.
 *
 * The order is the whole of the rule and it is cricket's, not a convenience.
 * Passing the target ends it there and then, so a chased innings is always
 * between a hundred and a hundred and five. Surviving the last ball is a draw
 * whatever state the batter is in — a blow that empties the meter as the tenth
 * over finishes has not stopped him batting, because there was no more batting
 * to do. Only then do the two ways of failing get asked about.
 */
export function endingOf(runs: number, balls: number, wickets: number, healthSpent: boolean): Ending | null {
  if (runs >= SURVIVE.target) return 'CHASED';
  if (balls >= SURVIVE.totalBalls) return 'DRAWN';
  if (wickets >= SURVIVE.maxWickets) return 'BOWLED_OUT';
  if (healthSpent) return 'RETIRED';
  return null;
}

/** Whether the innings was won, drawn or lost — what the end card leads with. */
export const WON: readonly Ending[] = ['CHASED'];
export const SAVED: readonly Ending[] = ['CHASED', 'DRAWN'];

/**
 * The score he walks out to, nine down. Cosmetic — the target is always a
 * hundred more than this, so every innings is the same job — but it is drawn
 * from the innings seed rather than the clock so that a reload, a share card
 * and a replay of the same seed all show the same scoreboard.
 */
export function teamScore(rng: { next(): number }): number {
  return Math.round(SURVIVE.minTeamScore + rng.next() * (SURVIVE.maxTeamScore - SURVIVE.minTeamScore));
}
