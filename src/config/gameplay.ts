import type { BallLine, DeliveryStyle, ShotType, TimingGrade } from '../game/types.js';
export const GAME = {
  totalBalls: 30, maxWickets: 3, ballsPerOver: 6, comboMs: 100,
  // A swipe is a swipe once the thumb has moved `swipeDistance`, and is timed
  // there; which way it went is read once it has moved `swipeRead`, or where
  // it lifted if that is sooner. The first few pixels of a flick curl, so read
  // that early a cut swipe came out pointing at the late cut.
  swipeDistance: 24, swipeRead: 40,
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
  // The Marathon swing bowler's, and never bowled here: weightless.
  REVERSE_IN: { weight: 0, min: 142, max: 156, label: 'REVERSE SWING' },
  REVERSE_OUT: { weight: 0, min: 142, max: 156, label: 'REVERSE SWING' },
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
  // The scoops are resolved on their own terms too, by `SCOOP.lines`, and
  // these columns only restate that rule so the table is keyed by every shot.
  // So is the hook, by `HOOK.lines`: it is only ever played at a bouncer.
  // The late cut wants the ball going past off stump: on the stumps there is
  // no room to run it fine, and the bat comes down across a ball that bowls
  // him. See `LATE_CUT`.
  OUTSIDE_LEG: { LEG: 1, LONG_ON: 0.9, STRAIGHT: 0.3, COVER_LONG_OFF: 0.1, SQUARE_CUT: 0, DEFEND: 1, SCOOP: 0, REVERSE_SCOOP: 0, HOOK: 0, LATE_CUT: 0 },
  LEG: { LEG: 1, LONG_ON: 1, STRAIGHT: 0.65, COVER_LONG_OFF: 0.25, SQUARE_CUT: 0.1, DEFEND: 1, SCOOP: 1, REVERSE_SCOOP: 0, HOOK: 0, LATE_CUT: 0 },
  MIDDLE: { LEG: 0.55, LONG_ON: 0.85, STRAIGHT: 1, COVER_LONG_OFF: 0.85, SQUARE_CUT: 0.4, DEFEND: 1, SCOOP: 1, REVERSE_SCOOP: 0, HOOK: 0, LATE_CUT: 0.2 },
  OFF: { LEG: 0.1, LONG_ON: 0.25, STRAIGHT: 0.65, COVER_LONG_OFF: 1, SQUARE_CUT: 0.85, DEFEND: 1, SCOOP: 0, REVERSE_SCOOP: 1, HOOK: 1, LATE_CUT: 1 },
  OUTSIDE_OFF: { LEG: 0, LONG_ON: 0.1, STRAIGHT: 0.3, COVER_LONG_OFF: 0.9, SQUARE_CUT: 1, DEFEND: 1, SCOOP: 0, REVERSE_SCOOP: 1, HOOK: 1, LATE_CUT: 1 },
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
// The scoops are the two that go behind the wicket: over fine leg and the
// keeper's leg side, and over the slips. The hook goes behind square too,
// out across the front of him the way the bat swings, to backward square:
// sent finer it went back past his head towards the camera while the bat was
// still going the other way.
// The late cut goes finer than the cut, along the ground past the slips to
// third man: run down off the open face rather than struck.
export const SHOT_ANGLES: Record<ShotType, number> = { LEG: -52, LONG_ON: -24, STRAIGHT: 0, COVER_LONG_OFF: 24, SQUARE_CUT: 100, DEFEND: 0, SCOOP: -150, REVERSE_SCOOP: 150, HOOK: -112, LATE_CUT: 138 };
/**
 * The scoop and the reverse scoop: the third pair of special strokes, and the
 * first that go behind the wicket. A full meter buys one, the same as the
 * charge and the slog sweep, and playing it spends the meter whatever it was
 * worth — it is a stroke a batter commits to, not one he can check.
 *
 * Each has its ball. The scoop is played from in front of the stumps at a
 * ball on middle or leg, so the blade can get under it and ramp it over the
 * keeper's shoulder; the reverse wants width, off stump or outside, to get
 * the reversed face under. Neither is offered at a bouncer, which is over the
 * top of the whole idea. Wrong line and he is playing at air.
 *
 * Timing names the rest. Middled it clears the keeper for six; a shade under
 * and it beats the field on the bounce for four; held back it is paddled away
 * for ones, twos and threes. Poor timing is the top edge, and a top edge with
 * the keeper standing behind is a catch. Miss it altogether and the stroke has
 * left nothing but the pads between the ball and the stumps.
 */
export const SCOOP = {
  shots: ['SCOOP', 'REVERSE_SCOOP'] as readonly ShotType[],
  /** Which lines each answers, read off where the ball finishes. */
  lines: { SCOOP: ['LEG', 'MIDDLE'], REVERSE_SCOOP: ['OFF', 'OUTSIDE_OFF'] } as Record<'SCOOP' | 'REVERSE_SCOOP', readonly BallLine[]>,
  /**
   * The swipe: down and to one side, from here, measured off vertical either
   * side, round to the block's fan (`SWIPE_ZONES`). The leg-side and cut
   * swipes keep everything above it.
   */
  sector: { from: 110 },
  /**
   * A scooped-at ball that beats the bat has him crouched right in front of
   * the stumps with the bat out of the way, so it is given LBW about as often
   * as bowled.
   */
  lbwChance: 0.5,
  feedback: {
    SCOOP: { six: 'SCOOPED OVER THE KEEPER!', four: 'SCOOPED AWAY — FOUR!' },
    REVERSE_SCOOP: { six: 'REVERSED OVER THE SLIPS!', four: 'REVERSE SCOOP — FOUR!' },
  },
  topEdge: 'TOP-EDGED — CAUGHT BEHIND!',
  /** Played at the wrong ball. Said so, so the rule teaches itself. */
  wrongLine: { SCOOP: 'TOO WIDE TO SCOOP', REVERSE_SCOOP: 'TOO STRAIGHT TO REVERSE' },
} as const;
/**
 * The hook: a bouncer on off stump or wider, hooked round to fine leg off the
 * back foot. He goes back and across to get inside the line, meets it in
 * front of the chest with the bat level, and swings it on round behind
 * square. An ordinary stroke — no meter — off the down-and-to-leg diagonal,
 * which on any other ball is a scoop's or nothing's: no special stroke is
 * played at a bouncer, so on this one the diagonal is free.
 *
 * Timing names it. Middled it goes over fine leg for six, a shade under and
 * it runs away there for four, held back it is helped round for ones and
 * twos. Anything worse is the price of hooking: late and it takes the glove
 * on the way through to the keeper, early and it goes off the top of the bat
 * and straight up, and somebody is under it. Missed, it flies on over the
 * stumps, which a bouncer cannot hit.
 */
export const HOOK = {
  /** Which bouncers it answers, read off where the ball finishes. */
  lines: ['OFF', 'OUTSIDE_OFF'] as readonly BallLine[],
  feedback: { six: 'HOOKED FOR SIX!', four: 'HOOKED — FOUR!' },
  gloved: 'GLOVED — CAUGHT BEHIND!',
  skied: 'TOP EDGE — CAUGHT!',
} as const;
/**
 * Where the swipes split, by mode: how far either side of straight down the
 * block reaches (`block`, in degrees), and where down-and-to-off stops being
 * the cut and starts being the late cut (`lateCut`, off vertical). Between
 * them the late cut runs down to the block, and on the leg side the leg-side
 * stroke runs all the way round to it — at a bouncer the pull or the hook,
 * whichever the ball's line calls for (`playedAs`).
 *
 * Nobody blocks in the Blast, so its block is thirty degrees; in Survival and
 * the Marathon, where it keeps a batter in, fifty. Modelled with a thumb
 * twelve to twenty degrees off what it meant, a late cut landed 75% and 53%
 * of the time in the old thirty-degree band, against 92% and 74% in the
 * Blast's and 85% and 62% in the Tests', and a down-left swipe at a bouncer
 * played the hook only a third of the time: at a bouncer on the body there
 * was no hook, and down-left sat on the line between the pull and the block.
 */
export interface SwipeZones { block: number; lateCut: number }
export const SWIPE_ZONES: { blast: SwipeZones; test: SwipeZones } = {
  blast: { block: 15, lateCut: 117.5 },
  test: { block: 25, lateCut: 120 },
};
/**
 * The late cut: off the back foot, the ball let come past him and run down
 * off an open face to third man. Not struck — guided — so its best is four,
 * never six. Down and to off without a meter, between the cut and the block
 * (`SWIPE_ZONES`); the reverse scoop takes it when the meter is full and the
 * ball is one to reverse. In every mode, at pace or spin.
 *
 * It wants a ball going past off stump (`COMPATIBILITY`'s `LATE_CUT`):
 * across one on the stumps the bat comes down too late to save them. On its
 * ball, timing names it: middled four to third man, a shade under two or
 * three (a single or two in a Test, where nobody runs three), held back one or
 * two (one), and poor off the edge to the keeper three times in four (`caught`),
 * else a thick edge down for a single.
 */
export const LATE_CUT = {
  /** Under this fit to the line he is across the ball, and misses it. */
  minFit: 0.25,
  good: { three: 0.4 },
  ok: { two: 0.35 },
  caught: 0.75,
  feedback: { four: 'LATE CUT — FOUR!', caught: 'EDGED — CAUGHT BEHIND!', edged: 'THICK EDGE — 1 RUN' },
} as const;
/**
 * The cut off the spinner. A slow ball gives a batter time to make room, so
 * the cut is not only for the one wide of off: he steps away to leg as he
 * picks the bat up, far enough to leave the ball out on his off side whatever
 * line it is on, and cuts it off the back foot. The off-spinner's ball,
 * pitched outside off and turning into him, and the leg-spinner's, pitched on
 * leg and turning away, are both his to cut. Down the leg side he has to go a
 * long way for it, and the further he goes the more of the stumps he shows:
 * missed, a straight one bowls him. A ball that finishes outside leg — the
 * off break pitched round leg and turning on down it — is one step too far:
 * it keeps coming into him as he backs away, and he is cramped (`cramped`),
 * so the cut is not one swipe for every ball the spinner bowls and the turn
 * still has to be read.
 *
 * `fit` is how well each line suits it, read where the turn leaves the ball,
 * in place of the cut's own column, which wants width.
 */
export const SPIN_CUT = {
  fit: { OUTSIDE_LEG: 0.5, LEG: 0.85, MIDDLE: 1, OFF: 1, OUTSIDE_OFF: 1 } as Record<BallLine, number>,
  /**
   * Cut at the ball finishing outside leg. The bat still comes down across him
   * to off, so whatever it meets goes that way, along the ground and without
   * the arms behind it: middled it is squeezed off the bottom of the bat to
   * point for one, or two (`two`); a shade under it is a single or straight
   * to the man there (`single`); worse it comes off the inside edge onto his
   * pad, dead; poor and it is gloved through to the keeper more often than
   * not (`caught`). Missed, it goes by down the leg side, where it can bowl
   * nobody. It never beats the field for four.
   */
  cramped: {
    two: 0.35, single: 0.5, caught: 0.75,
    feedback: { fielded: 'STRAIGHT TO POINT', padded: 'INSIDE EDGE', caught: 'GLOVED — CAUGHT BEHIND!', missed: 'PLAYED AND MISSED' },
  },
} as const;
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
  /**
   * Judged on timing alone, the way the cut is, because it is the same bargain:
   * a ball wide enough to free the arms at is a ball there is no excuse for.
   * Middled it goes square for six, a shade under for four, worked away along
   * the ground below that — and driven at and missed by more than that, it
   * takes the edge.
   *
   * That last part is the point of the pairing. Chasing a wide half-volley and
   * nicking it behind is the most common way a batter gets out to a good
   * bowler, and until this the drive had no edge in it at all: a mistimed one
   * could only balloon up and be caught in the field. Width now pays the best
   * and punishes the worst, which is what makes taking it a decision.
   */
  timing: { six: 'PERFECT', four: 'GOOD' } as const,
  edged: 'DROVE AT IT — CAUGHT BEHIND!',
  /**
   * Square of the wicket on the off side, between the cover drive's 24 and the
   * cut's 100. A stroke called the square drive that went to extra cover was
   * always going to read oddly; it only did because until now the stroke was an
   * animation with no say in where the ball went.
   */
  angle: 62,
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
/**
 * The orthodox sweep: the same stroke as the slog, played by anybody.
 *
 * It shares the slog's ball — only a spinner, only one pitched up far enough to
 * get under — and the whole of its body. What it does not share is the meter or
 * the arc. The blade is held level all the way round instead of climbing, and a
 * level blade cannot lift a ball over anybody, so this stroke never goes for
 * six and never goes in the air at all. It is the stroke a batter plays to keep
 * the score moving against spin, and it is paid that way: four for the one he
 * middles, down to a single for the one he does not.
 *
 * The risk is the one the shot has in cricket. Playing across the line with the
 * bat travelling horizontally leaves nothing behind it but the pads, so a ball
 * he misses is a ball with his stumps at the end of it.
 */
export const FLAT_SWEEP = {
  /** The slog's ball exactly: see `SWEEP` above, and `sweepable` reads both. */
  styles: SWEEP.styles,
  /**
   * The square leg-side input only. The slog also takes `LONG_ON` because it is
   * hit in front of square; this one goes square, and asks for the swipe that
   * points there.
   */
  shots: ['LEG'] as readonly ShotType[],
  /** Timing alone decides it. There is no grade here that is worth nothing. */
  runs: { PERFECT: 4, GOOD: 3, OK: 2, POOR: 1 } as Record<Exclude<TimingGrade, 'MISS'>, 1 | 2 | 3 | 4>,
  /**
   * Square leg: squarer than the slog's midwicket and squarer than the leg-side
   * swipe that plays it, because the blade is level and travelling across the
   * line rather than through it.
   */
  angle: -80,
  /**
   * Pitched wider of leg stump than this and he cannot be LBW however plumb it
   * looks — the one law in cricket written for the man sweeping. It reads the
   * line the ball was bowled on rather than where it finished, because pitching
   * is what the law is about and a ball that turns back in has still pitched
   * outside leg.
   */
  outsideLegX: -0.20,
  /**
   * Higher than `GAME.lbwChance`. Missing a sweep is the classic way to be
   * given out: the bat is over his shoulder, he is down on one knee, and the
   * pad is the next thing the ball meets.
   */
  lbwChance: 0.7,
  /**
   * What he gets for sweeping at one going the other way.
   *
   * The stroke is offered at the ball turning *into* him, where the turn brings
   * the ball onto a face that is travelling to meet it. Turning away it does
   * the opposite: the face goes one way, the ball the other, and what the two
   * of them meet on is the top edge. That is the real dismissal for the real
   * mistake, so it is the one the game gives — and it is certain rather than
   * rolled for, because a rule a player meets once should teach him the rule.
   */
  topEdge: 'TOP-EDGED \u2014 CAUGHT!',
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
  /**
   * The cover input plays the charge inside out, over extra cover: its own
   * stroke and its own call, and the ball leaves squarer than long-off.
   */
  coverFeedback: 'INSIDE OUT — OVER COVER!',
  coverAngle: 38,
  /**
   * How many degrees closer to vertical the cover swipe reaches while the
   * charge is on. A little: the straight charge keeps 14.5 degrees on that
   * side and all of the other, so an honest swipe up still walks straight.
   */
  coverLean: 8,
  /**
   * And the long-on input, mirrored: the charge over long-on, hit a little
   * squarer than the long-on sector, with its own call. The swipe leans the
   * same eight degrees towards vertical on that side.
   */
  onFeedback: 'LAUNCHED OVER LONG-ON!',
  onAngle: -34,
  /** How far down the pitch the charge carries him, and how long the walk back is. */
  stride: 1.15, walkBackMs: 1300,
} as const;
