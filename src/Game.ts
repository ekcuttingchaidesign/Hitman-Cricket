import { handleOf, ownsHandle } from './game/handle';
import { fetchActivity, fetchProfile, saveBio } from './game/profile-api';
import { cleanBio } from './server/bio-rules';
import {
  againLabel, beaten, close, placeOnPassing, surviveGoal, surviveResultOf, surviveSurely, surviveVerdict, verdict, type Chase, type Mine,
} from './game/chase';
import { chaseBarMarkup, chaseStripMarkup } from './ui/ChaseUi';
import { heroView } from './game/rank-hero';
import { rankHeroMarkup } from './ui/RankHero';
import { tookTheTop, topSpotView, type TopSpotView } from './game/top-spot';
import { TopSpot } from './ui/TopSpot';
import { buzz } from './game/haptics';
import { type GameMode, isTest } from './game/modes';
import { blastLights, keepLights } from './game/lights';
import { ADVANCE, CONFIDENCE_FULL, GAME, STYLES, SWIPE_ZONES } from './config/gameplay';
import { HEALTH, SURVIVE } from './config/survive';
import { INTRO_STEPS, introDue, noteIntro, type IntroGame } from './ui/MarathonIntro';
import { CONFIDENCE_STEP, FIELD_STEP, SHOTS_STEP, fieldIntroDue, howToDue, noteFieldIntro, noteHowTo, playedBefore } from './ui/ShotsIntro';
import { CONFIDENCE as MARATHON_CONFIDENCE, LEVEL_BANNER_MS, MARATHON, SETTLE } from './config/marathon';
import type { ArenaCue } from './scene/arena';
import { askedGround, groundFor } from './scene/grounds';
import type { SkyTime } from './scene/sky';
import { SUPER10, batterAt as super10Batter, windowsAt as super10Windows } from './config/super10';
import {
  SURGE, bowlerOf, drawnOf, fieldFor, fieldRules, offScreen, planFor, signalFor, steer, steerOf, surgeAuto, surgeOffered, type FieldSet,
} from './game/super10-field';
import { FieldUi } from './ui/FieldMap';
import { sectorOf } from './scene/flight';
import { MarathonInnings, leftHandersOf, marathonFigures, type Change } from './game/Marathon';
import { soloOf, teamOf, type SoloRow, type TeamRow } from './game/marathon-board';
import { marathonOffer, type MarathonLadder } from './ui/MarathonBoard';
import { shownKph } from './game/speed-gun';
import { Confidence, landedSpecial, pulledBouncer } from './game/Confidence';
import { Health } from './game/Health';
import { TAILENDER, endingOf, resolveSurvive, resultOf, sledgeDue, teamScore } from './game/Survive';
import { EASE, easeFor, easedSkill, easedWindows, notePlayed, playedIn, seedPlayed } from './game/newcomer';
import { CLASSIC_LIMITS, type InningsLimits } from './game/ScoreManager';
import { CLASSIC_PLAN, MARATHON_PLAN, NETS_BOWLERS, SUPER10_PLAN, SURVIVE_PLAN, bouncersEvery, lateCutsEvery, spinCutsEvery, spinPullsEvery, marathonFastWear, marathonOnly, roundEvery, spun, withoutYorkers, type NetsBowler } from './game/DeliveryGenerator';
import { Sledger } from './game/Sledge';
import { GameAudio, outcomeSound } from './game/Audio';
import { DeliveryGenerator } from './game/DeliveryGenerator';
import { ballPosition, effectiveLine, flightProgress } from './game/DeliveryTrajectory';
import { InputManager } from './game/InputManager';
import { ScoreManager } from './game/ScoreManager';
import { SeededRandom } from './game/SeededRandom';
import { ShuffleBag } from './game/ShuffleBag';
import { MARK_OF, milestoneOf, nearingEnd, nearingOf, type Milestone, type Moment, type Nearing } from './game/milestone';
import { COVER_V3_MEETS_AT, ON_DRIVE_MEETS_AT, HOOK_MEETS_AT, PULL_HEIGHT, PULL_MEETS_AT, DEFENCE_BACK_HEIGHT, DEFENCE_BACK_MEETS_AT, DEFENCE_FRONT_MEETS_AT, LATE_CUT_MEETS_AT, PUNCH_MEETS_AT, SLOG_MEETS_AT, SPIN_PULL_MEETS_AT, coverRoll, coverVersionOf, loftVersionOf, pullVersionOf, flickVersionOf, flickBackFoot, FLICK_MEETS_AT, FLICK_V3_MEETS_AT, type FlickVersion, type LoftVersion, type PullVersion, type Celebration, celebrationLength } from './entities/Batter';
import { COUNTED, countStroke, freshTally, strokeMarks } from './game/stroke-tally';
import { advanceShot, gradeOf, gradeTiming, hookable, loftedDrive, playedAs, punch, spinCut, spinPull, scoopLine, scoopShot, scoopable, slogSweep, sweeps, chargeable, sweepable, squareDrivable, resolveShot } from './game/ShotResolver';
import { TUTORIAL, tutorialDelivery, tutorialOutcome } from './game/Tutorial';
import type { Delivery, Ending, GamePhase, ShotAttempt, ShotOutcome, ShotType, TimingGrade } from './game/types';
import type { BoardFrame, PauseTone, Primed } from './ui/HUD';
import { BOARD_MODES, type BoardContext } from './ui/Board';
import { GameScene } from './scene/GameScene';
import { AFTER_MS, CUE, reelCamera, reelDelivery, reelLength, reelMeets, reelOutcome, reelPace, reelStroke, reelTimes, type ReelBeat, type ReelShot, type ReelTimes } from './game/ShotReel';
import { POWER_DOODLE_MS, POWER_STYLES, PULL_DOODLE_MS, PULL_PENS, type PowerStyle, type PullPen } from './ui/Milestone';
import { HUD } from './ui/HUD';
import { boundaryCheer, boundaryStreak, GROAN, HUSH, milestoneCheer, MURMUR, nearMiss, RUNUP, SEND_OFF } from './game/crowd';
import { afterBall, disappointment, HABITS, outNearMilestone, PACES } from './game/afterBall';
import type { AfterBall, CoverVersion, Hurt } from './entities/Batter';
import {
  chaseFor, claimName, fetchBoard, fetchMarathonBoard, fetchStanding, fetchSurviveBoard, forgetBoard, submitInnings, submitMarathon,
  submitSurvive,
  type BoardPayload, type SurvivePayload, type MarathonPayload, type SubmitResult,
} from './game/board-api';
import {
  forgetPasswordKnown, markPasswordKnown, markProfileDone, onPlayerWritten, passwordKnown, profileDone,
  readHand, readPlayer, writeHand, writePlayer, type Hand,
} from './game/player';
import { leaveTicket } from './game/return-ticket';
import {
  offerRestoreHere, restoreOfferDismissed, restoreOfferDone, restoreOfferShown,
} from './game/restore-offer';
import { cardOffer, type BoardTab, type CardOffer, type SheetTab } from './ui/Leaderboard';
import {
  bestStanding, careerBoardOf, placesOf, type AnyCareer, type LadderTab,
} from './ui/CareerBoard';
import { statsFacts, type StatsFacts } from './game/StatsCard';
import { gameLink, keyWhatsappLink } from './game/Share';
import { keyImage, keyImageName, prepareKeyAssets } from './game/KeyImage';
import {
  countInnings, fetchCareerBoards, fetchMyCareer, forgetCareer, heldCareer, mintNonce,
  type CareerBoards, type CareerRow,
} from './game/career-api';
import { blastTally, emptyBlast, emptyMarathon, emptySurvive, type BlastTally, type CareerMode, type MarathonTally, type SurviveTally } from './game/career';
import { demoBoard, demoCareers, demoMarathon, demoRivals, demoSurvive, demoWanted, fillMarathon, fillRivals } from './game/demo-board';
import { forgetKey, keepKey, keyView, markKeySaved } from './game/recovery';
import {
  findPlayers, findQuestion, firstCareerKey, newCareerKey, passwordStatus, recoverByAnswer, restoreByPassword, restoreRecord,
  setCareerPassword,
} from './game/recovery-api';
import { endCardDue, readIgnored, sheetDue, statsCardDue, writeIgnored, type PasswordState } from './game/password-nudge';
import type { RestoreEntry } from './ui/HUD';
import type { PasswordEntry, PasswordMode } from './ui/Password';
import type { LocalCareer } from './ui/Restore';
import type { StatsSheetView, StatsSlide } from './ui/StatsSheet';
import { headline } from './ui/Activity';
import type { BatterKit } from './entities/Batter';
import { markWhatsNewShown, whatsNewDue } from './game/whats-new';
import type { StoriesWhere } from './ui/WhatsNew';
import { climbedTo, standingOf, tierMeasure, TIERS, type Granted } from './game/tier';
import { LevelUp } from './ui/LevelUp';
import { BATS, FREE_BAT, FREE_OUTFIT, FREE_OUTFITS, OUTFITS, WELCOME_BAT, batOf, batOwned, earned, outfitOf, outfitOwned, type BatId, type BatSkin, type DressingRecord, type Outfit, type OutfitId } from './game/dressing';
import type { DressingRoom } from './ui/DressingRoom';
import type { UnlockItem, UnlockMoment } from './ui/Unlock';
import { onDressingWrite, readDressing, seenKey, writeDressing } from './game/dressing-store';
import { gloveOf, type GloveDesign, type GuardId } from './entities/gloves';
import { fetchSaved, sendSaved } from './game/dressing-api';
import { mergeDressing, sameDressing, type SavedDressing } from './game/dressing-sync';
import type { ModeSelectView } from './ui/ModeSelect';
import { RECENT_MS, coverParallax, type CoverBoard } from './ui/Cover';
import { HEADLINE_MS, answeredBy, noteAnswered, readAnswered } from './game/answered';
import { surviveLine as surviveResult } from './ui/SurviveBoard';
import type { BlastCareer, MarathonCareer, SurviveCareer } from './game/career';
import type { SurviveInnings } from './game/survive-board';
import { openFeedback } from './ui/Feedback';
import { feedbackGiven, type FeedbackContext } from './game/feedback';
import { sendExcited, sendFeedback } from './game/feedback-api';
import { EXCITED_KEY, excitedAlready } from './ui/Super10Page';
import { askRating, type RatingPrompt } from './ui/Rating';
import {
  counted, dismissed, mintRef, nextAsk, rated, readMemory, writeMemory,
  type RatedMode, type RatedThing, type RatingMoment,
} from './game/rating';
import { asSurvive, surviveOffer } from './ui/SurviveBoard';
import type { SurviveRow } from './game/survive-board';
import { adoptPlayerId, playerId } from './game/identity';
import { asInnings } from './ui/Leaderboard';
import type { BoardRow } from './game/leaderboard';
import {
  ballsBand, blowsBand, counting, inningsBand, injuryBand, marathonBestBand, marathonOversBand, marathonTotalBand, marksPassed,
  restoreFailure, roomBand, scoreBand,
  track, trackOnce,
} from './game/analytics';
import { hurtNoteSeen, markHurtNoteSeen } from './game/private-mode';
import { practiceSwitches } from './game/practice';
import { readVisits, today, visiting, writeVisits } from './game/visits';
import { ChallengeRun, ageOf, emptyList, noteResult, recentForm, rivalryView, roomView, type ListView, type Me, type RoomView } from './game/Challenge';
import {
  CODE_PARAM, challengeLink, copy, fetchRivalsBoard, hideChallenge, rivalryEntries, seenHere, whatsapp, type Challenge, type RivalsRow,
} from './game/challenge-api';
import type { GhostBall, ListRowView, ListSections, RoomAct } from './ui/HUD';
import { NAME_BLOCKED_REASON, nameBlocked } from './server/name-filter';
import { nameProblem, renameReason, siblingReason } from './server/name-rules';
import { cleanName, foldName } from './server/board-store';
import { kitDeal } from './config/board';
import { encodeInnings } from './game/ball-string';
import { demoRoom, demoWanted as roomDemoWanted } from './game/room-demo';
/** The phases that count as playing. Not the cover, the end card or a pause. */
const LIVE: GamePhase[] = ['READY', 'BOWLER_RUNUP', 'BALL_IN_FLIGHT', 'SHOT_RESOLVE', 'RESULT'];

/** How long a counted innings waits before its second and final attempt. */
const RETRY_MS = 4000;
/** This browser's storage, as the newcomer's count reads and writes it. Storage turned off reads as empty. */
const readStored = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const writeStored = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* Then it is not kept. */ } };
/** The longest the name sheet says SAVING… before it treats the board as away. */
const PROFILE_PATIENCE_MS = 8000;
/**
 * How long the end card stands on its own before the stars rise under it. Long
 * enough to read the score, which is what the player is looking at first.
 */
const RATING_DELAY_MS = 1600;
/** How long the end card stands before an unlock goes over it. */
const UNLOCK_DELAY_MS = 1100;
/** How long after a change to the Dressing Room it is sent to the store: a run of taps is one save. */
const DRESSING_SEND_MS = 1500;
/** Which innings is being played. The two share a loop and almost nothing else. */
export type { GameMode } from './game/modes';

/**
 * Whether this bundle was built to play Survive and nothing else. Set by the
 * GitHub Pages workflow, and the reason that deployment can exist at all: the
 * host cannot serve the board's two functions, and this build never asks it to.
 */
const SURVIVE_ONLY = !!import.meta.env.VITE_SURVIVE_ONLY;
/**
 * Super10's playtest build for GitHub Pages, as Survive's is: Super10 and
 * nothing else, practice as it is everywhere until it has a board, with no
 * server behind it (`main.ts` keeps the player in the browser, as a private
 * window does). The other modes, the boards and the stories are not reached.
 */
const SUPER10_ONLY = !!import.meta.env.VITE_SUPER10_ONLY;
/** A build published where nothing answers `/api`: no board, and nothing that goes looking for one. */
const NO_BOARD = SURVIVE_ONLY || SUPER10_ONLY;

/**
 * Whether this build offers the Test match at all.
 *
 * Off unless asked for. The mode is still in playtest and the production ground
 * is not where that happens — somebody arriving for the five-over innings should
 * get the five-over innings, not a choice between it and a mode still being
 * tuned. The Pages build sets `VITE_SURVIVE_ONLY` and plays nothing else; every
 * other build gets the classic innings and no picker.
 *
 * `?mode=SURVIVE` still works, so the mode stays one link away for anyone
 * testing it. It is hidden, not removed.
 */
const SHOW_SURVIVE = SURVIVE_ONLY || !!import.meta.env.VITE_SHOW_SURVIVE;
/**
 * Whether the Test Marathon has a card on the picker.
 *
 * Everywhere but production until it launches: a preview is where it is
 * played and judged, and a player there should reach it the way a player will,
 * from Select Mode rather than from a link somebody remembered.
 * `VITE_SHOW_MARATHON` is the switch launch turns on for production.
 */
const SHOW_MARATHON = !SURVIVE_ONLY && (!!import.meta.env.VITE_SHOW_MARATHON
  || import.meta.env.VITE_VERCEL_ENV !== 'production');
/**
 * Whether the Test Marathon can be reached from here, and so whether its board
 * has a tab: from the picker, or from a link that names it (`?mode=marathon`).
 */
/**
 * Whether the new boards — the Marathon's two ladders and the Rivals ranking —
 * carry made-up rows among the real ones (`fillMarathon`, `fillRivals`). Off
 * production only: a preview nobody has played them on shows a board worth
 * looking at, and a real innings still lands in its true place among them.
 */
const PREVIEW_FILL = !SURVIVE_ONLY && import.meta.env.VITE_VERCEL_ENV !== 'production';
/** The ground a link asks for (`?ground=`), which every innings is then played on: otherwise the game and the lights pick it (`groundFor`). */
const ASKED_GROUND = askedGround(location.search);
/**
 * The visit's coins for the grounds, tossed once each so the venue holds for
 * the visit (`groundFor`): the Blast's, the pavilion under a half and the
 * stadium over; the Tests', the pavilion, the stadium and the canopy a third
 * each. Two coins, so the Blast's ground says nothing about a Test's.
 */
const VENUE_COIN = { blast: Math.random(), test: Math.random() } as const;
const MARATHON_OPEN = SHOW_MARATHON || (!SURVIVE_ONLY
  && new URLSearchParams(location.search).get('mode')?.toLowerCase() === 'marathon');
/**
 * Whether Super10 can be played here: off production only, from a link that
 * names it (`?mode=super10`), while it is built. It has no card on the picker
 * yet, no board and no career, so an innings of it is played and counted for
 * nothing (`practising`).
 */
/** How long the bowler waits at his mark in a break Power Surge is offered in. */
const SURGE_WAIT_MS = 1600;
/** The overs a Super10 crowd sends a Mexican wave round the arena at the top of: the third, sixth and eighth. */
const WAVE_OVERS = [2, 5, 7];
const SUPER10_OPEN = SUPER10_ONLY || (!SURVIVE_ONLY && import.meta.env.VITE_VERCEL_ENV !== 'production');
/** The mode a browser played last, which Choose a mode's rail opens on; a new player starts on the Blast. */
const LAST_MODE_KEY = 'hitman-last-mode';
function lastMode(): 'CLASSIC' | 'MARATHON' | 'SURVIVE' {
  try {
    const kept = localStorage.getItem(LAST_MODE_KEY);
    return kept === 'MARATHON' || kept === 'SURVIVE' ? kept : 'CLASSIC';
  } catch { return 'CLASSIC'; }
}

/**
 * When the ghost's ball appears, and how long it holds.
 *
 * There are 2,440ms between one ball resolving and the next being released —
 * `resultMs` 1050, `readyMs` 550, `runupMs` 840. The player's own result owns
 * the first beat; the ghost takes the second and is gone before the bowler
 * lets go. Neither number is guessed: they are read off `GAME`, so a change to
 * the innings' pacing carries the flash with it rather than leaving it stranded
 * over a delivery.
 */
const GHOST_AFTER_MS = 900;
const GHOST_FOR_MS = 1200;

/**
 * Whether the spinner bowls the whole innings.
 *
 * A playtest build, and it exists because of what this branch added: the flat
 * sweep, the slog sweep and the leg-side flick are now three different answers
 * to the same swipe, and which one is right depends on which way the ball is
 * turning. All three live in one over out of five, so looking at them meant
 * batting out two overs of seam first, every time. This hands him the lot.
 *
 * Nothing else changes — the same lines, the same turn, the same arm balls,
 * the same scoring. It is only ever the spinner at the other end.
 */
const SPIN_ONLY = !!import.meta.env.VITE_SPIN_ONLY;
/**
 * A playtest build for the charge: the meter is full every ball and every ball
 * can be walked at, so the stroke can be looked at without batting for it.
 * Set to `ball`, it is only the ball — on the stumps, on a length, at a medium
 * pacer's pace — with the meter left to the innings, for looking at the
 * strokes a perfect drive plays when there is no charge to play instead.
 */
const CHARGE_ONLY = import.meta.env.VITE_CHARGE_ONLY ?? '';
/**
 * How slowly the clock runs through the charge, for comparing playtest
 * builds against each other. Half speed unless a build says otherwise; 1 is
 * no slow motion at all.
 */
const CHARGE_SLOWMO = Number(import.meta.env.VITE_CHARGE_SLOWMO) || 0.65;

const SURVIVE_LIMITS: InningsLimits = {
  totalBalls: SURVIVE.totalBalls, maxWickets: SURVIVE.maxWickets, ballsPerOver: SURVIVE.ballsPerOver,
};
/**
 * The Marathon's, for `ScoreManager` alone: it keeps the team's runs and balls
 * for everything that reads them. When the innings ends is `MarathonInnings`'s
 * to say — a batter carried off is not a wicket, but he is gone.
 */
const MARATHON_LIMITS: InningsLimits = {
  totalBalls: MARATHON.maxBalls, maxWickets: MARATHON.batters, ballsPerOver: MARATHON.ballsPerOver,
};
/** Super10's: ten overs, three wickets, and `ScoreManager` ends it on either. */
const SUPER10_LIMITS: InningsLimits = {
  totalBalls: SUPER10.totalBalls, maxWickets: SUPER10.maxWickets, ballsPerOver: SUPER10.ballsPerOver,
};

/** The longest the bowler waits past `readyMs` for the field to be back on its marks. */
const FIELD_WAIT_MS = 6000;
/**
 * And for the batter to finish tapping his bat down (`Batter.tapping`): a tap
 * is about a second and a quarter, and one cut short by the run-up was a dip.
 */
const TAP_WAIT_MS = 1400;

export class Game {
  private phase: GamePhase = 'START';
  private previousPhase: GamePhase = 'READY';
  private elapsed = 0; private phaseStart = 0; private previousFrame = 0; private frameId = 0;
  /**
   * The `requestAnimationFrame` stamp `elapsed` was last brought up to. Input is
   * timed against it rather than against `elapsed` alone — see `clockAt`.
   */
  private frameClock = 0;
  private score = new ScoreManager();
  /** Full, it buys one charge down the pitch. */
  private confidence = new Confidence();
  /**
   * Which innings is being played. Everything that differs between them is
   * reached through the four getters below rather than by branching at the call
   * site, so the loop itself reads the same in both.
   */
  private mode: GameMode = 'CLASSIC';
  /**
   * The Test modes: what is left of the batter in. In a Marathon it is
   * whichever of the three is in, and is handed on when the next walks out.
   */
  private health = new Health();
  /** Survive only: how the innings finished. */
  private ending: Ending | null = null;
  /** The Marathon only: its three batters and its end. */
  private marathon: MarathonInnings | null = null;
  /** What the Marathon has put up this innings: the swing coming on, and the express bowler's first over. */
  private told = { swing: false };
  /**
   * Super10's field this innings: the over it was last set for, the over Power
   * Surge was taken in, the field in play, the lines the batter's boundaries
   * went along, which the bowlers read at the top of an over (`planFor`), and
   * the wickets down when the last over began.
   */
  private s10 = Game.freshField();
  private static freshField() {
    return { over: -1, surged: null as number | null, field: null as FieldSet | null, boundaries: [] as number[], wicketsAtOver: 0 };
  }
  /** Whether the stroke just played was the flick, which has an arc of its own. */
  private flickPlayed = false;
  private fieldUi!: FieldUi;
  /** When the bowler may set off, if a level's banner is up: he waits for it as for the field. */
  private bannerUntil = 0;
  /** Where the batter who played the last ball came in, in the team's history: his fifty is his own. */
  private playedFrom = 0;
  /** The last ball took the man in out of the innings, and the next walks out once it is dead. */
  private changed: Change = null;
  /** The last ball put him on the ground. */
  private felled = false;
  /** The score he walked out to, nine down. Cosmetic, and drawn from the seed. */
  private chasing = 0;
  /** Another player's best being chased, from CHASE on their profile; null when nobody's is. */
  private chase: Chase | null = null;
  /** Three balls that went nowhere and the fielders have something to say. */
  private sledger = new Sledger();
  private sledgeDue = false;
  /**
   * The ball just played was a moment — his fifty, his hundred, or the sixth
   * six in a row — and he celebrates it once the ball is dead: not on the
   * swipe, and not over the flight of the ball that got him there.
   * `celebrating` holds the next ball back for exactly as long as it takes,
   * and no longer.
   */
  private milestoneDue: Moment | null = null;
  private celebrating = 0;
  /** The wait for one of those moments that is on the screen, if any: see Nearing.ts. */
  private nearing: Nearing | null = null;
  /** The ball the field last had something to say on, so they do not repeat themselves. */
  private lastSledge = 0;
  private rng = new SeededRandom(1); private generator = new DeliveryGenerator(this.rng);
  private delivery: Delivery | null = null; private attempt: ShotAttempt | null = null; private outcome: ShotOutcome | null = null;
  /** What the batter last did once a ball was done with, so he does not do it twice running. */
  private lastAfterBall: AfterBall | null = null;
  /** Balls since he last did any of them, and sweeps and scoops scored off: see `Habit`. */
  private afterBallSince = Infinity; private sweepsScored = 0;
  /** A dismissed batter's reaction, which the result is held open for: see `resultMs`. */
  private afterBallUntil = -Infinity;
  private best = 0; private bounced = false; private seed = 0;
  /** Innings begun this session, for telling a replay from a first go. */
  private innings = 0;
  /**
   * Milliseconds actually spent playing this session: the clock runs while a
   * ball is live, the bowler is walking back or the call is on screen, and stops
   * for a pause, a hidden tab, the cover and the end card. A tab left open on
   * the cover all afternoon has not been played all afternoon.
   */
  private playedMs = 0;
  /** What that clock read when this innings began. */
  private inningsFrom = 0;
  /** What this innings did with the spinner's short ball and the pull off him, and with the bouncer to hook, counted at its end. */
  private spinPulls = freshTally(); private hooks = freshTally();
  /** The fifty as last fetched, and who the board thinks you are. */
  private board: BoardRow[] = [];
  /**
   * Whether the board has ever answered. Not the same as holding rows: a board
   * that answered with nothing is the launch-day board, and somebody has to be
   * allowed to be first on it.
   */
  private boardSeen = false;
  /**
   * How many times each board has been written by something other than a fetch.
   *
   * A board's rows arrive from a request made some time ago, and by the time
   * they do the player may have claimed a place — which is answered with the
   * board the claim was written to, newer than anything already in flight. Each
   * fetch notes the number on the way out and drops what it brought back if the
   * number has moved since; otherwise a picture of the board from before the
   * claim lands on top of it and takes the row the player just took off the
   * screen they took it on.
   *
   * Only a claim moves the number. Two fetches racing each other are two reads
   * of the same store seconds apart, so either may write and the later one
   * simply wins — cancelling one for the other would throw away rows that a
   * failed fetch then has nothing to replace, and an innings-end strip reads
   * these rows to decide whether there is a place worth offering.
   */
  private boardEpoch = 0;
  private surviveEpoch = 0;
  /** The Test fifty, and whether that board has ever answered. Its own ladder. */
  private surviveRows: SurviveRow[] = [];
  private surviveSeen = false;
  /**
   * Whether the batter has been critical yet this innings, so the meter's own
   * lesson is shown once and the analytics count the innings rather than the
   * balls. The "once ever" half of it lives in `localStorage`; this is only the
   * "once this innings" half.
   */
  private wasCritical = false;
  /**
   * The injury notice, waiting for a gap to appear in.
   *
   * It cannot be shown the moment the blow lands: that happens inside the
   * shot-resolution block, and `setPhase('SHOT_RESOLVE')` runs immediately
   * after it — so a pause taken there was overwritten a line later and the
   * panel sat over a game that was still bowling. Dismissing it then *paused*
   * the innings instead of resuming it, which is the exact opposite of the
   * button's label. So it waits for the ball to finish and goes up in the gap
   * before the next one.
   */
  private noticeDue = false;
  private player: string | null = null;
  /** The match room this browser has open, and the innings it is batting in it. */
  private challenge = new ChallengeRun();
  /** Which question the name panel is open for: joining a room, or making one. */
  private asking: 'join' | 'create' = 'join';
  /** Which ladder the sheet is showing, which is the tab drawn as the live one. */
  private boardTab: BoardTab = 'classic';
  /** Which ladder of that mode the sheet is on. The innings board, always, to open. */
  private boardLadder: LadderTab = 'best';
  /**
   * Which of the three tabs is lit. Held apart from `boardTab`, which stays on
   * the last *game* looked at — the card under My Stats belongs to a mode, and
   * tabbing away and back has to land where the player was rather than on
   * whichever game the build opens with.
   */
  private sheetTab: SheetTab = 'classic';
  /** Each mode's career boards, held from the last fetch. */
  private careerBoards: Partial<Record<CareerMode, CareerBoards<AnyCareer>>> = {};
  /** This player's own figures, as the store last reported them. */
  private myCareer: Partial<Record<CareerMode, {
    career: AnyCareer; name: string; avatar: number; granted?: Granted | null;
  }>> = {};
  /** The facts the card on screen was drawn from, so a late paint can be dropped. */
  /**
   * The figures each mode's card was last painted for, so a picture arriving
   * late can tell whether it still belongs on the screen.
   *
   * Kept per mode rather than as one, because the My Stats rail paints both
   * games at once: with a single slot the second card to start painting took
   * the slot from the first, and the first card's picture was thrown away when
   * it landed — leaving the Blast for ever "Drawing your card…" beside a
   * finished Test one.
   */
  private statsDrawn: Partial<Record<CareerMode, StatsFacts>> = {};
  /** Whether the career page is wanted. Set before it exists, cleared on the way back. */
  private statsPage = false;
  /**
   * Whether this opening of the sheet is the one that follows a claim, and so
   * carries the card's keys at its foot. Held across a tab rather than passed
   * through it: a player who has just taken a place, looked at the other ladder
   * and come back has not given up their way to play again.
   */
  private boardActions = false;
  private presentationAt = 0; private resultPresented = false;
  private contactAt = 0; private contactPlayed = false; private resolveEndsAt = 0;
  /** -1 outside the tutorial, otherwise the ball being coached. */
  private lesson = -1;
  private scene!: GameScene;
  private hud: HUD;
  private input!: InputManager;
  private audio = new GameAudio();
  private debug = new URLSearchParams(location.search).get('debug') === '1';
  /**
   * How much a newcomer's windows are widened this innings, 1 for not at all:
   * see `newcomer.ts`. Decided as the innings starts, from the finished
   * innings this browser or this career has in the mode.
   */
  private ease = 1;
  /**
   * `?moments=1`: a row of keys on the screen, one a milestone — 50, 100, six
   * sixes, and the Test marks 150 to 400 — so each celebration can be looked
   * at on a phone without batting to it. A tap plays the moment exactly as the
   * ball that earns it would, and adds no runs, counts nothing and sends
   * nothing anywhere: it is the same celebration with none of the innings.
   */
  private readonly momentKeys = new URLSearchParams(location.search).get('moments') === '1';
  /**
   * `?actions=1`: a row of keys on the screen, one a thing the batter does once
   * a ball is done with (`AfterBall`) — the crease tap, watching a loft go, the
   * twirl, brushing the pad, the stroke rehearsed, the pitch scrubbed, the
   * look to the sky — so each can be looked at
   * on a phone without waiting for the ball that brings it, which is only half
   * of them. A tap plays the stroke it follows, at no ball, and then it. Nothing
   * is bowled, scored or counted.
   */
  private readonly actionKeys = new URLSearchParams(location.search).get('actions') === '1';
  /** One asked for while a ball was in play, for when it is dead. */
  private actionAsked: ActionKey | null = null;
  /** Where `?actions=1`'s FALL key has him hit next: each in turn. */
  private fallShown = 0;
  /**
   * `?rate=1`: a row of keys on the screen, one a thing the stars are asked
   * about — the game and each mode — so the sticker can be looked at and played
   * with on a phone without finishing the innings that would earn it. The same
   * sticker and the same follow-up, with none of the consequences: nothing is
   * sent, nothing is remembered, and asking again is one tap.
   */
  private readonly rateKeys = new URLSearchParams(location.search).get('rate') === '1';
  /**
   * `?welcome=1`: a row of keys, one a way the welcome before the first
   * innings can go — a new player, one coming back, the edit from My Stats,
   * and the four answers the store can turn a name down with. The real screen
   * and the real rules for a name, with the store's answer stood in for:
   * nothing is sent and nothing is kept, so each can be tried again and again.
   */
  private readonly welcomeKeys = new URLSearchParams(location.search).get('welcome') === '1';
  /**
   * `?levelup=1`: a row of keys, one a rung — EMERGING, STAR, HITMAN — in
   * each mode's card, putting Level Up up as an innings that climbed to it
   * would, for looking at it on a phone without the weeks of batting. Nothing
   * is counted, shared on the player's behalf, or followed by unlocks.
   */
  private readonly levelUpKeys = new URLSearchParams(location.search).get('levelup') === '1';
  /**
   * `?topspot=1`: a row of keys, one a board, putting New #1 up over whatever
   * is on screen as an innings that took the top would, over a made-up board.
   * Nothing is counted or sent.
   */
  private readonly topSpotKeys = new URLSearchParams(location.search).get('topspot') === '1';
  /** The way `?welcome=1` has the welcome up, or null when it is the real one. */
  private welcomeScenario: WelcomeScenario | null = null;
  /**
   * `?dressing=1`: a row of keys for the Dressing Room — the room as a new
   * player sees it, halfway through, and with everything earned; and the
   * unlocks, a kit, a bat and two in a row, each tap the next one. The real
   * room and the real moments over a made-up record: nothing is earned, worn
   * or remembered, so any of it can be tried again with one tap.
   */
  private readonly dressingKeys = new URLSearchParams(location.search).get('dressing') === '1';
  /** The record `?dressing=1` has the room read, or null for the player's own. */
  private dressingPreview: DressingRecord | null = null;
  /** Which kit and bat `?dressing=1`'s unlock keys play next. */
  private previewTurn = { kit: 0, bat: 0 };
  /**
   * `?nets=1`, in a Marathon: every bowler round the wicket from the first
   * ball, and a row of keys to change him — the seamer, the swing bowler, the
   * spinner, the express bowler — with one more to go back over the wicket
   * and round again. A tap changes the bowler from the next ball; the innings
   * is otherwise the innings, scored and offered to the boards as any other.
   */
  private readonly netsKeys = new URLSearchParams(location.search).get('nets') === '1';
  /** `?cover=1`: every ball the cover drive's, a stock ball pitched up on off stump. */
  private readonly coverDrill = new URLSearchParams(location.search).get('cover') === '1';
  /**
   * `?coverv=1`, `2` or `3`: always that version of the cover strokes, for
   * looking at one.
   */
  private readonly coverAsked = Number(new URLSearchParams(location.search).get('coverv'));
  /** How far along its flight this ball is met: the crease, or short of it for version three's cover drive. */
  private meetsAt = 1;
  /**
   * Which version of the strokes off the cover input this swing plays, by
   * `COVER_ODDS`. Rolled off the innings' seed and the ball it has reached
   * (`coverRoll`), since versions two and three go for four where version
   * one goes for six: the same ball plays the same version for everybody on
   * that seed, rivals included.
   */
  private coverVersion(): CoverVersion {
    return this.coverAsked === 1 || this.coverAsked === 2 || this.coverAsked === 3 ? this.coverAsked : coverVersionOf(coverRoll(this.seed, this.score.balls));
  }
  /** `?loftv=1` or `2`: always that version of the lofted straight drive, for looking at one. */
  private readonly loftAsked = Number(new URLSearchParams(location.search).get('loftv'));
  /**
   * Which of the lofted straight drive's two finishes this six is played
   * with, by `LOFT_ODDS`: over the front shoulder, or held with the arms long
   * up the line (`STRAIGHT_LOFT_V2`). Only the picture changes, never the six.
   */
  private loftVersion(): LoftVersion {
    return this.loftAsked === 1 || this.loftAsked === 2 ? this.loftAsked : loftVersionOf(this.seed, this.score.balls);
  }
  /** ?pullv=1 or 2: always that version of the pull, for looking at one. */
  private readonly pullAsked = Number(new URLSearchParams(location.search).get('pullv'));
  /**
   * Which of the pull's two versions this bouncer is pulled with, by
   * PULL_ODDS: standing where he hit it, or the hook's stroke with the turn
   * (PULL). Only the picture changes, and where the ball is met.
   */
  private pullVersion(): PullVersion {
    return this.pullAsked === 1 || this.pullAsked === 2 ? this.pullAsked : pullVersionOf(this.seed, this.score.balls);
  }
  /** `?flickv=1` or `2`: always that version of the flick, for looking at one. Practice, since version two is scored its own way. */
  private readonly flickAsked = Number(new URLSearchParams(location.search).get('flickv'));
  /**
   * Which version of the flick this ball is flicked with. A ball short of a
   * length is flicked off the back foot, version three (`flickBackFoot`,
   * `FLICK_V3`), whatever was asked for: a stride down the pitch is the wrong
   * stroke at a ball rising to the thigh. Otherwise by `FLICK_ODDS`: the flick
   * as it always was, or worked off the pads with the wrists (`FLICK_V2`),
   * four at the most (`FLICK`). Rolled off the innings' seed and the ball, as
   * the cover strokes' is, so the same ball plays the same version for
   * everybody on that seed, rivals included.
   */
  private flickVersion(ballY: number): FlickVersion {
    if (flickBackFoot(ballY)) return 3;
    return this.flickAsked === 1 || this.flickAsked === 2 ? this.flickAsked : flickVersionOf(this.seed, this.score.balls);
  }
  private nets: { bowler: NetsBowler; round: boolean } = { bowler: 'PACE', round: true };
  /** Hand the nets' choice to the bowling and show it on the keys. */
  private applyNets() {
    if (!this.netsKeys) return;
    // A Blast or a Survival innings played from the same link has no nets.
    if (!this.marathoning) { this.hud.netsHide(); return; }
    this.generator?.nets(this.nets.bowler, this.nets.round);
    this.hud.netsShow(this.nets.bowler, this.nets.round);
  }
  /** A moment asked for with a key and waiting for the ball to be dead: see `askMoment`. */
  private momentAsked: Moment | null = null;
  /**
   * `?demo=1`: fifty made-up rows on every ladder, and nothing written.
   *
   * A leaderboard is a screen you cannot judge empty — the scroll, the cut-off
   * line, the lit row with rows above and below it. The only other way to see
   * one full is to write fifty real rows to a real board, and a name claimed on
   * a board is never released. So this fills the screen and touches nothing:
   * the rows are made in this browser, live as long as the sheet is open, and
   * the fetches that would have overwritten them are not made.
   */
  private demo = demoWanted();
  /**
   * A link that names its mode. `?mode=survive` is how the Test match is handed
   * to playtesters on its own: the picker never opens, Play Again replays the
   * same innings, and there is no key out of it.
   */
  private locked = false;
  private disposed = false;
  /**
   * Whether an innings played here can be registered. False in a private
   * window, where the player id is minted fresh every session: a row claimed
   * from one is a row nobody can ever come back to and improve.
   */
  private canRegister: boolean;
  constructor(root: HTMLElement, options: { canRegister?: boolean } = {}) {
    this.canRegister = options.canRegister !== false;
    // Said out loud on the screen. A made-up board that looks exactly like a
    // real one is a good way to look at a screen and a very bad way to read a
    // number, so while it is on, the board says so above the tabs.
    if (this.demo) document.documentElement.setAttribute('data-demo', '1');
    try { this.best = Math.max(0, Math.min(180, Number(localStorage.getItem('hitman-best')) || 0)); } catch { /* Storage may be disabled. */ }
    this.hud = new HUD(root, this.best, { player: readPlayer() });
    // Super10's field on the screen, in the version this link asks for.
    this.fieldUi = new FieldUi(this.hud.viewport, { surge: () => this.armSurge() });
    this.hud.coverPlayer = () => readPlayer();
    this.noteLaunch();
    this.stopDressingSends = onDressingWrite(() => this.queueDressingSend());
    // The cover's depth: the poster, the smoke and the dust sliding at their own speeds.
    coverParallax(this.hud.viewport.querySelector<HTMLElement>('#intro')!);
    // Neither of these is allowed to hold up an innings. Settling the id touches
    // three stores, one of which can hang; the board is a network call that may
    // never answer. Both run alongside the game, and the cover's trophy line
    // picks up the board's leader if and when one arrives.
    // Swallowed in production, because none of this is worth an innings — but
    // never swallowed in development, where a silent catch here hid a real
    // failure for an afternoon.
    void playerId().then(id => {
      this.player = id;
      // The return ticket follows the id and whatever name is written under
      // it. Not from a private window, whose id is gone with the tab anyway.
      if (this.canRegister) {
        leaveTicket(id, readPlayer());
        onPlayerWritten(player => leaveTicket(this.player, player));
      }
      void this.pullDressing();
      void this.catchUpOnKey();
      void this.catchUpOnPassword();
      return this.openChallenges();
    }).catch(error => { if (import.meta.env.DEV) console.error('challenge startup', error); });
    this.countVisit();
    seedPlayed(readStored, writeStored, playedBefore(readStored));
    // A survive-only build has no board behind it and no screen that opens one,
    // so it does not go looking. On GitHub Pages that request is a guaranteed
    // 404 on every load — harmless, since a board that never answers is already
    // handled, but a console full of red is a bad first impression for somebody
    // who was handed the link to give an opinion on the batting.
    if (!NO_BOARD) void this.loadBoard();
    try { this.scene = new GameScene(this.hud.viewport); } catch (error) { console.error(error); track('webgl-fail', 'WebGL unavailable'); this.hud.error(); return; }
    // Bowled or stumped, the wicket is heard when the ball reaches it.
    this.scene.onStumps = () => this.audio.play('stumps');
    // The stars' keys first, so the moments' keys come after them in the page
    // and can be lifted clear of them when both are asked for.
    if (this.rateKeys) this.hud.rateKeys(RATE_KEYS, thing => this.previewRating(thing));
    if (this.levelUpKeys) this.hud.levelUpKeys(LEVEL_UP_KEYS, (tier, mode) => this.previewLevelUp(tier, mode));
    if (this.topSpotKeys) this.hud.topSpotKeys(TOP_SPOT_KEYS, mode => this.previewTopSpot(mode));
    if (this.welcomeKeys) this.hud.welcomeKeys(WELCOME_KEYS, scenario => this.previewWelcome(scenario));
    if (this.dressingKeys) this.hud.dressingKeys(DRESSING_KEYS, scenario => this.previewDressing(scenario));
    if (this.momentKeys) this.hud.momentKeys(MOMENT_KEYS, moment => this.askMoment(moment));
    if (this.actionKeys) this.hud.actionKeys(ACTION_KEYS, kind => this.askAction(kind));
    if (this.netsKeys) this.hud.netsKeys(NETS_BOWLERS,
      bowler => { this.nets = { ...this.nets, bowler }; this.applyNets(); },
      () => { this.nets = { ...this.nets, round: !this.nets.round }; this.applyNets(); });
    this.input = new InputManager(() => this.phase === 'BALL_IN_FLIGHT', this.clockAt, this.shoot, this.hud.viewport,
      () => this.isPrimed === 'CHARGE' ? ADVANCE.coverLean : 0,
      // The downward diagonals are the scoops whenever there is a meter to
      // spend on them. Which ball they get is settled in `playedAs`.
      () => this.charged,
      // A left-hander's swipes and side keys, read the way his mirrored
      // screen shows them. Asked of the scene, so the two cannot disagree.
      () => this.scene.mirrored,
      // The leg side is the hook at a bouncer on or outside off.
      () => !!this.delivery && hookable(this.delivery),
      // The block narrower in the Blast, where nobody blocks: see `SWIPE_ZONES`.
      () => this.surviving || this.marathoning ? SWIPE_ZONES.test : SWIPE_ZONES.blast);
    // The play key opens the picker rather than an innings — unless a link has
    // already named the mode, in which case it is that mode's play key.
    this.hud.on('start', this.play);
    // The update's stories open on the Dressing Room's stage, which takes a
    // second or two to make on a phone. Where they are due, it is made while the
    // cover is up, a moment after the game's own load, so the first story opens
    // on the batter rather than on an empty room.
    if (!NO_BOARD && whatsNewDue()) window.setTimeout(() => { if (whatsNewDue() && this.phase === 'START' && !this.disposed) this.hud.warmStories(); }, 1500);
    this.hud.on('mode-classic', () => { this.hud.closeModes(); this.choose('CLASSIC'); });
    this.hud.on('mode-survive', () => { this.hud.closeModes(); this.choose('SURVIVE'); });
    this.hud.on('mode-marathon', () => { this.hud.closeModes(); this.choose('MARATHON'); });
    this.hud.on('mode-challenge', () => { void this.openMatch(); });
    this.hud.on('challenge-set', () => { void this.openMatch({ card: encodeInnings(this.score.history) }); });
    this.hud.on('challenge-share-done', () => { this.hud.closeSheets(); this.showRoom(); });
    this.hud.on('challenge-copy', () => { void this.copyInvite(); });
    this.hud.on('challenge-more', () => { void this.shareInvite(); });
    this.hud.on('challenge-bat', () => { if (this.asking === 'create') void this.nameThenCreate(); else void this.nameThenJoin(); });
    this.hud.on('challenge-rename', () => this.hud.challengeRename());
    this.hud.on('challenge-solo', () => { void this.declineMatch(); });
    this.hud.on('room-back', () => this.leaveRoom());
    this.hud.onRoomAct = act => { void this.roomAct(act); };
    this.hud.on('modes-challenges', () => { void this.showChallenges(); });
    this.hud.on('modes-dressing', () => this.openDressing('modes'));
    // Super10, coming soon: its card opens its page, and I'M EXCITED says how much it is wanted.
    this.hud.on('mode-super10', () => { track('super10-open-card', 'Opened Super10 from Choose a mode'); this.hud.super10Page(); });
    this.hud.on('super10-back', () => this.hud.closeSuper10());
    this.hud.on('super10-got-it', () => { track('super10-got-it', 'Super10 page put away with GOT IT'); this.hud.closeSuper10(); });
    this.hud.on('super10-excited', this.excited);
    // My Stats from Choose a mode: the avatar at the top and the tier card in the bento.
    this.hud.on('modes-profile', this.showStats);
    this.hud.on('modes-stats', this.showStats);
    // The boards, from the mode screen: the same sheet the cover's trophy
    // opens, laid over the picker, which is still there when it is put away.
    if (NO_BOARD) document.getElementById('modes-board')?.remove();
    else {
      this.hud.on('modes-board', () => {
        this.mark('modes-board', 'The boards opened from the mode screen');
        this.showBoard();
      });
    }
    this.hud.on('challenge-list-ranking', () => { this.mark('rivals-ranking', 'The Rivals ranking opened'); this.hud.showRanking(); });
    this.hud.on('challenge-list-done', () => { this.hud.closeChallenge(); this.modes(); });
    this.hud.on('challenge-list-new', () => { this.hud.closeChallenge(); void this.openMatch(); });
    this.hud.on('rivalry-again', () => { this.hud.closeChallenge(); void this.challengeRival(); });
    this.hud.on('rivalry-back', () => { void this.showChallenges(); });
    this.hud.on('challenge-offline-retry', () => { this.hud.closeChallenge(); void this.openChallenges(); });
    this.hud.on('challenge-offline-solo', () => { this.challenge.clear(); this.pinRoom(null); this.hud.closeChallenge(); this.hud.showCover(); this.modes(); });
    // The rows are drawn fresh each time the list opens, so their keys are
    // listened for on the list itself rather than bound to buttons that will
    // not exist by the time anybody presses one. The room's keys likewise.
    this.hud.viewport.querySelector('#challenge-sections')!.addEventListener('click', event => {
      const key = (event.target as HTMLElement).closest('[data-open],[data-rival],[data-drop],[data-accept],[data-decline]') as HTMLElement | null;
      if (!key) {
        // Anywhere else on a card opens its match: the verdict, the badge, the
        // padding. Only the face and the accept and decline keys mean something
        // else, and they are caught above.
        const card = (event.target as HTMLElement).closest('.rival-row[data-code]') as HTMLElement | null;
        if (card?.dataset.code) { event.stopPropagation(); void this.listAct('open', card.dataset.code); }
        return;
      }
      event.stopPropagation();
      if (key.dataset.drop) void this.listAct('drop', key.dataset.drop);
      else if (key.dataset.accept) void this.listAct('accept', key.dataset.accept);
      else if (key.dataset.decline) void this.listAct('decline', key.dataset.decline);
      else if (key.dataset.rival) void this.listAct('rival', key.dataset.code ?? '', key.dataset.rival);
      else if (key.dataset.open) void this.listAct('open', key.dataset.open);
    });
    this.hud.viewport.querySelector('#room-keys')!.addEventListener('click', event => {
      const key = (event.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
      if (!key || key.tagName === 'A') return;
      this.hud.onRoomAct?.(key.dataset.act as RoomAct);
    });
    this.hud.on('room-card', () => this.hud.onRoomAct?.('card'));
    this.hud.on('modes-cancel', this.closePicker);
    this.hud.on('survive-again', this.start);
    this.hud.on('survive-modes', this.modes);
    this.hud.on('card-result', () => this.backToResult());
    this.hud.on('card-modes', () => { this.hud.hideScorecard(); this.leaveRoom(); });
    // The Marathon card's own two keys under its play-again key.
    this.hud.on('mcard-modes', () => { if (this.phase === 'INNINGS_END') this.modes(); });
    this.hud.on('card-change', () => { if (this.phase === 'INNINGS_END') this.modes(); });
    this.hud.on('mcard-share', () => { void this.hud.shareMarathon(); });
    this.hud.on('again', this.start); this.hud.on('pause', this.togglePause); this.hud.on('resume', this.togglePause);
    this.hud.on('tutorial', this.howToPlay); this.hud.on('tutorial-play', this.walkOut);
    // Not the covers from a skip: that is pressed with a lesson ball on its way,
    // and the ball would go on being bowled, heard, behind them.
    this.hud.on('skip-tutorial', this.start);
    this.hud.on('sound', this.toggleSound);
    // The end card's own sound key, in its header.
    this.hud.on('end-sound', this.toggleSound);
    this.hud.on('survive-sound', this.toggleSound);
    this.hud.on('survive-share', () => { void this.hud.shareSurvive(); });
    // The switch as it was left last visit.
    this.hud.sound(this.audio.setting);
    this.hud.on('restart', this.start);
    this.hud.on('declare', this.declare);
    // The pause sheet's sound switches: the crowd, and the ambience under it.
    this.hud.on('crowd-switch', () => { this.audio.setCrowd(!this.audio.crowdOn); this.soundSwitches(); });
    this.hud.on('ambience-switch', () => { this.audio.setAmbience(!this.audio.ambienceOn); this.soundSwitches(); });
    // Out of a paused innings and back to the picker. The picker is a screen
    // rather than a card, so it covers the pause card rather than replacing
    // it: pick a mode and the innings is walked out on, back out of it and the
    // card is exactly where it was.
    this.hud.on('change-mode', () => { if (this.phase === 'PAUSED') this.modes(); });
    // Day or night, from the pause card, between balls. Remembered for the next Blast innings.
    for (const time of ['day', 'night'] as const) this.hud.on(`lights-${time}`, () => {
      if (this.phase !== 'PAUSED' || this.test) return;
      keepLights(time); this.light(time); this.hud.lightsSwitch(time);
    });
    this.hud.on('share', () => { void this.hud.share(); });
    this.hud.on('board', this.showBoard);
    // Both ladders exist, so the sheet carries a way between them.
    this.hud.showBoardTabs(SHOW_SURVIVE && !SURVIVE_ONLY);
    this.hud.showMarathonTab(MARATHON_OPEN);
    this.hud.onBoardTab = this.tabBoard;
    this.hud.onBoardStories = () => this.showStories('board');
    // OPEN THE DRESSING ROOM, on the last story: after the stories, the room,
    // over Choose a mode where the stories were on the way to it.
    this.hud.onStoriesOpen = shown => this.openDressing('story', shown);
    this.hud.onStoryReel = (shot, beat) => this.playReel(shot, beat);
    this.hud.onLadderTab = this.tabLadder;
    this.hud.onBoardFrame = (mode, ladder) => this.boardFrame(mode, ladder);
    this.hud.onBoardPlay = mode => {
      this.hud.closeBoard();
      this.choose(mode === 'classic' ? 'CLASSIC' : mode === 'marathon' ? 'MARATHON' : 'SURVIVE');
    };
    this.hud.onBoardRetry = () => this.reopenBoard();
    // Another player's profile, from a row: a look counted for them only when
    // a named player is looking, and never their own.
    this.hud.onPlayerFetch = handle => {
      const looking = readPlayer()?.name && this.player ? handleOf(this.player) : null;
      return fetchProfile(handle, looking);
    };
    // CHASE: their best is the target for the next innings of that mode, and
    // the store is told it was a chase when the innings is posted.
    this.hud.onWinBack = event => {
      this.mark('activity-win-back', 'Win it back from Your profile');
      this.hud.closeStats();
      this.hud.onPlayerChase?.({
        handle: event.handle, name: event.name, avatar: event.avatar, mode: event.mode, target: event.runs,
        theirPlace: event.place ? event.place - 1 || 1 : null, result: event.result?.mine ?? null, answers: true,
      });
    };
    this.hud.onPlayerChase = chase => {
      this.chase = chase;
      this.chaseFresh = true;
      this.chaseWon = false;
      this.chaseNext = null;
      chaseFor(chase.handle, chase.mode, chase.ladder);
      this.mark(chase.ladder === 'solo' ? 'chase-start-batter' : 'chase-start', 'Chase: started from a profile');
      this.hud.closeBoard();
      this.choose(chase.mode === 'classic' ? 'CLASSIC' : chase.mode === 'marathon' ? 'MARATHON' : 'SURVIVE');
    };
    this.hud.onBoardName = () => this.askProfile(false);
    this.hud.onStatsOpen = this.showStats;
    this.hud.onStatsPlay = mode => {
      this.hud.closeStats();
      this.choose(mode === 'classic' ? 'CLASSIC' : mode === 'marathon' ? 'MARATHON' : 'SURVIVE');
    };
    // Either key in the sheet counts as saved. Which one was used is worth
    // knowing — one of them finishes the job and the other leaves homework —
    // so they are counted apart even though they retire the same prompts.
    this.hud.onKeySave = how => this.saveKey(how);
    // Fetched while the sheet is still being read, so the first tap on SAVE AS
    // IMAGE is not the thing that waits on a font.
    void prepareKeyAssets();
    this.hud.onRestore = entry => void this.sendRestore(entry);
    this.hud.onRestoreFind = name => void this.findForRestore(name);
    // The career password: every way into the one sheet, what it saves, and
    // the forgot-password sheets off the restore sheet.
    this.hud.passwordNow = () => (this.statsCardDue ? { runs: this.careerRuns() } : null);
    this.hud.onPasswordOpen = from => this.openPasswordSheet(from);
    this.hud.onPasswordSave = (entry, mode) => void this.savePassword(entry, mode);
    this.hud.onPasswordClosed = kind => {
      if (kind === 'nudge') track('password-nudge-later', 'Password nudge sheet put off');
      else if (kind === 'set' || kind === 'change') track(`password-closed-${this.passwordFrom}`, 'Password sheet closed unsaved');
    };
    this.hud.onRestoreForgot = name => void this.forgotPassword(name);
    this.hud.onAnswer = answer => void this.checkAnswer(answer);
    this.hud.onRestoreOpen = from => this.openRestore(from);
    this.hud.keyNow = () => this.careerKeyHeld();
    this.hud.whoNow = () => readPlayer();
    this.hud.onNewKey = () => void this.makeNewKey();
    this.hud.onProfile = entry => void this.saveProfile(entry);
    this.hud.onProfileSkip = entry => this.skipProfile(entry);
    this.hud.onProfileEdit = () => this.askProfile(false);
    // Back from the gate goes to the cover, and the innings it was asked for
    // goes with it: nobody bats without a name.
    this.hud.onProfileLeave = () => {
      this.afterProfile = null;
      this.welcomeScenario = null;
      this.hud.closeProfile();
      this.hud.closeModes();
      if (this.phase === 'START') this.hud.showCover();
    };
    this.hud.onRestoreShown = () => {
      restoreOfferShown();
      trackOnce('restore-offered-card', 'Offered the way back at the end of an innings');
    };
    this.hud.onRestoreDismiss = () => {
      restoreOfferDone();
      track('restore-offer-dismissed', 'Restore offer waved away');
    };
    // Only to somebody with no name. A record comes back as a name and a key
    // together, so there is nothing to offer a player who already has one.
    this.hud.restoreNow = () => !readPlayer();
    // The three ways into the questionnaire. The cover offers it only to
    // somebody who has played before: a form is a strange thing to be handed by
    // a game you have not started.
    this.hud.on('feedback-open', () => this.openFeedback('cover'));
    this.hud.on('feedback-card', () => this.openFeedback('card'));
    this.hud.on('feedback-pause', () => this.openFeedback('pause'));
    this.hud.offerFeedback({ cover: this.best > 0, card: false, pause: false });
    this.hud.on('claim', this.startClaim);
    this.hud.on('claim-cancel', () => this.hud.closeClaim());
    (this.hud.viewport.querySelector('#card-claim') as HTMLFormElement).addEventListener('submit', event => {
      event.preventDefault();
      void this.sendClaim();
    });
    if (!NO_BOARD) this.hud.on('cover-board', this.showBoard);
    // The chip on the cover is always the way to My Stats. Delegated, because
    // the chip is redrawn whenever the player behind it changes.
    this.hud.viewport.addEventListener('click', event => {
      if ((event.target as HTMLElement).closest('#cover-profile')) this.showStats();
    });
    this.hud.on('help', () => { trackOnce('help-open', 'Instructions opened'); if (!['START', 'PAUSED', 'INNINGS_END'].includes(this.phase)) this.togglePause(); this.hud.help(); });
    this.hud.on('fullscreen', () => {
      if (document.fullscreenElement) void document.exitFullscreen();
      else if (this.hud.viewport.requestFullscreen) void this.hud.viewport.requestFullscreen().catch(() => {});
    });
    window.addEventListener('keydown', this.shortcuts); window.addEventListener('beforeunload', this.leaving); document.addEventListener('visibilitychange', this.visibility);
    window.addEventListener('blur', this.blur);
    // A bundle built survive-only plays one innings and offers no way out of
    // it — that is the whole of what makes it publishable somewhere with no
    // board behind it. A `?mode=` link does the same thing at runtime.
    const named = SURVIVE_ONLY ? 'SURVIVE' : SUPER10_ONLY ? 'SUPER10' : new URLSearchParams(location.search).get('mode')?.toUpperCase();
    // Off production the Marathon has a card on the picker; on it, until it
    // ships, it is this link and nothing else. See `docs/MARATHON.md`.
    if (named === 'SURVIVE' || named === 'CLASSIC' || named === 'MARATHON' || (named === 'SUPER10' && SUPER10_OPEN)) {
      this.mode = named as GameMode;
      this.locked = true;
      this.hud.lockMode(NO_BOARD);
    } else {
      // The picker opens whenever there is something to pick. Challenging a
      // friend is always on offer, so from here that is always — where before,
      // with the Test match behind a flag, Play went straight to the innings and
      // the screen was never seen. The Test card is hidden rather than removed
      // when its flag is off, so the picker still reads as two choices.
      if (!SHOW_SURVIVE) this.hud.hideSurviveCard();
      if (!SHOW_MARATHON) this.hud.hideMarathonCard();
    }
    // The cover has music of its own. It is asked for rather than waited on:
    // a browser that will not play it yet is not a failure, it is a browser
    // nobody has touched, and the first touch of the page lets it through.
    this.audio.music('cover');
    this.frameId = requestAnimationFrame(this.frame);
    if (this.debug) Object.defineProperty(window, '__cricket', { configurable: true, value: {
      snapshot: () => this.snapshot(), batter: () => this.scene.inspectBatter(), bowler: () => this.scene.inspectBowler(),
      // Where every fielder is and what he is doing, for `field-check.mjs`.
      field: () => this.scene.fieldState,
      // What the stands are doing, for `crowd-check.mjs`.
      crowd: () => this.scene.crowdState,
      fireworks: () => this.scene.fireworksUp,
      // And what it sounds like: see `GameAudio.describe`.
      sound: () => this.audio.describe(),
      // Where this ball is drawn `progress` of the way through its flight: from
      // the hand round the wicket, for `marathon-check.mjs`.
      drawn: (progress: number) => this.delivery ? this.scene.drawnBall(this.delivery, progress) : null,
      // Which ground was built, for `scene-check.mjs`: `?ground=bowl` or the default.
      ground: () => this.scene.ground,
      turf: () => this.scene.turf,
      ledStumps: () => this.scene.ledStumps,
      // The ball's colour: Super10's white, the Blast's red, the Test's cherry.
      ball: () => this.scene.ballColour,
      // The arena's mood and what it is showing, and any of its moments on
      // demand, for photographing them without batting to them.
      arena: () => this.scene.arenaState,
      arenaCue: (kind: ArenaCue | 'wave' | 'stumps', word?: string) => this.scene.arenaCue(kind, this.elapsed, word),
      // The Test look, for the checks: the green strip down, or the Blast's.
      greenTop: () => this.scene.greenTop,
      // How worn the Marathon's strip is, a stage of `WEAR_STAGES`.
      worn: () => this.scene.worn,
      // Day or night, for the checks.
      lights: () => this.scene.lit,
      // Who this browser settled on being. Asked by `key-check.mjs`, which
      // cannot know it any other way: the id is resolved from three stores
      // against a one-second fuse, and a headless browser with a cold
      // IndexedDB loses that race and plays as a freshly minted stranger. A
      // check that plants an id and assumes it took is checking its own
      // planting — and a new key is only ever given to the id that already
      // holds the name, so it was asking as somebody else and being refused.
      player: () => this.player,
      // Fills the meter so the charge can be driven straight from a test.
      fillConfidence: () => { this.confidence.value = CONFIDENCE_FULL; this.showConfidence(); },
      // Leaves him one blow from the floor, so the fall can be looked at without
      // waiting for an innings that retires hurt to come round on its own.
      hurt: () => { this.health.value = 1; this.showConfidence(); },
      // The innings ended where it stands, for looking at the card it ends on.
      finish: () => { if (!['START', 'INNINGS_END'].includes(this.phase)) this.end(); },
      // A moment on demand, for `milestone-check.mjs`: getting to a real
      // hundred in a headless browser is thirty balls of perfect timing.
      milestone: (kind: Milestone = 'century', mark?: number) => this.celebrate({ kind, mark: mark ?? MARK_OF[kind] }),
      // The special stroke's flash, on demand, for the same reason — in the
      // style named, so `power-check.mjs` can see each, or the next one dealt;
      // `low` for a scoop's, the bursts out from under the squat.
      power: (style?: PowerStyle, low?: boolean) => this.powerUp(style, low),
      // And a pulled bouncer's, for `pull-check.mjs`.
      pull: () => this.pullUp(),
      // The wait for one, from an innings written out ball by ball — runs, or
      // 'W' for a wicket — for `nearing-check.mjs`, which cannot bat its way to
      // 96 either. Each call is one ball: the card moves as it would have.
      nearing: (balls: (number | 'W')[]) => this.showNearing(balls.map(ball => (
        { runs: ball === 'W' ? 0 : ball, isWicket: ball === 'W' } as ShotOutcome))),
      // Dresses him in a Rivals kit on the spot, so the four can be looked at
      // without four friends.
      kit: (kit: BatterKit) => this.scene.kit(kit),
      /** Puts any kit and bat from the Dressing Room on him, earned or not: for looking at them in play. */
      dress: (outfit: string, bat: string, gloves?: string) => this.scene.dressBatter(outfitOf(outfit), batOf(bat), gloveOf(gloves ?? this.myLook().guard.id)),
      /** Celebrates an unlock as if it had just been earned, by name: `unlock('bat', 'icecold')`. Nothing is put on or marked seen. */
      unlock: (shelf: 'kit' | 'bat', id: string) => {
        if (this.unlock) return;
        const look = this.myLook();
        const item: UnlockItem = shelf === 'bat' ? { moment: { kind: 'bat', bat: batOf(id) } }
          : { moment: { kind: 'kit', from: look.outfit.id === id ? outfitOf(FREE_OUTFIT) : look.outfit, to: outfitOf(id), bat: look.bat, guard: look.guard } };
        this.playUnlocks([item], true);
      },
      unlocking: () => this.unlock?.showing ? (this.unlock.showing.moment.kind === 'bat' ? `bat:${this.unlock.showing.moment.bat.id}` : `kit:${this.unlock.showing.moment.to.id}`) : null,
      // A Marathon written out ball by ball between deliveries — runs, 'W' for
      // a wicket, 'H' for a blow that carries him off — for `marathon-check.mjs`,
      // which cannot bat its way to over twenty in a software-rendered browser.
      // Each entry is bowled, so the plan moves on with it, and the next man
      // walks out at once. An entry that ends the innings ends it, card and all.
      marathon: (balls: (number | 'W' | 'H')[]) => this.writeMarathon(balls),
      // A Blast innings written ball by ball, the same way, for looking at its card,
      // and a Super10 one, for jumping to its later bowlers.
      blast: (balls: (number | 'W')[]) => this.writeBlast(balls),
      // The star prompt on demand, for `rating-check.mjs`: which thing, asked
      // as the end of an innings would ask it, and nothing about when.
      rating: (thing: RatedThing = 'game') => this.showRating(thing, thing === 'game' ? 'innings' : 'mode'),
      // The physio's card, up by name, for looking at it without batting to it.
      physio: (injury = 90) => this.hud.hurtNote(() => {}, injury),
      // Whether it is up.
      ratingOpen: () => !!this.ratingPrompt?.open,
      // Level Up by rung, for `levelup-check.mjs`: `levelUp('star', 'marathon')`.
      levelUp: (tier = 'star', mode?: CareerMode) => this.previewLevelUp(tier, mode),
      // New #1 by board, over a made-up board, for `topspot-check.mjs`: `topSpot('marathon')`.
      topSpot: (mode?: CareerMode) => this.previewTopSpot(mode),
      // Whether it is playing.
      topSpotOpen: () => !!this.topSpot,
      // Where it has got to — 'rush' to 'ready' — or null when it is not up.
      levelingUp: () => this.levelUp?.at ?? null,
    } });
  }
  /**
   * The mode picker, and the cover's music with it.
   *
   * The picker is a start screen — it replaces the ground rather than standing
   * over it, and the end card it can be opened from is put away to make room —
   * so it is the cover's music that belongs on it however it was reached. From
   * the cover that is already what is playing and this changes nothing; from
   * the Test card it is the card's music handing over to the screen that has
   * just replaced the card.
   */
  private modes = () => {
    this.audio.music('cover');
    // The bar rides on the picker, capped at two showings. Nothing is issued
    // yet, so it only appears where a key exists to be saved.
    this.hud.careerKey(this.careerKeyHeld(), { panel: false, bar: true });
    // The picker replaces the card, and the stars were asked of the card.
    this.putRatingAway();
    this.hud.modes(lastMode());
    // What this browser already knows goes up with the screen, and the places
    // the store keeps are asked for behind it.
    const view = this.modeSelectView();
    this.hud.modesFill(view);
    void this.placeOnModes(view);
    // What the Rivals widget wears is the last sync's word, and a sync is asked
    // for behind it so the next look is fresher.
    if (this.rooms) this.hud.challengesOpen(this.rooms.yourMove.length, this.rooms.waitingOnThem.length);
    void this.refreshCount();
    // Anything earned away from an innings's end — a Rival Match settled while
    // the player was elsewhere — is celebrated here instead.
    this.celebrateUnlocks();
  };

  /**
   * Choose a mode's figures from what this browser holds: the bests off the
   * career mirrors and the Blast's own best, the Blast's top three off the
   * board last fetched, the tier the Blast career is on, and the Rivals record
   * from the last sync. Places come after, from the store.
   */
  private modeSelectView(): ModeSelectView {
    const blast = heldCareer('classic') as BlastCareer;
    const marathon = heldCareer('marathon') as MarathonCareer;
    const survive = heldCareer('survive') as SurviveCareer;
    const at = this.board.findIndex(row => ownsHandle(row.handle, this.player));
    const tier = standingOf('classic', blast).tier;
    // Survival's best is a result, not a score: the best the career has had.
    const surviveBest = survive.wins > 0 ? 'Won a chase' : survive.draws > 0 ? SURVIVED : survive.innings > 0 ? 'Bowled out' : null;
    return {
      player: readPlayer(),
      marathon: { best: marathon.innings > 0 && marathon.highest > 0 ? String(marathon.highest) : null, rank: null },
      blast: { best: this.best > 0 ? String(this.best) : null, rank: at >= 0 ? at + 1 : null },
      survive: { best: surviveBest, rank: null },
      podium: this.board.slice(0, 3).map(row => row.avatar),
      blastRank: at >= 0 ? at + 1 : null,
      stats: { runs: blast.runs, tier: { key: tier.key, name: tier.name } },
      rivals: this.rooms?.record ?? null,
      dressing: this.dressingCount(),
    };
  }
  /** The Dressing Room, laid over Choose a mode; null while it is shut. */
  private dressing: DressingRoom | null = null;
  /**
   * Opens the Dressing Room over Choose a mode, which is still there when it
   * is put away. The screen and its stage are loaded the first time, so the
   * game itself never waits on them. `shown` is called once the room is on
   * screen — or once it is plain it will not be — for whatever it is to cover.
   * `from` is the way in, counted: its card on Choose a mode or a story.
   */
  private openDressing(from: 'modes' | 'story', shown?: () => void) {
    if (this.dressing) { shown?.(); return; }
    this.dressingMark(`dressing-open-${from}`, `The Dressing Room opened from ${from === 'story' ? 'a story' : 'Choose a mode'}`);
    const held = readDressing();
    if (!this.dressingPreview) writeDressing({ ...held, visited: true });
    const look = this.myLook();
    void Promise.all([import('./ui/DressingRoom'), import('./scene/DressingStage')]).then(([{ DressingRoom }, { DressingStage }]) => {
      if (this.dressing || this.disposed) return;
      this.dressing = new DressingRoom(this.hud.viewport, {
        shelf: 'kit', kit: look.outfit.id, bat: look.bat.id, guard: look.guard.id, wearing: look.outfit.id, holding: look.bat.id, wearingGuard: look.guard.id,
        record: this.dressingRecord(), pictures: {},
      }, {
        wear: (shelf, id) => {
          if (this.dressingPreview) return;
          const now = readDressing();
          writeDressing(shelf === 'kit' ? { ...now, outfit: id as OutfitId } : shelf === 'bat' ? { ...now, bat: id as BatId } : { ...now, guard: id as GuardId });
          const worn = this.myLook(); this.scene.dressBatter(worn.outfit, worn.bat, worn.guard);
          this.dressingMark(`dressing-wear-${shelf}-${id}`, `Put on the ${shelf} ${id}`);
        },
        play: mode => {
          this.dressingMark(`dressing-play-${mode ?? 'any'}`, `Went to play for a goal in the Dressing Room (${mode ?? 'any mode'})`);
          this.closeDressing();
          this.hud.closeModes();
          if (mode === 'rivals') { void this.showChallenges(); return; }
          this.choose(mode === 'survival' ? 'SURVIVE' : mode === 'marathon' ? 'MARATHON' : 'CLASSIC');
        },
        claim: (shelf, id) => {
          // Taken the moment the key is pressed, so a player who leaves mid-moment has it all the same.
          if (this.dressingPreview) this.dressingPreview = { ...this.dressingPreview, welcomed: true };
          else {
            const held = readDressing(), key = seenKey(shelf, id);
            writeDressing({ ...held, seen: [...new Set([...held.seen, key])], shown: [...new Set([...held.shown, key])] });
          }
          this.dressing?.update({ record: this.dressingRecord() });
          this.dressingMark(`dressing-claim-${shelf}-${id}`, `Unlocked the ${shelf} ${id} in the room`);
          const look = this.myLook();
          this.playUnlocks([{ moment: shelf === 'bat' ? { kind: 'bat', bat: batOf(id) } : { kind: 'kit', from: look.outfit, to: outfitOf(id), bat: look.bat, guard: look.guard } }], !!this.dressingPreview);
        },
        close: () => this.closeDressing(),
      }, () => new DressingStage({ room: true }));
      // Put up, or failed to be: either way, nothing more to wait for.
    }).finally(() => shown?.());
  }
  /** One of `?dressing=1`'s keys. */
  private previewDressing(scenario: DressingScenario) {
    if (scenario === 'kit' || scenario === 'bat' || scenario === 'two') {
      const kits = OUTFITS.filter(o => !FREE_OUTFITS.includes(o.id)), bats = BATS.filter(b => b.id !== FREE_BAT);
      const items: UnlockItem[] = [];
      const look = this.myLook();
      if (scenario !== 'bat') {
        const to = kits[this.previewTurn.kit++ % kits.length];
        items.push({ moment: { kind: 'kit', from: look.outfit.id === to.id ? outfitOf(FREE_OUTFIT) : look.outfit, to, bat: look.bat, guard: look.guard } });
      }
      if (scenario !== 'kit') {
        items.push({ moment: { kind: 'bat', bat: bats[this.previewTurn.bat++ % bats.length] } });
      }
      this.unlock?.close(); this.unlock = null;
      this.playUnlocks(items, true);
      return;
    }
    // Over whatever is on screen, and back to it when the room is put away.
    this.closeDressing();
    this.dressingPreview = previewRecord(scenario);
    this.openDressing('modes');
  }
  /** Puts the unlocks up; a preview's wear nothing and mark nothing. */
  private playUnlocks(items: UnlockItem[], preview = false) {
    void Promise.all([import('./ui/Unlock'), import('./scene/DressingStage')]).then(([{ UnlockMoment }, { DressingStage }]) => {
      if (this.unlock || this.disposed) return;
      // New #1 went up while the room's pieces loaded: these wait in the room for their keys instead.
      if (this.topSpot && !preview) {
        const keys = items.map(one => one.moment.kind === 'bat' ? seenKey('bat', one.moment.bat.id) : seenKey('kit', one.moment.to.id));
        const held = readDressing();
        writeDressing({ ...held, shown: held.shown.filter(key => !keys.includes(key)) });
        return;
      }
      this.unlock = new UnlockMoment(this.hud.viewport, items, new DressingStage(), {
        wear: (shelf, id) => {
          if (!preview) {
            const now = readDressing();
            writeDressing(shelf === 'kit' ? { ...now, outfit: id as OutfitId } : { ...now, bat: id as BatId });
            const worn = this.myLook(); this.scene.dressBatter(worn.outfit, worn.bat, worn.guard);
            this.dressingMark(`dressing-wear-${shelf}-${id}`, `Put on the ${shelf} ${id}`);
          }
          // Over the room, the room puts it on too.
          this.dressing?.update(shelf === 'kit' ? { kit: id as OutfitId, wearing: id as OutfitId, shelf } : { bat: id as BatId, holding: id as BatId, shelf });
        },
        done: () => { this.unlock?.close(); this.unlock = null; if (!this.hud.viewport.querySelector('#modes.hidden')) this.hud.modesFill(this.modeSelectView()); },
      });
    });
  }
  private closeDressing() {
    const was = !!this.dressing;
    this.dressing?.close(); this.dressing = null;
    // A preview's record goes with the room it was shown in.
    this.dressingPreview = null;
    if (!was) return;
    // The card's line and its NEW tag, as they now stand.
    this.hud.modesFill(this.modeSelectView());
    document.getElementById('modes-dressing')?.focus();
  }

  /** The unlock on show, if one is. */
  private unlock: UnlockMoment | null = null;
  /** Once this innings is counted: its unlocks, over its card, a moment after it is up. */
  private unlocksAfter(innings: number) {
    window.setTimeout(() => {
      if (this.disposed || this.innings !== innings || this.phase !== 'INNINGS_END') return;
      this.celebrateUnlocks();
    }, UNLOCK_DELAY_MS);
  }
  /**
   * What has been earned and not yet celebrated, in the order the shelves
   * run, kits first. The first time this browser asks, everything earned so
   * far is noted as seen without a fuss: an old career arriving in the room is
   * not a run of unlocks, and the What's new stories are its welcome.
   */
  private freshUnlocks(): UnlockItem[] {
    const got = earned(this.dressingRecord()), held = readDressing();
    const keys = [...got.outfits.map(id => seenKey('kit', id)), ...got.bats.map(id => seenKey('bat', id))];
    if (!held.seen.length) { writeDressing({ ...held, seen: keys }); return []; }
    const look = this.myLook();
    const items: UnlockItem[] = [];
    // The free kits are nobody's prize: Papaya arriving on an old record is not an unlock.
    for (const id of got.outfits) if (!FREE_OUTFITS.includes(id) && !held.seen.includes(seenKey('kit', id)))
      items.push({ moment: { kind: 'kit', from: look.outfit.id === id ? outfitOf(FREE_OUTFIT) : look.outfit, to: outfitOf(id), bat: look.bat, guard: look.guard } });
    for (const id of got.bats) if (!held.seen.includes(seenKey('bat', id)))
      items.push({ moment: { kind: 'bat', bat: batOf(id) } });
    return items;
  }
  /**
   * Plays whatever has been earned and not celebrated; each is marked seen as
   * it goes up, so none is played twice.
   *
   * An innings that took the top of a board has New #1 for its moment, and
   * one celebration is the end of an innings, not two: what it also earned
   * is noted as seen and left waiting in the Dressing Room with its dot and
   * its own UNLOCK key. So it waits for the store's answer to say which
   * innings this was, a few tries, before playing anything.
   */
  private celebrateUnlocks(tries = 0) {
    if (this.unlock || this.levelUp || this.dressing || this.practising || this.demoing) return;
    const answering = this.phase === 'INNINGS_END' && this.postFor?.innings === this.innings && this.standing?.innings !== this.innings;
    if (answering && tries < 10) {
      const innings = this.innings;
      window.setTimeout(() => { if (!this.disposed && this.innings === innings && this.phase === 'INNINGS_END') this.celebrateUnlocks(tries + 1); }, 500);
      return;
    }
    const items = this.freshUnlocks();
    if (!items.length) return;
    const held = readDressing();
    const keys = items.map(one => one.moment.kind === 'bat' ? seenKey('bat', one.moment.bat.id) : seenKey('kit', one.moment.to.id));
    if (this.topSpot || (this.phase === 'INNINGS_END' && this.topTaken === this.innings)) {
      writeDressing({ ...held, seen: [...new Set([...held.seen, ...keys])] });
      return;
    }
    writeDressing({ ...held, seen: [...new Set([...held.seen, ...keys])], shown: [...new Set([...held.shown, ...keys])] });
    this.putRatingAway();
    for (const one of items) {
      const [shelf, id] = one.moment.kind === 'bat' ? ['bat', one.moment.bat.id] : ['kit', one.moment.to.id];
      this.dressingMark(`dressing-unlock-${shelf}-${id}`, `Earned the ${shelf} ${id}`);
    }
    this.playUnlocks(items);
  }

  /**
   * Whether this browser keeps its Dressing Room with the store: a player
   * with a name, which is what a career key brings back on another device,
   * and not in a private window, whose id does not outlive it.
   */
  private keepsDressing() { return !!this.player && this.canRegister && !!readPlayer()?.name; }
  private stopDressingSends: (() => void) | null = null;
  private dressingTimer = 0;
  /** A change here, sent a moment later. */
  private queueDressingSend() {
    if (!this.keepsDressing()) return;
    window.clearTimeout(this.dressingTimer);
    this.dressingTimer = window.setTimeout(() => void this.sendDressing(), DRESSING_SEND_MS);
  }
  /** This browser's copy sent, and the store's merged answer taken up. */
  private async sendDressing() {
    const player = this.player;
    if (!player || this.disposed) return;
    const kept = await sendSaved(player, readDressing());
    if (kept && player === this.player) this.takeDressing(kept);
  }
  /**
   * What the store keeps for this player, merged into this browser's copy —
   * the later pick, every unlock either has shown — and sent back where the
   * store was missing any of it. Asked once a load, after a restore, and when
   * a name is claimed. An answer that could not be had changes nothing.
   */
  private async pullDressing() {
    if (!this.keepsDressing()) return;
    const player = this.player!;
    const kept = await fetchSaved(player);
    if (kept === undefined || this.disposed || player !== this.player) return;
    const mine = readDressing();
    const merged = kept ? mergeDressing(kept, mine) : mine;
    this.takeDressing(merged);
    if (!sameDressing(merged, kept)) void this.sendDressing();
  }
  /** A copy from the store taken up here, quietly, and whatever shows it redrawn; the batter wears it from his next innings. */
  private takeDressing(kept: SavedDressing) {
    const mine = readDressing(), merged = mergeDressing(kept, mine);
    if (sameDressing(merged, mine)) return;
    writeDressing(merged, { quiet: true });
    const look = this.myLook();
    this.dressing?.update({ record: this.dressingRecord(), wearing: look.outfit.id, holding: look.bat.id, wearingGuard: look.guard.id });
    if (!this.hud.viewport.querySelector('#modes.hidden')) this.hud.modesFill(this.modeSelectView());
  }

  /** The Dressing Room card's line: how much of both shelves is earned. */
  private dressingCount() {
    const record = this.dressingRecord(), got = earned(record);
    // The card's NEW stays until the room has been opened and Boom, waiting there, unlocked.
    return { earned: got.outfits.length + got.bats.length, of: OUTFITS.length + BATS.length, visited: readDressing().visited && record.welcomed && !record.waiting?.length };
  }

  /**
   * Where the player stands on each mode's whole board, asked of the store and
   * drawn onto the posters as each answers: below the fifty as readily as on it.
   * Only for a player with a name; nobody else is on a board to stand anywhere.
   */
  private async placeOnModes(view: ModeSelectView) {
    if (!readPlayer() || !this.player) return;
    const [blast, survive, marathon] = await Promise.all([
      fetchStanding(this.player, 'classic'), fetchStanding(this.player, 'survive'), fetchStanding(this.player, 'marathon'),
    ]);
    if (this.disposed || !this.hud.modesOpen) return;
    const row = survive?.row as SurviveInnings | null | undefined;
    const team = marathon?.team?.row as { runs?: number } | null | undefined;
    this.hud.modesFill({
      ...view,
      blast: { best: view.blast.best, rank: blast?.rank ?? view.blast.rank },
      blastRank: blast?.rank ?? view.blastRank,
      survive: row ? { best: surviveResult(row) === 'Drew the match' ? SURVIVED : surviveResult(row), rank: survive?.rank ?? null } : view.survive,
      marathon: team?.runs ? { best: String(team.runs), rank: marathon?.team?.rank ?? null } : view.marathon,
    });
  }

  /** The count on the hero card, refreshed without putting anything up. */
  private async refreshCount() {
    if (!this.player || NO_BOARD) return;
    const list = await ChallengeRun.mine(this.player);
    if (!list) return;
    this.rooms = list;
    this.hud.challengesOpen(list.yourMove.length, list.waitingOnThem.length);
  }

  /**
   * The key this player holds, or null.
   *
   * Only ever offered to somebody who has claimed a name. A record is brought
   * back with a name and a key together, so a key held by nobody opens nothing
   * — it is a lifeline with the far end tied to air. Four of the seven ways
   * somebody can arrive at this screen have no name yet: a first visit, a
   * career built but never registered, a new phone before restoring, and a new
   * phone with a few innings on it. All four were once handed a key, because
   * the rule was written in a comment and nowhere else.
   */
  private careerKeyHeld() { return keyView(!!readPlayer()); }

  /**
   * Whether the end of this innings offers the way back instead of a key.
   *
   * Only where there is no name, which is the same four arrivals that get no
   * key: a first innings, a career built but never registered, and either of
   * those on a phone that has forgotten somebody. We cannot tell them apart,
   * so the offer goes to all of them and the words carry the doubt.
   */
  private offerRestoreOnCard() {
    return !readPlayer() && offerRestoreHere();
  }

  /**
   * And at the foot of the board, for the same four arrivals.
   *
   * A ladder somebody is not on is the screen a returning player opens first
   * to find out their record is gone, so it is worth asking there — but not
   * against the innings-end cap. That cap is there because a card pushed in
   * front of somebody after every innings becomes scenery; the board is a
   * screen they chose to open, and a line at the foot of it is not in the way.
   * Waving it away anywhere still ends it everywhere.
   */
  private boardRestoreOffer() {
    this.hud.offerRestoreOnBoard = !readPlayer() && !restoreOfferDismissed();
  }

  /**
   * What this device has that no record has counted: the innings and the runs
   * a player put together before realising they could bring their own back.
   *
   * Null where there is nothing, which is the ordinary case — a genuinely
   * wiped phone is empty, so the restore screen never asks the question and
   * stays two fields and a key.
   */
  private localCareer(): LocalCareer | null {
    const held = Object.values(this.myCareer).map(one => one.career);
    const innings = held.reduce((sum, one) => sum + one.innings, 0);
    if (!innings) return null;
    return { innings, runs: held.reduce((sum, one) => sum + one.runs, 0) };
  }

  /** The way back, offered with whatever the screen already knows. */
  private openRestore(from: string, name = '') {
    track(`restore-open-${from}`, `Restore opened from the ${from}`);
    this.hud.openRestore(name, this.localCareer());
  }

  /**
   * A name and a key, offered to the store.
   *
   * Only the store can answer this. What is kept on our side is a salted hash,
   * so a check this browser could run is a check anybody could run offline as
   * often as they liked — and the store is also the only thing that can count
   * the attempts, which is most of what stands between a key and a keyspace.
   */
  private async sendRestore(entry: RestoreEntry) {
    // Opening the screen and filling it in are different acts, and the gap
    // between them is its own answer: somebody who opened this and never
    // pressed the key did not have one to try.
    const by = entry.key === undefined ? 'password' : 'key';
    track(by === 'key' ? 'restore-sent' : 'restore-sent-password',
      by === 'key' ? 'A name and key offered to the store' : 'A name and password offered to the store');
    this.hud.restoreSending(true);
    const answer = entry.key === undefined
      ? await restoreByPassword(entry.name, entry.password)
      : await restoreRecord(entry.name, entry.key);
    if (this.disposed) return;
    if (!answer.ok || !answer.playerId) {
      const why = restoreFailure(answer.reason);
      track(`restore-failed-${why}`, `Restore turned down: ${why}`);
      return this.hud.restoreFailed(answer.reason ?? 'That did not go through.');
    }
    track(by === 'key' ? 'restore-done' : 'restore-done-password', 'Record brought back');
    this.becomeRestored(answer.playerId, entry.name);
    this.hud.closeRestore();
    if (by === 'password') {
      // Brought back by a password, so it has one.
      markPasswordKnown();
      this.passwordState = 'set';
      this.hud.restoreDone(entry.name);
      void this.catchUpOnPassword(true);
    } else {
      // By a career key: the store is asked, and Welcome back offers a
      // password where there is none, so next time the name is enough.
      const state = await this.catchUpOnPassword(true);
      if (this.disposed) return;
      this.hud.restoreDone(entry.name, state === 'none');
    }
    // Brought back from the details sheet: it is drawn again under the name
    // that came back, for the player to carry on with.
    if (this.hud.profileOpen) this.askProfile(this.afterProfile !== null);
  }

  /**
   * The list under the restore sheet's name field, for what has been typed.
   * The HUD drops an answer that arrives after the name has moved on.
   */
  private async findForRestore(name: string) {
    const answer = await findPlayers(name);
    if (this.disposed) return;
    if (!answer) return this.hud.restoreFound(name, null, 'The list could not be reached. Type your whole name instead.');
    if ('reason' in answer) return this.hud.restoreFound(name, null, answer.reason);
    this.hud.restoreFound(name, answer.players);
  }

  /* ── Career password ─────────────────────────────────────────────────────
     When it is asked for is `game/password-nudge.ts`; the screens are
     `ui/Password.ts`; the store is `server/recovery-store.ts`. */

  /**
   * What the store last said about this player's password. "set" from this
   * browser's memory until the store is asked; "unknown" while it has not
   * answered, which asks for nothing — a card offered over an outage would be
   * offered to players who already have one.
   */
  private passwordState: PasswordState = passwordKnown() ? 'set' : 'unknown';
  /** The question the player picked, for the change sheet, and when the password was set. */
  private passwordQuestion: number | null = null;
  private passwordAt: number | null = null;
  private caughtUpOnPassword = false;
  /** Which way into the sheet was taken, for the counts. */
  private passwordFrom = 'stats';
  /** A forgotten password being replaced: the name and the right answer. */
  private recovering: { name: string; answer: string; avatar: number } | null = null;
  /** The nudge sheet is asked once a visit at most. */
  private nudgeShownThisVisit = false;

  /** The store asked, quietly: once a load, and again after a claim or a restore. */
  private async catchUpOnPassword(again = false): Promise<PasswordState> {
    const player = readPlayer();
    if (!player || !this.player || !this.canRegister) return this.passwordState;
    if (this.caughtUpOnPassword && !again) return this.passwordState;
    this.caughtUpOnPassword = true;
    const status = await passwordStatus(player.name, this.player);
    if (this.disposed || !status) return this.passwordState;
    const was = this.passwordState;
    this.passwordState = status.password ? 'set' : 'none';
    this.passwordQuestion = status.question;
    this.passwordAt = status.at;
    if (status.password) markPasswordKnown(); else forgetPasswordKnown();
    if (was !== this.passwordState) {
      if (this.passwordState === 'set') this.hud.passwordCard(null);
      this.redrawKeyPlacements();
    }
    return this.passwordState;
  }

  private get statsCardDue() {
    return statsCardDue({ named: !!readPlayer(), canRegister: this.canRegister, state: this.passwordState });
  }

  /** Career runs, every mode added up, as this browser last heard them. */
  private careerRuns() {
    return (['classic', 'survive', 'marathon'] as const).reduce((sum, mode) => sum + (Number((heldCareer(mode) as { runs?: number }).runs) || 0), 0);
  }

  private careerInnings() {
    return (['classic', 'survive', 'marathon'] as const).reduce((sum, mode) => sum + (Number((heldCareer(mode) as { innings?: number }).innings) || 0), 0);
  }

  /**
   * The end card's password card, and after three end cards walked past the
   * sheet that asks outright, then every five, once a visit. Counted per card
   * shown: one it carried and the player did not answer is one ignored.
   */
  private offerPassword(best: number | null) {
    const runs = this.careerRuns();
    const due = endCardDue({
      named: !!readPlayer(), canRegister: this.canRegister, practice: this.practising, rival: this.challenge.playing,
      demo: this.demoing, state: this.passwordState, runs,
    });
    this.hud.passwordCard(due ? { runs, best } : null);
    if (!due) return;
    track('password-card-end', 'Password card on the end card');
    const ignored = readIgnored();
    writeIgnored(ignored + 1);
    if (!sheetDue(ignored, this.nudgeShownThisVisit)) return;
    const innings = this.innings;
    window.setTimeout(() => {
      if (this.disposed || this.innings !== innings || this.phase !== 'INNINGS_END' || this.passwordState === 'set') return;
      // An unlock or the stars are this innings' moment; the sheet comes at the next one.
      if (this.unlock || this.ratingPrompt?.open || this.hud.passwordOpen) return;
      this.nudgeShownThisVisit = true;
      track('password-nudge-shown', 'Password nudge sheet shown');
      const ranks = (['classic', 'survive', 'marathon'] as const).map(mode => this.bestRank(mode)).filter((r): r is number => !!r);
      this.hud.openNudge({ runs, innings: this.careerInnings(), rank: ranks.length ? Math.min(...ranks) : null });
    }, RATING_DELAY_MS + 600);
  }

  /** Every way into the sheet: the cards, the nudge, Your details, Welcome back. */
  private openPasswordSheet(from: string) {
    const player = readPlayer();
    if (!player || !this.player || !this.canRegister) return;
    this.passwordFrom = from;
    this.recovering = null;
    const mode: PasswordMode = this.passwordState === 'set' ? 'change' : 'set';
    track(`password-open-${from}`, `Password sheet opened from ${from}`);
    this.hud.openPassword({
      mode, name: player.name, avatar: player.avatar,
      question: mode === 'change' ? this.passwordQuestion : null, answerKept: mode === 'change' && this.passwordQuestion !== null,
    });
  }

  /**
   * The sheet's answer, sent. A change that keeps the question and leaves the
   * answer blank sends no question, so the answer the store holds is kept.
   */
  private async savePassword(entry: PasswordEntry, mode: PasswordMode) {
    if (mode === 'recover') return this.finishRecovery(entry);
    const player = readPlayer();
    if (!player || !this.player) return;
    this.hud.passwordSending(true);
    const keepAnswer = mode === 'change' && entry.question === this.passwordQuestion && !entry.answer.trim();
    const question = keepAnswer ? null : entry.question;
    const result = await setCareerPassword(player.name, this.player, entry.password, question, entry.answer);
    if (this.disposed) return;
    if (!result.ok) {
      track('password-save-failed', 'Password not saved');
      return this.hud.passwordFailed(result.reason ?? 'That did not go through.');
    }
    const changed = mode === 'change';
    this.passwordState = 'set';
    markPasswordKnown();
    if (question !== null) this.passwordQuestion = question;
    if (entry.password.trim()) this.passwordAt = Date.now();
    writeIgnored(0);
    track(changed ? 'password-changed' : `password-set-${this.passwordFrom}`, changed ? 'Password changed' : `Password set from ${this.passwordFrom}`);
    // Every first password, whichever way in it came, as one figure.
    if (!changed) track('password-created', 'Password created');
    if (question !== null) track('password-question-set', 'Security question picked');
    this.hud.passwordDone(player.name, player.avatar, changed);
    this.hud.passwordCard(null);
    this.redrawKeyPlacements();
    if (this.hud.profileOpen) this.askProfile(this.afterProfile !== null);
  }

  /** Forgot password, off the restore sheet: the question, or the career key where there is none. */
  private async forgotPassword(name: string) {
    track('password-forgot', 'Forgot password opened');
    const found = await findQuestion(name);
    if (this.disposed) return;
    if ('reason' in found) return this.hud.restoreFailed(found.reason);
    if (found.question === null) { track('password-forgot-no-question', 'Forgot password, no question set'); return this.hud.openNoQuestion(); }
    this.recovering = { name, answer: '', avatar: this.hud.restoreAvatarOf(name) };
    this.hud.openAnswer({ name, avatar: this.recovering.avatar, question: found.question });
  }

  /** The answer, checked; right, and a new password is asked for. */
  private async checkAnswer(answer: string) {
    const r = this.recovering;
    if (!r) return;
    this.hud.answerSending(true);
    const result = await recoverByAnswer(r.name, answer);
    if (this.disposed) return;
    if (!result.ok) {
      track('password-answer-wrong', 'Security answer turned down');
      return this.hud.answerFailed(result.reason ?? 'That did not go through.');
    }
    this.recovering = { ...r, answer };
    this.hud.closePassword();
    this.hud.openPassword({ mode: 'recover', name: r.name, avatar: r.avatar, question: null });
  }

  /** The new password, with the answer again; the store changes it and hands the player back. */
  private async finishRecovery(entry: PasswordEntry) {
    const r = this.recovering;
    if (!r) return;
    this.hud.passwordSending(true);
    const result = await recoverByAnswer(r.name, r.answer, entry.password);
    if (this.disposed) return;
    if (!result.ok || !result.playerId) return this.hud.passwordFailed(result.reason ?? 'That did not go through.');
    track('restore-done-question', 'Record brought back with the security question');
    this.recovering = null;
    this.becomeRestored(result.playerId, r.name);
    markPasswordKnown();
    this.passwordState = 'set';
    this.hud.closePassword();
    this.hud.closeRestore();
    this.hud.restoreDone(r.name);
    void this.catchUpOnPassword(true);
    if (this.hud.profileOpen) this.askProfile(this.afterProfile !== null);
  }

  /**
   * Saving a key, which until now was a thing the sheet said and did not do.
   *
   * Both keys called through to a handler that recorded the save and retired
   * the prompts, and neither ever opened WhatsApp or wrote to the clipboard.
   * The player was told their key was safe and was holding nothing, which is
   * the exact failure this file's own comment warns about — and the one the
   * whole widget exists to prevent.
   *
   * The save is recorded only where something actually happened. A clipboard
   * that refuses, or a window the browser blocks, leaves the prompt standing:
   * a key that did not get out of here is a key still worth asking about.
   */
  private async saveKey(how: 'whatsapp' | 'copy' | 'image'): Promise<boolean> {
    const code = this.careerKeyHeld()?.code;
    const name = readPlayer()?.name;
    if (!code || !name) return false;
    // Counted, because a save that cannot happen is invisible from a dashboard
    // otherwise: the player presses a key, nothing is recorded, and the figures
    // read as somebody who never bothered. A browser that refuses one of these
    // for everybody would show up here as a flat line against a busy sheet.
    const refused = (why: 'blocked' | 'refused') => {
      track(`key-save-failed-${how}`, `Career key could not be saved: ${how} ${why}`);
      return false;
    };
    if (how === 'image') {
      const went = await this.saveKeyImage(name, code);
      // Dismissing the share sheet is somebody changing their mind, and it is
      // not counted as a failure: a browser that cannot save is a bug worth
      // seeing, and a player who thought better of it is not, and a figure
      // holding both answers neither.
      if (went === 'cancelled') return false;
      if (!went) return refused('blocked');
    } else if (how === 'copy') {
      // No clipboard at all, or permission refused. Either way nothing was
      // saved, and the sheet stays up rather than closing on a promise it
      // did not keep.
      try { await navigator.clipboard.writeText(code); } catch { return refused('refused'); }
    } else if (!window.open(keyWhatsappLink(name, code, gameLink()), '_blank')) {
      // Blocked as a popup. Opening inside the click that asked for it is what
      // usually prevents that, and this is the case where it did not.
      return refused('blocked');
    }
    // Which one was used is worth knowing — they do not all finish the job, and
    // the one that leaves the most homework is the one a player reaches for
    // first — so they are counted apart even though they retire the same
    // prompts.
    markKeySaved();
    track(`key-saved-${how}`, how === 'whatsapp'
      ? 'Career key sent to WhatsApp'
      : how === 'image' ? 'Career key saved as a picture' : 'Career key copied');
    this.redrawKeyPlacements();
    return true;
  }

  /**
   * The key as a picture, handed to the phone to put wherever it puts pictures.
   *
   * The share sheet first, because on a phone that is the road to the camera
   * roll and it is also where "save to Files" and every messaging app live. A
   * download is the desktop answer and the fallback for a browser that will not
   * hand a file to anything.
   *
   * A dismissed share sheet throws `AbortError`, and that is not a failure —
   * it is somebody changing their mind. Reporting it as one would put a
   * "could not save" notice under a key that worked perfectly.
   */
  private async saveKeyImage(name: string, code: string): Promise<boolean | 'cancelled'> {
    try {
      const picture = await keyImage(name, code);
      const file = new File([picture], keyImageName(name), { type: 'image/png' });
      if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file] });
        } catch (error) {
          if ((error as { name?: string })?.name === 'AbortError') return 'cancelled';
          throw error;
        }
        return true;
      }
      const url = URL.createObjectURL(picture);
      const link = document.createElement('a');
      link.href = url;
      link.download = keyImageName(name);
      link.click();
      // Given a moment to be read before the blob behind it is let go.
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Every screen the key and the offer appear on, redrawn from what is true now.
   *
   * Making a key, saving one, and bringing a record back all change what these
   * should say, and all three happen inside a modal standing over them. Closing
   * that modal put the player back in front of the screen as it was before —
   * still offering a new key they had just made, still offering to restore a
   * record they had just restored.
   */
  private redrawKeyPlacements() {
    // Only where that slot is already carrying something. Drawing the offer
    // into it is what counts a showing against its cap, so a redraw aimed at a
    // card nobody is looking at would spend one of the two.
    if (this.hud.keyPanelShowing) {
      this.hud.offerRestorePanel = this.offerRestoreOnCard();
      this.hud.careerKey(this.careerKeyHeld(), { panel: true, bar: false });
    }
    // The board is drawn when it is opened and not again, so an offer already
    // standing on it outlives the thing it was offering.
    this.boardRestoreOffer();
    if (!this.hud.offerRestoreOnBoard) this.hud.dropBoardRestore();
    this.hud.redrawStoryKey();
    this.redrawStats();
  }

  /** Whose career the innings in play counts toward. */
  private get careerMode(): CareerMode { return this.surviving ? 'survive' : this.marathoning ? 'marathon' : 'classic'; }

  /** My Stats, in whichever of its two presentations is on the screen. */
  private redrawStats() {
    const mode = this.careerMode;
    if (this.statsPage) {
      this.railStats(mode, view => {
        if (this.disposed || !this.statsPage) return;
        this.hud.stats(view);
      });
    } else if (this.hud.boardOpen && this.sheetTab === 'mine') {
      this.openMine();
    }
  }

  /**
   * The key an existing player never got, fetched quietly on sight of the game.
   *
   * Every name on the board was claimed before keys existed, so none of them
   * has one — and the path that mints a key is a *claim*, which happens when an
   * innings beats the one already up there, not when an innings is played.
   * Somebody sitting fourth with two thousand runs behind them could go weeks
   * without registering anything, and all that time the thing built to save
   * their record could not reach them. Waiting for them to find a button on My
   * Stats is the same problem wearing a hat.
   *
   * So it is asked for rather than waited for. The store mints only where the
   * name has none, which is what makes this safe to do unasked: a second
   * browser gets nothing and goes on saying `lost`, rather than minting a
   * replacement that would quietly stop the key on the first one working.
   *
   * Quietly, and once. No sheet is thrown in front of anybody on load — the
   * card and the strip at the end of an innings are where the asking belongs,
   * and they can only do it once there is a key for them to ask about.
   */
  private caughtUpOnKey = false;
  private async catchUpOnKey() {
    if (this.caughtUpOnKey) return;
    const player = readPlayer();
    if (!player || !this.player || this.careerKeyHeld()?.state !== 'lost') return;
    this.caughtUpOnKey = true;
    const made = await firstCareerKey(player.name, this.player);
    if (this.disposed || !made) return;
    keepKey(made);
    track('key-caught-up', 'A key issued to a name that never had one');
    this.redrawKeyPlacements();
  }

  /**
   * A key to replace one this browser cannot produce.
   *
   * Proved by holding the player id, which is the same secret the board is
   * written with — somebody who has it can already post innings under that
   * name, so this hands them nothing new. Making it is what stops the old one
   * working, which is the point: a key somebody has lost is a key somebody
   * else may have found.
   */
  private async makeNewKey() {
    const player = readPlayer();
    if (!player || !this.player) return;
    const made = await newCareerKey(player.name, this.player);
    if (this.disposed) return;
    if (!made.ok || !made.key) {
      track('key-new-failed', 'New career key refused');
      return;
    }
    keepKey(made.key);
    track('key-new', 'New career key made');
    // The card behind the sheet asked for this and has to stop asking: it still
    // reads "make a new key" over a browser that now holds one.
    this.redrawKeyPlacements();
    this.hud.openKeySheet();
  }

  /**
   * Who is batting, asked before the first innings — of a new player and an
   * old one alike, the old one's filled in — and from My Stats whenever they
   * want to change it.
   *
   * Not asked of the scripted browser the checks drive (`?debug=1`), which
   * would otherwise have to answer it in every one of them; `?profile=1` asks
   * it there too, for the check that walks it. Nor of the attract mode, which
   * nobody is playing.
   */
  private get profileDue() {
    if (profileDone() || this.demoing) return false;
    return !this.debug || new URLSearchParams(location.search).get('profile') === '1';
  }
  /** What the gate is holding up: the innings it was put in front of. */
  private afterProfile: (() => void) | null = null;
  private askProfile(gate: boolean) {
    this.welcomeScenario = null;
    const mine = readPlayer();
    const deal = kitDeal(this.player);
    const tier = standingOf('classic', heldCareer('classic') as BlastCareer).tier;
    this.hud.openProfile({
      name: mine?.name ?? '', avatar: mine?.avatar ?? deal.opening, hand: readHand(), order: deal.order,
      gate, fresh: !mine, tier: { key: tier.key, name: tier.name },
      // Played before?, for a browser that forgot them; and from My Stats, the
      // password row, where a password can be kept.
      played: gate && !mine,
      password: !gate && mine && this.canRegister && this.passwordState !== 'unknown'
        ? { set: this.passwordState === 'set', at: this.passwordAt, question: this.passwordQuestion !== null } : null,
      // The bio, on the edit for a player with a name and a store to keep it.
      ...(!gate && mine && this.canRegister ? { bio: this.bioKnown ?? '' } : {}),
    });
  }
  /** The bio as the store last said, from the activity My profile asks for; undefined until it has. */
  private bioKnown: string | null | undefined = undefined;

  /**
   * The answer. The name goes to the store whether or not it changed: a name
   * typed into a Rivals sheet lives only in this browser, and this is where it
   * is claimed. The store holds a new name to the rules and to once a month,
   * and a name the player already holds to nothing, so saying the same name
   * again costs nothing — and brings the key, where they have none.
   */
  private async saveProfile(entry: { name: string; avatar: number; hand: Hand; bio?: string; bioWas?: string }) {
    const mine = readPlayer();
    const name = cleanName(entry.name), folded = foldName(name);
    if (!folded) return this.hud.profileFailed('Your name, up to 14 letters or numbers.');
    const changed = !mine || foldName(mine.name) !== folded;
    if (changed) {
      const problem = nameProblem(name, folded);
      if (problem) return this.hud.profileFailed(problem);
    }
    if (this.welcomeScenario) return this.answerPreview(this.welcomeScenario, name, changed);
    writeHand(entry.hand);
    // A private window can keep nothing, so the name stays in it and goes nowhere.
    if (!this.canRegister || !this.player) {
      writePlayer({ name, avatar: entry.avatar });
      return this.profileSaved(false);
    }
    this.hud.profileSending(true);
    // The request carries its own timeout, and a phone's first visit has still
    // left this key saying SAVING… until a reload. So the sheet keeps a clock
    // of its own: past it, the answer is the outage's, which lets them bat.
    const result = await Promise.race([
      claimName(this.player, name, entry.avatar, mine?.name),
      new Promise<Awaited<ReturnType<typeof claimName>>>(settle => window.setTimeout(() => settle({
        ok: false, reason: 'The board could not be reached. Try again in a moment.', offline: true,
      }), PROFILE_PATIENCE_MS)),
    ]);
    if (this.disposed) return;
    if (!result.ok) {
      this.mark(result.taken ? 'profile-name-taken' : result.offline ? 'profile-offline' : 'profile-refused',
        result.taken ? 'Name already held' : result.offline ? 'Board unreachable from the form' : 'Name turned down');
      return this.hud.profileFailed(result.reason ?? 'That did not go through.', {
        held: result.taken ? (result.held ?? name) : null, offline: result.offline,
      });
    }
    this.mark(changed ? 'profile-named' : 'profile-confirmed', changed ? 'Name claimed or changed' : 'Details confirmed');
    writePlayer({ name: result.name ?? name, avatar: entry.avatar });
    // The bio, only where it was changed: a field drawn before the store had
    // said what it was must not send an empty one over a bio that exists.
    if (entry.bio !== undefined && cleanBio(entry.bio) !== cleanBio(entry.bioWas ?? '')) {
      const saved = await saveBio(this.player, result.name ?? name, entry.bio).catch(() => ({ ok: false as const, reason: 'Your bio could not be saved. Try again in a moment.' }));
      if (this.disposed) return;
      if (!saved.ok) { this.hud.profileSending(false); return this.hud.profileFailed(saved.reason); }
      this.bioKnown = saved.bio;
      this.hud.statsBio(saved.bio);
      this.mark(saved.bio ? 'bio-saved' : 'bio-cleared', saved.bio ? 'Bio saved' : 'Bio cleared');
    }
    // A new name has no password behind it yet; the store says so, quietly.
    if (!mine) void this.catchUpOnPassword(true);
    if (result.key) {
      keepKey(result.key);
      track('key-issued', 'Career key issued');
    }
    this.profileSaved(changed);
  }

  /**
   * The board could not be reached, and the player bats anyway: a gate that
   * held somebody at the crease for an outage would be the game's fault, not
   * theirs. What they typed is kept here and the form asks again next time.
   */
  private skipProfile(entry: { name: string; avatar: number; hand: Hand }) {
    if (this.welcomeScenario) return this.hud.closeProfile();
    this.mark('profile-skipped', 'Batted without the board');
    writeHand(entry.hand);
    if (!readPlayer() && cleanName(entry.name)) writePlayer({ name: cleanName(entry.name), avatar: entry.avatar });
    this.hud.closeProfile();
    this.continueAfterProfile();
  }

  /**
   * The welcome as `?welcome=1` puts it up: the screen a player in that spot
   * would see, filled in the way theirs would be.
   */
  private previewWelcome(scenario: WelcomeScenario) {
    const mine = readPlayer(), deal = kitDeal(this.player);
    const known = mine?.name ?? 'Virat18';
    const names: Record<WelcomeScenario, string> = {
      new: '', offline: '', back: known, edit: known, month: known, taken: 'Rohit', sibling: 'Rohit 2',
    };
    this.afterProfile = null;
    this.hud.openProfile({
      name: names[scenario], avatar: mine?.avatar ?? deal.opening, hand: readHand(), order: deal.order,
      gate: scenario !== 'edit' && scenario !== 'month',
      fresh: scenario === 'new' || scenario === 'taken' || scenario === 'sibling' || scenario === 'offline',
      played: scenario === 'new' || scenario === 'taken' || scenario === 'sibling' || scenario === 'offline',
      password: scenario === 'edit' || scenario === 'month' ? { set: true, at: Date.now() - 12 * 24 * 60 * 60 * 1000, question: true } : null,
    });
    this.welcomeScenario = scenario;
  }

  /**
   * What the store would have said, said after the moment it takes to ask it.
   * The words are the store's own: the same functions write them.
   */
  private answerPreview(scenario: WelcomeScenario, name: string, changed: boolean) {
    this.hud.profileSending(true);
    window.setTimeout(() => {
      if (this.disposed || this.welcomeScenario !== scenario) return;
      if (scenario === 'taken') return this.hud.profileFailed('Somebody already bats under that name.', { held: name });
      if (scenario === 'sibling') {
        const held = name.replace(/\s*\d+$/, '') || name;
        return this.hud.profileFailed(siblingReason(held), { held });
      }
      // The month holds back only a new name: the one already held is never refused.
      if (scenario === 'month' && changed) return this.hud.profileFailed(renameReason(Date.now() - 12 * 24 * 60 * 60 * 1000));
      if (scenario === 'offline') {
        return this.hud.profileFailed('The board could not be reached. Try again in a moment.', { offline: true });
      }
      this.hud.closeProfile();
    }, 600);
  }

  private profileSaved(changed: boolean) {
    markProfileDone();
    // A name claimed is a Dressing Room the store can keep: this browser's goes up, merged with any it held.
    void this.pullDressing();
    // Everything drawn under the old name is dropped, so the next look draws it under the new.
    if (changed) {
      forgetCareer();
      forgetBoard();
      this.careerBoards = {};
      this.myCareer = {};
      this.boardSeen = false;
      this.surviveSeen = false;
      this.boardEpoch++;
      this.surviveEpoch++;
    }
    this.hud.closeProfile();
    this.redrawKeyPlacements();
    this.continueAfterProfile();
  }

  private continueAfterProfile() {
    const then = this.afterProfile;
    this.afterProfile = null;
    then?.();
  }

  /**
   * This browser is that player now.
   *
   * The id is the whole of who somebody is here, so adopting it is the entire
   * act of restoring — the career, the board row and the card all key off it
   * and arrive on the next fetch. Everything held from before is dropped: it
   * describes whoever this browser used to be, and a card drawn from it over a
   * record that has just come back would be the wrong figures under the right
   * name.
   *
   * The key is forgotten rather than guessed at. The store has a hash and
   * cannot produce the key that made it, so this browser holds none — which is
   * what `lost` on the widget says, and it offers a new one.
   */
  private becomeRestored(playerId: string, name: string) {
    this.player = playerId;
    // Written down, so the next visit is this player too and not the one this browser minted.
    void adoptPlayerId(playerId);
    writePlayer({ name: name.trim(), avatar: readPlayer()?.avatar ?? 0 });
    forgetKey();
    // What was known about the last player's password is not this one's.
    forgetPasswordKnown();
    this.passwordState = 'unknown';
    this.passwordQuestion = null;
    this.passwordAt = null;
    forgetCareer();
    this.careerBoards = {};
    this.myCareer = {};
    this.board = [];
    this.surviveRows = [];
    this.boardSeen = false;
    this.surviveSeen = false;
    this.boardEpoch++;
    this.surviveEpoch++;
    // The offer that brought them here is answered. Left alone it stays on the
    // card under the career widget, inviting somebody to restore the record
    // they are already looking at.
    this.redrawKeyPlacements();
    // And their Dressing Room with it: what they wear and hold, from the device they played on.
    void this.pullDressing();
  }
  /**
   * Out of the picker without picking. Opened from the cover that is the cover
   * again; opened from a paused innings it is the pause card again, silent the
   * way a paused innings is, with the focus back on the key that resumes it.
   */
  private closePicker = () => {
    this.hud.closeModes();
    // Before any innings, back from the picker is back to the cover. The cover
    // is not always still under it: Rival Matches, the room and the sheets all
    // take it down to stand in its place, and a picker reopened from one of
    // them closed onto the bare ground, frozen, with nothing to press.
    if (this.phase === 'START') { this.hud.showCover(); return; }
    // Opened from an end card, which the picker put away to make room for
    // itself. Backing out has to put it back: the innings is over, so there is
    // nothing under the picker but the ground, holding the score it finished on
    // and refusing every key because the phase says the innings is done.
    if (this.phase === 'INNINGS_END') {
      this.hud.showResult(this.surviving);
      // The card's own music again, in place of the cover's that the picker
      // brought with it. `modes` hands one to the other on the way in and this
      // is the same handover run backwards.
      this.audio.music('result');
      return;
    }
    if (this.phase !== 'PAUSED') return;
    // Back to the card, and back to silence with it. `stop` is the one-shot
    // clips; the picker's own music is a track, and a track left wanted goes
    // on playing over a card whose whole point is that nothing is happening.
    this.audio.music(null); this.audio.stop();
    this.hud.pause(true);
  };
  /** Pick an innings. The mode is remembered, so Play Again replays the same one. */
  choose = (mode: GameMode) => {
    this.mode = mode;
    // The mode played last, where Choose a mode's rail opens next time.
    try { if (mode === 'CLASSIC' || mode === 'MARATHON' || mode === 'SURVIVE') localStorage.setItem(LAST_MODE_KEY, mode); } catch { /* Then it opens on the Blast. */ }
    this.walkOut();
  };
  /**
   * I'M EXCITED on Super10's page: lit at once and for good, and counted once a
   * browser, on GoatCounter and by the store (`sendExcited`). A private window
   * keeps nothing, so it is counted on GoatCounter alone.
   */
  private excited = () => {
    if (excitedAlready()) return;
    try { localStorage.setItem(EXCITED_KEY, '1'); } catch { /* Lit for this visit, all the same. */ }
    this.hud.super10Excited(true);
    buzz([12, 40, 18]);
    track('super10-excited', "Pressed I'M EXCITED on the Super10 page");
    if (this.player && this.canRegister) sendExcited(this.player);
  };
  /**
   * An innings chosen, by whichever way a player chose it: the picker, a link
   * that named the mode, or the tutorial's way out. The first one used to put
   * the old ground up first, to be swiped off the new one; the stadium is
   * nobody's news any more, so a player now walks straight out to bat.
   */
  private walkOut = () => this.start();
  start = () => {
    if (this.chaseWon) { this.chaseWon = false; this.clearChase(); }
    // Who is batting, first: once, before the first innings there is.
    if (this.profileDue) {
      this.afterProfile = () => this.start();
      return this.askProfile(true);
    }
    // A restart is an innings walked out on, and reads as nothing else: it is
    // the only way here that is not the cover, the tutorial, or the card.
    if (!['START', 'INNINGS_END'].includes(this.phase) && this.lesson < 0) this.mark('innings-restart', 'Innings restarted');
    this.innings++;
    this.putRatingAway();
    this.inningsFrom = this.playedMs;
    this.spinPulls = freshTally(); this.hooks = freshTally();
    this.mark('innings-start', 'Innings started');
    if (this.innings > 1) this.mark('innings-replay', 'Innings replayed');
    this.lesson = -1;
    // Walking out takes the cover's music with it: an innings is played to the
    // bat and the crowd. The card's music is fetched now instead, so that the
    // card does not go up in silence waiting for a megabyte to arrive.
    this.audio.stop(); this.audio.music(null); this.audio.warm('result'); this.audio.unlock();
    // And the crowd comes in with him: see `crowd.ts`.
    this.audio.crowd(this.test ? MURMUR.test : MURMUR.blast);
    this.score = new ScoreManager(this.limits); this.confidence = new Confidence(); this.health = new Health();
    this.sledger = new Sledger(); this.sledgeDue = false; this.lastSledge = 0; this.ending = null;
    this.playedFrom = 0; this.changed = null; this.felled = false;
    this.wasCritical = false; this.noticeDue = false;
    this.lastAfterBall = null; this.afterBallSince = Infinity; this.sweepsScored = 0;
    const param = new URLSearchParams(location.search).get('seed');
    this.seed = param !== null && Number.isFinite(Number(param)) ? Number(param) >>> 0 : crypto.getRandomValues(new Uint32Array(1))[0];
    this.rng = new SeededRandom(this.seed);
    // The score at the other end is drawn first, off the innings seed, so that
    // the same seed always walks out to the same scoreboard. Drawing it from the
    // clock would have made a share card a lie the moment it was reloaded.
    this.chasing = this.surviving ? teamScore(this.rng) : 0;
    // Who bats left-handed is the seed's too, drawn apart from the bowling.
    // `?settled=1` walks every batter out settled with a full meter, for trying
    // the special strokes without batting six overs to earn each one.
    this.marathon = this.marathoning
      ? new MarathonInnings(leftHandersOf(this.seed, location.search, readHand()), new URLSearchParams(location.search).get('settled') === '1')
      : null;
    if (this.marathon) this.health = this.marathon.current.health;
    this.ease = this.newcomerEase();
    // Which of the helped innings this is, so the dashboard can set the
    // newcomers who come back against the ones who do not.
    if (this.ease > 1) this.mark(`newcomer-${EASE.indexOf(this.ease) + 1}`, 'Innings batted with a newcomer\'s help');
    this.generator = new DeliveryGenerator(this.rng, this.plan);
    this.applyNets();
    // `?cover=1`: the cover drive's ball every time, to play the stroke over
    // and over. Practice, so it counts for nothing; and not in a Rival Match.
    if (this.coverDrill && !this.challenge.playing) this.generator.drill('NORMAL', 'OFF');
    this.delivery = null; this.attempt = null; this.outcome = null; this.elapsed = 0; this.primed = null;
    this.input.reset(); this.scene.reset();
    const look = this.myLook(); this.scene.dressBatter(look.outfit, look.bat, look.guard);
    this.scene.whites(this.test);
    // A Test by day; the Blast by the player's clock, or their own choice.
    this.light(this.test ? 'day' : blastLights());
    // Under a clear sky, with nothing yet told.
    this.told = { swing: false }; this.bannerUntil = 0; this.hud.closeIntro();
    this.scene.overcast(false, true); this.hud.levelBanner(null);
    this.hud.start(this.surviving, this.marathoning);
    this.hand();
    // Super10's field, and its captain at mid-off, put out before the first ball.
    this.s10 = Game.freshField();
    this.scene.arenaMood('calm');
    this.fieldUi.show(this.super10, this.scene.mirrored);
    if (this.super10) this.super10Over(false);
    this.nearing = null; this.hud.nearing(null, null);
    // The Test board is fetched when a Test innings starts rather than on every
    // load: a player who only ever picks the five-over innings never asks for
    // it, and by the time this one ends it is already held.
    if (this.surviving && !SURVIVE_ONLY) void this.loadSurviveBoard();
    this.hud.score(this.score); this.showConfidence();
    if (this.surviving) this.hud.target(this.chasing, this.score.runs, this.score.balls, this.score.wickets);
    this.setPhase('READY');
    (document.activeElement as HTMLElement | null)?.blur();
    if (this.marathoning) this.introduce(); else this.teachShots();
    this.startChase();
  };
  /**
   * The Marathon's rules, the first two times one starts: the bowler waits at
   * his mark until the last card is put away, the way he waits for a banner.
   */
  private introduce() {
    if (this.demoing || !introDue()) return;
    noteIntro('shown');
    // They open with how to hit, so a first innings anywhere else has only the meter left to tell.
    noteHowTo(false);
    this.mark('intro', 'Rules shown');
    this.bannerUntil = Number.POSITIVE_INFINITY;
    this.hud.marathonIntro(how => {
      if (how === 'skipped') noteIntro('skipped');
      this.mark(how === 'skipped' ? 'intro-skipped' : 'intro-finished', how === 'skipped' ? 'Rules skipped' : 'Rules read to the end');
      this.bannerUntil = this.elapsed;
    }, INTRO_STEPS, { left: !!this.marathon?.current.left, game: this.coachGame, at: () => this.scene.batterOnScreen() });
  }
  /**
   * How to hit, before the first ball a browser ever faces outside a
   * Marathon, and then the confidence meter where the scoreboard has one: the
   * same coachmarks, and the bowler at his mark until they are put away. Not
   * for a browser that has batted here before.
   */
  private teachShots() {
    const shots = this.demoing ? [] : howToDue(!this.hurts);
    // And Super10's field map, the first time this browser bats one.
    const field = !this.demoing && this.super10 && fieldIntroDue();
    const steps = field ? [...shots, FIELD_STEP] : shots;
    if (!steps.length) return;
    if (shots.length) noteHowTo(shots.includes(CONFIDENCE_STEP));
    if (field) noteFieldIntro();
    this.mark('shots-intro', 'How to hit shown');
    this.bannerUntil = Number.POSITIVE_INFINITY;
    this.hud.marathonIntro(how => {
      this.mark(how === 'skipped' ? 'shots-intro-skipped' : 'shots-intro-done', how === 'skipped' ? 'How to hit skipped' : 'How to hit put away');
      this.bannerUntil = this.elapsed;
    // Drawn the way round the player bats: a left-hander's swipes are mirrored, so are the lanes.
    }, steps, { left: this.scene.mirrored, game: this.coachGame, at: () => this.scene.batterOnScreen() });
  }
  /**
   * HOW TO PLAY on the cover: the coachmarks a first innings opens with (how
   * to hit, then the confidence meter), over a picture of the Blast's ground
   * before its first ball, ending on the two ways
   * on — PLAY NOW, which starts a Blast, and CHOOSE A MODE. Seen this way they
   * count as seen, so the Blast that follows does not show them again.
   */
  private howToPlay = () => {
    track('how-to-play', 'How to play opened from the cover');
    noteHowTo(true);
    this.hud.marathonIntro(how => {
      if (how === 'skipped') return;
      // A link or a build locked to one mode plays that mode either way: PLAY NOW started a Blast.
      if (this.locked) return this.walkOut();
      if (how === 'modes') return this.modes();
      this.choose('CLASSIC');
    // Drawn for the right-hander the picture of the ground shows.
    }, [SHOTS_STEP, CONFIDENCE_STEP], { finish: true });
  };

  /** Three scripted balls, no wickets, and a way out at any point. */
  startTutorial = () => {
    track('tutorial-start', 'Tutorial started');
    this.mode = 'CLASSIC';
    this.scene.whites(false); this.scene.overcast(false, true); this.hud.levelBanner(null); this.light(blastLights()); this.scene.leftHanded(false); this.hud.sides(false);
    this.fieldUi.show(false);
    this.audio.stop(); this.audio.music(null); this.audio.crowd(null); this.audio.unlock(); this.score = new ScoreManager();
    this.delivery = null; this.attempt = null; this.outcome = null; this.elapsed = 0; this.lesson = 0; this.primed = null; this.confidence = new Confidence(); this.sledger = new Sledger(); this.sledgeDue = false;
    this.ease = 1; this.input.reset(); this.scene.reset(); this.hud.startTutorial(); this.showConfidence(); this.setPhase('READY');
    this.hud.coach(TUTORIAL[0], 1, TUTORIAL.length);
    (document.activeElement as HTMLElement | null)?.blur();
  };
  /**
   * New or returning, and how long they were away. Worked out on this machine
   * because GoatCounter cannot do it — it forgets a visitor overnight by
   * design — and what goes out is a band, never a date.
   */
  private countVisit() {
    const { held, storable } = readVisits();
    // A browser that cannot remember would report itself new every session, so
    // it reports nothing: one silent visitor beats an inflated count of them.
    if (!storable || !counting(location)) return;
    const { visits, events } = visiting(held, today());
    writeVisits(visits);
    events.forEach(event => track(event));
  }

  /** Test Survival: its rules, its board, its chase. */
  private get surviving() { return this.mode === 'SURVIVE'; }
  /** Test Marathon: three batters, and no end but theirs. */
  private get marathoning() { return this.mode === 'MARATHON'; }
  /** Super10: the Blast's ball for ten overs, three batters and five bowlers. */
  private get super10() { return this.mode === 'SUPER10'; }
  /**
   * Day or night for the innings, and the ground that goes with it
   * (`groundFor`): Super10 at the canopy, always at night, its stumps the LED
   * stumps (`brand`); a Test by day at the pavilion, the stadium or the
   * canopy; the Blast at the pavilion or the stadium by the player's clock.
   */
  private light(time: SkyTime) {
    const game = this.super10 ? 'super10' : this.test ? 'test' : 'blast';
    if (game === 'super10') time = 'night';
    this.scene.stands(groundFor(ASKED_GROUND, game, VENUE_COIN[game === 'test' ? 'test' : 'blast']));
    this.scene.brand(this.super10);
    this.scene.time(time);
    this.hud.bigScreen(this.scene.bigScreen, this.scene.screenMoments);
  }
  /** What the arena's big screen says between moments: the game, the score, the over and, in Super10, who is in. */
  private scoreboard() {
    const { runs, wickets, balls } = this.score;
    const title = this.super10 ? 'SUPER10' : this.marathoning ? 'TEST MARATHON' : this.surviving ? 'TEST SURVIVAL' : 'THE BLAST';
    const overs = `${Math.floor(balls / 6)}.${balls % 6} OV`;
    return { title, score: `${runs}/${wickets}`, detail: this.super10 ? `${overs} · ${super10Batter(wickets).title}` : overs };
  }
  /**
   * Either Test mode: Survival's ball — its ladder, its injury meter, no
   * confidence and no charge. Which of the two decides everything else.
   */
  private get hurts() { return this.surviving || this.marathoning; }
  /** A Test match of either kind: how it looks — whites, the Test field, by day. See `modes.ts`. */
  private get test() { return isTest(this.mode); }
  private get limits() {
    return this.surviving ? SURVIVE_LIMITS : this.marathoning ? MARATHON_LIMITS : this.super10 ? SUPER10_LIMITS : CLASSIC_LIMITS;
  }
  /** The switches in this link that change the game: see `practice.ts`. */
  private readonly switches = practiceSwitches(location.search, { spinOnly: SPIN_ONLY, chargeOnly: CHARGE_ONLY });
  /**
   * This innings was played with one of them. Not in a Rival Match, where
   * they do nothing: a match has to send its innings to finish.
   */
  private get practising() { return (this.switches.length > 0 || this.super10) && !this.challenge.playing; }
  /**
   * What a card offers, once the innings is known to be practice or played in
   * a private window. An innings with nothing to offer stays quiet either way.
   */
  private shownOffer(offer: CardOffer): CardOffer {
    // Super10 has no board yet, and says so whatever the innings was worth.
    if (this.super10 && !this.challenge.playing) return { kind: 'practice', why: 'building' };
    // An innings with nothing for the boards still offers a name to a player
    // who has none — not from a private window, which cannot keep one, nor
    // practice, nor a Rival Match, whose card is the match's.
    if (offer.kind === 'silent') {
      return !readPlayer() && this.canRegister && !this.practising && !this.challenge.playing ? { kind: 'name' } : offer;
    }
    if (this.practising) return { kind: 'practice' };
    return this.canRegister ? offer : { kind: 'private' };
  }
  /** `?spin=1` is the same thing as the build flag, for a dev server. */
  private spinOnly = SPIN_ONLY || new URLSearchParams(location.search).get('spin') === '1';
  /** `?slowmo=0.65` tries a clock speed for the charge on a dev server. */
  private slowmoAsked = Number(new URLSearchParams(location.search).get('slowmo')) || CHARGE_SLOWMO;
  private get chargeSlowmo() { return this.challenge.playing ? CHARGE_SLOWMO : this.slowmoAsked; }
  /** `?charge=1` likewise, and `?charge=ball` for the ball alone. Only the classic innings has a meter to fill. */
  private chargeOnly = CHARGE_ONLY || new URLSearchParams(location.search).get('charge') || '';
  /**
   * The ball the charge is for, in place of whatever was drawn: on the stumps,
   * on a length, at a medium pacer's speed, and the meter filled to walk at it.
   * Nothing else about the innings changes — the same scoring, the same
   * wickets — so a mistimed charge is still a mistimed charge.
   */
  private chargeable(delivery: Delivery): Delivery {
    if (!this.chargeOnly || this.hurts || this.lesson >= 0 || this.challenge.playing) return delivery;
    if (this.chargeOnly !== 'ball') this.confidence.value = CONFIDENCE_FULL;
    // `meter`: the meter alone, the ball left to the innings, for the
    // strokes that want a ball the charge does not — the scoops.
    if (this.chargeOnly === 'meter') return delivery;
    const speedKph = Math.round((ADVANCE.minKph + ADVANCE.maxKph) / 2);
    return { ...delivery, line: 'MIDDLE', style: 'NORMAL', speedKph, baseTargetX: 0, finalTargetX: 0,
      bounceZ: GAME.bounceZ, rise: GAME.rise,
      durationMs: (GAME.releaseZ - GAME.contactZ) / (speedKph / 3.6) * 1000 * this.plan.travelScale };
  }
  /**
   * `?bouncers=1`: every ball a bouncer, in either mode, for looking at the
   * pull and its flash without waiting an over for each one. No spinner, and
   * no yorker or slower ball owed, since either would stand in its place.
   * Nothing else changes — the same timing and the same scoring.
   */
  private bouncersOnly = new URLSearchParams(location.search).get('bouncers') === '1';
  /**
   * `?hooks=1`: every ball a bouncer on off stump or wider, the ball the hook
   * answers, for trying the hook every ball. See `bouncersEvery`.
   */
  private hooksOnly = new URLSearchParams(location.search).get('hooks') === '1';
  /**
   * `?spincut=1`: every ball the spinner's, all of his on every line, for
   * trying the cut off the spinner every ball. See `spinCutsEvery`.
   */
  private spinCutsOnly = new URLSearchParams(location.search).get('spincut') === '1';
  /**
   * `?spinpull=1`: every ball the spinner's and every one but the arm ball
   * dropped short, for trying the pull off the spinner. See `spinPullsEvery`.
   */
  private spinPullsOnly = new URLSearchParams(location.search).get('spinpull') === '1';
  /** `?latecut=1`: every ball the late cut's, pitched up outside off. See `lateCutsEvery`. */
  private lateCutsOnly = new URLSearchParams(location.search).get('latecut') === '1';
  /**
   * `?swing=1` and `?express=1`, in a Marathon: the Level 2 swing bowler, the
   * Level 3 express bowler, or the two of them, from the first over — so each
   * can be tried without batting ten or twenty overs to reach him. See
   * `marathonOnly`.
   */
  private swingOnly = new URLSearchParams(location.search).get('swing') === '1';
  private expressOnly = new URLSearchParams(location.search).get('express') === '1';
  /** `?reverse=1`: the swing bowler every over, bowling nothing but reverse swing. */
  private reverseOnly = new URLSearchParams(location.search).get('reverse') === '1';
  /** `?wear=fast`: every step of the Marathon in a fifth of the overs. See `marathonFastWear`. */
  private wearFast = new URLSearchParams(location.search).get('wear') === 'fast';
  /** `?round=1`: every over of a Marathon bowled round the wicket, from the first. See `roundEvery`. */
  private roundOnly = new URLSearchParams(location.search).get('round') === '1';
  private get plan() {
    // A Rival Match is bowled as the Blast is, whatever the link asks for.
    if (this.challenge.playing) return CLASSIC_PLAN;
    const base = this.ease > 1 ? withoutYorkers(this.basePlan) : this.basePlan;
    return this.marathoning && (this.roundOnly || this.netsKeys) ? roundEvery(base) : base;
  }
  /**
   * The help for the innings about to start. None in a Rival Match, where both
   * sides must bat the same game; none in practice, whose switches are for
   * trying the game exactly as it is; and none for the scripted browser the
   * checks drive (`?debug=1`), which times its strokes to the real windows —
   * `?newcomer=1` beside it asks the browser's own count, for a check that
   * wants the help. It can only ever give a newcomer the help they are owed.
   */
  private newcomerEase(): number {
    if (this.challenge.playing || this.practising) return 1;
    if (this.debug && new URLSearchParams(location.search).get('newcomer') !== '1') return 1;
    const mode = this.careerMode;
    const career = this.myCareer[mode]?.career ?? heldCareer(mode);
    return easeFor(playedIn(mode, readStored, career.innings));
  }
  /**
   * The Blast's windows for this innings, a newcomer's if it is helped. In
   * Super10, whoever is in, and narrower at the death.
   */
  private get windows() {
    return easedWindows(this.super10 ? super10Windows(this.score.wickets, this.score.balls) : GAME.timing, this.ease);
  }
  /**
   * The grade the mode that pays for this swing gives it: the Blast's windows,
   * or Survival's and the Marathon batter's own, so a stroke picked by its
   * timing (the pull off the spinner, at the arm ball) is the one the score
   * is worked out for. A Marathon's special strokes are the Blast's, but none
   * of them is picked this way.
   */
  private gradeFor(delivery: Delivery, attempt: ShotAttempt): TimingGrade {
    const skill = this.marathon ? this.marathon.current.batter : this.surviving ? TAILENDER : null;
    if (!skill) return gradeOf(delivery, attempt, this.windows);
    return gradeTiming(attempt.inputTimeMs - delivery.idealContactTimeMs, !!STYLES[delivery.style].tight,
      easedSkill(skill, this.ease).timing, SURVIVE.fastTimingScale);
  }
  private get basePlan() {
    if (this.marathoning && (this.swingOnly || this.expressOnly || this.reverseOnly)) {
      return marathonOnly({ swing: this.swingOnly, express: this.expressOnly, reverse: this.reverseOnly });
    }
    if (this.marathoning && this.wearFast) return marathonFastWear();
    const plan = this.surviving ? SURVIVE_PLAN : this.marathoning ? MARATHON_PLAN : this.super10 ? SUPER10_PLAN : CLASSIC_PLAN;
    if (this.bouncersOnly || this.hooksOnly) return bouncersEvery(plan, this.hooksOnly);
    if (this.spinCutsOnly) return spinCutsEvery(plan);
    if (this.spinPullsOnly) return spinPullsEvery(plan);
    if (this.lateCutsOnly) return lateCutsEvery(plan);
    if (!this.spinOnly || !plan.spin) return plan;
    // Every over his, from the first: `spinOvers` always gives him `notBefore`
    // and draws the rest from what follows, so asking for all of them from
    // nought is how you get all of them rather than a coincidence.
    return { ...plan, spin: { ...plan.spin, overs: plan.spin.ofOvers, notBefore: 0 } };
  }
  private get readyMs() { return this.hurts ? SURVIVE.readyMs : GAME.readyMs; }
  private get resultMs() {
    const base = this.hurts ? SURVIVE.resultMs : GAME.resultMs;
    // The ball that puts him on the floor is held open long enough for him to
    // get there. Every other ball is the usual beat.
    if (this.felled) return base + SURVIVE.felledMs;
    // A hundred holds the next ball for the celebration and nothing more, and
    // a man out in his nineties for his look at the sky.
    return Math.max(base, this.celebrating, this.afterBallUntil - this.phaseStart);
  }
  /** How long after the ideal moment a swing still counts as a swing at all. */
  private get swingWindow() {
    if (this.marathon) return this.marathon.current.batter.timing.poor;
    return this.surviving ? SURVIVE.timing.poor : this.super10 ? this.windows.poor : GAME.timing.poor;
  }
  /**
   * A moment, named for the innings it happened in.
   *
   * GoatCounter has no custom properties — an event is a path and a title — so
   * the mode has to be in the name or it is not anywhere. Everything that is
   * about a session rather than an innings (the first shot, the help screen,
   * the minutes played) stays unprefixed: those are the same fact whichever
   * innings it happened in, and splitting them would halve every count for
   * nothing.
   *
   * A practice link — a test switch on, see `practising` — gets a prefix of its
   * own ahead of the mode's: the nets and the tuning switches are somebody
   * trying the game, and counted with the innings they would swell every
   * figure the dashboard is read for.
   */
  private mark(name: string, title: string) {
    track(...this.named(name, title));
  }
  /** The same, for the moments that must not be counted twice in one session. */
  private markOnce(name: string, title: string) {
    trackOnce(...this.named(name, title));
  }
  /**
   * A Dressing Room moment, counted. Not through `mark`: the room is between
   * innings, so the last mode played says nothing about it and would split
   * one count three ways. The item is in the name, because GoatCounter keeps
   * the name and not the title (`dressing-wear-kit-electric`, never
   * `dressing-wear` titled "electric"), and a fixed shelf keeps that a short
   * list. The `?dressing=1` preview counts nothing.
   */
  private dressingMark(name: string, title: string) {
    if (!this.dressingPreview) track(name, title);
  }
  private named(name: string, title: string): [string, string] {
    const [moded, said]: [string, string] = this.surviving ? [`survive-${name}`, `Test match: ${title}`]
      : this.marathoning ? [`marathon-${name}`, `Test Marathon: ${title}`]
      : this.super10 ? [`super10-${name}`, `Super10: ${title}`]
      : [name, title];
    return this.practising ? [`practice-${moded}`, `Practice: ${said}`] : [moded, said];
  }
  private setPhase(phase: GamePhase) {
    this.phase = phase; this.phaseStart = this.elapsed; this.hud.phase(phase, this.isPrimed, this.specials);
    if (phase === 'READY' && this.marathon) this.tellLevel();
    if (phase === 'READY' && this.super10 && this.lesson < 0) this.super10Over(true);
    // As the bowler sets off: the surge's offer goes, the map goes back into
    // its corner, and the last ball's line comes off it.
    if (phase === 'BOWLER_RUNUP' && this.super10) { this.surgeShown(); this.fieldUi.shot(null, null); }
    if (phase === 'READY' && this.momentAsked) { const moment = this.momentAsked; this.momentAsked = null; this.askMoment(moment); }
    if (phase === 'READY' && this.actionAsked) { const kind = this.actionAsked; this.actionAsked = null; this.askAction(kind); }
  }
  /**
   * A moment asked for with `?moments=1`'s keys. Between balls it goes up at
   * once and the bowler waits at his mark until it is over, the way he does
   * for a level banner; with a ball on its way it waits for that ball to be
   * dead, which is when a real one goes up.
   */
  private askMoment(moment: Moment) {
    if (this.phase === 'READY') {
      this.celebrate(moment, true);
      this.bannerUntil = Math.max(this.bannerUntil, this.elapsed + this.celebrating);
    } else if (['BOWLER_RUNUP', 'BALL_IN_FLIGHT', 'SHOT_RESOLVE', 'RESULT'].includes(this.phase)) this.momentAsked = moment;
  }
  /**
   * One of `?actions=1`'s keys. Between balls he plays it at once and the
   * bowler waits at his mark until he is back in his guard; with a ball on its
   * way it waits for that ball to be dead, as a moment does.
   */
  private askAction(kind: ActionKey) {
    if (this.phase === 'READY') {
      // Down, held there a moment, and up again for the next ball, which is
      // the one thing a real one does not do.
      if (kind === 'fall') {
        this.scene.fall(this.elapsed, FALLS[this.fallShown++ % FALLS.length]);
        this.bannerUntil = Math.max(this.bannerUntil, this.elapsed + FALL_SHOWN_MS);
      } else this.bannerUntil = Math.max(this.bannerUntil, this.scene.rehearse(kind, this.elapsed));
    }
    else if (['BOWLER_RUNUP', 'BALL_IN_FLIGHT', 'SHOT_RESOLVE', 'RESULT'].includes(this.phase)) this.actionAsked = kind;
  }
  /**
   * Super10, between balls: at the top of an over the bowler's field, his
   * first or his other as he reads the innings (`planFor`), with Power Surge
   * on it when this is its over by itself. Kept for the over: nothing a ball
   * does moves a man.
   */
  private super10Over(signal: boolean) {
    const s10 = this.s10;
    const over = Math.min(Math.floor(this.score.balls / SUPER10.ballsPerOver), SUPER10.overs - 1);
    if (s10.over === over) return this.surgeShown();
    const newBatter = this.score.wickets > s10.wicketsAtOver;
    s10.over = over; s10.wicketsAtOver = this.score.wickets;
    const surge = surgeAuto(over, s10.surged !== null);
    if (surge) { s10.surged = over; this.mark('surge-auto', 'Power Surge switched on by itself'); this.scene.arenaCue('surge', this.elapsed); }
    // The arena tells the last two overs coming, unless Power Surge has the ninth.
    else if (over === SUPER10.overs - 2) this.scene.arenaCue('death', this.elapsed);
    // And the stands send a wave round in the breaks a crowd would.
    if (WAVE_OVERS.includes(over)) this.scene.arenaCue('wave', this.elapsed);
    const bowler = bowlerOf(this.generator.overKind(over), over);
    const plan = planFor(bowler, over, { boundaries: s10.boundaries, newBatter });
    if (plan) this.mark(`field-plan-${bowler.toLowerCase()}`, 'A bowler took his other field');
    this.setSuper10Field(fieldFor({ bowler, over, surge, plan }), signal);
    this.surgeShown();
  }
  /**
   * A field into play: the men put straight on their marks (walked there
   * every over, they were forever running about the ground), the bowler's
   * signal when he has changed his mind or Power Surge brings men in, and the
   * map.
   */
  private setSuper10Field(field: FieldSet, signal: boolean) {
    const s10 = this.s10, prev = s10.field;
    s10.field = field;
    // The bowler bowls to it: the field book's id, Power Surge or not.
    this.generator.field = field.id.split('+')[0];
    this.scene.super10Field(drawnOf(field), prev !== null);
    const told = signal && field.change ? signalFor(prev, field) : null;
    if (told) this.scene.bowlerSignals(told.kind, told.man);
    this.fieldUi.overBegins(field, s10.over, { prev });
  }
  /**
   * Power Surge's corner: locked to the end of the fifth over, ready in the
   * break before the sixth to the eighth, on through its over, used after.
   */
  private surgeShown() {
    const s10 = this.s10, used = s10.surged !== null;
    this.scene.arenaMood(s10.surged === s10.over ? 'surge' : s10.over >= SUPER10.overs - 2 ? 'death' : 'calm');
    const between = this.phase === 'READY' && this.score.balls % SUPER10.ballsPerOver === 0;
    const offered = between && surgeOffered(s10.over, used);
    this.fieldUi.surge(s10.surged === s10.over ? 'on' : used ? 'used' : offered ? 'offer' : s10.over < SURGE.from ? 'locked' : 'rest',
      { balls: this.score.balls % SUPER10.ballsPerOver, over: s10.over });
    // The bowler gives it a moment at his mark, which the corner's ring counts down.
    if (offered && this.phase === 'READY') this.bannerUntil = Math.max(this.bannerUntil, this.elapsed + SURGE_WAIT_MS);
  }
  /** Power Surge taken, in the break before an over it is offered for: the chip, or P. */
  private armSurge() {
    const s10 = this.s10;
    if (!this.super10 || this.phase !== 'READY' || this.score.balls % SUPER10.ballsPerOver || !surgeOffered(s10.over, s10.surged !== null) || !s10.field) return;
    s10.surged = s10.over;
    const plan = s10.field.change === 'plan' ? 1 : 0;
    this.setSuper10Field(fieldFor({ bowler: s10.field.bowler, over: s10.over, surge: true, plan }), true);
    this.surgeShown();
    this.scene.arenaCue('surge', this.elapsed);
    this.mark(`surge-${s10.over + 1}`, 'Power Surge taken');
  }
  /**
   * Who got to a Super10 ball, by his place in the field's men, for the map to
   * light: the man the field's rules gave it to, or the man the scene sent
   * for a catch (he is one of the drawn six, in their order).
   */
  private takerOf(outcome: ShotOutcome): number | null {
    const field = this.s10.field;
    if (!field) return null;
    const f = outcome.fielder;
    if (f) { const i = field.men.findIndex(m => m.angle === f.angle && m.deep === f.deep); return i < 0 ? null : i; }
    const caught = (outcome.isWicket && outcome.wicketType === 'CAUGHT') || outcome.dropped;
    const drawn = caught && !outcome.edged ? this.scene.catcher : null;
    if (drawn === null) return null;
    const man = drawnOf(field)[drawn];
    return man ? field.men.indexOf(man) : null;
  }
  /** F: the map enlarged from its corner, or put back. */
  private lookAtField() {
    if (!this.super10) return;
    if (this.fieldUi.toggle()) this.mark('field-look', 'Looked at the field');
  }
  /**
   * At the top of an over, whether it is the one the innings changes in: the
   * first over the pace bowler swings it, which brings the cloud over with it.
   * Put up once an innings, and the bowler waits at his mark while it is.
   *
   * The express bowler had a banner of his own too, and the playtest took it
   * off: the swing is a change in conditions a batter cannot see coming and
   * should be told about, but a man running in from forty yards at 180 is his
   * own announcement.
   */
  private tellLevel() {
    const balls = this.score.balls;
    if (balls % MARATHON.ballsPerOver) return;
    const over = balls / MARATHON.ballsPerOver;
    // The strip wears in the same steps the bowling climbs: fresh, then the
    // swing, then the express bowler, then Level 3.
    const level = this.generator.levelAt(over);
    this.scene.wear(!level ? 0 : level.level === 3 ? 3 : level.express > 0 ? 2 : level.swingShare !== undefined ? 1 : 0);
    const kind = this.generator.overKind(over);
    const swinging = kind === 'PACE' && this.generator.levelAt(over)?.swingShare !== undefined;
    const banner = swinging && !this.told.swing ? 'swing' : null;
    if (!banner) return;
    this.told[banner] = true;
    if (banner === 'swing') this.scene.overcast(true);
    this.hud.levelBanner(banner, over + 1, LEVEL_BANNER_MS);
    this.bannerUntil = this.elapsed + LEVEL_BANNER_MS;
  }
  private shoot = (shot: ShotType, inputTimeMs: number, swipe?: number) => {
    if (this.phase !== 'BALL_IN_FLIGHT' || this.attempt) return;
    // The first swing of the session, tutorial or not: a player who never plays
    // one did not understand the controls, and that is a different problem from
    // a player who played and lost.
    trackOnce('first-shot', 'First shot played');
    // A scoop with nothing to spend on it, or at a bouncer, is the block: the
    // rig and the score read the same answer.
    this.attempt = playedAs(this.delivery!, { shotType: shot, inputTimeMs, swipe }, this.charged);
    const shotType = this.attempt.shotType;
    const charging = advanceShot(this.delivery!, this.attempt, this.charged);
    const lofted = !charging && loftedDrive(this.delivery!, this.attempt);
    const sweeping = !charging && slogSweep(this.delivery!, this.attempt, this.charged);
    // The orthodox sweep is what the same swipe at the same ball becomes when
    // the meter is empty or the timing is not good enough for the slog. It
    // costs nothing, so unlike the two special strokes it needs no meter read.
    const levelled = !charging && !sweeping
      && sweeps(this.delivery!, this.attempt, gradeOf(this.delivery!, this.attempt, this.windows));
    // The pull off the spinner: his ball dropped short, or the arm ball timed
    // well enough to be in position for it, on the grade the mode will pay.
    const spinPulling = !charging && !sweeping && !levelled
      && spinPull(this.delivery!, this.attempt, this.gradeFor(this.delivery!, this.attempt));
    this.primed = null;
    // The flick: the leg-side input at a ball below pull height, neither swept
    // nor pulled off the spinner. Its version is its own (`flickVersion`).
    const flicking = shotType === 'LEG' && !charging && !sweeping && !levelled && !spinPulling
      && ballPosition(this.delivery!, 1).y <= PULL_HEIGHT;
    // The lofted straight drive's version is its own; every other stroke's is the cover strokes'.
    // The pull's version is its own, as the lofted straight drive's is, and so is the flick's.
    const version = shotType === 'STRAIGHT' && lofted ? this.loftVersion() : flicking ? this.flickVersion(ballPosition(this.delivery!, 1).y)
      : shotType === 'LEG' && !sweeping ? this.pullVersion() : this.coverVersion();
    // Version three of the cover drive meets the ball beside the front pad, a
    // little before the crease, so the ball is struck there. The swipe is
    // judged as for the other two: the version is drawn after it, so nobody
    // can time for it. Not the square drive's wide ball, which is met where
    // it always was.
    // The same swipe at a ball short of a length is the back-foot punch, met
    // late beside the back hip and kept along the ground (PUNCH).
    const punching = !charging && punch(this.delivery!, this.attempt);
    const driven = shotType === 'COVER_LONG_OFF' && !charging && !punching && !squareDrivable(this.delivery!);
    // The on drive, lofted or along the ground, meets it beside the front pad
    // too, at the end of its stride, and is judged the same.
    // The hook meets it out in front of him, arms long, so it climbs away over
    // him to fine leg rather than through him. The slog sweep meets it out in
    // front of the front pad, at the end of its lunge down the pitch.
    // Version two of the pull meets it out in front of him too, the arms
    // straight: when the ball is up at pull height there, which is what makes
    // the stroke a pull. Version one meets it beside him.
    const pulled = shotType === 'LEG' && !charging && !sweeping && !spinPulling && !flicking && version === 2
      && ballPosition(this.delivery!, 1 - PULL_MEETS_AT / (GAME.releaseZ - GAME.contactZ)).y > PULL_HEIGHT;
    // The block meets it at the end of the forward defence's stride, beside
    // the front pad, or late under his eyes off the back foot: back if the
    // ball is up above `DEFENCE_BACK_HEIGHT` when it reaches him, which every
    // ball short of a length is and none pitched up is.
    const blocked = shotType === 'DEFEND'
      ? ballPosition(this.delivery!, 1).y > DEFENCE_BACK_HEIGHT ? DEFENCE_BACK_MEETS_AT : DEFENCE_FRONT_MEETS_AT : 0;
    const ahead = driven && version === 3 ? COVER_V3_MEETS_AT : shotType === 'LONG_ON' && !charging ? ON_DRIVE_MEETS_AT
      : shotType === 'HOOK' ? HOOK_MEETS_AT : pulled ? PULL_MEETS_AT : flicking && version === 2 ? FLICK_MEETS_AT : flicking && version === 3 ? FLICK_V3_MEETS_AT : spinPulling ? SPIN_PULL_MEETS_AT : shotType === 'LATE_CUT' ? LATE_CUT_MEETS_AT : sweeping ? SLOG_MEETS_AT : punching ? PUNCH_MEETS_AT : blocked;
    this.meetsAt = 1 - ahead / (GAME.releaseZ - GAME.contactZ);
    // Versions two and three keep it down: four, never six (`grounded`).
    if ((driven && version >= 2) || punching) this.attempt = { ...this.attempt, grounded: true };
    // Versions two and three of the flick, worked off the pads with the wrists: four at the most (`FLICK`).
    if (flicking && version >= 2) this.attempt = { ...this.attempt, flicked: true };
    this.flickPlayed = flicking;
    // At the spinner the cut is played making room for it: see `SPIN_CUT`.
    this.scene.swing(shotType, this.elapsed, this.delivery!, charging, lofted, sweeping, levelled, version, this.meetsAt,
      !charging && spinCut(this.delivery!, this.attempt), spinPulling);
    this.hud.select(shotType, charging);
    // The charge is judged now rather than when the ball arrives, because the
    // ball is not going to arrive: he is going down the pitch to meet it, and
    // the scene needs to know that from the first frame of his run so the ball
    // can be drawn to where he meets it rather than carrying on to the crease
    // and turning round.
    if (charging) this.resolve();
  };
  /**
   * Confidence is only a shot outside the tutorial, where nothing is scored —
   * and it does not exist at all in Survive. A tailender walking down the pitch
   * at a man bowling at 170 is not a shot, it is a decision to be hit.
   */
  private get charged() {
    if (this.lesson >= 0) return false;
    // The Marathon's batter earns his by settling and then playing himself in.
    if (this.marathon) return this.marathon.confident;
    return !this.hurts && this.confidence.full;
  }
  /**
   * This ball is one of the two special strokes, and the meter is full to play
   * it. Which one matters to the player and not to the meter: the charge is a
   * swipe up and the sweep is a swipe to leg, so the cue has to name it.
   */
  private set primed(value: Primed) {
    if (value === 'CHARGE') this.chargeBall = true;
    if (value === this.isPrimed) return;
    this.isPrimed = value; this.showConfidence();
    this.hud.phase(this.phase, value, this.specials);
  }
  private get primed() { return this.isPrimed; }
  private isPrimed: Primed = null;
  /**
   * Every special stroke this ball is for, in the order the cue prefers them.
   * The cue names the first; the swipe guide lights all of them, because a
   * ball on the stumps at pace can be charged or scooped and the player may
   * want the scoop.
   */
  private specials: NonNullable<Primed>[] = [];
  /** This ball was a charge and the meter was full, whatever came of it. */
  private chargeBall = false;
  /**
   * A charge that was on and did not happen is worth saying out loud. Missing it
   * silently — the same four as any other ball — leaves the player with no way
   * to tell whether the shot exists.
   */
  private get chargeMiss() {
    if (!this.chargeBall || !this.attempt || this.outcome?.advance) return null;
    return ADVANCE.shots.includes(this.attempt.shotType) ? 'CHARGE MISTIMED' : 'THE CHARGE WANTED A DRIVE';
  }
  private showConfidence() {
    if (this.marathon) {
      const man = this.marathon.current;
      this.hud.settling(man.confidence === null
        ? { settled: false, fraction: man.settle / SETTLE.balls, balls: Math.floor(man.settle), of: SETTLE.balls, primed: null }
        : { settled: true, fraction: man.confidence / MARATHON_CONFIDENCE.full, balls: SETTLE.balls, of: SETTLE.balls, primed: this.isPrimed });
    }
    if (this.hurts) return this.hud.injury(this.health.injury, this.health.critical);
    this.hud.confidence(this.confidence.fraction, this.isPrimed);
  }
  private toggleSound = () => { this.audio.step(); this.audio.unlock(); this.hud.sound(this.audio.setting, true); this.soundSwitches(); };
  private soundSwitches() { this.hud.crowdSwitches(this.audio.crowdOn, this.audio.ambienceOn, this.audio.setting === 'off'); }
  /** What the pause sheet calls the game it pauses, and the colour it wears for it. */
  private get pauseGame(): { name: string; tone: PauseTone } {
    if (this.challenge.playing) return { name: 'Rival Match', tone: 'rivals' };
    return { name: PAUSE_NAMES[this.mode], tone: this.test ? 'test' : 'blast' };
  }
  /** What the coachmarks call the game they come before, and the colour of its dot: the mode's own, a Rival Match's orange. */
  private get coachGame(): IntroGame {
    if (this.challenge.playing) return { name: 'Rival Match', tone: 'rivals' };
    return { name: PAUSE_NAMES[this.mode], tone: this.mode === 'CLASSIC' ? 'blast' : this.mode === 'SURVIVE' ? 'survival' : 'marathon' };
  }
  private togglePause = () => {
    if (this.phase === 'START' || this.phase === 'INNINGS_END' || this.hud.helpOpen) return;
    if (this.phase === 'PAUSED') { this.audio.unlock(); this.audio.holdCrowd(false); this.phase = this.previousPhase; this.hud.pause(false); (document.activeElement as HTMLElement | null)?.blur(); }
    else {
      this.input.cancel(); this.audio.stop(); this.audio.holdCrowd(true); this.previousPhase = this.phase; this.phase = 'PAUSED'; this.hud.pause(true, this.pauseGame);
      this.soundSwitches();
      // The arena is played at night whatever the switch says, so it has none.
      this.hud.lightsSwitch(this.test || this.super10 || this.scene.arenaGround ? null : this.scene.lit);
      // Twenty overs in, the Marathon can be declared — from here, and from
      // nowhere else, so it is never pressed by accident mid-ball. Before
      // that the key is there but shut, saying when it opens.
      this.hud.declareKey(!this.marathon ? 'hidden' : this.marathon.canDeclare ? 'open' : 'locked');
      // A paused innings is the one moment in the game where nothing is waiting
      // on the player, which is the only kind of moment worth asking in.
      this.hud.offerFeedback({ pause: true });
    }
  };
  /**
   * The board, with the innings just played measured against it when there is
   * one. An innings in progress is not offered up: half an over is not a score,
   * and the board is opened between innings anyway.
   */
  /**
   * The board, in the background. Nothing waits on it: if it never answers, the
   * cover simply goes on showing whatever it was showing.
   */
  private async loadBoard() {
    const epoch = this.boardEpoch;
    const payload = await fetchBoard();
    if (this.disposed || !payload) return;
    // The cover's figure is the top row of whichever board answered, so it is
    // written either way. The held rows are not: a later fetch, or the rows a
    // claim answered with, are the newer truth and this one must not land on
    // top of them.
    void this.quoteOnCover(payload.rows);
    if (epoch !== this.boardEpoch) return;
    this.boardSeen = true;
    this.board = payload.rows;
  }

  /**
   * The cover's board widget: the player's best and where it stands — read off
   * the fifty when they are on it, and asked of the store when they are below
   * it — or, with no best yet, the board's leader and their score to chase.
   */
  /** A Blast best taken in the last two days and neither won back nor gone after, from the player's activity, for the cover. */
  private async takenLately(): Promise<CoverBoard | null> {
    if (!this.player || !readPlayer()?.name) return null;
    try {
      const activity = await fetchActivity(this.player);
      const now = Date.now();
      const answered = readAnswered();
      const beat = activity.events.find(one => one.kind === 'beat' && one.dropped !== false && one.mode === 'classic' && !one.wonBack
        && now - one.at < HEADLINE_MS && !answeredBy(one, answered));
      return beat ? { kind: 'beaten', name: beat.name, target: beat.target, place: beat.place, ago: now - beat.at } : null;
    } catch {
      return null;
    }
  }

  private async quoteOnCover(rows: readonly BoardRow[]) {
    const top = rows[0];
    const lines: CoverBoard[] = [];
    // Somebody who took the player's best in the last day leads: it is the
    // one line on the cover that is about them, and it has a way to answer.
    const taken = await this.takenLately();
    if (this.disposed) return;
    if (taken) lines.push(taken);
    if (this.best > 0) {
      const at = rows.findIndex(row => ownsHandle(row.handle, this.player));
      let rank: number | null = at >= 0 ? at + 1 : null;
      if (rank === null && readPlayer()) rank = (await fetchStanding(this.player, 'classic'))?.rank ?? null;
      if (this.disposed) return;
      lines.push({ kind: 'best', runs: this.best, rank });
    }
    if (top && !ownsHandle(top.handle, this.player)) lines.push({ kind: 'top', runs: top.runs, name: top.name });
    // The latest score on the board made in the last day, by somebody else:
    // the line that says the board is alive.
    const now = Date.now();
    const recent = rows.filter(row => row.at && now - row.at < RECENT_MS && !ownsHandle(row.handle, this.player))
      .sort((a, b) => (b.at ?? 0) - (a.at ?? 0))[0];
    if (recent) lines.push({ kind: 'recent', runs: recent.runs, name: recent.name, ago: now - (recent.at ?? now) });
    if (lines.length) this.hud.coverBoard(lines);
  }

  /** The Test fifty, the same way. The cover quotes the other one, not this. */
  private async loadSurviveBoard() {
    const epoch = this.surviveEpoch;
    const payload = await fetchSurviveBoard();
    if (this.disposed || !payload || epoch !== this.surviveEpoch) return;
    this.surviveSeen = true;
    this.surviveRows = payload.rows;
  }

  /**
   * The board, opened. The sheet goes up straight away saying it is fetching,
   * rather than the button doing nothing for a second and then a screen
   * appearing — and if the fetch fails it says so instead of showing an empty
   * fifty or, worse, fifty invented names.
   */
  /**
   * The play key.
   *
   * What it does is start the game, except when the stories are due
   * (`whatsNewDue`: the first two visits after the update), where it stops for them. The stories are counted here rather
   * than when they are closed, because a player who skips on the first card has
   * still been shown them — counting on the way out would show the same cards
   * to the same person for ever.
   *
   * The board's own What's New key does not count against it: somebody who went
   * looking has not used up one of the two they are given.
   */
  private play = () => {
    const go = () => (this.locked ? this.walkOut() : this.modes());
    // A build with nothing but one mode in it has no update to tell.
    if (NO_BOARD || !whatsNewDue()) return go();
    markWhatsNewShown();
    this.showStories('intro', go);
  };

  /** The update's stories, and whatever happens when they are done with. */
  private showStories(where: StoriesWhere, then: (() => void) | null = null) {
    this.mark(`whatsnew-${where}`, 'What\'s new opened');
    this.hud.onStoriesDone = then;
    this.hud.stories(where, where === 'intro' && this.locked);
  }

  private showBoard = () => {
    this.mark('board-open', 'Board opened');
    // Mid-innings the board is a distraction with a ball on its way, so it
    // pauses first, the way the instructions do. The pause card is still behind
    // it when the sheet is put away, which is the point.
    if (!['START', 'PAUSED', 'INNINGS_END'].includes(this.phase)) this.togglePause();
    // The board a player asks for is the board for the innings they are in. The
    // other one is a tab away, and never the one they land on.
    this.boardActions = false;
    if (this.marathoning) return this.openMarathon(this.marathonLadder);
    this.openBoard(this.surviving ? 'survive' : 'classic', 'best');
  };

  /**
   * The questionnaire, opened.
   *
   * Mid-innings it pauses first, the same way the board and the instructions do:
   * a ball is on its way, and a screen that goes up in front of one is a wicket
   * nobody played a shot at. The pause card is still behind it when the form is
   * put away, which is the point.
   *
   * What the answers carry with them is assembled here rather than in the form,
   * because this is the object that knows it: which innings was played, what it
   * came to, what the best is, and how many days this browser has been coming
   * back. None of it is asked as a question — a question whose answer is already
   * on the machine is a screen somebody has to tap through for nothing.
   */
  private openFeedback = (from: 'cover' | 'card' | 'pause') => {
    this.mark(`feedback-${from}`, `Feedback opened from the ${from}`);
    if (!['START', 'PAUSED', 'INNINGS_END'].includes(this.phase)) this.togglePause();
    openFeedback({
      root: this.hud.viewport,
      playerId: this.player,
      context: this.feedbackContext(),
      onDone: () => {
        // Answered, and the links go; waved away, and they stay where they were.
        if (feedbackGiven()) this.hud.offerFeedback({ cover: false, card: false, pause: false });
      },
    });
  };

  /** The star prompt, while it is up. */
  private ratingPrompt: RatingPrompt | null = null;
  /** Whether the stars have been put up this visit. Once a visit is the most they ask. */
  private ratingAsked = false;

  /**
   * The innings, counted toward when to ask for stars, and the stars asked for
   * if this is the moment (`nextAsk` decides; see `game/rating.ts`).
   *
   * Counted here rather than at the start for the career's reason: an innings
   * walked out on is not one anybody has an opinion of yet. Practice is left out
   * of the count as it is left out of the career, and a demo room is nobody's.
   */
  private rateThisInnings() {
    if (this.practising || this.demoing) return;
    const mode: RatedMode = this.challenge.playing ? 'rivals' : this.careerMode;
    const memory = counted(readMemory(), mode);
    writeMemory(memory);
    const ask = nextAsk(memory, {
      mode, practice: false, askedThisVisit: this.ratingAsked, formGiven: feedbackGiven(), now: Date.now(),
    });
    if (!ask) return;
    const innings = this.innings;
    window.setTimeout(() => {
      // Still on this innings' card. Played again, or gone to the picker, and
      // the moment has passed; it is asked at the next one instead.
      if (this.disposed || this.innings !== innings || this.phase !== 'INNINGS_END') return;
      // An unlock is this innings' moment; the stars wait for another, and for the password sheet.
      if (this.unlock || this.hud.passwordOpen) return;
      this.showRating(ask.thing, ask.moment);
    }, RATING_DELAY_MS);
  }

  /** The stars, up. Also the debug hook's way in, for `rating-check.mjs`. */
  private showRating(thing: RatedThing, moment: RatingMoment) {
    this.putRatingAway();
    this.ratingAsked = true;
    const ref = mintRef();
    track(`rating-ask-${thing}`, `Stars asked for: ${thing}`);
    this.ratingPrompt = askRating({
      root: this.hud.viewport,
      thing,
      onRate: (stars, changed) => {
        // Remembered as rated before it is sent, and whatever the send says: a
        // rating lost to a dead connection is a pity, but asking again somebody
        // who has already given one is the thing that makes people stop.
        writeMemory(rated(readMemory(), thing, Date.now()));
        // A mark changed after it was sent is counted as a change rather than as
        // a second rating, which the counts of each mark could not take back.
        if (changed) track('rating-changed', `Rating of ${thing} changed`);
        else track(`rating-${thing}-${stars}`, `Rated ${thing}: ${stars} stars`);
        void sendFeedback({
          playerId: this.player, answers: {}, suggestion: '', context: this.feedbackContext(),
          rating: { stars, thing, moment, ref },
        });
      },
      onMore: stars => {
        this.ratingPrompt = null;
        openFeedback({
          root: this.hud.viewport,
          playerId: this.player,
          context: this.feedbackContext(),
          followUp: { stars, thing, moment, ref },
        });
      },
      onDismiss: () => {
        writeMemory(dismissed(readMemory(), Date.now()));
        track('rating-dismissed', 'Stars waved away');
      },
    });
  }

  /**
   * The stars as `?rate=1` puts them up: the real sticker and the real
   * follow-up, sending nothing and remembering nothing, so they can be asked
   * for again and again and nobody's answers or counts are touched.
   */
  private previewRating(thing: RatedThing) {
    this.putRatingAway();
    this.ratingPrompt = askRating({
      root: this.hud.viewport,
      thing,
      onRate: () => {},
      onMore: stars => {
        this.ratingPrompt = null;
        openFeedback({
          root: this.hud.viewport,
          playerId: this.player,
          context: this.feedbackContext(),
          followUp: { stars, thing, moment: thing === 'game' ? 'innings' : 'mode', ref: mintRef() },
          preview: true,
        });
      },
      onDismiss: () => {},
    });
  }

  private putRatingAway() {
    this.ratingPrompt?.close();
    this.ratingPrompt = null;
  }

  /** What rides along with the answers, none of it asked. */
  private feedbackContext(): FeedbackContext {
    const { held } = readVisits();
    return {
      mode: this.surviving ? 'survive' : this.marathoning ? 'marathon' : 'classic',
      // The innings just played, where one has been. Nought off nought balls
      // before the first ball is a fact about nobody, so it is left out.
      runs: this.score.balls ? this.score.runs : undefined,
      balls: this.score.balls || undefined,
      best: this.best,
      innings: this.innings,
      days: held?.days,
      device: document.documentElement.classList.contains('touch-device') ? 'touch' : 'keyboard',
    };
  }

  /** Another tab over the sheet: the other game, or the player's own card. */
  private tabBoard = (tab: SheetTab) => {
    if (tab === this.sheetTab) return;
    this.mark(`board-tab-${tab}`, 'Another tab opened over the sheet');
    if (tab === 'mine') return this.openMine();
    if (tab === 'marathon') return this.openMarathon(this.marathonLadder);
    this.openBoard(tab, 'best');
  };

  /** The Rivals ranking as last fetched, so a second look at Rival Matches is instant. */
  private rivalsRows: RivalsRow[] | null = null;

  /** The Rivals ranking for Rival Matches, as it stands: held, demo, or still coming. */
  private rivalsRanking(state?: 'ready' | 'loading' | 'offline') {
    if (this.demo) return { rows: demoRivals(this.player), youId: this.player, state: 'ready' as const };
    const rows = this.rivalsRows ?? [];
    return { rows: PREVIEW_FILL && this.rivalsRows ? fillRivals(rows) : rows, youId: this.player, state: state ?? (this.rivalsRows ? 'ready' as const : 'loading' as const) };
  }
  /** Both Marathon ladders as they are shown: the real rows, with the preview's filler among them off production. */
  private get marathonShown(): { team: TeamRow[]; solo: SoloRow[] } | null {
    if (!this.marathonRows) return null;
    const real = { team: this.marathonRows.team.rows, solo: this.marathonRows.solo.rows };
    return PREVIEW_FILL ? fillMarathon(real) : { team: [...real.team], solo: [...real.solo] };
  }

  /** Both Marathon ladders as last fetched, and which of the two is up. */
  private marathonRows: MarathonPayload | null = null;
  private marathonLadder: MarathonLadder = 'team';

  /**
   * The Test Marathon's board, on one of its two ladders. What was held from
   * the last fetch goes up at once and the fetch corrects it; both ladders come
   * in one answer, so the toggle between them is instant after the first look.
   * After an innings, that innings sits under the list on its ladder's terms.
   */
  private openMarathon(ladder: MarathonLadder) {
    this.boardRestoreOffer();
    this.sheetTab = 'marathon';
    this.marathonLadder = ladder;
    this.boardLadder = ladder;
    const mine = this.phase === 'INNINGS_END' && this.marathoning && this.marathon?.ended;
    const played = mine ? marathonFigures(this.marathon!) : null;
    const yours = played ? { team: teamOf(played), solo: soloOf(played) } : null;
    const actions = this.boardActions && !!mine;
    if (ladder === 'runs') return this.showMarathonRuns(actions);
    const draw = (rows: MarathonPayload | { team: { rows: TeamRow[] }; solo: { rows: SoloRow[] } } | null, state: 'ready' | 'loading' | 'offline') => {
      if (this.disposed || !this.hud.boardOpen || this.sheetTab !== 'marathon' || this.marathonLadder !== ladder) return;
      const shown = rows ? this.marathonShown : null;
      this.hud.marathonBoard({ ladder, team: shown?.team ?? [], solo: shown?.solo ?? [], youId: this.player, yours, state, actions });
    };
    // The sheet has to be up before `draw` will draw on it.
    if (this.demo) { const demo = demoMarathon(this.player); this.hud.marathonBoard({ ladder, team: demo.team, solo: demo.solo, youId: this.player, yours, state: 'ready', actions }); return; }
    this.hud.marathonBoard({
      ladder, team: this.marathonShown?.team ?? [], solo: this.marathonShown?.solo ?? [], youId: this.player, yours,
      state: this.marathonRows ? 'ready' : 'loading', actions,
    });
    void fetchMarathonBoard().then(payload => {
      if (payload) this.marathonRows = payload;
      draw(this.marathonRows, payload || this.marathonRows ? 'ready' : 'offline');
    });
  }

  /**
   * The Marathon's career runs, under its own tab beside the two innings
   * ladders: the career boards' screen, the way the Blast's Runs ladder is
   * drawn, with the Marathon's strip of three over it. What was held goes up
   * at once and the fetch corrects it.
   */
  private showMarathonRuns(actions: boolean) {
    const board = careerBoardOf('marathon', 'runs');
    if (!board) return;
    const draw = (payload: CareerBoards<AnyCareer> | undefined, state: 'ready' | 'loading' | 'offline') => {
      if (this.disposed || !this.hud.boardOpen || this.sheetTab !== 'marathon' || this.marathonLadder !== 'runs') return;
      this.hud.careerBoard({
        mode: 'marathon', board, youId: this.player, state, actions,
        rows: (payload?.boards?.runs ?? []) as readonly CareerRow<AnyCareer>[],
        size: payload?.size ?? 50,
      });
    };
    // The sheet has to be up before `draw` will draw on it.
    const first = (payload: CareerBoards<AnyCareer> | undefined, state: 'ready' | 'loading' | 'offline') => this.hud.careerBoard({
      mode: 'marathon', board, youId: this.player, state, actions,
      rows: (payload?.boards?.runs ?? []) as readonly CareerRow<AnyCareer>[], size: payload?.size ?? 50,
    });
    if (this.demo) return first(demoCareers('marathon', this.player) as CareerBoards<AnyCareer>, 'ready');
    const held = this.careerBoards.marathon;
    first(held, held ? 'ready' : 'loading');
    void fetchCareerBoards<AnyCareer>('marathon').then(payload => {
      if (this.disposed || !this.hud.boardOpen) return;
      if (payload) this.careerBoards.marathon = payload;
      draw(this.careerBoards.marathon, this.careerBoards.marathon ? 'ready' : 'offline');
    });
  }

  /**
   * The card, under its own tab on the sheet.
   *
   * It shows the career for the game the player was last looking at, which is
   * why the mode is remembered apart from the tab: a player who came to the
   * board from a Test innings and tapped My Stats wants their Test figures,
   * not the Blast's because the Blast is first in the row.
   */
  /** The cards on the tab's rail, by mode, as each of them is painted. */
  private mineSlides: Partial<Record<CareerMode, StatsSlide>> = {};

  /**
   * Both cards, painted as they arrive, handed to whoever is drawing them.
   *
   * The Blast first and the Test match behind it, which is the order of the
   * tabs above and the order somebody swipes. A build that plays one game has
   * one card, and one card is not a rail.
   *
   * There is one of these rather than one per screen because there are two
   * ways to the card — the tab on the board, and the end card's career widget,
   * which is a page of its own — and a player who swipes on one of them and
   * not the other has found a bug rather than a second design.
   *
   * `open` is the card the rail opens on: the game whose figures the player
   * asked for. Landing on the Blast after a Test innings is landing on
   * somebody else's card.
   */
  private railStats(open: CareerMode, draw: (view: StatsSheetView) => void) {
    // Each card's Best rank reads the innings boards' places too.
    this.refreshRanks();
    // The Test Marathon's card comes second, between the Blast's and Test
    // Survival's, wherever the mode can be played.
    const marathon: CareerMode[] = MARATHON_OPEN ? ['marathon'] : [];
    const modes: CareerMode[] = SHOW_SURVIVE && !SURVIVE_ONLY
      ? ['classic', ...marathon, 'survive']
      : [this.boardTab, ...marathon];
    const at = Math.max(0, modes.indexOf(open));
    this.mineSlides = {};
    for (const mode of modes) {
      this.loadStats(mode, (facts, picture, failed) => {
        if (this.disposed) return;
        this.mineSlides[mode] = { facts, picture, failed };
        // The whole rail is redrawn whenever either card finishes painting.
        // Anything short of that would mean two ways of putting a card on the
        // screen, and the second one only ever runs a beat after the first.
        // The card still being painted stands in as the one beside it so the
        // rail is its full length from the first draw, which is what keeps the
        // player's place when the second one lands.
        draw({
          cards: modes.map(one => ({
            ...(this.mineSlides[one] ?? { facts, picture: null, failed: false }), rank: this.bestRank(one), place: this.modeRanks[one] ?? null,
          })),
          at,
          rivals: this.rooms?.record ?? null,
        });
      });
    }
    // The Rivals record rides on the same answer as the list. A screen opened
    // before that answer has arrived is drawn again when it does, with every
    // card already painted standing where it was.
    if (!this.rooms && this.player && !NO_BOARD) {
      void ChallengeRun.mine(this.player).then(list => {
        if (this.disposed || !list) return;
        this.rooms = list;
        const cards = modes.map(one => this.mineSlides[one]).filter((one): one is StatsSlide => !!one);
        if (cards.length === modes.length) draw({ cards, at, rivals: list.record });
      });
    }
  }

  /**
   * The best place this player holds on any of a mode's ladders: its innings
   * board, as the store last said, and each career ladder from the rows held.
   */
  private bestRank(mode: CareerMode): number | null {
    const places = Object.values(placesOf(this.careerBoards[mode]?.boards ?? {}, this.player));
    const innings = this.modeRanks[mode];
    const all = [...places, ...(innings ? [innings] : [])].filter(place => place > 0);
    return all.length ? Math.min(...all) : null;
  }

  private openMine() {
    // The game they were last looking at, which is why the mode is remembered
    // apart from the tab — and the Marathon's card from the Marathon's tab.
    const open: CareerMode = this.sheetTab === 'marathon' ? 'marathon' : this.boardTab;
    this.sheetTab = 'mine';
    this.railStats(open, view => {
      if (this.disposed || !this.hud.boardOpen || this.sheetTab !== 'mine') return;
      this.hud.statsTab(view);
    });
  }

  /** The board on screen, asked for again: TRY AGAIN, after it could not be reached. */
  private reopenBoard() {
    if (this.sheetTab === 'marathon') return this.openMarathon(this.marathonLadder);
    this.openBoard(this.boardTab, this.boardLadder);
  }

  // ── The chase (section 14, lane B) ────────────────────────────────────────

  /** The intro is due: set by CHASE on a profile and by CHASE AGAIN, spent by the innings it stands before. */
  private chaseFresh = false;
  /** The target passed this innings, and whether its moment is waiting on a dead ball or has had it. */
  private chasePassDue = false;
  private chasePassed = false;

  /** Whether the innings on now is the chase's: its mode, and no Rival Match. */
  private get chaseLive(): Chase | null {
    return this.chase && this.chase.mode === this.careerMode && !this.challenge.playing && this.lesson < 0 ? this.chase : null;
  }

  /** The runs a chase is judged on: the innings's, the side's in a Marathon. */
  private get chaseRuns() {
    // Chasing their best batter, it is the best of this side's three that counts.
    if (this.chase?.ladder === 'solo' && this.marathon) return Math.max(0, ...marathonFigures(this.marathon).batters.map(one => one.runs));
    return this.score.runs;
  }

  /** Balls left, where the innings is counted in them. */
  private get chaseBallsLeft() { return this.careerMode === 'classic' ? GAME.totalBalls - this.score.balls : null; }

  /** What the player brings to it: their best and place in the mode, as far as this browser knows. */
  private chaseMine(): Mine {
    const place = this.modeRanks[this.careerMode] ?? null;
    return { best: this.careerMode === 'classic' && this.best > 0 ? this.best : null, place };
  }

  /** The chase let go: by BACK, by another mode, or once it is won and the card has said so. */
  private clearChase() {
    this.chase = null;
    this.chaseFresh = false;
    chaseFor(null);
    this.hud.chaseChip(null);
  }

  /**
   * An innings starting: the chase kept only for its own mode, the chip put up
   * under the scoreboard, and — the first time — the intro held in front of
   * the first ball. A browser in its coachmarks gets those first and the chip
   * alone: two cards in a row before a ball is one too many.
   */
  private startChase() {
    this.hud.chaseStrip(null);
    this.hud.againLabel(null);
    this.chasePassDue = false;
    this.chasePassed = false;
    this.chaseBest = this.chaseMine().best;
    if (this.chase && (this.chase.mode !== this.careerMode || this.challenge.playing)) this.clearChase();
    const chase = this.chaseLive;
    if (!chase) { this.hud.chaseChip(null); return; }
    chaseFor(chase.handle, chase.mode, chase.ladder);
    this.hud.chaseChip(chase, 0, this.chaseBallsLeft);
    if (!this.chaseFresh) return;
    this.chaseFresh = false;
    if (this.bannerUntil === Number.POSITIVE_INFINITY) return;
    this.bannerUntil = Number.POSITIVE_INFINITY;
    this.hud.chaseIntro(chase, this.chaseMine(), { avatar: readPlayer()?.avatar ?? null }, bat => {
      this.bannerUntil = this.elapsed;
      if (bat) { this.mark('chase-bat', 'Chase: let’s bat'); return; }
      this.mark('chase-back', 'Chase: back');
      this.clearChase();
      this.togglePause();
      this.modes();
    });
  }

  /** After each ball: the chip moved on, and the target, once passed, waiting on the dead ball for its moment. */
  private chaseBall(outcome: ShotOutcome) {
    const chase = this.chaseLive;
    if (!chase) return;
    // Passed and celebrated, the chase has nothing left to say in play.
    if (this.chasePassed && !this.chasePassDue) { this.hud.chaseChip(null); return; }
    const runs = this.chaseRuns;
    const passed = chase.result ? surviveSurely(chase.result, this.score.balls) : beaten(chase, runs);
    const place = this.chasePassed || passed ? placeOnPassing(chase, this.chaseMine()) : null;
    const beat = outcome.runs >= 4 ? 'boundary' : outcome.runs > 0 || (!chase.result && close(chase, runs)) ? 'scored' : 'none';
    this.hud.chaseChip(chase, runs, this.chaseBallsLeft, place, beat, this.score.balls);
    if (!this.chasePassed && passed) { this.chasePassed = true; this.chasePassDue = true; }
  }

  /**
   * The target passed, between balls, as a milestone is (B3): held on the
   * game's own celebration clock, one hard knock in the hand, and the crowd.
   */
  private celebrateChase() {
    const chase = this.chaseLive;
    this.chasePassDue = false;
    if (!chase) return;
    const lasts = 1700;
    this.celebrating = Math.max(this.celebrating, lasts);
    const place = placeOnPassing(chase, this.chaseMine());
    this.hud.chasePassed(chase, chase.result ? this.score.balls : this.chaseRuns, { avatar: readPlayer()?.avatar ?? null }, place, CHASE_MODE_NAMES[chase.mode], lasts);
    // The moment says it; the chip under the scoreboard goes with it.
    this.hud.chaseChip(null);
    buzz([0, 40, 30, 90]);
    this.audio.cheer(boundaryCheer(6, 1, this.test));
    this.mark('chase-passed', 'Chase: passed the target');
  }

  /**
   * The end card's strip (B4, B5) and its key, drawn when the card goes up and
   * again when the store has said where the innings landed. A chase won is
   * over once its card has said so; one fallen short stays, and the key says
   * CHASE 187 AGAIN.
   */
  private chaseCard(result: SubmitResult<unknown> | null = null) {
    const chase = this.chaseLive;
    if (!chase) { this.hud.chaseStrip(null); this.hud.againLabel(null); return; }
    const runs = this.chaseRuns;
    const now = this.placeNow() ?? null;
    const held = this.standing?.innings === this.innings ? this.standing.standing : null;
    const was = held ? ('team' in held ? held.team.was?.rank : held.was?.rank) ?? null : null;
    const said = chase.result
      ? surviveVerdict(chase.name, chase.result, surviveResultOf(this.survived()), { now, was })
      : verdict(chase, runs, { now, was });
    const next = result?.around?.next ?? this.chaseNext;
    if (result?.around) this.chaseNext = result.around.next;
    this.hud.chaseStrip(chaseStripMarkup({
      chase, runs, verdict: said, place: now, modeName: CHASE_MODE_NAMES[chase.mode],
      you: { avatar: readPlayer()?.avatar ?? null }, best: this.chaseBest, next,
    }), !!readPlayer()?.name);
    this.hud.againLabel(said.beat ? null : chase.result ? surviveGoal(chase.name, chase.result).again : againLabel(chase));
    if (!result) this.mark(said.beat ? 'chase-beat' : 'chase-short', said.beat ? 'Chase: beaten' : 'Chase: fell short');
    // The same again for WIN IT BACK alone, which `chase-` counts among the rest.
    if (!result && chase.answers) this.mark(said.beat ? 'winback-beat' : 'winback-short', said.beat ? 'Win it back: won' : 'Win it back: fell short');
    // Gone after from the Rank down card and played to the end: the card comes down, won or not.
    if (!result && chase.answers) noteAnswered(chase.handle, chase.mode);
    const board = () => { if (this.careerMode === 'marathon') this.openMarathon('team'); else this.openBoard(this.careerMode, 'best'); };
    document.getElementById('chase-board')?.addEventListener('click', board);
    document.getElementById('chase-next')?.addEventListener('click', board);
    document.getElementById('chase-profile')?.addEventListener('click', () => this.showStats());
    if (said.beat) this.chaseWon = true;
    this.drawHero();
  }
  /** The player's best as the innings began, for the bar on a chase fallen short. */
  private chaseBest: number | null = null;
  /** Who stands next above, from the store's answer to the post. */
  private chaseNext: { name: string; avatar: number; runs: number; place: number } | null = null;
  /** Won: let go at the next start, after its card has said so. */
  private chaseWon = false;

  /** Where the store has this player on each mode's whole board, as last asked. */
  private modeRanks: Partial<Record<CareerMode, number | null>> = {};
  private ranksAsked = 0;

  /** Asked once a minute at most, and the board redrawn if it is still up. */
  private refreshRanks() {
    if (!readPlayer() || !this.player || Date.now() - this.ranksAsked < 60_000) return;
    this.ranksAsked = Date.now();
    void Promise.all([
      fetchStanding(this.player, 'classic'), fetchStanding(this.player, 'survive'), fetchStanding(this.player, 'marathon'),
    ]).then(([blast, survive, marathon]) => {
      if (this.disposed) return;
      this.modeRanks = { classic: blast?.rank ?? null, survive: survive?.rank ?? null, marathon: marathon?.team?.rank ?? null };
    });
  }

  /**
   * What the board needs from the game at every draw: who is looking, where
   * the store has them, the innings just posted on this board, and which key
   * the foot carries — PLAY AGAIN for the innings just played, the mode's own
   * PLAY from anywhere else, and none mid-innings, where it is a look and the
   * innings is waiting underneath.
   */
  private boardFrame(mode: CareerMode, ladder: string): BoardFrame {
    this.refreshRanks();
    const me = readPlayer();
    const ended = this.phase === 'INNINGS_END' && this.careerMode === mode && !this.challenge.playing;
    const innings = ladder === 'best' || ladder === 'team' || ladder === 'solo';
    const held = ended && innings && !this.practising && this.standing?.innings === this.innings && this.standing.mode === mode
      ? this.standing : null;
    let posted: BoardContext['posted'] = null;
    if (held) {
      const raw = held.standing;
      const one = 'team' in raw ? (ladder === 'solo' ? raw.solo : raw.team) : raw;
      const improved = held.by ? (ladder === 'solo' ? held.by.solo : held.by.team) : held.improved;
      if (one.rank) {
        posted = {
          rank: one.rank, total: one.total, was: one.was ?? null, improved, first: heldCareer(mode).innings <= 1,
        };
      }
    }
    const midInnings = !['START', 'INNINGS_END'].includes(this.phase) && !(this.phase === 'PAUSED' && ['START', 'INNINGS_END'].includes(this.previousPhase));
    return {
      ctx: {
        you: me ? { name: me.name, avatar: me.avatar } : null,
        kit: me?.avatar ?? null,
        rank: innings && ladder !== 'solo' ? this.modeRanks[mode] ?? null : null,
        posted,
        played: heldCareer(mode).innings > 0,
        restore: false,
        modeName: BOARD_MODES[mode].name.replace(/^The /, ''),
      },
      ranks: this.modeRanks,
      play: ended ? 'again' : midInnings ? null : 'mode',
    };
  }

  /** Another ladder of the same mode, from the row of tabs under the first. */
  private tabLadder = (ladder: LadderTab) => {
    if (ladder === this.boardLadder) return;
    // The Marathon's three under a name of their own: its Runs and the Blast's
    // are two different ladders with the same key.
    if (this.sheetTab === 'marathon') {
      this.mark(`board-ladder-marathon-${ladder}`, 'A Test Marathon ladder opened from a tab');
      return this.openMarathon(ladder as MarathonLadder);
    }
    this.mark(`board-ladder-${ladder}`, 'A career ladder opened from a tab');
    this.openBoard(this.boardTab, ladder);
  };

  private openBoard(mode: BoardTab, ladder: LadderTab): void {
    // Every view of the board comes through here, so the offer is decided once
    // rather than at each of the four places that draw one.
    this.boardRestoreOffer();
    this.boardTab = mode;
    this.sheetTab = mode;
    this.boardLadder = ladder;
    if (ladder !== 'best') return this.showCareerBoard(mode, ladder);
    if (mode === 'survive') this.showSurviveBoard();
    else this.showClassicBoard();
  }

  /**
   * A career board. Whatever was held from the last fetch goes up straight
   * away, and the fetch corrects it — which matters more here than on the
   * innings board, because every career board of a mode arrives in one call, so
   * moving between three tabs after the first is instant rather than three
   * round trips.
   */
  private showCareerBoard(mode: BoardTab, key: string): void {
    const board = careerBoardOf(mode, key);
    if (!board) return this.openBoard(mode, 'best');
    const held = this.careerBoards[mode];
    const draw = (payload: CareerBoards<AnyCareer> | undefined, state: 'ready' | 'loading' | 'offline') => {
      if (this.sheetTab !== mode || this.boardTab !== mode || this.boardLadder !== key) return;
      this.hud.careerBoard({
        mode, board, youId: this.player, state,
        rows: (payload?.boards?.[key] ?? []) as readonly CareerRow<AnyCareer>[],
        size: payload?.size ?? 50,
        actions: this.boardActions && this.atEndOf(mode),
      });
    };
    if (this.demo) return draw(demoCareers(mode, this.player) as CareerBoards<AnyCareer>, 'ready');
    draw(held, held ? 'ready' : 'loading');
    void fetchCareerBoards<AnyCareer>(mode).then(payload => {
      if (this.disposed || !this.hud.boardOpen) return;
      if (payload) this.careerBoards[mode] = payload;
      draw(this.careerBoards[mode], payload ? 'ready' : 'offline');
    });
  }

  /**
   * The card, over everything else.
   *
   * Three things happen at once, in the order they can be done. The mirror in
   * this browser answers immediately, so the sheet is up with the player's own
   * figures rather than a spinner. The card is painted from those figures. And
   * the store is asked for the truth — which is what carries a career across
   * from another browser once the ids agree — and where it differs, the card is
   * painted again.
   *
   * Painting twice is deliberate. The alternative is waiting on the network
   * before drawing anything, and the figures almost never change between the
   * two: the mirror was written by the last innings this browser played.
   */
  /**
   * The card, as a page of its own — where the innings-end card's Career Stats
   * widget leads. A place the player travelled to rather than a tab they
   * switched to, so it carries a way back and the board is not underneath it.
   */
  /**
   * What the player's profile has collected, asked for each time My profile
   * opens: who looked, who chased and passed them, their bio. Only a named
   * player has a profile, and a private window keeps nothing to show.
   */
  private async askActivity() {
    const player = this.player;
    if (!player || !readPlayer()?.name) { this.hud.statsActivity(null); return; }
    try {
      const activity = await fetchActivity(player);
      this.bioKnown = activity.bio;
      if (this.disposed || this.player !== player) return;
      // My profile led with Rank down: against `activity-open` and `activity-win-back`, how often being passed brings a player back.
      if (headline(activity)) track('activity-headline', 'My profile led with Rank down');
      this.hud.statsActivity(activity);
    } catch { /* My profile without its activity is still My profile. */ }
  }

  private showStats = () => {
    this.mark('stats-open', 'Career card opened');
    const mode = this.careerMode;
    // Wanted, rather than open. The first draw is the one that opens the page,
    // so it cannot be the one that checks whether the page is open — guarding
    // on that left the widget doing nothing at all.
    this.statsPage = true;
    // The same rail the tab draws, opened on the game just played. This page
    // used to be handed a single card, so the swipe the tab offers was missing
    // from the one screen most players reach first.
    this.railStats(mode, view => {
      if (this.disposed || !this.statsPage) return;
      this.hud.stats(view);
    });
    void this.askActivity();
    this.hud.onStatsBack = () => {
      this.statsPage = false;
      this.hud.onStatsBack = null;
      this.hud.dropStats();
    };
  };

  /**
   * One player's card, assembled and then painted, handed to whoever is
   * drawing it.
   *
   * Three things happen at once, in the order they can be done. The mirror in
   * this browser answers immediately, so the screen is up with the player's own
   * figures rather than a spinner. The card is painted from those figures. And
   * the store is asked for the truth — which is what carries a career across
   * from another browser once the ids agree — and where it differs, the card is
   * painted again.
   *
   * Painting twice is deliberate. The alternative is waiting on the network
   * before drawing anything, and the figures almost never change between the
   * two: the mirror was written by the last innings this browser played.
   *
   * The `draw` it is handed is what makes one path serve both the tab on the
   * board and the page off the innings card. Neither of them knows any of the
   * above, and neither of them has a copy of it.
   */
  private loadStats(
    mode: CareerMode,
    draw: (facts: StatsFacts, picture: string | null, failed: boolean) => void,
  ) {
    const batting = readPlayer();
    const held = this.myCareer[mode] ?? {
      career: heldCareer(mode), name: batting?.name ?? '', avatar: batting?.avatar ?? 0, granted: null,
    };
    this.paintStats(mode, held, draw);
    if (this.player) {
      void fetchMyCareer<AnyCareer>(this.player, mode).then(mine => {
        if (this.disposed || !mine?.career) return;
        const fresh = {
          career: mine.career, name: mine.name, avatar: mine.avatar, granted: mine.granted ?? null,
        };
        this.myCareer[mode] = fresh;
        // Only redrawn where the store actually disagreed, or every open would
        // repaint the card a beat after the player started looking at it.
        if (JSON.stringify(fresh) !== JSON.stringify(held)) this.paintStats(mode, fresh, draw);
      });
    }
    // The card names a place, which only the boards know. One call, and it is
    // the same one the career ladders would have made.
    if (!this.careerBoards[mode]) {
      void fetchCareerBoards<AnyCareer>(mode).then(payload => {
        if (this.disposed || !payload) return;
        this.careerBoards[mode] = payload;
        this.paintStats(mode, this.myCareer[mode] ?? held, draw);
      });
    }
  }

  /**
   * The figures, then the picture for them.
   *
   * The screen goes up first with the keys already on it, because painting
   * takes a moment on a cold font cache and a screen that appears only once the
   * picture is ready is a key that does nothing for half a second. A card that
   * cannot be painted at all falls back to the figures as text, which is the
   * thing the player came for either way.
   */
  private paintStats(
    mode: CareerMode,
    mine: { career: AnyCareer; name: string; avatar: number; granted?: Granted | null },
    draw: (facts: StatsFacts, picture: string | null, failed: boolean) => void,
  ) {
    const standing = bestStanding(mode, placesOf(this.careerBoards[mode]?.boards ?? {}, this.player));
    const facts = statsFacts(
      mode, mine.career, { name: mine.name, avatar: mine.avatar, granted: mine.granted ?? null }, standing,
    );
    this.statsDrawn[mode] = facts;
    // The page draws the card itself now (UI v1), so nothing is painted behind
    // it: SHARE MY CARD paints its own picture when it is pressed. Painting one
    // here only redrew the rail when it landed, which could snap a swipe back.
    draw(facts, null, false);
  }

  /** Whether the innings just played was this mode's, which is what the keys are for. */
  private atEndOf(mode: BoardTab) {
    // A Marathon has no board yet, so the keys at its end are nobody's.
    return this.phase === 'INNINGS_END' && !this.marathoning && this.surviving === (mode === 'survive');
  }

  /**
   * The Blast board. The sheet goes up straight away saying it is fetching,
   * rather than the tab doing nothing for a second and then a screen appearing.
   *
   * The innings just played peeks on its own board and on no other: a Test
   * innings has no place on this ladder, so switching to it from a Test card
   * shows the fifty and nothing of yours.
   */
  private showClassicBoard() {
    this.boardTab = 'classic';
    this.boardLadder = 'best';
    const mine = this.phase === 'INNINGS_END' && this.mode === 'CLASSIC';
    const view = { youId: this.player, yours: mine ? asInnings(this.score) : null, actions: this.boardActions && mine };
    if (this.demo) return this.hud.board({ ...view, rows: demoBoard(this.player), state: 'ready' });
    if (this.board.length) this.hud.board({ ...view, rows: this.board, state: 'ready' as const });
    else this.hud.board({ ...view, rows: [], state: 'loading' as const });
    const epoch = this.boardEpoch;
    void fetchBoard().then(payload => {
      if (this.disposed || epoch !== this.boardEpoch) return;
      // Kept first and drawn second. What came back is the board whether or not
      // anybody is still looking at it, and the innings-end strip reads these
      // rows to decide whether there is a place worth claiming — so throwing
      // the payload away because the player had moved on left them with no way
      // to register at all.
      if (payload) { this.boardSeen = true; this.board = payload.rows; }
      // Drawn only onto the sheet it belongs to — the tab and the ladder,
      // rather than the mode. A fetch in flight lands a moment after the
      // player has moved and the mode is still exactly what it was, so
      // guarding on the mode alone let fifty innings rows draw straight over
      // the top of a career ladder or of the player's own card.
      if (!this.hud.boardOpen || this.sheetTab !== 'classic' || this.boardLadder !== 'best') return;
      this.hud.board({ ...view, rows: this.board, state: payload ? 'ready' : 'offline' });
    });
  }

  /** The same opening, over the Test ladder. */
  private showSurviveBoard() {
    this.boardTab = 'survive';
    this.boardLadder = 'best';
    const mine = this.phase === 'INNINGS_END' && this.surviving;
    const view = { youId: this.player, yours: mine ? this.survived() : null, actions: this.boardActions && mine };
    if (this.demo) return this.hud.surviveBoard({ ...view, rows: demoSurvive(this.player), state: 'ready' });
    this.hud.surviveBoard({
      ...view,
      rows: this.surviveRows,
      state: this.surviveRows.length ? 'ready' as const : 'loading' as const,
    });
    const epoch = this.surviveEpoch;
    void fetchSurviveBoard().then(payload => {
      if (this.disposed || epoch !== this.surviveEpoch) return;
      if (payload) { this.surviveSeen = true; this.surviveRows = payload.rows; }
      // A fetch that lands after the player has tabbed away belongs to a sheet
      // that is no longer on screen, and drawing it would put the other ladder
      // back under the tab they just chose.
      if (!this.hud.boardOpen || this.sheetTab !== 'survive' || this.boardLadder !== 'best') return;
      this.hud.surviveBoard({ ...view, rows: this.surviveRows, state: payload ? 'ready' : 'offline' });
    });
  }

  /** The Test innings just played, as its board ranks it. */
  private survived() { return asSurvive(this.score, this.health.blows.length, this.health.value); }
  private visibility = () => { this.audio.background(document.hidden); if (document.hidden && !['START', 'INNINGS_END', 'PAUSED'].includes(this.phase)) this.togglePause(); };
  private blur = () => { if (!['START', 'INNINGS_END', 'PAUSED'].includes(this.phase)) this.togglePause(); };
  /**
   * Leaving a long Marathon asks first. Nothing of an innings is kept until it
   * ends, so a tab closed or reloaded three hundred balls in is three hundred
   * balls gone; past `MARATHON.warnFrom` the browser's own "leave this page?"
   * goes up. A phone that closes a backgrounded tab without asking is beyond
   * reach of this, which is why it is a question and not a save.
   */
  private leaving = (event: BeforeUnloadEvent) => {
    if (!this.marathoning || !this.marathon || this.marathon.ended || this.phase === 'INNINGS_END') return;
    if (this.marathon.balls < MARATHON.warnFrom) return;
    event.preventDefault();
    event.returnValue = '';
  };
  private shortcuts = (event: KeyboardEvent) => {
    if (event.repeat || this.hud.helpOpen) return;
    // A player typing their name into the claim field is not pressing shortcuts.
    // Without this, "Rohit" restarts the innings on the R and Escape abandons
    // the form by pausing whatever is behind it.
    const typing = event.target instanceof HTMLElement
      && (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' || event.target.isContentEditable);
    if (typing && event.key !== 'Escape') return;
    // The stars and the questionnaire take their own keys. Enter on a star
    // gives it, and Enter on an answer picks it — and on the end card Enter is
    // also Play Again, so without this a keyboard rating started an innings
    // behind the prompt. Escape on the questionnaire is its own, too. Only the
    // stars' own keys, though: R from a star still walks out to bat, which it
    // did not while every key pressed on one was swallowed.
    if (document.querySelector('.feedback-screen')) return;
    // Level Up takes its own keys: Escape is its way to the scorecard, and
    // Enter is whichever of its keys has the focus, not PLAY AGAIN under it.
    if (this.levelUp) return;
    if (event.target instanceof Element && event.target.closest('.rate-pop') && STAR_KEYS.has(event.key)) return;
    const key = event.key.toUpperCase();
    // The stories sit over everything, including the board that may have opened
    // them, so they answer first. Without this Enter started an innings behind
    // them — and then started it again on the way out — 'B' opened the board
    // underneath, and Esc closed the board the player had come from.
    if (this.hud.storiesOpen) {
      if (key === 'ESCAPE') { event.preventDefault(); this.hud.closeStories(); }
      return;
    }
    // The card sits over the board, so it answers before the board does. Esc
    // puts it away and hands the board back, rather than closing both or
    // pausing whatever is under the two of them.
    if (this.hud.statsOpen) {
      if (key === 'ESCAPE') { event.preventDefault(); this.hud.closeStats(); }
      return;
    }
    // The board is the thing on top while it is open, so it answers first: Esc
    // puts it away rather than pausing whatever is behind it, and the keys that
    // start an innings would otherwise start one under a sheet nobody closed.
    if (this.hud.boardOpen) {
      if (key === 'ESCAPE' || key === 'B') { event.preventDefault(); this.hud.closeBoard(); }
      return;
    }
    if (this.hud.claimOpen) {
      if (key === 'ESCAPE') { event.preventDefault(); this.hud.closeClaim(); }
      return;
    }
    // The picker is the thing on top while it is open, so it answers first —
    // otherwise Enter starts an innings underneath a sheet nobody closed.
    // Super10's page is over the picker, so it answers before it does.
    if (this.hud.super10Open) {
      if (key === 'ESCAPE') { event.preventDefault(); this.hud.closeSuper10(); }
      return;
    }
    if (this.hud.modesOpen) {
      if (key === 'ESCAPE') { event.preventDefault(); this.closePicker(); }
      // On a desktop the arrow keys move the rail of posters, as a swipe does.
      else if (key === 'ARROWLEFT' || key === 'ARROWRIGHT') { event.preventDefault(); this.hud.stepRail(key === 'ARROWRIGHT' ? 1 : -1); }
      return;
    }
    // The card opened from a match result goes back to it, rather than
    // starting a Blast innings on a key meant for the card at an innings' end.
    if (this.hud.matchScorecardOpen && (key === 'ENTER' || key === 'R' || key === 'ESCAPE')) {
      event.preventDefault();
      this.backToResult();
      return;
    }
    if (key === 'ENTER' && (this.phase === 'START' || this.phase === 'INNINGS_END')) {
      event.preventDefault();
      if (this.phase === 'INNINGS_END') this.start(); else if (this.locked) this.walkOut(); else this.modes();
    }
    else if (key === 'B' && !NO_BOARD) { event.preventDefault(); this.showBoard(); }
    else if (key === 'R' && this.phase !== 'START') { event.preventDefault(); this.start(); }
    else if (key === 'ESCAPE') { event.preventDefault(); this.togglePause(); }
    else if (key === 'M') { event.preventDefault(); this.toggleSound(); }
    else if (key === 'P' && this.super10) { event.preventDefault(); this.armSurge(); }
    else if (key === 'F' && this.super10) { event.preventDefault(); this.lookAtField(); }
  };
  /**
   * The innings clock at the moment an input actually happened.
   *
   * `elapsed` only moves once per frame, so reading it directly rounded every
   * shot to the nearest frame — sixteen milliseconds at sixty hertz and
   * thirty-three on a phone that is working hard. Against Survive's windows,
   * where a perfect shot is twenty-six milliseconds either side, that rounding
   * is most of the window: two players who pressed at genuinely different
   * moments got the same grade, and the mode would have felt like chance.
   *
   * A keyboard or pointer event carries the time it was generated, in the same
   * clock `requestAnimationFrame` is handed. So the honest answer is the
   * innings clock as of the last frame, plus however long after that frame the
   * press landed. The gap is clamped to one slow frame's worth: an event that
   * has been sitting in a queue through a stall should be treated as having
   * just happened, not as having happened in the future.
   */
  private clockAt = (at?: number) => {
    if (!this.frameClock) return this.elapsed;
    const stamp = typeof at === 'number' && at > 0 ? at : performance.now();
    return this.elapsed + Math.min(Math.max(stamp - this.frameClock, 0), 60) * this.timeScale;
  };
  private frame = (time: number) => {
    if (this.disposed) return;
    const dt = this.previousFrame ? Math.min(time - this.previousFrame, 60) : 0; this.previousFrame = time;
    this.frameClock = time;
    if (LIVE.includes(this.phase) && !document.hidden) {
      // Wall-clock rather than the game's own clock, which the charge stretches
      // into slow motion: a second of slow motion is still a second of playing.
      this.playedMs += dt;
      marksPassed(this.playedMs).forEach(mark => trackOnce(mark, `Played ${mark.slice(7)}`));
    }
    if (this.phase !== 'PAUSED' && !document.hidden) {
      // A stroke's film held on one frame for its swipe, on the page's clock.
      if (this.reel && this.reel.hold > 0) this.reel.hold -= dt;
      this.elapsed += dt * this.timeScale;
      this.input.flush(this.elapsed);
      this.update();
      if (this.reel) this.reelFrame();
    }
    // Level Up covers the whole screen, so the ground under it is not drawn:
    // a phone has one GPU, and the confetti wants it.
    if (!document.hidden && !this.levelUp) { this.scene.scoreboard(this.scoreboard()); this.scene.render(this.elapsed); }
    // The sound first: on a phone the overlay is taller than the screen is.
    if (this.debug) this.hud.debug({ ...this.audio.describe(), ...this.snapshot() });
    this.frameId = requestAnimationFrame(this.frame);
  };
  /**
   * The charge, and only the charge, gets slow motion: from the swipe that
   * played it, through the run down the pitch and the hit, to a beat off the
   * bat. The ball is already resolved at the swipe, so nothing the player can
   * still affect is running slowly — the clock only stretches the replay of a
   * shot he has won.
   */
  private get timeScale() {
    // A stroke's film slows through the bat meeting the ball (`reelPace`).
    // Stopped dead while the swipe is drawn over it.
    if (this.reel) return this.reel.hold > 0 ? 0 : reelPace(this.elapsed - this.reel.start - this.reel.times.contact);
    if (this.phase !== 'SHOT_RESOLVE' || !this.outcome?.advance) return 1;
    const since = this.elapsed - this.contactAt;
    // Two thirds speed, chosen from three playtest builds side by side. It
    // ran at a third, and with the run down the pitch now inside the window
    // as well as the hit, a third of that read as a replay rather than a
    // beat: over a second and a half of him walking at the ball. Half was
    // still slow; two thirds keeps the run readable and the hit still lands.
    return since < 340 ? this.chargeSlowmo : 1;
  }
  private update() {
    const age = this.elapsed - this.phaseStart;
    // The bowler waits for the field to be back on its marks — a catcher
    // jogging back from deep midwicket, the man who chased one to the rope —
    // and no longer than a few seconds past the usual wait, whatever happens.
    if (this.phase === 'READY' && age >= this.readyMs && this.elapsed >= this.bannerUntil && (this.scene.fieldSettled || age >= this.readyMs + FIELD_WAIT_MS)
      && (!this.scene.batterTapping || age >= this.readyMs + TAP_WAIT_MS)) {
      this.delivery = this.lesson >= 0 ? tutorialDelivery(TUTORIAL[this.lesson], this.elapsed + GAME.runupMs)
        : this.chargeable(this.generator.next(this.elapsed + GAME.runupMs));
      this.attempt = null; this.outcome = null; this.bounced = false; this.specials = []; this.primed = null; this.chargeBall = false; this.meetsAt = 1;
      // The ball is settled before the bowler moves, so the call goes out with
      // him. Held to the flight it gave the player under a second to see the
      // cue, change the shot he had in mind and time it — and that was most of
      // why a full meter kept going unspent.
      // The cue names one stroke. A ball on the stumps at a bowler's pace is
      // the charge's first and the scoop's second, so it is called as the
      // charge; the scoops are named for the balls only they answer — the
      // yorker, the slower ball, the quick one, the wide one.
      this.specials = !this.charged ? [] : ([
        chargeable(this.delivery) && 'CHARGE', sweepable(this.delivery) && 'SWEEP',
        scoopable(this.delivery) && scoopLine(this.delivery, 'SCOOP') && 'SCOOP',
        scoopable(this.delivery) && scoopLine(this.delivery, 'REVERSE_SCOOP') && 'REVERSE',
      ] as const).filter((special): special is NonNullable<Primed> => !!special);
      this.primed = this.specials[0] ?? null;
      // He may still be finishing what he did after the last ball: the bowler
      // runs in while he does (see `presentResult`).
      this.scene.reset(true); this.input.reset();
      // After the reset, which hands the ball back to the quick bowler.
      this.scene.spinner(spun(this.delivery));
      this.scene.express(!!this.delivery.express, !!this.delivery.death);
      this.scene.round(!!this.delivery.round);
      this.showConfidence(); this.setPhase('BOWLER_RUNUP');
      // The stands lift as he runs in, and settle once the ball has gone.
      this.audio.swellCrowd(1 + RUNUP.swell, GAME.runupMs / 1000, RUNUP.settle, 0, GAME.runupMs / 3000);
    } else if (this.phase === 'BOWLER_RUNUP') {
      this.scene.runup(Math.min(1, age / GAME.runupMs));
      if (age >= GAME.runupMs) {
        this.delivery!.releaseTimeMs = this.elapsed; this.delivery!.idealContactTimeMs = this.elapsed + this.delivery!.durationMs; this.setPhase('BALL_IN_FLIGHT');
        // Out of the hand, onto the gun: the Marathon's, and Super10's, whose
        // five bowlers are told apart by their pace as much as their actions.
        // See `speed-gun.ts`.
        if (this.marathon || this.super10) this.hud.speed(shownKph(this.delivery!.speedKph));
      }
    } else if (this.phase === 'BALL_IN_FLIGHT' && this.delivery) {
      const progress = flightProgress(this.delivery, this.elapsed - this.delivery.releaseTimeMs);
      this.scene.delivery(this.delivery, progress);
      const bounce = (GAME.releaseZ - this.delivery.bounceZ) / (GAME.releaseZ - GAME.contactZ);
      if (!this.bounced && progress >= bounce) { this.audio.play('bounce'); this.bounced = true; }
      if ((progress >= this.meetsAt && this.attempt) || this.elapsed >= this.delivery.idealContactTimeMs + this.swingWindow + GAME.comboMs) this.resolve();
    } else if (this.phase === 'SHOT_RESOLVE') {
      this.scene.result(this.elapsed);
      // A skied ball cracks off the bat now and is judged when it comes down.
      if (!this.contactPlayed && this.elapsed >= this.contactAt) {
        this.contactPlayed = true;
        if (this.lesson < 0 && landedSpecial(this.outcome!)) this.powerUp();
        else if (this.lesson < 0 && pulledBouncer(this.delivery!, this.attempt?.shotType, this.outcome!)) this.pullUp();
        if (this.outcome!.aerial && this.outcome!.madeBatContact) this.audio.play('hit');
      }
      if (!this.resultPresented && this.elapsed >= this.presentationAt) this.presentResult();
      if (this.elapsed >= this.resolveEndsAt) {
        this.setPhase('RESULT');
        if (this.milestoneDue) { this.celebrate(this.milestoneDue); this.milestoneDue = null; }
        else if (this.momentAsked) { this.celebrate(this.momentAsked, true); this.momentAsked = null; }
        else if (this.chasePassDue) this.celebrateChase();
        // After the call, not over it: the sledge is what comes back from the
        // field once the ball is dead.
        if (this.sledgeDue) { this.sledgeDue = false; this.audio.play('sledge'); }
      }
    } else if (this.phase === 'RESULT' && age >= this.resultMs) {
      this.celebrating = 0; this.afterBallUntil = -Infinity;
      if (this.lesson >= 0) {
        this.lesson++;
        if (this.lesson >= TUTORIAL.length) { this.lesson = -1; noteHowTo(false); track('tutorial-complete', 'Tutorial completed'); this.setPhase('START'); this.hud.tutorialComplete(); }
        else { this.setPhase('READY'); this.hud.coach(TUTORIAL[this.lesson], this.lesson + 1, TUTORIAL.length); }
      } else if (this.marathon ? this.marathon.ended : this.surviving ? this.ending : this.score.ended) this.end();
      else {
        if (this.changed) this.nextBatter();
        if (this.noticeDue) { this.noticeDue = false; this.showHurtNote(); }
        else this.setPhase('READY');
      }
    }
  }
  private resolve() {
    const step = this.lesson >= 0 ? TUTORIAL[this.lesson] : null;
    this.outcome = step ? tutorialOutcome(step, this.delivery!, this.attempt)
      : this.marathon ? this.marathonBall()
      : this.surviving ? resolveSurvive(this.delivery!, this.attempt, this.rng, easedSkill(TAILENDER, this.ease))
      : resolveShot(this.delivery!, this.attempt, this.rng, this.charged, this.windows);
    // Super10: the swipe steers the stroke inside its arc, and the field has
    // its say on the line it went — stopped, cut off, saved, caught on the
    // rope — and a boundary is remembered for the bowlers to read.
    if (!step && this.super10 && this.s10.field) {
      const shot = this.attempt?.shotType;
      const lane = steerOf(shot, this.outcome, this.flickPlayed);
      const steered = lane ? steer(lane, this.attempt?.swipe) : null;
      if (steered) this.outcome = { ...this.outcome, angle: steered.angle };
      const line = sectorOf(this.outcome, shot), struck = this.outcome.runs;
      this.outcome = fieldRules(this.outcome, line, this.s10.field, this.rng, steered?.stretch ?? 0);
      if (this.outcome.fielder) this.mark(`fielded-${this.outcome.fielder.how}`, 'A ball fielded');
      if (lane && struck >= 4 && this.outcome.runs >= 4) this.s10.boundaries.push(line);
    }
    if (step) this.hud.coachPlayed(step.praise, this.outcome.madeBatContact);
    else {
      this.score.record(this.outcome); this.generator.record(this.outcome);
      const delivery = this.delivery!, attempt = this.attempt;
      const ball = { armBall: delivery.style === 'ARM_BALL', swung: !!attempt,
        runs: this.outcome.runs, out: this.outcome.isWicket, missed: !this.outcome.madeBatContact };
      this.spinPulls = countStroke(this.spinPulls, { ...ball, its: !!delivery.dragged,
        played: !!attempt && spinPull(delivery, attempt, this.gradeFor(delivery, attempt)) });
      this.hooks = countStroke(this.hooks, { ...ball, its: hookable(delivery), played: attempt?.shotType === 'HOOK' });
      // His own fifty, not the side's: a Marathon's history is three innings
      // end to end, and the No. 3 has not made the opener's runs.
      this.milestoneDue = milestoneOf(this.batterHistory);
      // The other innings, one ball behind the player's own. It goes up after
      // their own result has had the screen to itself, and it is down again
      // before the next ball is bowled — see `flashGhost`.
      if (this.challenge.playing) {
        const me = this.me;
        if (me && !this.demoing) void this.challenge.ballPlayed(me, this.score.history);
        this.flashGhost(this.score.balls - 1);
      }
      if (this.surviving) {
        this.health.record(this.outcome);
        // Read in the order cricket reads it: the target first, then the last
        // ball of the tenth over, then the two ways of failing. That order is
        // what makes a blow landing on the sixtieth ball a draw rather than a
        // retirement — he had no more batting left to be unable to do.
        this.ending = endingOf(this.score.runs, this.score.balls, this.score.wickets, this.health.spent);
        this.felled = this.ending === 'RETIRED';
        this.hud.target(this.chasing, this.score.runs, this.score.balls, this.score.wickets);
      } else if (this.marathon) {
        // The meter on screen is his, and `record` marks it: `this.health` is
        // the same object, so it is not recorded twice. If he is gone the next
        // man is already padded up, and walks out once this ball is dead.
        this.changed = this.marathon.record(this.outcome);
        this.felled = this.changed === 'RETIRED';
        if (this.marathon.justSettled && !this.changed) {
          this.hud.callOut(`${this.marathon.current.batter.title} SETTLED · CONFIDENCE BUILDING`);
          this.mark('batter-settled', 'A batter settled');
        }
      } else {
        this.confidence.record(this.outcome);
        // Super10's next man walks out once this ball is dead, as the
        // Marathon's does: the score says who, by the wickets down.
        if (this.super10 && this.outcome.isWicket && !this.score.ended) this.changed = 'OUT';
      }
      this.showConfidence();
      // Not about a Marathon batter this ball has already taken out of the
      // innings: the notice would pause over the next man, with a full meter.
      if (this.hurts && this.health.critical && !this.wasCritical && !this.changed) this.turnedCritical();
      // The Test match needles a batter who is stuck rather than one who has
      // simply played a few balls — see `sledgeDue`.
      if (this.hurts) {
        this.sledgeDue = sledgeDue(this.score.history, this.lastSledge);
        if (this.sledgeDue) this.lastSledge = this.score.balls;
      } else {
        this.sledgeDue = this.sledger.record(this.outcome);
      }
    }
    this.input.reset();
    const flight = this.scene.hit(this.outcome, this.attempt?.shotType, this.delivery!, this.elapsed);
    this.contactAt = flight.contactAt; this.presentationAt = flight.presentAt; this.resolveEndsAt = flight.endAt;
    this.resultPresented = false; this.contactPlayed = false;
    this.setPhase('SHOT_RESOLVE');
    if (this.outcome.aerial) this.hud.airborne();
  }
  /**
   * The wait, moved on by the ball just played. With the score, not after
   * it: the dial winding on is the same news as the number going up.
   */
  private showNearing(history: readonly ShotOutcome[]) {
    const end = nearingEnd(this.nearing, history);
    this.nearing = nearingOf(history);
    this.hud.nearing(this.nearing, end);
  }
  /** The Blast's version of `writeMarathon`: the balls written straight into the score, and the card if it ends. */
  private writeBlast(balls: (number | 'W')[]) {
    if (this.marathon || this.surviving || this.phase !== 'READY') return false;
    for (const ball of balls) {
      if (this.score.ended) break;
      this.delivery = this.generator.next(0);
      const outcome = {
        runs: typeof ball === 'number' ? ball : 0, isWicket: ball === 'W', quality: 0, feedback: '',
        timingGrade: 'MISS', timingDeltaMs: null, compatibility: 0, madeBatContact: false, aerial: false,
      } as ShotOutcome;
      this.score.record(outcome); this.generator.record(outcome);
      this.chaseBall(outcome);
      // Super10's next man walks out, as he would off a real ball.
      if (this.super10 && outcome.isWicket && !this.score.ended) { this.changed = 'OUT'; this.nextBatter(); }
    }
    this.hud.score(this.score);
    if (this.chasePassDue && !this.score.ended) this.celebrateChase();
    if (this.score.ended) this.end(); else this.setPhase('READY');
    return true;
  }
  private writeMarathon(balls: (number | 'W' | 'H')[]) {
    const marathon = this.marathon;
    if (!marathon || this.phase !== 'READY') return false;
    for (const ball of balls) {
      if (marathon.ended) break;
      const delivery = this.generator.next(0);
      const outcome = {
        runs: typeof ball === 'number' ? ball : 0, isWicket: ball === 'W', quality: 0, feedback: '',
        timingGrade: 'MISS', timingDeltaMs: null, compatibility: 0, madeBatContact: false, aerial: false,
        ...(ball === 'H' ? { hit: { where: 'HELMET', damage: HEALTH.full } } : {}),
      } as ShotOutcome;
      this.delivery = delivery;
      this.score.record(outcome); this.generator.record(outcome);
      this.changed = marathon.record(outcome);
      if (marathon.justSettled && !this.changed) this.hud.callOut(`${marathon.current.batter.title} SETTLED · CONFIDENCE BUILDING`);
      if (this.changed && !marathon.ended) this.nextBatter();
    }
    this.changed = null; this.felled = false;
    this.hud.score(this.score); this.showConfidence();
    if (marathon.ended) this.end(); else this.setPhase('READY');
    return this.marathonState();
  }
  /**
   * A Marathon ball. Survival's ladder resolves it with the skill of whoever
   * is in — unless he has a full meter and has played one of the special
   * strokes, and played it well enough to come off, when it is the Blast's
   * stroke and the Blast's reward. A special swipe mistimed is just the stroke
   * it was, and a Test stroke at that.
   */
  private marathonBall(): ShotOutcome {
    const delivery = this.delivery!, attempt = this.attempt;
    const special = this.charged && (advanceShot(delivery, attempt, true)
      || slogSweep(delivery, attempt, true) || !!scoopShot(delivery, attempt, true));
    return special ? resolveShot(delivery, attempt, this.rng, true, this.windows)
      : resolveSurvive(delivery, attempt, this.rng, easedSkill(this.marathon!.current.batter, this.ease));
  }
  /** The balls the batter who played the last one has faced. The whole innings, but in a Marathon. */
  private get batterHistory() { return this.score.history.slice(this.playedFrom); }
  /**
   * The next man in, once the ball that took the last one is dead. His meter
   * is full, his nineties are his own, and he walks out standing up: the man
   * carried off was put on the ground, and nothing but a reset lifts him.
   */
  private nextBatter() {
    const marathon = this.marathon;
    this.mark(this.changed === 'OUT' ? 'batter-out' : 'batter-retired',
      this.changed === 'OUT' ? 'A batter dismissed' : 'A batter retired hurt');
    this.changed = null; this.felled = false;
    this.playedFrom = this.score.balls;
    if (marathon) this.health = marathon.current.health;
    this.wasCritical = false;
    this.nearing = null; this.hud.nearing(null, null);
    this.scene.newBatter();
    this.showConfidence();
    this.hand();
  }
  /**
   * Which way round the man in bats. A left-hander gets the ground mirrored,
   * the swipes mirrored with it and the side labels swapped, and nothing said
   * about it: a batter on the other side of the stumps says it himself.
   */
  private hand() {
    const man = this.marathon?.current ?? null;
    // The Marathon's three are each their own; the one batter of the Blast and
    // the Test match bats the way the player said they do.
    const left = man ? man.left : readHand() === 'left';
    this.scene.leftHanded(left);
    this.hud.sides(left);
    this.hud.walkingOut(man?.batter.title ?? (this.super10 ? super10Batter(this.score.wickets).title : null));
  }
  /**
   * The player has had enough, from the pause card. Refused before twenty
   * overs; after them it is an innings finished like any other, and counts
   * like one when the Marathon has a career to count it toward.
   */
  private declare = () => {
    if (this.phase !== 'PAUSED' || !this.marathon?.declare()) return;
    this.hud.pause(false);
    this.mark('declared', 'Innings declared');
    this.end();
  };
  /**
   * A special stroke, on the hit: the ground greys round him and the ball for
   * a second and fire streaks out of him, and the doodle goes up behind him,
   * he and the ball cut back out over it. See `powerDoodle`. The burst is
   * dealt from a shuffled bag of its five styles, off `Math.random` and never
   * the innings' seed, so which one comes up leaves the bowling alone. `low`
   * is a scoop, whose bursts move out from under the squat.
   */
  private powerUp(style: PowerStyle = this.powerStyles.next(), low = !!this.outcome?.scooped) {
    this.powerStyle = style;
    this.scene.power(this.elapsed);
    const { back, cutout } = this.hud.power(this.scene.batterOnScreen(), POWER_DOODLE_MS, style, low);
    this.scene.cutout(back, cutout, POWER_DOODLE_MS);
    // The Blast's ground lets the fireworks off for one: see `FIREWORKS_MS`.
    if (this.mode === 'CLASSIC') this.scene.fireworks(this.elapsed, FIREWORKS_MS.special);
    track('special-shot', 'Played a special stroke on a full meter');
  }
  /**
   * A bouncer pulled and hit, on the hit: focus lines, a swoosh behind the bat
   * and a streak behind the ball. See `pulledBouncer` and `pullDoodle`.
   */
  /**
   * A new stroke, filmed for its What's new story (`ShotReel.ts`), over and over
   * until the story moves on: the game's ground and its own scene, the bowler
   * bowling the ball the stroke answers and the player's batter playing it in
   * time, the camera the film's. Nothing is scored or counted; the innings's
   * state is never touched, which is why it plays only where no innings is
   * going on — off the cover, or once one is over — and says so.
   */
  private reel: {
    shot: ReelShot; start: number; times: ReelTimes; delivery: Delivery; beat: (beat: ReelBeat) => void;
    swung: boolean; struck: boolean; presentAt: number; cheered: boolean;
    /** How much longer it holds on this frame for the swipe, page milliseconds; and whether it has this go. */
    hold: number; cued: boolean;
  } | null = null;
  private reelCrowd = false;
  private playReel(shot: ReelShot | null, beat: (beat: ReelBeat) => void): boolean {
    if (!shot) {
      if (!this.reel) return false;
      this.reel = null;
      this.scene.cinematic(null); this.scene.reset();
      if (this.reelCrowd) { this.reelCrowd = false; this.audio.crowd(null); }
      return false;
    }
    if (this.phase !== 'START' && this.phase !== 'INNINGS_END') return false;
    if (!this.reel) {
      const look = this.myLook(); this.scene.dressBatter(look.outfit, look.bat, look.guard);
      this.scene.leftHanded(readHand() === 'left');
      this.scene.cinematic((now, ball) => this.reel ? reelCamera(this.reel.shot, now - this.reel.start, ball) : reelCamera(shot, 0, null));
      // The stands murmur under it off the cover, where they are quiet; after an innings they are already there.
      if (this.phase === 'START') { this.reelCrowd = true; this.audio.crowd(MURMUR.blast); }
    }
    this.beginReel(shot, beat);
    return true;
  }
  /** A go of the film, from the bowler at his mark. */
  private beginReel(shot: ReelShot, beat: (beat: ReelBeat) => void) {
    const times = reelTimes(shot), start = this.elapsed;
    this.scene.reset(); this.scene.spinner(false); this.scene.express(false); this.scene.round(false);
    this.reel = { shot, start, times, delivery: reelDelivery(shot, start + times.release), beat, swung: false, struck: false, presentAt: Infinity, cheered: false, hold: 0, cued: false };
    beat('again');
  }
  /** One frame of the film, as `update` plays a ball: run-up, flight, the stroke, the ball away. */
  private reelFrame() {
    const reel = this.reel!, t = this.elapsed - reel.start, { times, shot, delivery } = reel;
    if (t >= reelLength(shot)) { this.beginReel(shot, reel.beat); return; }
    if (t < times.runup) return;
    if (t < times.release) { this.scene.runup(Math.min(1, (t - times.runup) / GAME.runupMs)); return; }
    if (!reel.struck) {
      const progress = flightProgress(delivery, this.elapsed - delivery.releaseTimeMs);
      this.scene.delivery(delivery, progress);
      // The frame before the bat comes down: held, the swipe drawn over it, then on from here.
      if (!reel.cued && t >= times.swing) { reel.cued = true; reel.hold = CUE.ms; reel.beat('cue'); return; }
      if (!reel.swung && reel.cued && reel.hold <= 0) {
        reel.swung = true;
        this.scene.swing(reelStroke(shot), this.elapsed, delivery, false, false, false, false, 2, reelMeets(shot));
      }
      if (progress < reelMeets(shot)) return;
      const outcome = reelOutcome(shot, delivery), flight = this.scene.hit(outcome, reelStroke(shot), delivery, this.elapsed);
      reel.struck = true; reel.presentAt = Math.min(flight.presentAt, this.elapsed + AFTER_MS / 2);
      this.audio.play('hit');
      // The hooked six's flash, as the game gives it (`pulledBouncer`).
      if (outcome.hooked && outcome.runs === 6) this.scene.pull(this.elapsed, PULL_PENS[this.pullPen].swish);
      reel.beat('hit');
    }
    this.scene.result(this.elapsed);
    if (!reel.cheered && this.elapsed >= reel.presentAt) {
      reel.cheered = true;
      const runs = shot === 'hook' ? 6 : 4;
      this.scene.cheer(runs === 6 ? 'hit-six' : 'hit-four', this.elapsed, 0, 1, '');
      this.audio.cheer(boundaryCheer(runs, 1, false));
    }
  }
  private pullUp() {
    this.scene.pull(this.elapsed, PULL_PENS[this.pullPen].swish);
    this.scene.cutout();
    this.hud.pull(this.scene.batterOnScreen(), PULL_DOODLE_MS, this.pullPen);
    track('pulled-bouncer', 'Pulled a bouncer');
  }
  /**
   * `?pullpen=ice` and the like: which colours a pulled bouncer's focus lines
   * and swoosh are drawn in, for trying them against each other. White and
   * blue unless a link names another of `PULL_PENS`.
   */
  private readonly pullPen: PullPen = (() => {
    const asked = new URLSearchParams(location.search).get('pullpen') ?? '';
    return asked in PULL_PENS ? asked as PullPen : 'ice';
  })();
  private readonly powerStyles = new ShuffleBag(POWER_STYLES);
  /** The burst the last special stroke was drawn with, for the debug snapshot. */
  private powerStyle: PowerStyle | null = null;
  /** A moment: see `milestoneDue`. */
  private celebrate(moment: Moment, asked = false) {
    const { kind } = moment;
    // Which celebration the batter plays: the raised bat for every other
    // fifty, the hundred's for six sixes, and the three big ones their own.
    const pose: Celebration = kind === 'fifty' || kind === 'raise' ? 'fifty' : kind === 'century' || kind === 'six-sixes' ? 'hundred' : kind;
    this.celebrating = celebrationLength(pose);
    this.scene.celebrate(this.elapsed, pose);
    // And for a milestone, as long as he celebrates it.
    if (this.mode === 'CLASSIC') this.scene.fireworks(this.elapsed, Math.max(FIREWORKS_MS.milestone, this.celebrating));
    const { back, cutout } = this.hud.milestone(moment, this.scene.batterOnScreen(), this.celebrating);
    this.scene.cutout(back, cutout, this.celebrating);
    this.scene.cheer(kind, this.elapsed, moment.mark, 1, this.batter.name);
    // The crowd with it, the biggest cheer there is, in a Test too, falling
    // away: the fifty's the sooner, the hundred's on past him into the next
    // ball's run-up, and the big ones the longest.
    this.audio.cheer(milestoneCheer(CHEER[kind]));
    // Named for the mode it was reached in, and the raised bat for its mark:
    // 150, 250 and 350 are one celebration and three different innings.
    if (!asked) this.mark(kind === 'raise' ? `raise-${moment.mark}` : kind, MOMENT_SAID[kind]);
  }
  private presentResult() {
    this.resultPresented = true;
    const outcome = this.outcome!;
    if (this.lesson < 0) { this.hud.score(this.score); this.showNearing(this.batterHistory); this.chaseBall(outcome); }
    this.hud.result(outcome, this.chargeMiss);
    // A boundary rider out of the picture: the side label it went past says who.
    const away = outcome.fielder && offScreen(outcome.fielder.angle);
    if (away && outcome.fielder) this.fieldUi.light({ side: (away === 'leg') !== this.scene.mirrored ? 'left' : 'right', name: outcome.fielder.name });
    // And on the map, the line it went.
    if (this.super10 && this.lesson < 0 && outcome.madeBatContact) this.fieldUi.shot(sectorOf(outcome, this.attempt?.shotType), outcome, this.takerOf(outcome));
    if (outcome.hit) {
      // The blow lands with the call rather than before it, so the flash, the
      // kick and the words are one event instead of three.
      this.hud.blow(outcome.feedback);
      this.audio.play('edge');
      // The one that finishes him puts him on the ground. It is the only blow
      // that does, which is what makes it read as the end rather than as
      // another dent in the meter.
      if (this.felled) this.scene.fall(this.elapsed, outcome.hit.where);
    }
    const sound = outcomeSound(outcome);
    if (sound && !(outcome.aerial && sound === 'hit')) this.audio.play(sound);
    // What he does once the ball is done with, on some of the balls that call
    // for it (`afterBall`): looking at the bat after a classic drive, and so on.
    // A ball left alone has no stroke, and only a milestone missed off it is
    // taken at all: bowled shouldering arms on 99 is the worst of them.
    {
      const stroke = this.attempt ? this.scene.stroke : null, scored = outcome.madeBatContact && outcome.runs > 0;
      const kind = afterBall(stroke, {
        scored, four: outcome.runs === 4,
        beaten: (!outcome.madeBatContact || !!outcome.edged) && !outcome.hit,
        wicket: outcome.isWicket, milestone: !!this.milestoneDue,
        heartbreak: this.lesson < 0 && !this.felled ? disappointment(this.batterHistory) : null,
        hurt: this.felled ? null : outcome.hit?.where ?? null,
        last: this.lesson < 0 && !!(this.marathon ? this.marathon.ended : this.surviving ? this.ending : this.score.ended),
      }, {
        last: this.lastAfterBall, since: this.afterBallSince, sweeps: this.sweepsScored,
        history: this.batterHistory, pace: PACES[this.mode],
        favourites: this.marathon ? HABITS[(this.marathon.batters.length - 1) % HABITS.length] : undefined,
      }, Math.random());
      if (scored && stroke && !stroke.charging && (stroke.swept || stroke.shot === 'SCOOP' || stroke.shot === 'REVERSE_SCOOP')) this.sweepsScored++;
      this.afterBallSince++;
      // The bowler waits at his mark only as long as he must: he runs in while
      // the batter finishes, and the ball leaves his hand as the batter is back
      // in his guard, not a run-up later. Out, the result is held for him, so
      // that neither the next man nor the end of the innings comes in over it.
      if (kind) {
        const until = this.scene.afterBall(kind, this.elapsed);
        this.bannerUntil = Math.max(this.bannerUntil, until - GAME.runupMs);
        if (outcome.isWicket) this.afterBallUntil = until;
        this.lastAfterBall = kind; this.afterBallSince = 0;
      }
    }
    // The stands for a boundary, once the call is made and not when the ball
    // leaves the bat: a skied one may yet be caught.
    if (!outcome.isWicket && (outcome.runs === 4 || outcome.runs === 6)) {
      // Bigger, and more of the stands up, the more of them have come in a row (`crowd.ts`).
      const streak = boundaryStreak(this.batterHistory);
      this.scene.cheer(outcome.runs === 6 ? 'hit-six' : 'hit-four', this.elapsed, 0, streak, this.batter.name);
      this.audio.cheer(boundaryCheer(outcome.runs, streak, this.test));
    }
    // A wicket goes quiet under a groan; one that cost him a milestone, or a
    // man carried off, is sent off with a softer cheer once it has.
    if (outcome.isWicket || this.felled) {
      // The screen's word for how he went: bowled, out for nothing, or out.
      const runs = this.batterHistory.reduce((sum, ball) => sum + ball.runs, 0);
      this.scene.arenaCue('wicket', this.elapsed, outcome.wicketType === 'BOWLED' ? 'BOWLED' : runs === 0 ? 'DUCK' : 'OUT');
      this.audio.groan(this.test ? GROAN.outTest : GROAN.out);
      this.audio.hushCrowd(HUSH.depth, HUSH.hold, HUSH.recover, HUSH.after);
      if (this.felled || (this.lesson < 0 && outNearMilestone(this.batterHistory))) this.audio.cheer(SEND_OFF, SEND_OFF.after);
    } else if (nearMiss({ test: this.test, express: !!this.delivery?.express, attempted: !!this.attempt, outcome })) {
      this.audio.groan(GROAN.near);
    }
  }
  /**
   * What the board has to say about the innings just played, answered from the
   * board already on screen so nothing waits on the network at the one moment a
   * wait would be felt. A board that has not loaded is not a reason to say
   * nothing: the store ranks it properly either way, and the worst case is an
   * offer that turns out to be a place in the sixties.
   */
  /**
   * What the rank header says under the place: a first innings in this mode,
   * how far a new best climbed, or how far off the fifty a place below it is —
   * read off where the post left the player, however far down.
   */
  private cardNoteFor(rows: readonly { runs: number }[], runs: number): HUD['cardNote'] {
    const first = (heldCareer(this.careerMode).innings ?? 0) <= 1;
    const held = this.standing?.innings === this.innings ? this.standing.standing : null;
    const standing = held ? ('team' in held ? held.team : held) : null;
    if (!standing?.rank) return { first, sub: null };
    if (standing.rank > rows.length && rows.length >= 50) {
      const short = this.careerMode === 'classic' && rows[49] ? rows[49].runs - runs + 1 : null;
      const best = this.careerMode === 'classic' && this.best > 0 ? ` · best ${this.best}` : '';
      return { first, sub: { tone: 'off', text: short && short > 0 ? `${short} runs off the top 50${best}` : `Outside the top 50${best}` } };
    }
    if (this.standing?.improved && standing.was && standing.rank < standing.was.rank) {
      const up = standing.was.rank - standing.rank;
      return { first, sub: { tone: 'new', text: `New best · up ${up} ${up === 1 ? 'place' : 'places'}` } };
    }
    if (this.standing?.improved && standing.was) return { first, sub: { tone: 'new', text: 'New best' } };
    if (!this.standing?.improved && standing.was && !first) {
      const best = this.careerMode === 'classic' && this.best > 0 ? `  \u00b7  ${this.best}` : '';
      return { first, sub: { tone: 'stands', text: `Best still stands${best}` } };
    }
    return { first, sub: null };
  }

  private offerBoard() {
    const played = asInnings(this.score);
    this.hud.cardNote = this.cardNoteFor(this.board, played.runs);
    const offer = cardOffer(this.boardSeen, this.board, played, Date.now(), this.player);
    // An innings that had nothing to offer stays quiet in a private window too:
    // the strip is there to say what is being missed, and a two-run innings was
    // missing nothing.
    this.hud.offerClaim(this.postedOffer(offer), readPlayer(), this.board, played, this.player);
    this.drawHero();
  }

  /** The same, asked of both Marathon ladders and answered on the Marathon's card. */
  private offerMarathon() {
    const played = marathonFigures(this.marathon!);
    const rows = this.marathonShown ?? { team: [], solo: [] };
    const offer = marathonOffer(!!this.marathonRows, rows, { team: teamOf(played), solo: soloOf(played) }, Date.now(), this.player);
    this.hud.cardNote = this.cardNoteFor(rows.team, played.runs);
    this.hud.offerMarathonClaim(this.postedOffer(offer), readPlayer(), rows.team, this.player);
    this.drawHero();
  }

  /** The same, asked of the Test ladder and answered on the Test card. */
  private offerSurvive() {
    const played = this.survived();
    const offer = surviveOffer(this.surviveSeen, this.surviveRows, played, Date.now(), this.player);
    this.hud.cardNote = this.cardNoteFor(this.surviveRows, played.runs);
    this.hud.offerSurviveClaim(this.postedOffer(offer), readPlayer(), this.surviveRows, played, this.player);
    this.drawHero();
  }

  /**
   * The strip's key. An innings already beaten by the player's own row has
   * nothing to register, so its key opens the board; anything else opens the
   * form.
   *
   * The form opens for a returning player too, filled in with the name and kit
   * they last batted under. It used to send straight off, which saved them a tap
   * and left them no way to change either — and an innings that beats their own
   * best is exactly the moment somebody wants a different name on it.
   */
  private startClaim = () => {
    // A private window has no place to claim, and nor does practice, so the key is the board's.
    if (['standing', 'private', 'practice', 'placed'].includes(this.hud.offerKind)) return this.showBoard();
    this.mark('claim-open', 'Claim form opened');
    this.hud.openClaim();
  };

  /**
   * The innings, offered. The store ranks it and answers with the board it
   * made, so where the player actually landed comes back rather than being
   * guessed at — and the board on screen is up to date the moment they open it.
   */
  private async sendClaim() {
    const entry = this.hud.claimEntry.name ? this.hud.claimEntry : readPlayer();
    if (!this.canRegister || this.practising) return this.showBoard();
    if (!entry || !this.player) return this.hud.openClaim();
    // A new name is held to the rules here as well as on the board, so a name
    // that cannot be claimed says why at once rather than after a round trip.
    // The name this browser already bats under is the board's to judge: it was
    // claimed under whatever the rules were then, and goes on working.
    const typed = cleanName(entry.name), mine = readPlayer();
    if (!mine || foldName(mine.name) !== foldName(typed)) {
      const problem = nameProblem(typed, foldName(typed));
      if (problem) {
        this.mark('claim-name-refused', 'Name failed the rules');
        return this.hud.claimFailed(problem);
      }
    }
    this.hud.claimSending(true);
    if (this.hud.offerKind === 'name') return this.sendName(entry.name, entry.avatar);
    // Each mode offers its own innings to its own ladder. The store keeps the
    // two under separate keys, so the mode travels with the figures rather than
    // being inferred from their shape at the far end.
    const result = this.marathoning && this.marathon
      ? await submitMarathon(this.player, entry.name, entry.avatar, marathonFigures(this.marathon))
      : this.surviving
      ? await submitSurvive(this.player, entry.name, entry.avatar, this.survived())
      : await submitInnings(this.player, entry.name, entry.avatar, asInnings(this.score));
    if (this.disposed) return;
    if (!result.ok) {
      this.mark(result.taken ? 'claim-name-taken' : 'claim-failed',
        result.taken ? 'Name already held' : 'Claim rejected');
      return this.hud.claimFailed(result.reason ?? 'That did not go through.', result.taken === true, result.held);
    }
    this.mark('claim-done', 'Innings put on the board');
    writePlayer({ name: entry.name.trim(), avatar: entry.avatar });
    void this.catchUpOnPassword(true);
    // Handed over once and kept nowhere else. If this browser does not write
    // it down now, nothing in the world can show it again — which is exactly
    // what makes it worth asking the player to put it somewhere safe.
    if (result.key) {
      keepKey(result.key);
      track('key-issued', 'Career key issued');
    }
    // The Marathon's two rows, from what the store answered with, and its tab
    // opened on the place just taken. It has no careers to refresh yet.
    if (this.marathoning) {
      if (result.board) this.marathonRows = result.board as MarathonPayload;
      this.hud.claimDone();
      this.boardActions = true;
      this.offerFirstKey();
      return this.openMarathon(this.marathonLadder);
    }
    // Claiming a name is what puts a career already counted onto the career
    // boards, so the copies held from before it are wrong the moment this
    // returns — including the card's, which was drawn with no name on it.
    const claimed = this.careerMode;
    delete this.careerBoards[claimed];
    delete this.myCareer[claimed];
    forgetCareer();
    // The board is where the place the player just took is written, so that is
    // where they are taken — with the keys carried onto it, since it is now the
    // screen they are on.
    this.hud.claimDone();
    // Each call answers with its own ladder's board; which one came back is
    // decided by which one was asked, so the mode is what reads it.
    if (this.surviving) {
      if (result.board) {
        // The rows the claim answered with are newer than anything a fetch
        // started before it can bring back, so that fetch is retired here
        // rather than left to land on top of the place just taken.
        this.surviveEpoch++;
        this.surviveSeen = true;
        this.surviveRows = (result.board as SurvivePayload).rows;
      }
      this.boardActions = true;
      this.offerFirstKey();
      return this.openBoard('survive', 'best');
    }
    if (result.board) {
      this.boardEpoch++;
      this.boardSeen = true;
      this.board = (result.board as BoardPayload).rows;
    }
    // Drawn from what the store just handed back rather than fetched again, so
    // the place the player took is on screen and not a cached fifty from before
    // they took it. The tab is set by hand for the same reason.
    this.boardTab = 'classic';
    // The tab the sheet is showing, as well as the mode it is of. This draws
    // the board by hand rather than through `openBoard`, which is what sets
    // both — and a player who had been looking at My Stats when they
    // registered came back to a sheet whose own tab did nothing, because the
    // row still thought that was where they were.
    this.sheetTab = 'classic';
    this.boardLadder = 'best';
    this.boardActions = true;
    this.offerFirstKey();
    this.hud.board({ rows: this.board, youId: this.player, state: 'ready', actions: true });
  }

  /**
   * A name on its own, for a player whose innings earned no place on a board.
   * Nothing goes on a board, so none is opened: the card stays where it is,
   * the strip goes, and the key comes up over it — the name is what the key
   * opens, and this is the moment there is one.
   */
  private async sendName(name: string, avatar: number) {
    const result = await claimName(this.player!, name, avatar);
    if (this.disposed) return;
    if (!result.ok) {
      this.mark(result.taken ? 'claim-name-taken' : 'claim-failed',
        result.taken ? 'Name already held' : 'Name claim rejected');
      return this.hud.claimFailed(result.reason ?? 'That did not go through.', result.taken === true, result.held);
    }
    this.mark('name-claimed', 'Name claimed without a board place');
    writePlayer({ name: result.name ?? name.trim(), avatar });
    void this.catchUpOnPassword(true);
    if (result.key) {
      keepKey(result.key);
      track('key-issued', 'Career key issued');
    }
    // Every career counted so far is on the career boards under the name now,
    // so the copies held from before it — the card's among them — are stale.
    this.careerBoards = {};
    this.myCareer = {};
    forgetCareer();
    this.hud.claimDone();
    // The card's one slot: it was offering a way back to a player with no
    // name, and holds the key to the name they have now.
    this.hud.offerRestorePanel = this.offerRestoreOnCard();
    this.hud.careerKey(this.careerKeyHeld(), { panel: true, bar: false });
    this.offerFirstKey();
  }

  /**
   * The innings put on the board by itself, for a player with a name: the
   * name was asked for before the first ball and said it goes on the boards,
   * so a place earned is a place taken, with nothing left to press. Not from
   * a private window, nor practice, nor a Rival Match, whose card is the
   * match's — those keep the offers they always had.
   */
  private get autoPosting() {
    return !!readPlayer() && !!this.player && this.canRegister && !this.practising && !this.challenge.playing && !this.demoing;
  }
  /** Which innings has been posted, or is being, and where it landed. */
  private posted: { innings: number; place: number | null; posting: boolean } | null = null;
  /** The innings whose post failed: its card goes back to asking, by hand. */
  private postFailed = 0;
  /** The one post an innings gets, however many ways it is asked for: see `postOnce`. */
  private postFor: { innings: number; result: Promise<SubmitResult<unknown>> } | null = null;
  /**
   * Where the last innings posted left the player on its mode's whole board,
   * and where they stood before it — a place however far below the fifty.
   * Nothing draws it yet; the redrawn end card and board read it (UI v1).
   */
  private standing: {
    innings: number; mode: CareerMode; standing: NonNullable<SubmitResult['standing']>; improved: boolean;
    /** The Marathon's two ladders, each improved or not. */
    by?: { team: boolean; solo: boolean } | null;
  } | null = null;

  /**
   * The offer as the card shows it: a place earned is posted and said as
   * taken; everything else is `shownOffer`'s.
   */
  private postedOffer(offer: CardOffer): CardOffer {
    if (!this.autoPosting || this.postFailed === this.innings) return this.shownOffer(offer);
    // Once the store has said where this innings left the player, that is what
    // the card says — on the fifty or below it, a new best or a best still
    // standing — whatever the board on screen would have guessed.
    const placed = this.placeNow();
    if (placed) return { kind: 'placed', place: placed, posting: false };
    if (this.posted?.innings === this.innings) return { kind: 'placed', place: this.posted.place, posting: this.posted.posting };
    if (offer.kind === 'claim') {
      void this.autoPost(offer.place);
      return { kind: 'placed', place: offer.place, posting: true };
    }
    // Every other innings goes up too, and says nothing: the store keeps only
    // a best, so one that does not beat it changes nothing there, and what it
    // answers is where the player stands — off the bottom of the fifty as
    // readily as on it. The card is the one it always was.
    //
    // Posted whether or not the board is in: the card goes by what the store
    // answers, so a board arriving after the post cannot turn this innings into
    // a best already standing. Until it answers, the card says it is going up.
    void this.quietPost();
    return readPlayer() ? { kind: 'placed', place: null, posting: true } : this.shownOffer(offer);
  }

  /**
   * An innings posted once, whichever way it is asked for. The card can be
   * drawn before the board arrives — no place to offer, so it is posted
   * quietly — and drawn again once it does, with a place to claim; the two
   * share the one post, or the second would find the first already standing
   * and report it as the place the player had before.
   */
  private postOnce(): Promise<SubmitResult<unknown>> {
    const innings = this.innings;
    if (this.postFor?.innings === innings) return this.postFor.result;
    const mine = readPlayer()!, player = this.player!;
    const result: Promise<SubmitResult<unknown>> = this.marathoning && this.marathon
      ? submitMarathon(player, mine.name, mine.avatar, marathonFigures(this.marathon))
      : this.surviving
      ? submitSurvive(player, mine.name, mine.avatar, this.survived())
      : submitInnings(player, mine.name, mine.avatar, asInnings(this.score));
    this.postFor = { innings, result };
    return result;
  }


  /** What every post does with a good answer: the key it may carry, and where it left the player. */
  private tookPost(innings: number, result: SubmitResult<unknown>) {
    if (result.key) {
      keepKey(result.key);
      track('key-issued', 'Career key issued');
    }
    const improved = typeof result.improved === 'object' ? result.improved.team || result.improved.solo : !!result.improved;
    const by = typeof result.improved === 'object' ? { team: !!result.improved.team, solo: !!result.improved.solo } : null;
    if (result.standing) this.standing = { innings, mode: this.careerMode, standing: result.standing, improved, by };
    if (result.around) this.aroundOf = { innings, around: result.around };
    if (innings === this.innings && this.phase === 'INNINGS_END') {
      this.chaseCard(result);
      // Who it went past and who is next, where no chase strip says it already.
      this.hud.cardAround(this.chaseLive ? null : result.around ?? null);
      this.drawHero();
      this.topOfTheBoard(result);
    }
  }

  /** Who the last post went past and who stands next, for the rank hero. */
  private aroundOf: { innings: number; around: NonNullable<SubmitResult['around']> } | null = null;

  /**
   * The end card's player card as the rank hero (Figma 14E): for a named
   * player, once the store has said where the innings left them. Everybody
   * else, and the moment before the store answers, keeps the card as it was.
   */
  private drawHero() {
    const mine = readPlayer();
    const held = this.standing?.innings === this.innings ? this.standing.standing : null;
    const standing = held ? ('team' in held ? held.team : held) : null;
    if (this.phase !== 'INNINGS_END' || !mine?.name || !standing?.rank || this.practising || this.challenge.playing || this.demoing) {
      this.hud.rankHero(null, null);
      return;
    }
    const rows: readonly (BoardRow | TeamRow | SurviveRow)[] = this.marathoning ? this.marathonShown?.team ?? [] : this.surviving ? this.surviveRows : this.board;
    const own = rows.find(row => ownsHandle(row.handle, this.player)) ?? null;
    const survive = this.surviving ? this.survived() : null;
    const runs = this.marathoning && this.marathon ? marathonFigures(this.marathon).runs : survive ? survive.runs : asInnings(this.score).runs;
    const improved = this.standing!.by ? this.standing!.by.team : this.standing!.improved;
    const chase = this.chaseLive;
    let judged: Parameters<typeof heroView>[0]['chase'] = null;
    let bar = '';
    if (chase) {
      const now = standing.rank, was = standing.was?.rank ?? null;
      const said = chase.result
        ? surviveVerdict(chase.name, chase.result, surviveResultOf(this.survived()), { now, was })
        : verdict(chase, this.chaseRuns, { now, was });
      judged = { name: chase.name, target: chase.target, key: chase.result ? surviveGoal(chase.name, chase.result).key : undefined, beat: said.beat, title: said.title, line: said.line };
      if (!said.beat && !chase.result) bar = chaseBarMarkup({ chase, runs: this.chaseRuns, best: this.chaseBest });
    }
    const view = heroView({
      name: mine.name, modeName: HERO_MODE[this.careerMode], place: standing.rank, was: standing.was?.rank ?? null, total: standing.total, improved,
      measure: survive ? 'result' : 'runs',
      innings: { runs, line: survive ? surviveResult(survive) : undefined },
      best: own ? { runs: own.runs, line: survive ? surviveResult(own as SurviveRow) : undefined } : null,
      chase: judged,
      around: this.aroundOf?.innings === this.innings ? this.aroundOf.around : null,
    });
    // The hero says the chase now, so its strip makes way.
    if (chase) this.hud.chaseStrip(null);
    this.hud.rankHero(rankHeroMarkup(view, bar), { innings: this.innings, from: standing.was?.rank ?? null, confetti: !!judged?.beat });
  }

  /**
   * An innings that earned no place, posted for where it leaves the player.
   * The card moves only for a place below the fifty, which it now says: "You
   * are #73". A best that still stands is already on the card.
   */
  private async quietPost() {
    const innings = this.innings;
    if (this.postFor?.innings === innings || !readPlayer() || !this.player) return;
    const result = await this.postOnce();
    if (this.disposed || this.innings !== innings || !result.ok) return;
    this.tookPost(innings, result);
    this.reoffer();
  }

  /** Where the store put the player after this innings, once it has said; null until then. */
  private placeNow(): number | null {
    const held = this.standing?.innings === this.innings ? this.standing.standing : null;
    const standing = held ? ('team' in held ? held.team : held) : null;
    return standing?.rank ?? null;
  }

  /**
   * Once an innings, whatever redraws the card meanwhile. What the store
   * answers with is the board with the player on it, and the place is read off
   * that rather than the one guessed from the board on screen.
   */
  private async autoPost(guess: number | null) {
    const mine = readPlayer(), innings = this.innings;
    if (!mine || !this.player) return;
    this.posted = { innings, place: guess, posting: true };
    const result = await this.postOnce();
    if (this.disposed || this.innings !== innings) return;
    if (!result.ok) {
      // Back to asking, by hand: the key and the form say what went wrong.
      this.mark('auto-post-failed', 'Innings could not be posted by itself');
      this.posted = null;
      this.postFailed = innings;
      return this.reoffer();
    }
    this.mark('auto-posted', 'Innings put on the board by itself');
    this.tookPost(innings, result);
    let rows: readonly { handle: string }[] = [];
    if (this.marathoning) {
      if (result.board) this.marathonRows = result.board as MarathonPayload;
      const team = this.marathonShown?.team ?? [];
      rows = team.some(row => ownsHandle(row.handle, this.player)) ? team : this.marathonShown?.solo ?? [];
    } else if (this.surviving) {
      if (result.board) {
        this.surviveEpoch++;
        this.surviveSeen = true;
        this.surviveRows = (result.board as SurvivePayload).rows;
      }
      rows = this.surviveRows;
    } else {
      if (result.board) {
        this.boardEpoch++;
        this.boardSeen = true;
        this.board = (result.board as BoardPayload).rows;
      }
      rows = this.board;
    }
    // The career boards carry the name now, so the copies from before are stale.
    delete this.careerBoards[this.careerMode];
    delete this.myCareer[this.careerMode];
    forgetCareer();
    const at = rows.findIndex(row => ownsHandle(row.handle, this.player));
    this.posted = { innings, place: at >= 0 ? at + 1 : guess, posting: false };
    this.reoffer();
    this.redrawKeyPlacements();
  }

  /** The strip drawn again for the innings on the card, from what is held now. */
  private reoffer() {
    if (this.phase !== 'INNINGS_END') return;
    if (this.marathoning) this.offerMarathon();
    else if (this.surviving) this.offerSurvive();
    else this.offerBoard();
  }

  /**
   * The first key a player is ever handed, on the beat the board opens on the
   * row they have just taken.
   *
   * Here rather than anywhere earlier because claiming a name is the moment a
   * key starts being worth anything: restoring takes a name and a key
   * together, so before there is a name there is nothing for a key to open.
   * It is closed by hand and never on a clock — a message that takes itself
   * away while somebody is looking at their own name was never read.
   */
  private offerFirstKey() {
    const held = this.careerKeyHeld();
    if (held) this.hud.keyToast(held);
  }

  /**
   * The first ball he is one blow from being carried off.
   *
   * Counted every innings it happens, because "how many players ever meet the
   * injury meter at all" is the question the whole mode turns on and the result
   * events cannot answer it — an innings that goes critical and is then bowled
   * out reports only the bowling.
   *
   * The panel is shown once per device and never again. It pauses first: the
   * gap between deliveries is four hundred milliseconds and a card that arrives
   * inside it would eat a ball the player never saw.
   */
  private turnedCritical() {
    this.wasCritical = true;
    this.mark('critical-reached', 'Batter one blow from being carried off');
    if (SURVIVE_ONLY || hurtNoteSeen()) return;
    this.noticeDue = true;
  }

  /**
   * The notice itself, in the gap between deliveries. It takes the guard phase
   * first and then pauses over it, so dismissing it hands back an innings
   * waiting to bowl rather than one mid-ball.
   */
  private showHurtNote() {
    markHurtNoteSeen();
    this.setPhase('READY');
    this.togglePause();
    this.hud.hurtNote(() => { if (this.phase === 'PAUSED') this.togglePause(); }, this.health.injury);
  }

  /**
   * The innings, counted toward this player's career.
   *
   * Sent after every innings that finishes, with nothing asked of the player
   * and nothing waiting on the answer — the card is already on screen by the
   * time this lands. That is the whole point of it: the career boards say
   * "all time", and an all-time total assembled only out of the innings
   * somebody chose to register would be a total of their good days.
   *
   * A private window is left out, the same way it is left out of claiming a
   * place. Its id does not survive the session, so every innings played in one
   * would open a career that is never added to again.
   *
   * The innings carries an id of its own so it can be sent twice safely, and it
   * is sent twice on purpose: a reply lost on the way back is indistinguishable
   * from a request that never arrived, so the second attempt is the only way to
   * be sure a counted innings was counted — and the store throws away the one
   * it has already seen.
   */
  private countThisInnings() {
    if (!this.player || !this.canRegister || this.practising) return;
    const mode = this.careerMode;
    // The career's own tally, not the board's row: it carries what each batsman
    // made, which the six totals on a row cannot say. The Marathon's is the very
    // innings its boards are sent, every batter's figures with it.
    const tally: BlastTally | SurviveTally | MarathonTally = this.marathon ? marathonFigures(this.marathon)
      : this.surviving ? { ...this.survived(), sixes: this.score.sixes, fours: this.score.fours }
      : blastTally(this.score);
    const nonce = mintNonce();
    const innings = this.innings;
    // What he batted in, for the year recap: read now, as it was worn, not when the answer lands.
    const worn = this.myLook(), look = { kit: worn.outfit.id, bat: worn.bat.id };
    // The career as it stood before this innings, read before it is sent,
    // because the climb is the difference between the two and there is
    // nowhere else it is written down. Read here and not when the answer
    // lands: `countInnings` writes the answer into the mirror before handing
    // it back, so a mirror read then is already the new career and nothing
    // would ever have been climbed. The mirror stands in on the first innings
    // of a session, when nothing has been fetched yet: it is this browser's
    // own last word on the career and it is what the card would have drawn.
    const was = this.myCareer[mode]?.career ?? heldCareer(mode);
    let climbed = false;
    const send = () => countInnings<AnyCareer>(this.player!, mode, tally, readPlayer(), nonce, look).then(mine => {
      if (this.disposed) return true;
      if (!mine?.career) return false;
      const granted = mine.granted ?? null;
      // A first innings is an arrival, not a climb, for the count.
      this.markClimb(mode, was.innings ? was : null, mine.career, granted);
      // The screen, though, is for anybody the innings carried onto a new
      // rung — once, though the innings may be sent twice — and only while
      // its card is still the one up.
      const rung = climbedTo(mode, was, mine.career, granted);
      const levelling = !!rung && !climbed && !this.demoing && this.innings === innings && this.phase === 'INNINGS_END';
      if (rung) climbed = true;
      if (levelling) this.showLevelUp(mode, was, mine.career, granted);
      this.myCareer[mode] = {
        career: mine.career, name: mine.name, avatar: mine.avatar, granted: mine.granted ?? null,
      };
      // The boards held from before this innings no longer have it on them, so
      // the next open asks again rather than drawing a career one innings old.
      delete this.careerBoards[mode];
      this.unlocksAfter(innings);
      return true;
    });
    void send().then(landed => {
      if (landed || this.disposed) return;
      setTimeout(() => { if (!this.disposed) void send(); }, RETRY_MS);
    });
  }

  /**
   * A rung climbed, counted once.
   *
   * The ladder is the whole argument for a career board — an all-time total
   * nobody is climbing is a list — and until now nothing said whether anybody
   * was climbing it. It is the rarest event the game sends and the one that
   * says most: a rung nobody reaches is the same as no rung at all, and that is
   * a sentence about thresholds that only this can settle.
   *
   * Once per rung per session, because the innings that carries a player over
   * is deliberately sent twice — a reply lost on the way back is
   * indistinguishable from a request that never arrived — and a promotion
   * counted twice is a promotion that did not happen.
   */
  private markClimb(mode: CareerMode, was: AnyCareer | null, now: AnyCareer, granted: Granted | null) {
    const climbed = climbedTo(mode, was, now, granted);
    if (climbed) this.markOnce(`tier-${climbed.key}`, `Reached ${climbed.name}`);
  }

  /** Level Up, while it is up. */
  private levelUp: LevelUp | null = null;
  /**
   * Level Up (`src/ui/LevelUp.ts`): the full screen for an innings that
   * carried the career onto a new rung, over the innings card, which GO TO
   * SCORECARD hands back to. The unlocks the same innings earned wait for it
   * and follow it. A preview (`?levelup=1`, `__cricket.levelUp`) counts and
   * shares nothing of its own and is followed by nothing.
   */
  private showLevelUp(mode: CareerMode, was: AnyCareer, now: AnyCareer, granted: Granted | null, preview = false, tries = 0) {
    if (this.levelUp || this.disposed) return;
    // New #1 goes first: a climb the same innings earned waits for it, and for
    // the store's answer to the post to say whether there is one, a few tries.
    if (this.topSpot) { this.levelUpAfter = () => this.showLevelUp(mode, was, now, granted, preview); return; }
    const answering = !preview && this.phase === 'INNINGS_END' && this.postFor?.innings === this.innings && this.standing?.innings !== this.innings;
    if (answering && tries < 10) {
      const innings = this.innings;
      window.setTimeout(() => { if (!this.disposed && this.innings === innings && this.phase === 'INNINGS_END') this.showLevelUp(mode, was, now, granted, preview, tries + 1); }, 500);
      return;
    }
    const batting = readPlayer();
    const who = batting?.name ? { name: batting.name, avatar: batting.avatar ?? 0 } : null;
    const standing = bestStanding(mode, placesOf(this.careerBoards[mode]?.boards ?? {}, this.player));
    const factsOf = (career: AnyCareer) => statsFacts(mode, career, { name: who?.name ?? '', avatar: who?.avatar ?? 0, granted }, standing);
    const before = factsOf(was), after = factsOf(now);
    this.putRatingAway();
    if (!preview) this.mark(`levelup-${after.tier.key}`, `Level up: ${after.tier.name}`);
    this.levelUp = new LevelUp(this.hud.viewport, { before, after, who }, {
      share: status => {
        if (!preview) this.mark('levelup-share', 'Shared the card from Level up');
        return this.hud.shareCareer(after, status);
      },
      scorecard: () => {
        if (!preview) this.mark('levelup-scorecard', 'Went on to the scorecard from Level up');
        this.closeLevelUp(!preview);
      },
      cheer: (size, at) => this.audio.cheer({ size, peak: size === 'big' ? .75 : .55, decay: 2.4, swell: .35 }, at),
    });
  }
  private closeLevelUp(thenUnlocks: boolean) {
    if (!this.levelUp) return;
    this.levelUp.close();
    this.levelUp = null;
    document.querySelector<HTMLElement>('#end:not(.hidden) .k-cta')?.focus({ preventScroll: true });
    // New #1 decided while Level Up was up plays now, and the unlocks wait in the room behind it.
    const top = this.topAfter;
    this.topAfter = null;
    if (top && this.phase === 'INNINGS_END') this.showTopSpot(top);
    if (thenUnlocks && this.phase === 'INNINGS_END') this.celebrateUnlocks();
  }
  /** New #1 decided while Level Up was already up: it follows Level Up rather than being lost. */
  private topAfter: TopSpotView | null = null;
  /** New #1, while it plays. */
  private topSpot: TopSpot | null = null;
  /** A Level Up the same innings earned, waiting for New #1 to finish. */
  private levelUpAfter: (() => void) | null = null;
  /** The innings New #1 has played for: once an innings, however many times the store is asked. */
  private topTaken = -1;

  /**
   * New #1 (Figma section 15, `src/ui/TopSpot.ts`): when the store's answer
   * to the post says this innings took the top of a board it was not the top
   * of before. A named player's real innings only: never practice, a Rival
   * Match or a demo, and a private window or a guest posts nothing to answer.
   */
  private topOfTheBoard(result: SubmitResult<unknown>) {
    const mine = readPlayer();
    const held = result.standing;
    if (!held || !mine?.name || this.topTaken === this.innings || this.practising || this.challenge.playing || this.demoing) return;
    const standing = 'team' in held ? held.team : held;
    if (!tookTheTop(standing.rank, standing.was?.rank ?? null)) return;
    const survive = this.surviving ? this.survived() : null;
    const board: readonly (BoardRow | TeamRow | SurviveRow)[] = this.marathoning
      ? (result.board as MarathonPayload | undefined)?.team.rows ?? this.marathonShown?.team ?? []
      : this.surviving ? (result.board as SurvivePayload | undefined)?.rows ?? this.surviveRows
      : (result.board as BoardPayload | undefined)?.rows ?? this.board;
    const runs = this.marathoning && this.marathon ? marathonFigures(this.marathon).runs : survive ? survive.runs : asInnings(this.score).runs;
    // The player first, as the store has them now, then everybody else in order.
    const rows = [
      { name: mine.name, avatar: mine.avatar ?? 0, runs, you: true, line: survive ? surviveResult(survive) : undefined },
      ...board.filter(row => !ownsHandle(row.handle, this.player)).map(row => ({
        name: row.name, avatar: row.avatar, runs: row.runs, you: false, line: this.surviving ? surviveResult(row as SurviveRow) : undefined,
      })),
    ];
    const view = topSpotView({ mode: this.careerMode, you: { name: mine.name, avatar: mine.avatar ?? 0 }, rows, was: standing.was?.rank ?? null, measure: survive ? 'result' : 'runs' });
    // The top of an empty board is not taken from anybody.
    if (!view?.second) return;
    this.topTaken = this.innings;
    this.mark(`top-${this.careerMode}`, 'Took the top of a board');
    this.showTopSpot(view);
  }

  private showTopSpot(view: TopSpotView) {
    if (this.topSpot || this.disposed) return;
    if (this.levelUp) { this.topAfter = view; return; }
    // An unlock already up gives way: one celebration is the end of an innings.
    if (this.unlock) { this.unlock.close(); this.unlock = null; }
    this.putRatingAway();
    this.topSpot = new TopSpot(this.hud.viewport, view, {
      card: () => document.querySelector<HTMLElement>('#end:not(.hidden)') ?? document.querySelector<HTMLElement>('#end-survive:not(.hidden)'),
      target: () => document.querySelector<HTMLElement>('#card-hero:not(.hidden) .rh-place'),
      cheer: () => this.audio.cheer({ size: 'big', peak: .8, decay: 2.6, swell: .3 }),
      done: () => {
        this.topSpot = null;
        const next = this.levelUpAfter;
        this.levelUpAfter = null;
        if (next) next();
        else document.querySelector<HTMLElement>('#end:not(.hidden) .k-cta')?.focus({ preventScroll: true });
      },
    });
  }

  /** New #1 by board over a made-up board: the preview's keys and the checks'. */
  private previewTopSpot(mode: CareerMode = this.careerMode) {
    this.topSpot?.close();
    const result = mode === 'survive';
    const made = (name: string, avatar: number, runs: number, balls: number) => ({ name, avatar, runs, you: false, line: result ? `Won off ${balls} balls` : undefined });
    const runsOf = mode === 'marathon' ? [412, 403, 398, 390, 385] : mode === 'survive' ? [96, 91, 88, 84, 80] : [154, 150, 148, 145, 141];
    const mine = readPlayer();
    const you = { name: mine?.name || 'You', avatar: mine?.avatar ?? 1 };
    const rows = [
      { ...you, runs: runsOf[0], you: true, line: result ? 'Won off 38 balls' : undefined },
      made('Riya', 0, runsOf[1], 41), made('Kabir', 3, runsOf[2], 44), made('Meera', 4, runsOf[3], 47), made('Arjun', 2, runsOf[4], 52),
    ];
    const view = topSpotView({ mode, you, rows, was: 6, measure: result ? 'result' : 'runs' });
    if (view) this.showTopSpot(view);
  }

  /** Level Up for a rung, by name, over whatever is on screen: the preview's keys and the checks'. */
  private previewLevelUp(key: string, mode: CareerMode = this.careerMode) {
    const rung = Math.max(1, TIERS.findIndex(one => one.key === key));
    const tier = TIERS[rung] ?? TIERS[2], below = TIERS[rung - 1];
    const field = mode === 'survive' ? 'balls' : 'runs';
    const held = heldCareer(mode);
    // Just short of the rung before, a little over it after: the innings that tipped it.
    const step = Math.max(1, Math.round((tier.at[mode] - below.at[mode]) * .03));
    const was = { ...held, [field]: tier.at[mode] - step, innings: Math.max(1, held.innings) } as AnyCareer;
    const now = { ...held, [field]: tier.at[mode] + step * 2, innings: Math.max(2, held.innings + 1) } as AnyCareer;
    this.closeLevelUp(false);
    this.showLevelUp(mode, was, now, null, true);
  }

  private end() {
    this.setPhase('INNINGS_END');
    this.hud.rankHero(null, null);
    this.chaseCard();
    this.hud.cardAround(null);
    this.countThisInnings();
    // Toward the end of a newcomer's help, by the same rule as the career: only
    // an innings finished counts, so walking out on one does not keep it going.
    if (!this.practising) notePlayed(this.careerMode, readStored, writeStored);
    this.rateThisInnings();
    // Both cards get it, and it is asked for before the modes part company
    // below: the innings that just ended is a different innings in each of
    // them, but the screen it ends on is the same screen.
    this.audio.music('result');
    [...strokeMarks(this.spinPulls, COUNTED.spinPull), ...strokeMarks(this.hooks, COUNTED.hook)].forEach(([name, title]) => this.mark(name, title));
    if (this.marathon) {
      // The Blast's card with the worm and the batting card under the total,
      // the boards' strip on it, and the way to the career it has just added to.
      const marathon = this.marathon;
      this.mark('innings-end', 'Innings completed');
      this.mark(inningsBand(this.playedMs - this.inningsFrom), 'How long the innings took');
      this.mark(`ended-${marathon.ending!.toLowerCase().replace('_', '-')}`, `Ended: ${marathon.ending}`);
      // What it made, the most one man made of it, and how long it went: the
      // three things the boards rank on and the tuning is done in.
      this.mark(marathonTotalBand(this.score.runs), 'Total');
      this.mark(marathonBestBand(Math.max(0, ...marathonFigures(marathon).batters.map(one => one.runs))), 'Best individual score');
      this.mark(marathonOversBand(this.score.balls), 'Overs batted');
      this.hud.endMarathon(this.score, marathon, (heldCareer('marathon') as MarathonCareer).highest || null);
      this.hud.career(this.canRegister, readPlayer()?.avatar ?? null);
      this.hud.offerRestorePanel = this.offerRestoreOnCard();
      this.hud.careerKey(this.careerKeyHeld(), { panel: true, bar: false });
      this.offerPassword(null);
      this.offerMarathon();
      // Both ladders, fresh, and the offer asked again once they are here: an
      // innings this long outlives whatever was fetched before it.
      void fetchMarathonBoard(true).then(payload => {
        if (this.disposed || !payload || this.phase !== 'INNINGS_END' || this.marathon !== marathon) return;
        this.marathonRows = payload;
        if (!this.hud.claimOpen) this.offerMarathon();
      });
      return;
    }
    if (this.surviving) {
      // Survive keeps its own best, its own card and its own board. It is
      // deliberately kept off the classic one: the two innings are not
      // comparable and a Survive score standing next to a thirty-ball one would
      // be nonsense in both directions.
      const ending = this.ending ?? 'DRAWN';
      // The classic end block below is never reached from here, so the Test
      // match reports its own. The result rather than the ending, because the
      // result is what the player was actually shown — and it carries the
      // ending anyway, with the close losses split off from the rest.
      this.mark('innings-end', 'Innings completed');
      this.mark(inningsBand(this.playedMs - this.inningsFrom), 'How long the innings took');
      this.mark(`result-${resultOf(ending, this.score.runs, this.score.balls).toLowerCase()}`, `Ended: ${ending}`);
      this.mark(scoreBand(this.score.runs), 'Runs');
      this.mark(ballsBand(this.score.balls), 'Balls faced');
      // What the meter finished on, in bands, so the live spread can be read
      // against the simulator's — the tuning is done in those terms.
      this.mark(injuryBand(this.health.injury), 'Injury');
      this.mark(blowsBand(this.health.blows.length), 'Blows taken');
      this.hud.endSurvive(this.score, this.health, ending, this.chasing);
      // The widget follows the strip onto whichever card is up, so this card
      // has one now — and it opens the Test career, because `showStats` reads
      // the mode from the innings that has just ended.
      this.hud.career(this.canRegister, readPlayer()?.avatar ?? null);
      this.hud.offerRestorePanel = this.offerRestoreOnCard();
      this.hud.careerKey(this.careerKeyHeld(), { panel: true, bar: false });
      this.offerPassword(null);
      this.offerSurvive();
      return;
    }
    // Practice does not move this browser's own best either.
    const record = !this.practising && this.score.runs > this.best;
    if (!this.practising) {
      this.best = Math.max(this.best, this.score.runs);
      try { localStorage.setItem('hitman-best', String(this.best)); } catch { /* A session remains playable without persistence. */ }
    }
    this.mark('innings-end', 'Innings completed');
    this.mark(inningsBand(this.playedMs - this.inningsFrom), 'How long the innings took');
    this.mark(this.score.wickets >= this.score.limits.maxWickets ? 'innings-all-out' : 'innings-overs-up',
      this.score.wickets >= this.score.limits.maxWickets ? 'Innings ended all out' : 'Innings ended, overs up');
    this.mark(scoreBand(this.score.runs), `Innings scored ${scoreBand(this.score.runs).replace('score-', '').replace(/-/g, ' to ')} runs`);
    // A chase answers itself the moment it ends, and the reveal replaces the
    // ordinary card: the scoreline is what the player has been waiting thirty
    // balls for, and the card behind it would be the wrong first thing to see.
    if (this.challenge.playing) { this.matchCard = record; void this.finishMatch(); return; }
    this.showBlastCard(record);
  }

  /** The five-over card, with the strip, the key and the board under it. */
  private showBlastCard(record: boolean, fromMatch = false) {
    // Super10's card is the Blast's in its own colours, with the batting card
    // and no best of its own to quote yet.
    if (this.super10) this.hud.endSuper10(this.score, record, this.s10.surged);
    else this.hud.end(this.score, this.best, record);
    this.hud.matchScorecard(fromMatch);
    // The way to the career card from the innings card. Offered only where a
    // career is actually being kept: a private window counts nothing, so a
    // widget there would lead to a card of noughts that never fills.
    this.hud.career(this.canRegister, readPlayer()?.avatar ?? null);
    // The same strip as the Test card's, and it was missing here. Both cards
    // share these nodes — `hostStrip` moves them rather than drawing a second
    // set — so a slot the Blast path never fills is not empty, it is holding
    // whatever the Test path last put in it.
    this.hud.offerRestorePanel = this.offerRestoreOnCard();
    this.hud.careerKey(this.careerKeyHeld(), { panel: true, bar: false });
    this.offerPassword(record ? this.score.runs : null);
    // On every card, first innings included. It was held back for a second
    // innings on the theory that the first card belongs to the score and the
    // board — but a line nobody ever sees asks nothing at all, and most people
    // who play once play once.
    this.hud.offerFeedback({ card: true, cover: this.best > 0 });
    this.offerBoard();
  }
  /* ── The match room ────────────────────────────────────────────────── */

  /**
   * Who this browser bats as.
   *
   * The name and kit are the ones the board already knows — a player who has
   * claimed a place keeps both, and one who has not gets the kit their own id
   * deals them. A match never asks for a kit: it is the same person, and being
   * asked to pick a colour twice is the kind of thing that makes a game feel
   * like a form.
   */
  private get batter() {
    const held = readPlayer();
    return {
      name: held?.name ?? '',
      avatar: held?.avatar ?? kitDeal(this.player).opening,
    };
  }

  /** The same, with the id, for anything that writes to a room. */
  private get me(): Me | null {
    if (!this.player) return null;
    const { name, avatar } = this.batter;
    return { playerId: this.player, name, avatar };
  }

  /**
   * The ghost's ball, flashed in the gap after the player's own result.
   *
   * There are 2,440ms between one ball resolving and the next leaving the
   * bowler's hand. The player's own result owns the first beat of that; this
   * takes the second, and is gone before the run-up finishes. Nothing about the
   * other innings ever appears while a ball is in the air. Against a friend
   * batting at the same time the card is whatever the last poll brought, so a
   * friend who is behind shows nothing yet — and nothing on this screen ever
   * says how far along they are.
   */
  private flashGhost(index: number) {
    const balls: GhostBall[] = [];
    for (const ghost of this.challenge.ghosts) {
      const ball = this.challenge.ghostBall(ghost, index);
      if (ball) {
        balls.push({
          who: ghost.name, avatar: ghost.avatar,
          result: ball.isWicket ? 'OUT' : ball.runs === 0 ? 'DOT' : String(ball.runs),
          kind: ball.isWicket ? 'out' : ball.runs >= 4 ? 'big' : 'runs',
        });
      } else if (this.challenge.ghostEndedAt(ghost) === index) {
        // Past the end of their innings there is nothing to show but the fact
        // of it, said once, on the ball it happened: silence after that reads
        // as the feature being broken, and the moment is worth more than the
        // secrecy.
        balls.push({ who: ghost.name, avatar: ghost.avatar, result: 'ALL OUT', kind: 'out' });
      }
    }
    if (!balls.length) return;
    window.setTimeout(() => {
      this.hud.ghost(balls);
      // A little longer for a stack, but never into the next run-up.
      window.setTimeout(() => this.hud.ghostAway(), GHOST_FOR_MS + Math.min(300, (balls.length - 1) * 150));
    }, GHOST_AFTER_MS);
  }

  /**
   * The hero card on the picker. A room is made on the spot — there is nothing
   * to bat first — and the only thing that can stand in the way is a player
   * the game has never had a name for.
   */
  private async openMatch(extra: { card?: string; rematchOf?: string } = {}) {
    if (!this.player) return;
    if (!this.batter.name) {
      // Never given a name, so the room asks for one in its own words. The
      // board's claim form is a different offer — its key says PUT ME ON THE
      // BOARD — and sending somebody there to send a friend a link is a
      // non-sequitur they would have to read twice.
      this.asking = 'create';
      this.roomExtra = extra;
      this.hud.closeModes();
      this.hud.challengeWhoAreYou(null);
      return;
    }
    await this.createRoom(extra);
  }
  private roomExtra: { card?: string; rematchOf?: string } = {};

  /** A name typed on the panel, taken or refused. */
  private takeName(): string | null {
    const name = this.hud.challengeName.trim() || this.batter.name;
    if (!name) { this.hud.challengeJoinError('A name, so they know who to be scared of.'); return null; }
    if (nameBlocked(name)) { this.hud.challengeJoinError(NAME_BLOCKED_REASON); return null; }
    if (name !== readPlayer()?.name) writePlayer({ name, avatar: this.batter.avatar });
    this.hud.challengeJoinError(null);
    return name;
  }

  private async nameThenCreate() {
    if (!this.takeName()) return;
    this.hud.closeChallenge();
    await this.createRoom(this.roomExtra);
    this.roomExtra = {};
  }

  /**
   * A room made, and opened.
   *
   * Whatever the tap came from stays on the screen while the room is made,
   * and gives way to the room in the same moment it is drawn: taking the
   * picker down first left the start screen showing through for as long as
   * the server took. A second tap while the first is still out is ignored,
   * or an impatient thumb makes two rooms.
   */
  private async createRoom(extra: { card?: string; rematchOf?: string } = {}) {
    const me = this.me;
    if (!me || this.creatingRoom) return;
    this.creatingRoom = true;
    try {
      const answer = await this.challenge.create(me, extra);
      if (!answer.ok || !answer.challenge) {
        this.hud.offline(answer.reason ?? null);
        return;
      }
      track(extra.rematchOf ? 'challenge-rematch' : 'challenge-set', extra.rematchOf ? 'Rematch made' : 'Match room made');
      this.pinRoom(answer.challenge.code);
      this.hud.closeModes();
      this.showRoom();
    } finally {
      this.creatingRoom = false;
    }
  }
  private creatingRoom = false;

  /** The room's code on the address bar, so a reload lands back in it. */
  private pinRoom(code: string | null) {
    try {
      const url = new URL(location.href);
      if (code) url.searchParams.set(CODE_PARAM, code); else url.searchParams.delete(CODE_PARAM);
      history.replaceState(history.state, '', url);
    } catch { /* Then the link in their messages is the way back. */ }
  }

  /**
   * The room, drawn for this person and kept fresh.
   *
   * The screen is redrawn from every poll, so a friend joining, a ball
   * landing and a result arriving all appear without anybody pressing
   * anything. The one thing a redraw must not do is take a key out from under
   * a thumb mid-press, which is why the keys are the same keys in the same
   * order for as long as the room is in the same state.
   */
  private showRoom(interstitial?: { index: number; total: number }) {
    if (!this.player) return;
    const view = this.challenge.view(this.player);
    if (!view) return;
    this.audio.music('cover');
    const card = this.matchCard !== null && this.phase === 'INNINGS_END';
    this.hud.room(view, { sent: this.challenge.sent, interstitial, card });
    if (this.demoing) return;
    if (view.result) this.settle(view);
    let last = view.kind;
    this.challenge.watch(() => {
      if (!this.hud.roomOpen || !this.player) return;
      const fresh = this.challenge.view(this.player);
      if (!fresh) return;
      this.hud.room(fresh, { sent: this.challenge.sent, interstitial, card });
      if (fresh.result && last !== 'result') this.settle(fresh);
      last = fresh.kind;
    });
  }

  /** A result this person has just seen: noted against the friend, and marked seen. */
  private settle(view: RoomView) {
    if (!view.result) return;
    const me = this.me;
    if (!me) return;
    noteResult(view.result);
    if (!view.mine?.seen && !seenHere(view.code)) {
      track(`challenge-${view.result.outcome === 'W' ? 'won' : view.result.outcome === 'D' ? 'drew' : 'lost'}`, 'Match result seen');
      if (view.result.forfeit) track('challenge-by-forfeit', 'Match decided by a walkout or a decline');
      track(`challenge-players-${roomBand(view.result.players.length)}`, 'Match size at the result');
      void this.challenge.seen(me);
    }
  }

  /** Out of the room. Back to wherever makes sense, which is always the picker. */
  /** From the innings card back to the match result it was opened from. */
  private backToResult() {
    this.hud.hideScorecard();
    this.showRoom();
  }

  private leaveRoom() {
    this.challenge.stopWatching();
    this.hud.closeRoom();
    this.pinRoom(null);
    if (this.demoing) {
      this.demoing = false;
      try { const url = new URL(location.href); url.searchParams.delete('room'); history.replaceState(history.state, '', url); } catch { /* fine */ }
    }
    // The room hid the cover on the way in; the picker stands over the cover,
    // so it has to be back before the picker's own way out lands on nothing.
    if (this.phase === 'START') this.hud.showCover();
    this.challenge.clear();
    this.modes();
  }
  /**
   * Whether the innings that just ended has a card to show, and whether it
   * was a record. A match ends on the room rather than the card, but the card
   * is where the Top 50 is claimed, so the room keeps a way to it.
   */
  private matchCard: boolean | null = null;
  /** Whether the room on screen is a fixture. Nothing is written while it is. */
  private demoing = false;

  /** What the room's keys do. */
  private async roomAct(act: RoomAct) {
    const me = this.me;
    const code = this.challenge.code;
    if (!me || !code) return;
    const view = this.challenge.view(me.playerId);
    switch (act) {
      case 'invite':
      case 'share':
        this.challenge.sent = true;
        this.hud.inviteSheet(code ? challengeLink(code) : '');
        return;
      case 'nudge':
        window.open(whatsapp(copy.nudge(challengeLink(code))), '_blank', 'noopener');
        return;
      case 'play':
      case 'resume':
        this.startMatchInnings(act === 'resume');
        return;
      case 'rematch': {
        const them = view?.result?.them;
        const tally = them ? rivalryView(them.handle, them)?.tally ?? null : null;
        this.rematchLine = them && tally ? { them: them.name, tally } : null;
        this.challenge.stopWatching();
        await this.createRoom({ rematchOf: code });
        return;
      }
      case 'new':
        this.rematchLine = null;
        this.challenge.stopWatching();
        // Through the door the Rivals card uses, which asks a first-timer for
        // a name: straight to the room, a player with none made nothing.
        await this.openMatch();
        return;
      case 'join': {
        const answer = await this.challenge.join(me);
        if (!answer.ok) { this.hud.offline(answer.reason ?? null); return; }
        this.showRoom();
        return;
      }
      case 'next':
        this.nextResult();
        return;
      case 'list':
        await this.showChallenges();
        return;
      case 'card': {
        const record = this.matchCard;
        if (record === null) return;
        this.challenge.stopWatching();
        this.hud.closeRoom();
        this.audio.music('result');
        this.showBlastCard(record, true);
        return;
      }
      case 'decline':
        await this.declineMatch();
        return;
      case 'home':
      case 'solo':
      case 'retry':
        if (this.pending.length) { this.nextResult(); return; }
        this.leaveRoom();
        return;
    }
  }

  /** The message the invite goes out with: the taunt, and the link. */
  private inviteText(): string {
    const code = this.challenge.code;
    if (!code) return '';
    const link = challengeLink(code);
    const mine = this.player ? this.challenge.row(this.player) : null;
    const batted = !!mine && (mine.status === 'done' || mine.status === 'forfeit');
    return this.rematchLine ? copy.rematch(link, this.rematchLine.them, this.rematchLine.tally) : batted ? copy.set(link) : copy.invite(link);
  }

  /** SHARE on the invite: the phone's own sheet where there is one, WhatsApp where there is not. */
  private async shareInvite() {
    const text = this.inviteText();
    if (!text) return;
    track('challenge-shared', 'Match link shared');
    if (navigator.share) {
      try { await navigator.share({ text }); } catch { /* Dismissed, which is not a failure. */ }
      return;
    }
    window.open(whatsapp(text), '_blank', 'noopener');
  }

  /** COPY LINK on the invite. The taunt goes with it, so a paste is a message. */
  private async copyInvite() {
    const text = this.inviteText();
    if (!text) return;
    track('challenge-copied', 'Match link copied');
    try {
      await navigator.clipboard.writeText(text);
      this.hud.inviteNote('Copied. Now go and paste it somewhere they\u2019ll see it.');
    } catch {
      this.hud.inviteNote(challengeLink(this.challenge.code ?? ''));
    }
  }

  /**
   * The match turned down, defeat and all. From the sheet a link lands on, or
   * from a row of Rival Matches. A name is needed to be recorded against, so
   * somebody who has never given one is written down as the stranger they are.
   */
  private async declineMatch(code?: string) {
    if (!this.player) return;
    if (code && code !== this.challenge.code) {
      const opened = await this.challenge.open(code);
      if (!opened.ok) { this.hud.offline(opened.reason ?? null); return; }
    }
    const me = this.me;
    if (!me) return;
    const name = me.name || this.hud.challengeName.trim() || 'Someone';
    const answer = await this.challenge.decline({ ...me, name });
    if (!answer.ok) {
      if (answer.retry) { this.hud.offline(null); return; }
      this.hud.challengeJoinError(answer.reason ?? 'Could not decline the match.');
      return;
    }
    track('challenge-declined', 'Match declined');
    this.hud.closeChallenge();
    this.pinRoom(null);
    this.challenge.clear();
    if (this.phase === 'START') this.hud.showCover();
    await this.showChallenges();
  }
  private rematchLine: { them: string; tally: string } | null = null;

  /**
   * The innings, in the room's colours.
   *
   * The same thirty balls, the same bowler, the same resolver. What changes is
   * that every ball is written to the room as it happens, the ghost flashes in
   * the gaps, and the end of the innings goes back to the room rather than to
   * the card. Picking up an innings left mid-way replays the balls already
   * faced into a fresh scoreboard, and the bowler carries on from there.
   */
  private startMatchInnings(resume: boolean) {
    if (!this.player) return;
    this.matchCard = null;
    this.hud.closeRoom();
    this.challenge.beginInnings(this.player);
    this.rematchLine = null;
    track(resume ? 'challenge-resumed' : 'challenge-accepted', resume ? 'Match innings resumed' : 'Match innings started');
    // Whether the friend is batting at the same time — the live match the
    // polling exists for — or this is the innings that answers one played
    // earlier. The pair is what says which of the two ways people use it.
    if (!resume) track(this.challenge.ghostBatting ? 'challenge-live' : 'challenge-apart', this.challenge.ghostBatting ? 'Match batted together' : 'Match batted apart');
    this.mode = 'CLASSIC';
    this.start();
    // Dressed by `start` like any innings: in his own Dressing Room kit and
    // bat, which the room keeps with his innings.
    if (resume) {
      for (const ball of this.challenge.resumeFrom(this.player)) {
        const outcome: ShotOutcome = {
          runs: ball.runs as ShotOutcome['runs'], isWicket: ball.isWicket, quality: 0.5, feedback: '',
          timingGrade: 'OK', timingDeltaMs: null, compatibility: 0, madeBatContact: !ball.isWicket, aerial: false,
        };
        this.score.record(outcome); this.generator.record(outcome); this.confidence.record(outcome);
      }
      this.hud.score(this.score); this.showConfidence();
    }
    // Kept fresh while anybody else is still batting, so their balls arrive in
    // time to flash. Once they are all done, or nobody started, there is
    // nothing a poll could bring and it stops on its own.
    this.challenge.watch(() => {
      if (!this.challenge.ghostBatting) this.challenge.stopWatching();
    });
    if (!this.challenge.ghostBatting) this.challenge.stopWatching();
  }

  /**
   * The innings, over. The last card has to land before the room can say
   * anything — the reveal is what the player waited five overs for — and if it
   * will not, the ordinary card goes up with a word, and the innings is sent on
   * the next open.
   */
  private async finishMatch() {
    const me = this.me;
    if (!me) return;
    if (this.demoing) { this.hud.end(this.score, this.best, false); this.challenge.playing = false; return; }
    const answer = await this.challenge.finishInnings(me, this.score.history);
    if (!answer.ok || !answer.challenge) {
      this.hud.end(this.score, this.best, false);
      this.hud.claimFailed(answer.reason ?? 'Your innings is saved and will be sent when you are back online.');
      return;
    }
    track('challenge-answered', 'Match innings sent');
    this.showRoom();
  }

  /**
   * What was waiting when the game was opened.
   *
   * Three things, in the order they matter: an innings that never reached the
   * server, a link that was tapped, and results this person has not yet seen.
   * None of them costs a call unless there is something to ask about — except
   * the last, which is one call on every open, because there is no push
   * notification on the web worth having and this is how somebody finds out
   * they were beaten on Thursday.
   */
  private async openChallenges() {
    if (!this.player) return;
    // `?room=won` and its siblings: one face of the room, drawn from a fixture
    // and saving nothing, so every state can be looked at on one phone. The
    // room is not watched, because there is nothing behind it to watch.
    const demo = roomDemoWanted();
    if (demo) {
      const { room, interstitial, sent } = demoRoom(demo, this.player);
      this.challenge.room = room;
      this.challenge.sent = sent ?? false;
      this.demoing = true;
      this.hud.room(this.challenge.view(this.player)!, { sent: sent ?? false, interstitial });
      return;
    }
    void ChallengeRun.retryUnsent(this.player);

    const opened = await this.challenge.fromLink();
    if (opened) {
      if (!opened.ok || !opened.challenge) {
        this.hud.offline(opened.retry ? null : opened.reason ?? null);
        return;
      }
      if (this.challenge.isIn(this.player)) { this.showRoom(); return; }
      const view = this.challenge.view(this.player);
      // A room that is over for good is shown as it stands. One that is
      // finished but still open takes a third batter — that is how a forwarded
      // link becomes a leaderboard — so it is offered like any other.
      if (view && (view.state === 'expired' || view.kind === 'void' || view.kind === 'full')) { this.showRoom(); return; }
      // Not in it yet: who it is from, and a way in. The host, unless somebody
      // else has already batted — then the innings to beat is the one to name.
      const rows = opened.challenge.players;
      const batted = rows.find(row => row.status === 'done' || row.status === 'batting') ?? null;
      const from = batted ?? rows.find(row => row.host) ?? rows[0] ?? null;
      this.asking = 'join';
      track('challenge-opened', 'Match link opened');
      this.hud.challengeFrom(from, view?.closes ?? '', readPlayer(), !!batted);
      return;
    }

    await this.syncChallenges();
  }

  /** The name given, then the room joined under it. */
  private async nameThenJoin() {
    const me = this.me;
    if (!this.takeName() || !me) return;
    const answer = await this.challenge.join({ ...me, name: this.batter.name });
    if (!answer.ok) {
      if (answer.retry) { this.hud.offline(null); return; }
      this.hud.challengeJoinError(answer.reason ?? 'Could not join the match.');
      return;
    }
    track('challenge-joined', 'Match room joined');
    this.hud.closeChallenge();
    this.pinRoom(answer.challenge?.code ?? null);
    this.showRoom();
  }

  /**
   * One call on open: every room this person is in. It wears the count on the
   * picker's hero card, and it puts up any result they have not seen — one at
   * a time, oldest first, before anything else.
   */
  private async syncChallenges() {
    if (!this.player) return;
    const list = await ChallengeRun.mine(this.player);
    if (!list) return;
    this.rooms = list;
    this.hud.challengesOpen(list.yourMove.length, list.waitingOnThem.length);
    if (list.unseen.length && !this.hud.modesOpen && this.phase === 'START') {
      this.pending = [...list.unseen];
      this.pendingTotal = this.pending.length;
      this.nextResult();
    }
  }
  private rooms: ListView | null = null;
  /**
   * Everything the Dressing Room's unlocks are read off: the three careers
   * this browser holds, the Rival Matches won (the store's count or this
   * browser's, whichever is more) and how many different players were beaten
   * in them, and each mode's figure at launch — or now, until it is known.
   */
  private dressingRecord(): DressingRecord {
    if (this.dressingPreview) return this.dressingPreview;
    const careers = { classic: heldCareer('classic') as BlastCareer, survive: heldCareer('survive') as SurviveCareer, marathon: heldCareer('marathon') as MarathonCareer };
    const wins = rivalryEntries().filter(one => one.outcome === 'W');
    const now = { classic: tierMeasure('classic', careers.classic), survive: tierMeasure('survive', careers.survive), marathon: tierMeasure('marathon', careers.marathon) };
    const held = readDressing();
    const record: DressingRecord = {
      careers,
      rivals: { won: Math.max(wins.length, this.rooms?.record?.won ?? 0), beaten: new Set(wins.map(one => one.them.handle)).size },
      launch: held.launch ?? now,
      welcomed: held.seen.includes(seenKey('bat', WELCOME_BAT)),
    };
    // Earned and known, never shown: won before the room arrived, waiting there
    // for its key. One not yet seen is new, and goes up at the innings' end.
    const got = earned(record);
    const free = new Set([...FREE_OUTFITS.map(id => seenKey('kit', id)), seenKey('bat', FREE_BAT), seenKey('bat', WELCOME_BAT)]);
    const waiting = [...got.outfits.map(id => seenKey('kit', id)), ...got.bats.map(id => seenKey('bat', id))]
      .filter(key => !free.has(key) && held.seen.includes(key) && !held.shown.includes(key));
    return { ...record, waiting };
  }
  /** What the batter goes out in: the player's pick, or the free one where the pick is not (or no longer) theirs; the guard is always theirs. */
  private myLook(): { outfit: Outfit; bat: BatSkin; guard: GloveDesign } {
    const record = this.dressingRecord(), held = readDressing();
    return {
      outfit: outfitOf(outfitOwned(held.outfit, record) ? held.outfit : FREE_OUTFIT),
      bat: batOf(batOwned(held.bat, record) ? held.bat : FREE_BAT),
      guard: gloveOf(held.guard),
    };
  }
  /**
   * Where each mode stood when the Dressing Room arrived, written once. Only
   * from a browser that holds its careers, or has never batted: a player on a
   * new device would otherwise start from nought and be handed a quarter of a
   * tier for play that came before. Until then "since launch" counts from now.
   */
  private noteLaunch() {
    const held = readDressing();
    if (held.launch) return;
    let mirrored = false;
    try { mirrored = localStorage.getItem('hitman-career') !== null; } catch { /* No storage: nothing is kept anyway. */ }
    if (!mirrored && profileDone()) return;
    const record = this.dressingRecord(), careers = record.careers, got = earned(record);
    writeDressing({
      ...held,
      launch: { classic: tierMeasure('classic', careers.classic), survive: tierMeasure('survive', careers.survive), marathon: tierMeasure('marathon', careers.marathon) },
      // What a career already holds when the room arrives is noted, not celebrated: see `freshUnlocks`.
      seen: held.seen.length ? held.seen : [...got.outfits.map(id => seenKey('kit', id)), ...got.bats.map(id => seenKey('bat', id))],
    });
  }
  private pending: Challenge[] = [];
  private pendingTotal = 0;

  /** The next unseen result, or the way out once they are all seen. */
  private nextResult() {
    const next = this.pending.shift();
    if (!next) {
      this.challenge.stopWatching();
      this.hud.closeRoom();
      this.pinRoom(null);
      this.challenge.clear();
      this.hud.showCover();
      return;
    }
    this.challenge.room = next;
    this.showRoom({ index: this.pendingTotal - this.pending.length, total: this.pendingTotal });
  }

  /**
   * The list of matches this person is in, refreshed on the way in so that a
   * ball landed since the last look says so.
   */
  /**
   * Rival Matches, opened.
   *
   * Drawn at once from the list the mode screen already fetched, and the
   * picker taken down in the same moment, so there is never a frame with
   * neither on the screen — waiting on the network first left the ground
   * showing through for as long as the answer took. The fresh answer is drawn
   * over it when it lands, and only if it says something different and the
   * list is still the screen being looked at. With nothing held yet, the
   * picker stays up until there is a list to replace it with.
   */
  private async showChallenges() {
    if (!this.player) return;
    const me = this.player;
    track('rivals-list', 'Rival Matches opened');
    const fromPicker = this.hud.modesOpen;
    let drawn = '';
    const draw = (shown: ListView) => {
      const sections = listSections(shown, me);
      const said = JSON.stringify([sections, shown.record]);
      if (said === drawn) return;
      drawn = said;
      this.hud.challengesOpen(shown.yourMove.length, shown.waitingOnThem.length);
      this.hud.closeModes();
      this.hud.challengeList(sections, shown.record, this.rivalsRanking(), { form: recentForm(), me: readPlayer()?.avatar ?? null });
    };
    if (this.rooms) draw(this.rooms);
    // The ranking under the record, fetched alongside the list and drawn in
    // when it lands, if the list is still the screen being looked at.
    if (!this.demo) void fetchRivalsBoard().then(rows => {
      if (rows) this.rivalsRows = rows;
      if (!this.hud.listOpen || !this.rooms) return;
      this.hud.challengeList(listSections(this.rooms, me), this.rooms.record, this.rivalsRanking(rows || this.rivalsRows ? 'ready' : 'offline'), { form: recentForm(), me: readPlayer()?.avatar ?? null });
    });
    const wasShowing = !!drawn;
    const list = await ChallengeRun.mine(me);
    if (list) this.rooms = list;
    // Somebody who left while it was fetching is not dragged back to it.
    if (wasShowing ? !this.hud.listOpen : fromPicker && !this.hud.modesOpen) return;
    draw(this.rooms ?? emptyList());
  }

  /** What a row of the list does. */
  private async listAct(act: 'open' | 'rival' | 'drop' | 'accept' | 'decline', code: string, playerId?: string) {
    if (!this.player) return;
    if (act === 'decline') { await this.declineMatch(code); return; }
    if (act === 'drop') {
      hideChallenge(code);
      const shown = this.rooms ?? emptyList();
      const rest = (rows: Challenge[]) => rows.filter(room => room.code !== code);
      this.rooms = { yourMove: rest(shown.yourMove), waitingOnThem: rest(shown.waitingOnThem), done: rest(shown.done), unseen: shown.unseen, record: shown.record };
      this.hud.challengeList(listSections(this.rooms, this.player), this.rooms.record, this.rivalsRanking(), { form: recentForm(), me: readPlayer()?.avatar ?? null });
      return;
    }
    const room = [...(this.rooms?.yourMove ?? []), ...(this.rooms?.waitingOnThem ?? []), ...(this.rooms?.done ?? [])]
      .find(one => one.code === code) ?? null;
    if (act === 'rival' && playerId) {
      const row = room?.players.find(one => one.handle === playerId) ?? null;
      const view = rivalryView(playerId, row ? { name: row.name, avatar: row.avatar } : undefined);
      if (!view) return;
      this.rival = view.them;
      track('rivals-head-to-head', 'Head-to-head opened');
      this.hud.rivalry(view, readPlayer()?.avatar ?? null);
      return;
    }
    if (room) this.challenge.room = room;
    const answer = await this.challenge.open(code);
    if (!answer.ok && !room) { this.hud.offline(answer.reason ?? null); return; }
    this.pinRoom(code);
    this.showRoom();
  }
  private rival: { handle: string; name: string; avatar: number } | null = null;

  /** A fresh room aimed at the same person, with the message pre-addressed. */
  private async challengeRival() {
    const them = this.rival;
    if (!them) return;
    const tally = rivalryView(them.handle, them)?.tally ?? 'Fresh start';
    this.rematchLine = { them: them.name, tally };
    await this.createRoom();
  }

  private snapshot() {
    return { phase: this.phase, lesson: this.lesson, seed: this.seed, elapsed: Math.round(this.elapsed),
      // A stroke's film under its story: which, and how far into a go of it, on its own clock.
      reel: this.reel ? { shot: this.reel.shot, at: Math.round(this.elapsed - this.reel.start), struck: this.reel.struck } : null, balls: this.score.balls, runs: this.score.runs, wickets: this.score.wickets,
      line: this.delivery?.line ?? '—', dragged: !!this.delivery?.dragged, spinPulled: !!this.outcome?.spinPulled, spinPulls: this.spinPulls, hooks: this.hooks, effectiveLine: this.delivery ? effectiveLine(this.delivery) : '—', style: this.delivery?.style ?? '—', speed: this.delivery?.speedKph ?? '—',
      baseX: this.delivery?.baseTargetX.toFixed(3) ?? '—', finalX: this.delivery?.finalTargetX.toFixed(3) ?? '—',
      contactAt: Math.round(this.delivery?.idealContactTimeMs ?? 0), timingDelta: this.outcome?.timingDeltaMs?.toFixed(0) ?? '—', timingGrade: this.outcome?.timingGrade ?? '—',
      compatibility: this.outcome?.compatibility ?? '—', quality: this.outcome?.quality.toFixed(2) ?? '—', outcome: this.outcome?.feedback ?? '—', shot: this.attempt?.shotType ?? '—',
      confidence: this.confidence.value, primed: this.isPrimed, chargeMiss: this.chargeMiss ?? '—', chargeable: this.delivery ? chargeable(this.delivery) : '—', advance: this.outcome?.advance ?? false, celebrating: this.celebrating > 0, muted: Math.round(this.scene.muted * 100) / 100,
      special: this.outcome ? landedSpecial(this.outcome) : false, burning: this.scene.burning, powerStyle: this.powerStyle,
      pulled: this.outcome && this.delivery ? pulledBouncer(this.delivery, this.attempt?.shotType, this.outcome) : false, swishing: this.scene.swishing, tail: this.scene.tailKind, pullPen: this.pullPen,
      mirrored: this.scene.mirrored, look: this.scene.wearing, fieldingKit: this.scene.fieldingKit, chase: this.chase ? { handle: this.chase.handle, mode: this.chase.mode, target: this.chase.target } : null, marathon: this.marathon ? this.marathonState() : null,
      super10: this.super10 ? this.super10State() : null,
      standing: this.standing, ease: this.ease };
  }
  /** Where a Super10 innings stands, for `super10-check.mjs`. */
  private super10State() {
    const over = Math.floor(this.score.balls / SUPER10.ballsPerOver);
    return {
      over, batter: super10Batter(this.score.wickets).title, bowler: this.generator.overKind(over),
      express: !!this.delivery?.express, death: !!this.delivery?.death, action: this.scene.bowlerAction,
      speed: this.delivery?.speedKph ?? null, windows: this.windows, practising: this.practising,
      field: this.s10.field && { id: this.s10.field.id, change: this.s10.field.change, bowler: this.s10.field.bowler,
        deep: this.s10.field.men.filter(m => m.deep).map(m => m.angle) },
      surge: this.s10.surged, enlarged: this.fieldUi.enlargedOpen,
      fielder: this.outcome?.fielder ?? null, angle: this.outcome?.angle ?? null, signalling: this.scene.signalling, away: this.scene.fieldAway,
    };
  }
  /** Where a Marathon innings stands, for `marathon-check.mjs`. */
  private marathonState() {
    const marathon = this.marathon!;
    const over = Math.floor(this.score.balls / MARATHON.ballsPerOver);
    return {
      batter: marathon.current.batter.role, batters: marathon.batters.map(b => MarathonInnings.score(b)),
      left: marathon.current.left, mirrored: this.scene.mirrored, lefty: marathon.batters.findIndex(b => b.left),
      settle: marathon.current.settle, confidence: marathon.current.confidence, confident: marathon.confident,
      gone: marathon.gone, ending: marathon.ending, canDeclare: marathon.canDeclare,
      health: marathon.current.health.value, level: this.generator.levelAt(over)?.level ?? null,
      bowler: this.generator.overKind(over), express: !!this.delivery?.express, action: this.scene.bowlerAction,
      round: this.generator.roundAt(over), side: this.scene.bowlerSide,
      told: { ...this.told }, clouded: this.scene.clouded,
    };
  }
  dispose() {
    onPlayerWritten(null);
    this.stopDressingSends?.(); window.clearTimeout(this.dressingTimer);
    this.disposed = true; cancelAnimationFrame(this.frameId); this.input?.dispose(); this.scene?.dispose(); this.audio.dispose();
    window.removeEventListener('keydown', this.shortcuts); window.removeEventListener('beforeunload', this.leaving); window.removeEventListener('blur', this.blur); document.removeEventListener('visibilitychange', this.visibility);
  }
}


/** How long the crowd keeps it up for each moment, in seconds; the clip is three and a half. */
/** A drawn Test Survival, as Choose a mode says it. */
const SURVIVED = 'Survived all 60 · drew';
/** `?rate=1`'s keys: the game, then each mode in the order the picker shows them. */
const RATE_KEYS: readonly { label: string; thing: RatedThing }[] = [
  { label: 'GAME', thing: 'game' }, { label: 'BLAST', thing: 'classic' }, { label: 'MARATHON', thing: 'marathon' },
  { label: 'SURVIVAL', thing: 'survive' }, { label: 'RIVALS', thing: 'rivals' },
];
/** `?levelup=1`'s keys: each rung a player can climb to, in the Blast's card and in the Marathon's green. */
const LEVEL_UP_KEYS: readonly { label: string; tier: string; mode: CareerMode }[] = [
  { label: 'EMERGING', tier: 'emerging', mode: 'classic' }, { label: 'STAR', tier: 'star', mode: 'classic' },
  { label: 'HITMAN', tier: 'hitman', mode: 'classic' }, { label: 'TEST STAR', tier: 'star', mode: 'marathon' },
  { label: 'TEST HITMAN', tier: 'hitman', mode: 'marathon' },
];
/** A way `?welcome=1` puts the welcome up. */
type WelcomeScenario = 'new' | 'back' | 'edit' | 'taken' | 'sibling' | 'month' | 'offline';
/** `?welcome=1`'s keys: the three ways in, then the store's four refusals. */
const WELCOME_KEYS: readonly { label: string; scenario: WelcomeScenario }[] = [
  { label: 'NEW', scenario: 'new' }, { label: 'BACK', scenario: 'back' }, { label: 'EDIT', scenario: 'edit' },
  { label: 'TAKEN', scenario: 'taken' }, { label: 'SIBLING', scenario: 'sibling' }, { label: 'MONTH', scenario: 'month' },
  { label: 'OFFLINE', scenario: 'offline' },
];
/** A way `?dressing=1` shows the Dressing Room: the room at three points in a career, or an unlock. */
type DressingScenario = 'new' | 'half' | 'all' | 'kit' | 'bat' | 'two';
const DRESSING_KEYS: readonly { label: string; scenario: DressingScenario }[] = [
  { label: 'NEW', scenario: 'new' }, { label: 'HALFWAY', scenario: 'half' }, { label: 'ALL', scenario: 'all' },
  { label: 'KIT UNLOCK', scenario: 'kit' }, { label: 'BAT UNLOCK', scenario: 'bat' }, { label: 'TWO', scenario: 'two' },
];
/** The made-up careers `?dressing=1`'s room reads: nothing played, some of each shelf earned, and all of it. */
function previewRecord(scenario: 'new' | 'half' | 'all'): DressingRecord {
  const blast = emptyBlast(), survive = emptySurvive(), marathon = emptyMarathon();
  if (scenario === 'half') {
    Object.assign(blast, { innings: 30, runs: 4000, balls: 2500, sixes: 182, highest: 112, hundreds: 1 });
    Object.assign(survive, { innings: 20, runs: 900, balls: 640, sixes: 20, wins: 18, draws: 1, losses: 1 });
    Object.assign(marathon, { innings: 6, runs: 900, balls: 1100, sixes: 10, highest: 142, hundreds: 1 });
    return { careers: { classic: blast, survive, marathon }, rivals: { won: 3, beaten: 2 }, launch: { classic: 4000, survive: 640, marathon: 900 }, welcomed: true };
  }
  if (scenario === 'all') {
    Object.assign(blast, { innings: 400, runs: 19000, balls: 12000, sixes: 900, highest: 160, hundreds: 20 });
    Object.assign(survive, { innings: 120, runs: 9000, balls: 5400, sixes: 100, wins: 60, draws: 20, losses: 40 });
    Object.assign(marathon, { innings: 40, runs: 9500, balls: 12000, sixes: 60, highest: 230, hundreds: 12, doubles: 2 });
    return { careers: { classic: blast, survive, marathon }, rivals: { won: 14, beaten: 7 }, launch: { classic: 0, survive: 0, marathon: 0 }, welcomed: true };
  }
  // As a new player walks in: Boom waiting on the bat shelf for its key.
  return { careers: { classic: blast, survive, marathon }, rivals: { won: 0, beaten: 0 }, launch: { classic: 0, survive: 0, marathon: 0 }, welcomed: false };
}
/** `?actions=1`'s keys. */
/** A `?actions=1` key: one of the things he does after a ball, or the retired-hurt fall. */
type ActionKey = AfterBall | 'fall';
/** The places FALL has him hit, in turn. */
const FALLS: readonly Hurt[] = ['HELMET', 'RIBS', 'GLOVES', 'THIGH'];
/** How long FALL holds the bowler: down, and a while on his knees. */
const FALL_SHOWN_MS = 3200;
const ACTION_KEYS: readonly { label: string; kind: ActionKey }[] = [
  { label: 'ADMIRE', kind: 'admire' }, { label: 'LEAN', kind: 'lean' }, { label: 'WATCH', kind: 'watch' }, { label: 'TWIRL', kind: 'twirl' },
  { label: 'BRUSH', kind: 'brush' }, { label: 'SHADOW', kind: 'shadow' }, { label: 'SCRUB', kind: 'scrub' }, { label: 'SKY', kind: 'sky' },
  { label: 'DOWN', kind: 'down' }, { label: 'RIBS', kind: 'ribs' }, { label: 'HAND', kind: 'sting' }, { label: 'HELMET', kind: 'dazed' },
  { label: 'FALL', kind: 'fall' },
];
/** `?moments=1`'s keys, in the order an innings reaches them. */
const MOMENT_KEYS: readonly { label: string; moment: Moment }[] = [
  { label: '50', moment: { kind: 'fifty', mark: 50 } }, { label: '100', moment: { kind: 'century', mark: 100 } },
  { label: '6\u00d76', moment: { kind: 'six-sixes', mark: 0 } }, { label: '150', moment: { kind: 'raise', mark: 150 } },
  { label: '200', moment: { kind: 'double', mark: 200 } }, { label: '250', moment: { kind: 'raise', mark: 250 } },
  { label: '300', moment: { kind: 'triple', mark: 300 } }, { label: '350', moment: { kind: 'raise', mark: 350 } },
  { label: '400', moment: { kind: 'four', mark: 400 } },
];
/**
 * How long the Blast's fireworks stay up: a special stroke's for one go of the
 * film, and a milestone's for at least that and as long as he celebrates.
 * The Test modes have none: a Test ground is not a T20 night. And the Blast
 * has them only after dark, which `GameScene.fireworks` sees to.
 */
const FIREWORKS_MS = { special: 3000, milestone: 3600 } as const;
/** The keys the star prompt answers itself: give a star, and walk between them. */
const STAR_KEYS = new Set(['Enter', ' ', 'Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);
/** The games by name, as the pause sheet's chip says them. */
/** What a chase's moments and strip call each mode. */
const CHASE_MODE_NAMES: Record<CareerMode, string> = { classic: 'The Blast', marathon: 'Test Marathon', survive: 'Test Survival' };
/** The board's name as the rank hero's eyebrow says it. */
const HERO_MODE: Record<CareerMode, string> = { classic: 'THE BLAST', marathon: 'TEST MARATHON', survive: 'TEST SURVIVAL' };
/** `?topspot=1`'s keys: New #1 in each board's colours. */
const TOP_SPOT_KEYS: readonly { label: string; mode: CareerMode }[] = [
  { label: 'BLAST', mode: 'classic' }, { label: 'MARATHON', mode: 'marathon' }, { label: 'SURVIVAL', mode: 'survive' },
];

const PAUSE_NAMES: Record<GameMode, string> = { CLASSIC: 'The Blast', SURVIVE: 'Test Survival', MARATHON: 'Test Marathon', SUPER10: 'Super10' };
const CHEER: Record<Milestone, number> = { fifty: 2.3, raise: 2.3, century: 2.8, 'six-sixes': 2.8, double: 3.1, triple: 3.3, four: 3.5 };
const MOMENT_SAID: Record<Milestone, string> = {
  fifty: 'Reached fifty', raise: 'Reached another fifty', century: 'Reached a hundred', 'six-sixes': 'Six sixes in a row',
  double: 'Reached a double hundred', triple: 'Reached a triple hundred', four: 'Reached four hundred',
};

/**
 * What each row of the list says.
 *
 * A match is against a person, so the row leads with them — the other player,
 * or the leader of a group, or nobody yet — and says what it needs in a word:
 * your move, waiting, and how it went.
 */
function listSections(list: ListView, me: string): ListSections {
  const row = (room: Challenge): ListRowView => {
    const view = roomView(room, me, false);
    const others = room.players.filter(one => !ownsHandle(one.handle, me));
    const lead = view.result?.them ?? others.find(one => one.status === 'done' || one.status === 'batting') ?? others[0] ?? null;
    const them = lead ? { handle: lead.handle, name: lead.name, avatar: lead.avatar } : null;
    const moved = Math.max(room.at, ...room.players.map(one => one.at ?? 0));
    const base = { code: room.code, them, others: others.length, age: ageOf(moved) };
    const host = room.players.find(one => one.host);
    const fromThem = !!host && !ownsHandle(host.handle, me);
    switch (view.kind) {
      case 'chase': {
        const batting = others.find(one => one.status === 'batting');
        return { ...base, actionable: true, note: batting ? `batting now \u00b7 ball ${batting.balls}` : fromThem ? 'challenged you' : 'batted \u00b7 your move' };
      }
      case 'lobby':
        return others.length
          ? { ...base, actionable: fromThem, note: fromThem ? 'challenged you' : 'in the room \u00b7 not batted' }
          : { ...base, note: 'nobody has joined yet' };
      case 'resume': return { ...base, note: `you were on ball ${view.mine?.balls ?? 0} \u00b7 resume` };
      case 'waiting': return { ...base, note: lead ? `Waiting for ${lead.name} to bat` : 'Waiting for a rival' };
      case 'spectate': return { ...base, note: `${view.live?.row.name} ${view.live?.needs}` };
      case 'result': {
        const result = view.result!;
        const margin = Math.abs((view.mine?.runs ?? 0) - (result.them?.runs ?? 0));
        // Said from where the player sits: "You won by 4 runs", "Riya won by 12 runs".
        const won = result.outcome === 'W' ? 'You won' : `${result.them?.name ?? 'They'} won`;
        // Level on runs and still decided: the tiebreak did it, and says so
        // rather than claiming a margin of nothing.
        const tiebreak = (view.mine?.sixes ?? 0) !== (result.them?.sixes ?? 0) ? 'sixes' : 'fours';
        const verdict = result.forfeit
          ? `${won} by forfeit`
          : result.outcome === 'D' ? `Drawn \u00b7 ${view.mine?.runs} each`
            : margin === 0 ? `${won} on ${tiebreak}` : `${won} by ${margin} run${margin === 1 ? '' : 's'}`;
        return { ...base, outcome: result.outcome, verdict, note: fromThem ? 'challenged you' : 'you challenged' };
      }
      case 'expired': return { ...base, outcome: '\u2014', verdict: 'Closed', note: view.mine && view.mine.status === 'done' ? `${lead?.name ?? 'nobody'} never batted` : 'nobody batted in the week' };
      case 'void': return { ...base, outcome: '\u2014', verdict: 'Void', note: 'made on an older version' };
      case 'declined': return { ...base, outcome: 'L', verdict: 'Declined', note: fromThem ? 'challenged you' : 'you challenged' };
      default: return { ...base, outcome: '\u2014', verdict: 'Over', note: 'you were not in this one' };
    }
  };
  return {
    received: list.yourMove.map(row),
    waiting: list.waitingOnThem.map(row),
    past: list.done.slice(0, 10).map(row),
  };
}
