import type { BodyPart, DeliveryStyle, TimingGrade } from '../game/types.js';
import { GAME, SPIN_BOWLING, type StyleShape } from './gameplay.js';

/**
 * Survive: a tailender, one wicket, and ten overs to bat out.
 *
 * Everything this mode does differently from the innings in `gameplay.ts` is
 * written here, and nothing here is read by that mode. That separation is the
 * point: Survive shrinks the timing windows, reads the *sign* of a timing error
 * where the classic innings only reads its size, and can end an innings by
 * battering the batter rather than by dismissing him. None of that is an
 * improvement to the game everybody has already been playing, so none of it
 * reaches it — `GAME` is still exactly what it was, and `resolveShot` still
 * resolves a classic ball exactly as it did.
 *
 * The one thing borrowed wholesale is the pitch: `contactZ`, `releaseZ`,
 * `stanceX` and the rest are the geometry of a cricket field rather than rules
 * of a mode, so they are read straight off `GAME`.
 *
 * ## What the two win conditions are made of
 *
 * The chase and the draw are tuned by different dials, deliberately:
 *
 *   - **Whether 100 can be scored** is set by `STYLES` below — how many balls
 *     in an over are attackable at all. A competent player needs about thirty
 *     scoring shots to get there and has sixty balls to find them in, so the
 *     proportion of yorkers, express balls and bouncers decides the chase far
 *     more than any timing window does.
 *   - **Whether ten overs can be survived** is set by `DAMAGE.GLOVES`. Playing
 *     late is the safe mistake — the ball hits the glove rather than the
 *     stumps — so a batter who has worked out that blocking late keeps him in
 *     will do it all day. What stops him is that it hurts, a little, sixty
 *     times. That number is the price of the safe strategy and therefore the
 *     length of time the safe strategy lasts.
 *
 * Both were tuned against `scripts/survive-sim.ts` rather than by feel, and
 * retuned against it after the first playtest — which reported the mode too
 * easy, sixes far too common, and the batter never once hit. What it says now,
 * over twelve thousand innings of each:
 *
 *            player        won   drawn  bowled  retire  balls  health   six  aerial
 *   expert · chasing      24.5%    0.0%   72.2%    3.2%   24.2      78  1/21   1/63
 *   expert · measured     14.0%    5.8%   66.8%   13.4%   29.5      60  1/24   1/75
 *   competent · chasing    0.7%    0.1%   95.4%    3.9%   11.7      79  1/31   1/20
 *   expert · blocking      0.0%   31.4%   14.6%   54.0%   43.6      19     —      —
 *
 * A good player chases it down about a quarter of the time and bats out the ten
 * overs about a third — both of them hard, neither of them out of reach. A six
 * comes round once in twenty-odd balls and is rarer still in a real innings,
 * where the stroke is not always the one the line was asking for. And a ball in
 * the air is now a once-an-innings event rather than a twice-an-over one.
 */

/** The innings, and what winning it means. */
export const SURVIVE = {
  totalBalls: 60,
  maxWickets: 1,
  ballsPerOver: 6,
  /** Runs to add to the score he walks out to. Always a hundred, so that two innings can be compared. */
  target: 100,
  /** The score at the other end, nine down. Cosmetic, but seeded so it survives a reload. */
  minTeamScore: 50,
  maxTeamScore: 250,
  /**
   * Less arcade padding on the flight than the classic innings carries. Raising
   * the speeds instead would put absurd numbers on the HUD; taking the padding
   * off makes a believable 155 arrive like a genuinely quick ball.
   */
  travelScale: 1.62,
  /**
   * A tailender's windows. Roughly two thirds of the classic ones, and the
   * reason the mode needs `Game.clockAt`: twenty-six milliseconds is under two
   * frames at sixty hertz, so a shot timed by the frame that noticed it rather
   * than by the press itself would be graded by rounding.
   */
  timing: { perfect: 18, good: 40, ok: 78, poor: 165 },
  /** Quick deliveries squeeze the windows further, but less brutally than classic's .82. */
  fastTimingScale: 0.86,
  /** How long an innings holds between balls. Trimmed, because sixty balls is a long sit. */
  readyMs: 420,
  resultMs: 760,
  /**
   * How long a skied ball hangs. Longer than it was, because a mishit off a
   * tailender's bat now goes genuinely up rather than looping to nobody — and a
   * ball that high has to be watched down for the catch to mean anything.
   */
  hangMs: 1450,
  /**
   * The extra beat the last ball is held for, so the batter is on the ground
   * before the card comes up over him. Without it the innings ended on the blow
   * and the fall played out behind a dialog nobody could see.
   */
  felledMs: 1000,
  /**
   * When the field has something to say: a run of ten balls that produced three
   * runs or fewer.
   *
   * The classic innings counts consecutive balls the batter went nowhere with.
   * Here almost every ball is one he went nowhere with, so that counter would
   * have the slips talking over each other all afternoon. A fixed clock was the
   * first replacement and it was worse in the other direction — needling a man
   * who had just hit two fours reads as the fielders not watching the game.
   *
   * So it is the thing actually worth needling about: he has been stuck. The
   * window rolls, so a drought that straddles the tenth ball is caught the same
   * as one that sits neatly inside it, and nothing is said again until another
   * full window has gone by.
   */
  sledgeWindow: 10,
  sledgeRuns: 3,
} as const;

/**
 * The block's own two thresholds, and they are deliberately *not* the attacking
 * windows above.
 *
 * A tailender cannot drive, but he can put bat in front of stumps — that is the
 * one thing he is for, and the mode says "he defends as he always could". Tying
 * the block to the attacking windows was the first thing tried and it made the
 * mode unplayable: at fifty-two milliseconds nearly half of all blocks failed,
 * and a batter with one wicket cannot fail at anything half the time.
 *
 * Inside `clean` the bat is on the ball and it dies. Between `clean` and
 * `beaten` there is bat involved but not enough of it: late it catches the
 * glove, early the ball is past the bat and into him or off the top edge.
 * Beyond `beaten` the bat is nowhere near and the ball does what it was always
 * going to do.
 */
export const BANDS = { clean: 86, beaten: 190 } as const;

/**
 * The batter's health, and what takes it away.
 *
 * `base` is what a blow costs at `nominalKph`; a faster ball costs more by the
 * square of its speed, because that is how the energy in a cricket ball
 * actually scales and because it produces the spread the mode wants without a
 * hand-written table — an express bouncer on the helmet is half an innings, the
 * same blow off a slower ball is a nuisance.
 *
 * Nothing heals. A batter who has been worked over stays worked over, which is
 * the whole of why the meter is worth watching.
 */
export const HEALTH = {
  full: 100,
  /** At or below this the screen keeps a red edge: one more blow and he is off. */
  critical: 25,
  nominalKph: 140,
} as const;

export const DAMAGE: Record<BodyPart, number> = {
  HELMET: 30,
  RIBS: 18,
  THIGH: 8,
  /**
   * The cheapest blow, and the most important number in the mode. See the note
   * at the top: this is what a batter pays for the safe mistake, so it decides
   * how long he can go on making it.
   */
  GLOVES: 11,
};

/** What a blow costs, by where it lands and how fast it arrived. */
export function damageFor(where: BodyPart, speedKph: number): number {
  const pace = speedKph / HEALTH.nominalKph;
  return Math.round(DAMAGE[where] * pace * pace);
}

/**
 * The bowling, and it is all quick. Two thirds of it is between 138 and 165,
 * which is the pace this mode is *about*; the slower ball is rare enough to
 * still be a surprise when it comes, and it is the ball this model punishes
 * hardest, because it is the one everybody plays early.
 *
 * `RIB` is the delivery the classic table never had: back of a length, climbing
 * to about eighty centimetres at the batter and still under the bails by the
 * time it reaches the stumps. That is the whole of why it exists — it is the
 * only ball in the game that can hit you in the ribs *and* bowl you, so it has
 * to be read rather than simply survived. Above a rise of about 2.2 it clears
 * the stumps and is a bouncer; below about 1.8 it is a length ball. The window
 * is narrow and these numbers sit in the middle of it.
 */
export const STYLES: Record<DeliveryStyle, StyleShape> = {
  NORMAL: { weight: 0.17, min: 138, max: 150, label: 'SEAM', rush: 0.86 },
  FAST: { weight: 0.18, min: 152, max: 166, label: 'FAST', rush: 0.76, tight: true, aimWide: 0.4 },
  // Barely reactable, and meant to be: about 340ms from hand to bat, which is
  // inside the time it takes to choose a stroke. It is bowled at fifth stump
  // four times in five, because the punishment for an express ball is supposed
  // to be the drive you should not have played at it.
  EXPRESS: { weight: 0.09, min: 172, max: 186, label: 'EXPRESS', rush: 0.62, tight: true, aimWide: 0.8 },
  // Into the ribs, and aimed there. Dealt from the bag it came down the off side
  // as often as not, which is a ball nobody has to think about.
  RIB: { weight: 0.18, min: 142, max: 160, label: 'BACK OF A LENGTH', rush: 0.82, bounce: 9.6, rise: 2.0, aimBody: 0.75 },
  // A bouncer at fifth stump is a wide. This one is at his head.
  SHORT: { weight: 0.13, min: 158, max: 172, label: 'BOUNCER', rush: 0.72, tight: true, bounce: 10.4, rise: 2.9, aimBody: 0.8 },
  SLOWER: { weight: 0.05, min: 82, max: 100, label: 'SLOWER BALL', rush: 1.15 },
  SWING_IN: { weight: 0.10, min: 138, max: 152, label: 'INSWINGER', rush: 0.86, aimBody: 0.3 },
  SWING_OUT: { weight: 0.10, min: 138, max: 152, label: 'OUTSWINGER', rush: 0.86, aimWide: 0.45 },
  // The spinner's three balls. All three carry a zero weight because they are
  // never rolled for: the spell is given whole overs by SPIN below, and inside
  // one of those overs these are the only deliveries bowled.
  //
  // `rush` is doing real work here. At 90kph the arithmetic alone puts the ball
  // in the air for about eleven hundred milliseconds, which is the slower
  // ball's flight — and a spell where every delivery floats like the change-up
  // is a spell with no change-up in it. Pulled back to 0.78 it arrives in the
  // high eight hundreds: plainly slower than the seam bowler's six hundred, and
  // nowhere near the twelve hundred of the ball that is meant to deceive.
  //
  // Each turns from where a bowler of that kind actually pitches it, which is
  // most of what keeps a turning ball legal: the off-spinner starts it wide and
  // brings it back, the leg-spinner starts it at the pads and takes it away.
  // Neither carries an aim. Pitching every off break wide and every leg break at
  // the pads is how a real spinner keeps the ball in play, but it also announces
  // which way it is about to go before it lands — and a batter reading the turn
  // off the line is not reading the turn. They take their line from `turnable`
  // instead, which offers every line with room to turn away from; three of the
  // five are common to both, so where it pitches does not give the game away.
  OFF_SPIN: { weight: 0, min: 84, max: 96, label: 'OFF SPIN', rush: 0.78 },
  LEG_SPIN: { weight: 0, min: 82, max: 94, label: 'LEG SPIN', rush: 0.78 },
  // Held across the seam and pushed through quicker. It does not turn, and that
  // is the whole of it: the batter has spent an over playing for a ball that
  // moves and this one does not, and it is on him before he has finished
  // waiting for it.
  ARM_BALL: { weight: 0, min: 118, max: 130, label: 'ARM BALL', rush: 0.86 },
  YORKER: { weight: 0, min: 160, max: 174, label: 'YORKER', rush: 0.62, tight: true, bounce: 1.6, rise: 0.28 },
};

/**
 * The bowler answering what is done to him. Both counters are slacker than the
 * classic innings', and they have to be: perfect timing pays six here, so sixes
 * come in clusters and a yorker every third one would be a yorker every over.
 * The same goes for the change-up — nearly every ball in this spell is quick,
 * so classic's threshold of four would fire the slower ball every fourth
 * delivery and it would stop being a surprise at all.
 *
 * `shortChance` is zero because the short ball is in the weight table above
 * rather than rolled for separately.
 */
export const SPECIALS = { sixesForYorker: 4, quickForSlower: 9, shortChance: 0 } as const;

/**
 * How near a losing innings has to come before the card says so.
 *
 * A tailender's innings is lost nearly every time, and a card that says the
 * same flat thing about a man bowled off the third ball and a man bowled twelve
 * short of a hundred is a card that has stopped watching. These are the two
 * ways of being close — nearly there on runs, or nearly there on time — and
 * either one earns the better card.
 */
export const CLOSE = { byRuns: 20, byBalls: 50 } as const;

/**
 * The spinner's spell: which overs he is given, and what he does with them.
 *
 * Three of the ten. The third over is always his: the mode opens with two of
 * pace because that is what it is about — the batter has to be made to feel the
 * quick bowling before taking it away means anything — and then the ball is
 * tossed to the spinner on a fixed cue, so the change of pace arrives as an
 * event rather than as a coin landing.
 *
 * When he comes *back* is the open question. The other two are drawn fresh from
 * the seven overs after it, so a player cannot learn that the seventh is the one
 * to see off and bat to a timetable instead of to the ball.
 *
 * `maxFinalX` is the promise that a turning ball stays a cricket ball. The turn
 * is drawn from a range rather than fixed — a spinner who gives every delivery
 * the same revolutions is a bowling machine — but however far it bites, it
 * finishes no wider than the widest line the bag deals. A ball that pitches leg
 * and finishes a foot outside off is a wide, and a wide is not a test of
 * anything.
 */
export const SPIN = {
  ...SPIN_BOWLING,
  overs: 3,
  /** The over he is always given, counting from nought: the third. */
  notBefore: 2,
  /**
   * How often being beaten by a turning ball is a stumping.
   *
   * This is the spinner's wicket, and without it he had none. Beaten by the
   * quick bowler you are bowled or you survive, because the keeper is twenty
   * yards back and there is nothing else on; beaten by a spinner you are out of
   * your ground with a man standing over the stumps. It is also exactly the
   * dismissal this batter is built for — a number eleven who has been drawn
   * forward and has not got back is the stumping every tailender has been out
   * to — and it is what stops three overs of spin being three overs off.
   *
   * Only the two that turn. The arm ball beats him by going straight on, and
   * beating him from the crease is being bowled.
   */
  stumpedChance: 0.34,
} as const;

/**
 * How close to the batter a ball has to finish before it is coming at him
 * rather than at the stumps. He stands at `GAME.stanceX`, outside leg, so this
 * is what makes a rising ball angled into the body a different proposition from
 * the same ball aimed at off stump — one hits him, the other is a dismissal.
 */
export const BODY_ZONE = 0.22;

/** How far outside off a ball has to finish before playing at it risks the edge. */
export const OFF_WIDTH = 0.16;

/**
 * What a mistake costs, once the sign and the line have decided what kind of
 * mistake it was.
 *
 * `mishitCaught` is far below the classic innings' .75 on purpose. Three
 * wickets can absorb a skied shot; one cannot, and at classic's rate a hundred
 * runs could not be chased by anybody. `nickCarries` is the same idea for the
 * outside edge: a feather to the keeper is the most common way a tailender
 * goes, so it has to be frequent enough to fear and rare enough to bat through.
 */
/**
 * The ball a tailender can actually hit for six.
 *
 * Timing alone used to be the whole condition, and it made a six the reward for
 * being good at the game rather than for getting the one ball an hour that is
 * there to be swung at. A number eleven does not middle a 179kph delivery over
 * the rope however well he picks it up — he blocks it and waits. So the maximum
 * is gated on the ball first and the stroke second: full enough to swing
 * through, and slow enough to line up. Everything outside this is worth four at
 * the very best.
 *
 * Between this and the perfect window, a six comes round about once in
 * twenty-five balls, which `scripts/survive-sim.ts` reports on every run.
 */
export const SIX = { maxKph: 140, minBounce: 8.1, maxBounce: 8.6, minCompatibility: 0.9 } as const;

export const RISK = {
  /**
   * A ball skied to a fielder is taken far more often than not. The mode used
   * to drop three of every four, which read as the game letting him off — and,
   * with a mishit going up on every early stroke, it happened several times an
   * over.
   */
  mishitCaught: 0.62,
  /** A leading edge that loops to a close fielder rather than dying in the pitch. */
  leadingEdgeCaught: 0.14,
  nickCarries: 0.44,
  /** A ball that beats the bat on the stumps, with the batter's leg in the way. */
  lbwChance: 0.45,
  /**
   * Late on one that is straight. The ball catches the inside half of the bat
   * and almost always goes down into the pitch — this is the *common* way to
   * mistime, and making it a dismissal is what made the first build of this
   * mode end two innings in three inside an over.
   */
  playedOn: 0.10,
} as const;

/** A mistimed shot that goes up and lands safely is worth this, and never a boundary. */
export const SAFE_MISHIT: readonly (readonly [0 | 1, number])[] = [[0, 0.6], [1, 0.4]];

/** Middled, the grade still names the shot — but only these two are worth anything real. */
export const SURVIVE_TIMING: Record<TimingGrade, number> = { PERFECT: 1, GOOD: 0.82, OK: 0.58, POOR: 0.25, MISS: 0 };

/** The pitch is the pitch. Geometry comes from the classic config, unchanged. */
export const PITCH = {
  contactZ: GAME.contactZ, releaseZ: GAME.releaseZ, bounceZ: GAME.bounceZ,
  stumpZone: GAME.stumpZone, stumpHeight: GAME.stumpHeight, stanceX: GAME.stanceX,
} as const;

/** What the batter and bowler wear. Whites, and the ball stays red. */
export const WHITES = {
  shirt: 0xf2ece0, trousers: 0xf4f0e4, skin: 0xb77950,
  trim: 0xfbf7ec, cap: 0xe8e2d4, shoe: 0xfbf7ec,
} as const;
