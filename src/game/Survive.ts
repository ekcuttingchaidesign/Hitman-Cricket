import { COMPATIBILITY, CUT, SOLID_SHOT } from '../config/gameplay.js';
import {
  BANDS, BODY_ZONE, CLOSE, OFF_WIDTH, PITCH, RISK, SAFE_MISHIT, SIX, SPIN, STYLES, SURVIVE, SURVIVE_TIMING, damageFor,
} from '../config/survive.js';
import { ballPosition, effectiveLine, stumpIntersection } from './DeliveryTrajectory.js';
import { spun } from './DeliveryGenerator.js';
import { gradeTiming, squareDrive, sweeps } from './ShotResolver.js';

export { spun };
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

/**
 * Whether this is a ball a number eleven could put over the rope.
 *
 * Full enough to swing through and slow enough to line up. A tailender who
 * middles an express ball has middled it — he has not cleared the ropes with
 * it — so everything outside this is worth four at the very best however well it
 * is timed. This is the gate that turns the maximum from a reward for timing
 * into a reward for waiting for the right ball.
 */
export function inTheSlot(delivery: Delivery, compatibility = 1): boolean {
  // Never off the spinner, and the gate as written says the opposite: it asks
  // for slow and full, which every ball he bowls is, so all three overs came
  // back as slot balls and the maximum stopped being a reward for waiting. It
  // is the wrong test for him. Clearing the rope off a slow bowler is done by
  // going down the pitch to reach the pitch of it — the one thing a number
  // eleven cannot do — and off the back foot the best he gets is four.
  if (spun(delivery)) return false;
  return delivery.speedKph <= SIX.maxKph
    && delivery.bounceZ >= SIX.minBounce && delivery.bounceZ <= SIX.maxBounce
    // And the stroke has to be the one the line was asking for. A tailender who
    // middles a cover drive to a ball angled at his hip has middled it; he has
    // not cleared long-off with it.
    && compatibility >= SIX.minCompatibility;
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

/**
 * The same contact off the spinner, said without the damage. A ball at ninety
 * that hits the glove has been kept out, not survived, and the call should not
 * borrow the language of a ball that hurt.
 */
const PAD_SAID: Record<BodyPart, string> = {
  HELMET: 'UP INTO THE GRILLE', RIBS: 'INTO THE BODY', GLOVES: 'OFF THE GLOVE', THIGH: 'ONTO THE PAD',
};



/**
 * A ball that went through to the body. Never a wicket, never a run, and off
 * the quick bowler always a mark on the meter.
 *
 * The spinner cannot hurt him, and not as a mercy: the meter is kinetic —
 * `damage = base × (kph/140)²` — and at ninety off a pitch it would be reading
 * a sixth of what an express bouncer costs, which is a number pretending to be
 * a threat. A spell that cannot injure is a different kind of pressure and a
 * cleaner one: the batter can stop protecting himself for three overs and go
 * back to protecting his wicket, which is the only thing the spinner can take.
 *
 * So it is the same ball in every other respect — it still beats the bat, still
 * finds the edge, still bowls him — and hitting him is simply a dot.
 */
function blow(base: ShotOutcome, delivery: Delivery, where: BodyPart): ShotOutcome {
  if (spun(delivery)) {
    return { ...base, runs: 0, isWicket: false, madeBatContact: where === 'GLOVES', aerial: false, feedback: PAD_SAID[where] };
  }
  return {
    ...base, runs: 0, isWicket: false, madeBatContact: where === 'GLOVES', aerial: false,
    hit: { where, damage: damageFor(where, delivery.speedKph) }, feedback: SPOT_SAID[where],
  };
}

/** The two that turn. The arm ball beats him by going straight on. */
function turns(delivery: Delivery): boolean {
  return delivery.style === 'OFF_SPIN' || delivery.style === 'LEG_SPIN';
}

/** Beaten on the stumps. The one dismissal this mode shares unchanged with the classic innings. */
function beaten(base: ShotOutcome, delivery: Delivery, rng: { next(): number }): ShotOutcome {
  // Beaten by a turning ball, with a man over the stumps. This is the only
  // wicket the spinner had — the quick bowler beats him and it costs nothing
  // unless the ball goes on to hit something, because the keeper is standing
  // twenty yards back. It is read before the stumps are, so a batter beaten
  // outside off is out here where against pace he would have got away with it.
  if (turns(delivery) && rng.next() < SPIN.stumpedChance) {
    return { ...base, madeBatContact: false, isWicket: true, wicketType: 'STUMPED', feedback: 'STUMPED!' };
  }
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
  // The hang is shorter than the classic innings'. A skied ball is the slowest
  // thing that happens in a game of sixty deliveries, and at nearly two seconds
  // it was the single longest wait in the mode for what is usually a wicket.
  const up = { ...base, aerial: true, madeBatContact: true, hangMs: SURVIVE.hangMs };
  if (rng.next() < RISK.mishitCaught) {
    return { ...up, isWicket: true, wicketType: 'CAUGHT', feedback: 'CAUGHT!' };
  }
  // Not taken. A ball that goes that high does not land in a gap — somebody is
  // under it, gets hands to it, and spills it. Saying it was dropped rather
  // than that it fell safe is the difference between a let-off and a shrug.
  let roll = rng.next();
  for (const [value, weight] of SAFE_MISHIT) {
    roll -= weight;
    if (roll <= 0) return { ...up, dropped: true, runs: value, feedback: value ? 'DROPPED — 1 RUN' : 'DROPPED!' };
  }
  return { ...up, dropped: true, feedback: 'DROPPED!' };
}

/**
 * Through the shot, but not so badly that it goes up. The ball comes off the
 * leading edge and squirts away along the ground for nothing much.
 *
 * This exists because every early mistake used to sky it, which put a ball in
 * the air several times an over — far too often to read as a mistake, and far
 * too long to watch. Only a genuinely bad one goes up now; this is the rest.
 */
function leadingEdge(base: ShotOutcome, rng: { next(): number }): ShotOutcome {
  if (rng.next() < RISK.leadingEdgeCaught) {
    return { ...base, madeBatContact: true, isWicket: true, wicketType: 'CAUGHT', feedback: 'LEADING EDGE — CAUGHT!' };
  }
  const runs = rng.next() < 0.7 ? 0 : 1;
  return { ...base, madeBatContact: true, runs: runs as 0 | 1, feedback: runs ? award(1) : 'OFF THE LEADING EDGE' };
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
    return { ...base, madeBatContact: true, isWicket: true, wicketType: 'BOWLED', feedback: 'PLAYED ON — BOWLED!' };
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
function defended(base: ShotOutcome, delivery: Delivery, contact: Contact, delta: number | null, rng: { next(): number }): ShotOutcome {
  // A bouncer is ducked — but it has to be ducked in time. Ducking used to be
  // unconditionally safe, which made the fastest, nastiest ball in the mode the
  // one delivery a player could answer without thinking: press the block key
  // and nothing could happen to him. Get under it late and you are still
  // standing up when it arrives.
  if (delivery.style === 'SHORT') {
    if (delta === null || delta > BANDS.clean) return blow(base, delivery, blowSpot(delivery));
    return { ...base, defended: true, madeBatContact: false, feedback: 'DUCKED' };
  }
  if (contact === 'CLEAN') return { ...base, defended: true, madeBatContact: true, feedback: 'DEFENDED' };
  if (contact === 'BEATEN') return beaten({ ...base, feedback: 'PLAYED AND MISSED' }, delivery, rng);
  // Late, the ball beats the bat. At a ball angled into him that means the body
  // rather than the glove — the glove is where a ball going past the outside of
  // the bat catches him, not one coming at his ribs.
  if (contact === 'EDGED_LATE') return blow(base, delivery, atTheBody(delivery) ? blowSpot(delivery) : 'GLOVES');
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
  const outcome = surviveBall(delivery, attempt, rng);
  // The square drive is not one of the two special strokes — it costs no meter,
  // so unlike the charge and the slog sweep it is played in this mode too, and
  // `Batter` animates it here off the same ball it animates it off in the
  // classic innings. What it does not get here is this mode's runs: the ladder
  // below is a tailender's and stays exactly as it was tuned, which is why this
  // only tags the outcome rather than resolving it.
  //
  // The tag is read by one thing, `GameScene.hit`, and it picks the sector the
  // ball leaves on. Without it the stroke and the flight disagree in front of
  // the player: he watches a square drive and the ball goes through cover.
  // Asking `squareDrive` rather than repeating its arithmetic is what keeps the
  // animation, the classic innings and this mode on one rule.
  if (!outcome.madeBatContact) return outcome;
  // The orthodox sweep is meterless too, so it is played here as well, and it
  // is tagged for the same reason and with the same restraint: the sector the
  // ball leaves on, and not a run of this mode's.
  // Asked with this mode's own grade, off the outcome, rather than with the
  // classic windows: Survive's are two thirds the width, and a stroke tagged by
  // one ladder and paid by the other would send the ball somewhere the batter
  // was not.
  if (attempt && sweeps(delivery, attempt, outcome.timingGrade)) return { ...outcome, sweptFlat: true };
  return squareDrive(delivery, attempt) ? { ...outcome, squared: true } : outcome;
}

/**
 * The ladder itself: this mode's runs, dismissals and blows, and nothing about
 * where the ball then goes. Exported so a test can hold `resolveSurvive`
 * against it and show that the tag above is the only thing the wrapper adds —
 * the numbers below were tuned over twelve thousand innings apiece and are not
 * something to take on trust.
 */
export function surviveBall(delivery: Delivery, attempt: ShotAttempt | null, rng: { next(): number }): ShotOutcome {
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

  if (attempt.shotType === 'DEFEND') return defended(base, delivery, contact, delta, rng);
  if (delivery.style === 'SHORT') return shortBall(base, delivery, attempt.shotType, contact, rng);

  // Middled: bat on ball, and a stroke the line actually allowed. The grade
  // still names it, but only the top two grades are worth anything real —
  // a tailender does not place the ball, he either times it or he does not.
  const middled = compatibility >= SOLID_SHOT && timingGrade !== 'POOR' && timingGrade !== 'MISS';
  if (middled) {
    // The maximum wants the right ball as well as the right moment — see
    // `inTheSlot`. Middled anything else and it is four, which is what a
    // tailender's best shot is actually worth.
    // Off the spinner every reward is one grade worse, and that is where the
    // three overs stopped being three overs off. The slot gate already denies
    // him the maximum, but the rest of the ladder was still paying a seam
    // bowler's rates for a ball that is far easier to middle — so an expert
    // came out of the spell having scored faster than he manages against pace,
    // which is the opposite of what a spell of spin does to a number eleven.
    //
    // The reason is footwork he has not got. A boundary off a slow bowler comes
    // from getting to the pitch of it and hitting through the line; stuck in the
    // crease, a well-timed ball goes firmly to a fielder, and only the one he
    // absolutely middles beats them.
    const spin = spun(delivery);
    if (timingGrade === 'PERFECT') {
      const runs = inTheSlot(delivery, compatibility) ? 6 : 4;
      return { ...base, runs, madeBatContact: true, feedback: award(runs) };
    }
    if (timingGrade === 'GOOD' && !spin) return { ...base, runs: 4, madeBatContact: true, feedback: award(4) };
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
  if (delta !== null && delta < 0) {
    // Through the shot at one aimed at him: the bat is past and the ball is
    // still coming, so it hits him. Playing a stroke at a ball angled into the
    // body is how a tailender gets hurt, and without this the only way to take
    // a blow was to block — so a batter who attacked was never hit at all.
    if (atTheBody(delivery)) return blow(base, delivery, blowSpot(delivery));
    // Only a badly early stroke goes up. Everything else comes off the leading
    // edge and stays on the ground, which is both the commoner miss in cricket
    // and the one that does not stop the game for two seconds.
    return timingGrade === 'POOR' ? skied(base, rng) : leadingEdge(base, rng);
  }
  return outsideOff(delivery) ? nick(base, rng) : insideEdge(base, delivery, rng);
}

/**
 * Whether the field has something to say after this ball.
 *
 * They needle a batter who is stuck, not one who is merely there: ten balls for
 * three runs or fewer. `since` is the ball the last one was said on, which is
 * what keeps them quiet for a full window afterwards rather than repeating
 * themselves every ball for as long as the drought lasts.
 */
export function sledgeDue(history: readonly Pick<ShotOutcome, 'runs'>[], since: number): boolean {
  const balls = history.length;
  if (balls < SURVIVE.sledgeWindow || balls - since < SURVIVE.sledgeWindow) return false;
  const scored = history.slice(-SURVIVE.sledgeWindow).reduce((total, ball) => total + ball.runs, 0);
  return scored <= SURVIVE.sledgeRuns;
}

/**
 * How the innings finished, or null while it is still going.
 *
 * The order is the whole of the rule and it is cricket's, not a convenience.
 * Passing the target ends it there and then, so a chased innings is always
 * between a hundred and a hundred and five. The wicket is asked about next,
 * because out is out whenever it happened: the last man bowled on the sixtieth
 * ball is all out and has lost, and a scorecard that called it a draw would be
 * reading the overs as though surviving them were the same as being there at
 * the end of them.
 *
 * Only the meter is read after the overs, and deliberately. A blow that empties
 * it as the tenth over finishes has not stopped him batting, because there was
 * no more batting to do — nothing was cut short, so nothing was lost.
 */
export function endingOf(runs: number, balls: number, wickets: number, healthSpent: boolean): Ending | null {
  if (runs >= SURVIVE.target) return 'CHASED';
  if (wickets >= SURVIVE.maxWickets) return 'BOWLED_OUT';
  if (balls >= SURVIVE.totalBalls) return 'DRAWN';
  if (healthSpent) return 'RETIRED';
  return null;
}

/**
 * Which of the five result cards an innings has earned.
 *
 * The four endings are the *rules*; these are what the card says about them,
 * and they are not the same list. Being bowled out is one ending and two very
 * different innings — the third ball of the match, or twelve runs short with
 * the field up — so a loss that came close gets its own card and its own line.
 *
 * Retiring hurt keeps its card whatever the score. It is the one ending with a
 * cause the player can point at, and telling a man carried off that he almost
 * did it says nothing about the thing that actually stopped him.
 */
export type Result = 'WON' | 'DRAWN' | 'HURT' | 'ALMOST' | 'LOST';
export function resultOf(ending: Ending, runs: number, balls: number): Result {
  if (ending === 'CHASED') return 'WON';
  if (ending === 'DRAWN') return 'DRAWN';
  if (ending === 'RETIRED') return 'HURT';
  const nearlyThere = runs >= SURVIVE.target - CLOSE.byRuns || balls >= CLOSE.byBalls;
  return nearlyThere ? 'ALMOST' : 'LOST';
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
