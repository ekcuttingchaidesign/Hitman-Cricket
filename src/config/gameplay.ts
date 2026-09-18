import type { BallLine, DeliveryStyle, ShotType, TimingGrade } from '../game/types.js';
export const GAME = {
  totalBalls: 30, maxWickets: 3, ballsPerOver: 6, comboMs: 100,
  swipeDistance: 24,
  contactZ: 1.30, releaseZ: 18, bounceZ: 8.3, stumpZone: 0.18, stumpHeight: 0.76,
  // Where the batter stands: side of the stumps, and back down the crease. The
  // popping crease is 1.2m in front of the wicket, and a batter stands inside it
  // rather than over the stumps, so the ball is met about a metre in front of
  // them and there is daylight between his back foot and the bails.
  stanceX: -0.36, stanceZ: 1.00, creaseZ: 1.20,
  // Arcade time scaling gives the player time to read a 3D ball on a small
  // screen. It carries the shorter flight the deeper crease leaves, so every
  // delivery keeps the duration it was tuned to.
  travelScale: 1.79, readyMs: 550, runupMs: 840, resultMs: 1050, hitAnimationMs: 1250,
  timing: { perfect: 40, good: 78, ok: 135, poor: 205 }, fastTimingScale: 0.82,
  // How steeply a normal ball climbs off the pitch; specials override it.
  rise: 1.25,
  lbwChance: 0.6, aerialFlightMs: 1900, mishitCaught: 0.75,
  movement: 0.13, boundaryRadius: 30,
  // What a ball off a length takes to arrive, and how much of a slower one's
  // pace is held back off the hand and paid for later in the flight. See
  // `flightProgress`: this is the whole of what makes a slower ball a surprise.
  nominalFlightMs: 830, slowBallDrag: 0.62, maxSlowBallDrag: 0.42,
} as const;
export const LINES: BallLine[] = ['OUTSIDE_LEG', 'LEG', 'MIDDLE', 'OFF', 'OUTSIDE_OFF'];
/** The scoring strokes. Defence is not one of them and is never chosen for you. */
export const SHOTS: ShotType[] = ['LEG', 'LONG_ON', 'STRAIGHT', 'COVER_LONG_OFF', 'SQUARE_CUT'];
export const LINE_X: Record<BallLine, number> = { OUTSIDE_LEG: -0.42, LEG: -0.14, MIDDLE: 0, OFF: 0.14, OUTSIDE_OFF: 0.42 };
// The innings is medium-fast by default and everything else is a change from
// it: two thirds of the balls come out between 110 and 135, and the quick ones
// and the slow ones are what happens to a batter who has settled into that. A
// mix with a quarter of each is not a surprise, it is a lottery.
// `rush` shortens the flight beyond what the speed alone buys and `tight`
// squeezes the timing windows, so a quick ball is a jolt rather than a number.
// `bounce` and `rise` set the length: a yorker pitches at the toes and skids,
// a bouncer lands short and rears. Zero-weight styles are only ever bowled as
// specials, by the state of the innings.
/**
 * What a delivery style is. `aimBody` and `aimWide` are how often a bowler puts
 * this ball at the batter or at fifth stump rather than letting the bag of lines
 * deal it; the classic innings sets neither and its bowler aims at nothing.
 */
export interface StyleShape {
  weight: number; min: number; max: number; label: string;
  rush?: number; tight?: boolean; bounce?: number; rise?: number;
  aimBody?: number; aimWide?: number;
}
export const STYLES: Record<DeliveryStyle, StyleShape> = {
  NORMAL: { weight: 0.396, min: 122, max: 138, label: 'SEAM' },
  FAST: { weight: 0.154, min: 142, max: 158, label: 'FAST', rush: 0.80, tight: true },
  EXPRESS: { weight: 0.055, min: 164, max: 176, label: 'EXPRESS', rush: 0.64, tight: true },
  SLOWER: { weight: 0.066, min: 78, max: 98, label: 'SLOWER BALL', rush: 1.15 },
  SWING_IN: { weight: 0.170, min: 118, max: 140, label: 'INSWINGER' },
  SWING_OUT: { weight: 0.159, min: 118, max: 140, label: 'OUTSWINGER' },
  // The spinner's, and they carry no weight because he is not rolled for: he is
  // given the third over whole, the same as in the Test match. The pace table
  // below them describes the other four overs only.
  OFF_SPIN: { weight: 0, min: 84, max: 96, label: 'OFF SPIN', rush: 0.78 },
  LEG_SPIN: { weight: 0, min: 82, max: 94, label: 'LEG SPIN', rush: 0.78 },
  // The ball the spinner holds across the seam so it goes on with the arm
  // instead of turning. Survive's, and never bowled here — listed because the
  // table is keyed by every style the game knows.
  ARM_BALL: { weight: 0, min: 118, max: 130, label: 'ARM BALL', rush: 0.86 },
  YORKER: { weight: 0, min: 158, max: 170, label: 'YORKER', rush: 0.64, tight: true, bounce: 1.6, rise: 0.28 },
  SHORT: { weight: 0, min: 132, max: 168, label: 'BOUNCER', rush: 0.95, bounce: 10.4, rise: 2.9 },
  // Back of a length, climbing into the ribs. Survive's ball, and it is never
  // bowled here — it is listed only because the table is keyed by every style
  // the game knows. A zero weight is how YORKER and SHORT sit here too.
  RIB: { weight: 0, min: 140, max: 158, label: 'BACK OF A LENGTH', rush: 0.84, bounce: 9.6, rise: 2.0 },
};
/**
 * How a spinner bowls, in either innings.
 *
 * These are the numbers that make a turning ball a turning ball rather than a
 * slow one, and there is no reason for the two modes to disagree about them: a
 * ball that beats a full line and might go either way is the same delivery
 * whether it is bowled in a five-over slog or a Test match. What each mode
 * decides for itself is how many overs he gets and when — see `CLASSIC_SPIN`
 * here and `SPIN` in the Survive config.
 */
export const SPIN_BOWLING = {
  /** Adjacent lines sit 0.14 apart, so the floor is a ball that beats one. */
  minTurn: 0.22,
  maxTurn: 0.42,
  /** Neither side, ever: the widest lines sit at 0.42. */
  maxFinalX: 0.42,
  /** Placed in the over rather than rolled for, so it is never absent from it. */
  armBallsPerOver: 1,
  secondArmBallChance: 0.25,
} as const;

/**
 * The spinner's over in the classic innings: the third, and only the third.
 *
 * Five overs is not a spell, it is a cameo, so he gets one — and the same one
 * every innings, because with a single over a drawn position would mean a
 * player could go a whole game without meeting him.
 */
export const CLASSIC_SPIN = {
  ...SPIN_BOWLING,
  overs: 1,
  notBefore: 2,
  ofOvers: GAME.totalBalls / GAME.ballsPerOver,
  ballsPerOver: GAME.ballsPerOver,
};

// The bowler answers being hit, and mixes his pace up when he has been quick.
export const SPECIALS = { sixesForYorker: 3, quickForSlower: 4, shortChance: 0.13 };
export const QUICK_STYLES: readonly DeliveryStyle[] = ['FAST', 'EXPRESS', 'YORKER'];
export const COMPATIBILITY: Record<BallLine, Record<ShotType, number>> = {
  // Defence suits every line — the bat comes down in front of the stumps
  // wherever the ball is — and it is resolved on its own terms before any of
  // this is read.
  // The cut is the off side's square stroke, and it is at its best with width:
  // a ball he can free his arms at goes away behind point. On the stumps there
  // is no room to swing square, and down the leg side nothing at all.
  OUTSIDE_LEG: { LEG: 1, LONG_ON: 0.9, STRAIGHT: 0.3, COVER_LONG_OFF: 0.1, SQUARE_CUT: 0, DEFEND: 1 },
  LEG: { LEG: 1, LONG_ON: 1, STRAIGHT: 0.65, COVER_LONG_OFF: 0.25, SQUARE_CUT: 0.1, DEFEND: 1 },
  MIDDLE: { LEG: 0.55, LONG_ON: 0.85, STRAIGHT: 1, COVER_LONG_OFF: 0.85, SQUARE_CUT: 0.4, DEFEND: 1 },
  OFF: { LEG: 0.1, LONG_ON: 0.25, STRAIGHT: 0.65, COVER_LONG_OFF: 1, SQUARE_CUT: 0.85, DEFEND: 1 },
  OUTSIDE_OFF: { LEG: 0, LONG_ON: 0.1, STRAIGHT: 0.3, COVER_LONG_OFF: 0.9, SQUARE_CUT: 1, DEFEND: 1 },
};
export const TIMING_SCORE: Record<TimingGrade, number> = { PERFECT: 1, GOOD: 0.82, OK: 0.58, POOR: 0.25, MISS: 0 };
// A shot at least this compatible with the line counts as middled; below it the
// batter is reaching, and the ball goes up off the edge.
export const SOLID_SHOT = 0.55;
// Middled, the timing grade alone names the shot: perfect is six, good is four,
// and ok keeps it along the ground for these.
export const GROUND_RUNS = [[1, 0.45], [2, 0.35], [3, 0.20]] as const;
// The cut is the only stroke that scores behind square: past ninety degrees the
// ball runs away behind point rather than in front of it.
export const SHOT_ANGLES: Record<ShotType, number> = { LEG: -52, LONG_ON: -24, STRAIGHT: 0, COVER_LONG_OFF: 24, SQUARE_CUT: 100, DEFEND: 0 };
/**
 * The square cut. It is the one stroke that answers a bouncer outside off: the
 * ball sits up at chest height with width on it, and a batter who rocks back
 * and frees his arms puts it away square. `minWidth` is how far outside off the
 * ball has to be before there is room to play it at all — cut at one close to
 * the body and the arms are cramped, which is the edge rather than the stroke.
 *
 * Timing does the rest. Middled it is six or four the way any stroke is; late
 * or early and the ball takes the edge and carries to the keeper, which is the
 * price of playing square to a ball doing something off the pitch.
 */
export const CUT = {
  /**
   * How far outside off a short ball has to finish before there is room to cut
   * it. This gates the bouncer alone: a ball rearing at the body cannot be cut
   * however well it is read. Off a length the stroke is judged by the
   * compatibility table like every other, which is more forgiving, because on a
   * length a ball on off stump can still be cut square.
   */
  minWidth: 0.24,
  /** Above this the ball is up at the chest and the stroke is played standing tall. */
  highBallY: 0.78,
  timing: { six: 'PERFECT', four: 'GOOD' } as const,
  edged: 'EDGED — CAUGHT BEHIND!',
} as const;
/**
 * When the off-side drive is played square rather than through cover.
 *
 * This is a variation on one input, the way the pull is a variation on the
 * leg-side drive and the standing cut is a variation on the cut: the player
 * swipes for the off-side drive and the stroke he gets depends on the ball. A
 * ball wide of off and full enough to drive is driven square of the wicket; the
 * same swipe at anything straighter or shorter is still the cover drive.
 *
 * It changes no scoring. Where the ball goes is the cover drive's business, and
 * `SHOT_ANGLES` is unchanged: this is how the stroke is played, not where it
 * is hit. Widening those two things at once is how a rig change turns into a
 * balance change nobody asked for.
 */
export const SQUARE_DRIVE = {
  /**
   * How far outside off the ball has to finish before there is room to free the
   * arms and hit it square. This is roughly the inside edge of the OUTSIDE_OFF
   * line once movement is accounted for: the wide one is driven square, the one
   * on off stump is driven through cover, which is what the two strokes are for.
   */
  minWidth: 0.30,
  /**
   * Above this the ball is up off a length or higher and there is no driving it
   * off the front foot — that ball is the cut's. A length ball arrives at .54
   * and a yorker at .19; back of a length is .81 and a bouncer 1.13, so this
   * takes the two a batter can get under and leaves the two he cannot.
   */
  maxBallY: 0.70,
} as const;
// A defensive shot: timed this well or better it is dead at his feet, and
// nothing can be caught off it. Worse, and the ball goes on past the bat — at
// the stumps, that is the end of it.
export const DEFENCE = { timing: ['PERFECT', 'GOOD', 'OK'] as readonly TimingGrade[], feedback: 'DEFENDED' } as const;
// Confidence is earned by scoring and lost by not scoring: boundaries and hard
// running fill the meter and a dot ball drains it, while a single leaves it
// where it stands — nudging one is not a failure. A wicket empties it, and
// roughly four scoring shots fill it from nothing.
export const CONFIDENCE_STEP: Record<number, number> = { 6: 28, 4: 22, 3: 16, 2: 12, 1: 0, 0: -18 };
export const CONFIDENCE_FULL = 100;
/**
 * The one ball you can charge: straight at the stumps, on a length, and at a
 * bowler's pace. A yorker pitches at your toes, a bouncer over your head, and
 * neither a slower ball nor an express one gives you the time to walk at it —
 * so the length and speed windows exclude every special without naming them.
 * Line is the stump zone rather than the middle stump alone: pinned to one line
 * of five, a chargeable ball came round barely twice an innings and the meter
 * filled with nothing to spend it on.
 */
/**
 * The slog sweep: the second special stroke, and the spinner's answer to the
 * charge. A full meter buys one, the same as the charge does, and spending it
 * empties it the same way — a run of form, not a bank balance.
 *
 * It is a Blast stroke only, and only against spin. There is no sweeping a
 * quick: the whole shot is built on getting down early to a ball that is slow
 * enough to wait for, and a batter who kneels to a seamer is a batter who has
 * been hit. That restriction is also what keeps it from ever colliding with
 * the charge, which needs a bowler's pace and so can never be offered on the
 * same ball.
 *
 * Middled it clears midwicket. Timed a shade under, it still beats the field
 * but along the ground and over the rope on the bounce — four either way to the
 * scorer, and two plainly different balls to watch.
 */
export const SWEEP = {
  /** Only the turning ball. The arm ball goes on with the arm and is not one. */
  styles: ['OFF_SPIN', 'LEG_SPIN'] as readonly DeliveryStyle[],
  /** The leg-side inputs. Sweeping is a leg-side stroke and asks for a leg-side swipe. */
  shots: ['LEG', 'LONG_ON'] as readonly ShotType[],
  /** Middled is six, a shade under is four. Worse than that and it is just the shot he played. */
  timing: ['PERFECT', 'GOOD'] as readonly TimingGrade[],
  /**
   * How full the ball has to pitch. Getting down to a ball dropped short is how
   * a sweep becomes a top edge, so the stroke is only offered at one he can get
   * under — and `bounceZ` is metres from the bowler, so further is fuller.
   */
  minBounceZ: 7.6,
  /**
   * Where it goes. Midwicket is between square leg and mid-on, so the sector
   * sits between `SHOT_ANGLES.LEG` and `SHOT_ANGLES.LONG_ON` — not outside the
   * pair of them. Wider than square leg is fine leg, which is a different shot
   * and a much worse one to be given for middling a slog.
   */
  angle: -38,
  feedback: { six: 'INTO THE CROWD!', four: 'SWEPT AWAY!' },
} as const;
export const ADVANCE = {
  minKph: 108, maxKph: 134, minBounceZ: 7.4, maxBounceZ: 9.4,
  // Any upward drive charges it. The gesture asked for is "swipe up", and a
  // thumb flick that drifts twenty degrees is still a swipe up — but the sectors
  // are 45 degrees wide, so pinning it to the straight drive alone threw the
  // shot away on a gesture the player had no way of knowing was off.
  shots: ['STRAIGHT', 'LONG_ON', 'COVER_LONG_OFF'] as readonly ShotType[],
  timing: ['PERFECT', 'GOOD'] as readonly TimingGrade[],
  feedback: 'OUT OF THE STADIUM!',
  /** How far down the pitch the charge carries him, and how long the walk back is. */
  stride: 1.75, walkBackMs: 1300,
} as const;
