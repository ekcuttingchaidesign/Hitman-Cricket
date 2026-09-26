import { ADVANCE, CONFIDENCE_FULL, GAME } from './config/gameplay';
import { SURVIVE } from './config/survive';
import { Confidence } from './game/Confidence';
import { Health } from './game/Health';
import { endingOf, resolveSurvive, resultOf, sledgeDue, teamScore } from './game/Survive';
import { CLASSIC_LIMITS, type InningsLimits } from './game/ScoreManager';
import { CLASSIC_PLAN, SURVIVE_PLAN, spun } from './game/DeliveryGenerator';
import { Sledger } from './game/Sledge';
import { GameAudio, outcomeSound } from './game/Audio';
import { DeliveryGenerator } from './game/DeliveryGenerator';
import { effectiveLine, flightProgress } from './game/DeliveryTrajectory';
import { InputManager } from './game/InputManager';
import { ScoreManager } from './game/ScoreManager';
import { SeededRandom } from './game/SeededRandom';
import { advanceShot, gradeOf, loftedDrive, playedAs, scoopLine, scoopable, slogSweep, sweeps, chargeable, sweepable, resolveShot } from './game/ShotResolver';
import { TUTORIAL, tutorialDelivery, tutorialOutcome } from './game/Tutorial';
import type { Delivery, Ending, GamePhase, ShotAttempt, ShotOutcome, ShotType } from './game/types';
import type { Primed } from './ui/HUD';
import { GameScene } from './scene/GameScene';
import { HUD } from './ui/HUD';
import {
  fetchBoard, fetchSurviveBoard, submitInnings, submitSurvive,
  type BoardPayload, type SurvivePayload,
} from './game/board-api';
import { readPlayer, writePlayer } from './game/player';
import {
  offerRestoreHere, restoreOfferDismissed, restoreOfferDone, restoreOfferShown,
} from './game/restore-offer';
import { cardOffer, type BoardTab, type CardOffer, type SheetTab } from './ui/Leaderboard';
import {
  bestStanding, careerBoardOf, placesOf, type AnyCareer, type LadderTab,
} from './ui/CareerBoard';
import { statsCardImage, statsFacts, type StatsFacts } from './game/StatsCard';
import { gameLink, keyWhatsappLink } from './game/Share';
import { keyImage, keyImageName, prepareKeyAssets } from './game/KeyImage';
import {
  countInnings, fetchCareerBoards, fetchMyCareer, forgetCareer, heldCareer, mintNonce,
  type CareerBoards, type CareerRow,
} from './game/career-api';
import { blastTally, type BlastTally, type CareerMode, type SurviveTally } from './game/career';
import { demoBoard, demoCareers, demoSurvive, demoWanted } from './game/demo-board';
import { forgetKey, keepKey, keyView, markKeySaved } from './game/recovery';
import { firstCareerKey, newCareerKey, restoreRecord } from './game/recovery-api';
import type { LocalCareer } from './ui/Restore';
import type { StatsSheetView, StatsSlide } from './ui/StatsSheet';
import { markWhatsNewShown, whatsNewDue } from './game/whats-new';
import type { StoriesWhere } from './ui/WhatsNew';
import { climbedTo, type Granted } from './game/tier';
import { openFeedback } from './ui/Feedback';
import { feedbackGiven, type FeedbackContext } from './game/feedback';
import { asSurvive, surviveOffer } from './ui/SurviveBoard';
import type { SurviveRow } from './game/survive-board';
import { playerId } from './game/identity';
import { asInnings } from './ui/Leaderboard';
import type { BoardRow } from './game/leaderboard';
import {
  ballsBand, blowsBand, counting, inningsBand, injuryBand, marksPassed, restoreFailure, scoreBand,
  track, trackOnce,
} from './game/analytics';
import { hurtNoteSeen, markHurtNoteSeen } from './game/private-mode';
import { readVisits, today, visiting, writeVisits } from './game/visits';
import { ChallengeRun, noteResult, rivalryView, roomView, type ListView, type Me, type RoomView } from './game/Challenge';
import { CODE_PARAM, challengeLink, copy, hideChallenge, seenHere, whatsapp, type Challenge } from './game/challenge-api';
import type { ListRowView, ListSections, RoomAct } from './ui/HUD';
import { NAME_BLOCKED_REASON, nameBlocked } from './server/name-filter';
import { kitDeal } from './config/board';
import { encodeInnings } from './game/ball-string';
import { demoRoom, demoWanted as roomDemoWanted } from './game/room-demo';
/** The phases that count as playing. Not the cover, the end card or a pause. */
const LIVE: GamePhase[] = ['READY', 'BOWLER_RUNUP', 'BALL_IN_FLIGHT', 'SHOT_RESOLVE', 'RESULT'];

/** How long a counted innings waits before its second and final attempt. */
const RETRY_MS = 4000;
/** Which innings is being played. The two share a loop and almost nothing else. */
export type GameMode = 'CLASSIC' | 'SURVIVE';

/**
 * Whether this bundle was built to play Survive and nothing else. Set by the
 * GitHub Pages workflow, and the reason that deployment can exist at all: the
 * host cannot serve the board's two functions, and this build never asks it to.
 */
const SURVIVE_ONLY = !!import.meta.env.VITE_SURVIVE_ONLY;

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
  /** Survive only: what is left of the batter, and how the innings finished. */
  private health = new Health();
  private ending: Ending | null = null;
  /** The score he walked out to, nine down. Cosmetic, and drawn from the seed. */
  private chasing = 0;
  /** Three balls that went nowhere and the fielders have something to say. */
  private sledger = new Sledger();
  private sledgeDue = false;
  /** The ball the field last had something to say on, so they do not repeat themselves. */
  private lastSledge = 0;
  private rng = new SeededRandom(1); private generator = new DeliveryGenerator(this.rng);
  private delivery: Delivery | null = null; private attempt: ShotAttempt | null = null; private outcome: ShotOutcome | null = null;
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
  private careerBoards: Partial<Record<BoardTab, CareerBoards<AnyCareer>>> = {};
  /** This player's own figures, as the store last reported them. */
  private myCareer: Partial<Record<BoardTab, {
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
  private statsDrawn: Partial<Record<BoardTab, StatsFacts>> = {};
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
    this.hud = new HUD(root, this.best);
    // Neither of these is allowed to hold up an innings. Settling the id touches
    // three stores, one of which can hang; the board is a network call that may
    // never answer. Both run alongside the game, and the cover's trophy line
    // picks up the board's leader if and when one arrives.
    // Swallowed in production, because none of this is worth an innings — but
    // never swallowed in development, where a silent catch here hid a real
    // failure for an afternoon.
    void playerId().then(id => {
      this.player = id;
      void this.catchUpOnKey();
      return this.openChallenges();
    }).catch(error => { if (import.meta.env.DEV) console.error('challenge startup', error); });
    this.countVisit();
    // A survive-only build has no board behind it and no screen that opens one,
    // so it does not go looking. On GitHub Pages that request is a guaranteed
    // 404 on every load — harmless, since a board that never answers is already
    // handled, but a console full of red is a bad first impression for somebody
    // who was handed the link to give an opinion on the batting.
    if (!SURVIVE_ONLY) void this.loadBoard();
    try { this.scene = new GameScene(this.hud.viewport); } catch (error) { console.error(error); track('webgl-fail', 'WebGL unavailable'); this.hud.error(); return; }
    this.input = new InputManager(() => this.phase === 'BALL_IN_FLIGHT', this.clockAt, this.shoot, this.hud.viewport,
      () => this.isPrimed === 'CHARGE' ? ADVANCE.coverLean : 0,
      // The downward diagonals are the scoops whenever there is a meter to
      // spend on them. Which ball they get is settled in `playedAs`.
      () => this.charged);
    // The play key opens the picker rather than an innings — unless a link has
    // already named the mode, in which case it is that mode's play key.
    this.hud.on('start', this.play);
    this.hud.on('mode-classic', () => { this.hud.closeModes(); this.choose('CLASSIC'); });
    this.hud.on('mode-survive', () => { this.hud.closeModes(); this.choose('SURVIVE'); });
    this.hud.on('mode-challenge', () => { void this.openMatch(); });
    this.hud.on('challenge-set', () => { void this.openMatch({ card: encodeInnings(this.score.history) }); });
    this.hud.on('challenge-share-done', () => this.showRoom());
    this.hud.on('challenge-copy', () => { void this.copyChallengeLink(); });
    this.hud.on('challenge-more', () => { void this.shareChallengeLink(); });
    this.hud.on('challenge-bat', () => { if (this.asking === 'create') void this.nameThenCreate(); else void this.nameThenJoin(); });
    this.hud.on('challenge-rename', () => this.hud.challengeRename());
    this.hud.on('challenge-solo', () => { this.challenge.clear(); this.pinRoom(null); this.hud.closeChallenge(); this.hud.showCover(); this.modes(); });
    this.hud.on('room-back', () => this.leaveRoom());
    this.hud.onRoomAct = act => { void this.roomAct(act); };
    this.hud.on('modes-challenges', () => { void this.showChallenges(); });
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
      const key = (event.target as HTMLElement).closest('[data-open],[data-rival],[data-drop]') as HTMLElement | null;
      if (!key) return;
      event.stopPropagation();
      if (key.dataset.drop) void this.listAct('drop', key.dataset.drop);
      else if (key.dataset.rival) void this.listAct('rival', key.dataset.code ?? '', key.dataset.rival);
      else if (key.dataset.open) void this.listAct('open', key.dataset.open);
    });
    this.hud.viewport.querySelector('#room-keys')!.addEventListener('click', event => {
      const key = (event.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
      if (!key || key.tagName === 'A') return;
      this.hud.onRoomAct?.(key.dataset.act as RoomAct);
    });
    this.hud.on('modes-cancel', this.closePicker);
    this.hud.on('survive-again', this.start);
    this.hud.on('survive-modes', this.modes);
    this.hud.on('again', this.start); this.hud.on('pause', this.togglePause); this.hud.on('resume', this.togglePause);
    this.hud.on('tutorial', this.startTutorial); this.hud.on('skip-tutorial', this.start); this.hud.on('tutorial-play', this.start);
    this.hud.on('sound', this.toggleSound);
    // The switch as it was left last visit.
    this.hud.sound(this.audio.setting);
    this.hud.on('restart', this.start);
    // Out of a paused innings and back to the picker. The picker is a screen
    // rather than a card, so it covers the pause card rather than replacing
    // it: pick a mode and the innings is walked out on, back out of it and the
    // card is exactly where it was.
    this.hud.on('change-mode', () => { if (this.phase === 'PAUSED') this.modes(); });
    this.hud.on('share', () => { void this.hud.share(); });
    this.hud.on('board', this.showBoard);
    // Both ladders exist, so the sheet carries a way between them.
    this.hud.showBoardTabs(SHOW_SURVIVE && !SURVIVE_ONLY);
    this.hud.onBoardTab = this.tabBoard;
    this.hud.onBoardStories = () => this.showStories('board');
    this.hud.onLadderTab = this.tabLadder;
    this.hud.onStatsOpen = this.showStats;
    // Either key in the sheet counts as saved. Which one was used is worth
    // knowing — one of them finishes the job and the other leaves homework —
    // so they are counted apart even though they retire the same prompts.
    this.hud.onKeySave = how => this.saveKey(how);
    // Fetched while the sheet is still being read, so the first tap on SAVE AS
    // IMAGE is not the thing that waits on a font.
    void prepareKeyAssets();
    this.hud.onRestore = entry => void this.sendRestore(entry);
    this.hud.onRestoreOpen = from => this.openRestore(from);
    this.hud.keyNow = () => this.careerKeyHeld();
    this.hud.onNewKey = () => void this.makeNewKey();
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
    if (!SURVIVE_ONLY) this.hud.on(document.getElementById('cover-board') ? 'cover-board' : 'panel-board', this.showBoard);
    this.hud.on('help', () => { trackOnce('help-open', 'Instructions opened'); if (!['START', 'PAUSED', 'INNINGS_END'].includes(this.phase)) this.togglePause(); this.hud.help(); });
    this.hud.on('fullscreen', () => {
      if (document.fullscreenElement) void document.exitFullscreen();
      else if (this.hud.viewport.requestFullscreen) void this.hud.viewport.requestFullscreen().catch(() => {});
    });
    window.addEventListener('keydown', this.shortcuts); document.addEventListener('visibilitychange', this.visibility);
    window.addEventListener('blur', this.blur);
    // A bundle built survive-only plays one innings and offers no way out of
    // it — that is the whole of what makes it publishable somewhere with no
    // board behind it. A `?mode=` link does the same thing at runtime.
    const named = SURVIVE_ONLY ? 'SURVIVE' : new URLSearchParams(location.search).get('mode')?.toUpperCase();
    if (named === 'SURVIVE' || named === 'CLASSIC') {
      this.mode = named as GameMode;
      this.locked = true;
      this.hud.lockMode(SURVIVE_ONLY);
    } else {
      // The picker opens whenever there is something to pick. Challenging a
      // friend is always on offer, so from here that is always — where before,
      // with the Test match behind a flag, Play went straight to the innings and
      // the screen was never seen. The Test card is hidden rather than removed
      // when its flag is off, so the picker still reads as two choices.
      if (!SHOW_SURVIVE) this.hud.hideSurviveCard();
    }
    // The cover has music of its own. It is asked for rather than waited on:
    // a browser that will not play it yet is not a failure, it is a browser
    // nobody has touched, and the first touch of the page lets it through.
    this.audio.music('cover');
    this.frameId = requestAnimationFrame(this.frame);
    if (this.debug) Object.defineProperty(window, '__cricket', { configurable: true, value: {
      snapshot: () => this.snapshot(), batter: () => this.scene.inspectBatter(), bowler: () => this.scene.inspectBowler(),
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
    this.hud.modes();
    // What the hero card wears is the last sync's word, and a sync is asked
    // for behind it so the next look is fresher.
    if (this.rooms) this.hud.challengesOpen(this.rooms.yourMove.length, this.rooms.waitingOnThem.length);
    void this.refreshCount();
  };

  /** The count on the hero card, refreshed without putting anything up. */
  private async refreshCount() {
    if (!this.player) return;
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
  private async sendRestore(entry: { name: string; key: string }) {
    // Opening the screen and filling it in are different acts, and the gap
    // between them is its own answer: somebody who opened this and never
    // pressed the key did not have one to try.
    track('restore-sent', 'A name and key offered to the store');
    this.hud.restoreSending(true);
    const answer = await restoreRecord(entry.name, entry.key);
    if (this.disposed) return;
    if (!answer.ok || !answer.playerId) {
      const why = restoreFailure(answer.reason);
      track(`restore-failed-${why}`, `Restore turned down: ${why}`);
      return this.hud.restoreFailed(answer.reason ?? 'That did not go through.');
    }
    track('restore-done', 'Record brought back');
    this.becomeRestored(answer.playerId, entry.name);
    this.hud.closeRestore();
    this.hud.restoreDone(entry.name);
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
    this.redrawStats();
  }

  /** My Stats, in whichever of its two presentations is on the screen. */
  private redrawStats() {
    const mode: BoardTab = this.surviving ? 'survive' : 'classic';
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
    writePlayer({ name: name.trim(), avatar: readPlayer()?.avatar ?? 0 });
    forgetKey();
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
  }
  /**
   * Out of the picker without picking. Opened from the cover that is the cover
   * again; opened from a paused innings it is the pause card again, silent the
   * way a paused innings is, with the focus back on the key that resumes it.
   */
  private closePicker = () => {
    this.hud.closeModes();
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
  choose = (mode: GameMode) => { this.mode = mode; this.start(); };
  start = () => {
    // A restart is an innings walked out on, and reads as nothing else: it is
    // the only way here that is not the cover, the tutorial, or the card.
    if (!['START', 'INNINGS_END'].includes(this.phase) && this.lesson < 0) this.mark('innings-restart', 'Innings restarted');
    this.innings++;
    this.inningsFrom = this.playedMs;
    this.mark('innings-start', 'Innings started');
    if (this.innings > 1) this.mark('innings-replay', 'Innings replayed');
    this.lesson = -1;
    // Walking out takes the cover's music with it: an innings is played to the
    // bat and the crowd. The card's music is fetched now instead, so that the
    // card does not go up in silence waiting for a megabyte to arrive.
    this.audio.stop(); this.audio.music(null); this.audio.warm('result'); this.audio.unlock();
    this.score = new ScoreManager(this.limits); this.confidence = new Confidence(); this.health = new Health();
    this.sledger = new Sledger(); this.sledgeDue = false; this.lastSledge = 0; this.ending = null;
    this.wasCritical = false; this.noticeDue = false;
    const param = new URLSearchParams(location.search).get('seed');
    this.seed = param !== null && Number.isFinite(Number(param)) ? Number(param) >>> 0 : crypto.getRandomValues(new Uint32Array(1))[0];
    this.rng = new SeededRandom(this.seed);
    // The score at the other end is drawn first, off the innings seed, so that
    // the same seed always walks out to the same scoreboard. Drawing it from the
    // clock would have made a share card a lie the moment it was reloaded.
    this.chasing = this.surviving ? teamScore(this.rng) : 0;
    this.generator = new DeliveryGenerator(this.rng, this.plan);
    this.delivery = null; this.attempt = null; this.outcome = null; this.elapsed = 0; this.primed = null;
    this.input.reset(); this.scene.reset(); this.scene.whites(this.surviving);
    this.hud.start(this.surviving);
    // The Test board is fetched when a Test innings starts rather than on every
    // load: a player who only ever picks the five-over innings never asks for
    // it, and by the time this one ends it is already held.
    if (this.surviving && !SURVIVE_ONLY) void this.loadSurviveBoard();
    this.hud.score(this.score); this.showConfidence();
    if (this.surviving) this.hud.target(this.chasing, this.score.runs, this.score.balls, this.score.wickets);
    this.setPhase('READY');
    (document.activeElement as HTMLElement | null)?.blur();
  };
  /** Three scripted balls, no wickets, and a way out at any point. */
  startTutorial = () => {
    track('tutorial-start', 'Tutorial started');
    this.mode = 'CLASSIC';
    this.scene.whites(false);
    this.audio.stop(); this.audio.music(null); this.audio.unlock(); this.score = new ScoreManager();
    this.delivery = null; this.attempt = null; this.outcome = null; this.elapsed = 0; this.lesson = 0; this.primed = null; this.confidence = new Confidence(); this.sledger = new Sledger(); this.sledgeDue = false;
    this.input.reset(); this.scene.reset(); this.hud.startTutorial(); this.showConfidence(); this.setPhase('READY');
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

  private get surviving() { return this.mode === 'SURVIVE'; }
  private get limits() { return this.surviving ? SURVIVE_LIMITS : CLASSIC_LIMITS; }
  /** `?spin=1` is the same thing as the build flag, for a dev server. */
  private spinOnly = SPIN_ONLY || new URLSearchParams(location.search).get('spin') === '1';
  /** `?slowmo=0.65` tries a clock speed for the charge on a dev server. */
  private chargeSlowmo = Number(new URLSearchParams(location.search).get('slowmo')) || CHARGE_SLOWMO;
  /** `?charge=1` likewise, and `?charge=ball` for the ball alone. Only the classic innings has a meter to fill. */
  private chargeOnly = CHARGE_ONLY || new URLSearchParams(location.search).get('charge') || '';
  /**
   * The ball the charge is for, in place of whatever was drawn: on the stumps,
   * on a length, at a medium pacer's speed, and the meter filled to walk at it.
   * Nothing else about the innings changes — the same scoring, the same
   * wickets — so a mistimed charge is still a mistimed charge.
   */
  private chargeable(delivery: Delivery): Delivery {
    if (!this.chargeOnly || this.surviving || this.lesson >= 0) return delivery;
    if (this.chargeOnly !== 'ball') this.confidence.value = CONFIDENCE_FULL;
    // `meter`: the meter alone, the ball left to the innings, for the
    // strokes that want a ball the charge does not — the scoops.
    if (this.chargeOnly === 'meter') return delivery;
    const speedKph = Math.round((ADVANCE.minKph + ADVANCE.maxKph) / 2);
    return { ...delivery, line: 'MIDDLE', style: 'NORMAL', speedKph, baseTargetX: 0, finalTargetX: 0,
      bounceZ: GAME.bounceZ, rise: GAME.rise,
      durationMs: (GAME.releaseZ - GAME.contactZ) / (speedKph / 3.6) * 1000 * this.plan.travelScale };
  }
  private get plan() {
    const plan = this.surviving ? SURVIVE_PLAN : CLASSIC_PLAN;
    if (!this.spinOnly || !plan.spin) return plan;
    // Every over his, from the first: `spinOvers` always gives him `notBefore`
    // and draws the rest from what follows, so asking for all of them from
    // nought is how you get all of them rather than a coincidence.
    return { ...plan, spin: { ...plan.spin, overs: plan.spin.ofOvers, notBefore: 0 } };
  }
  private get readyMs() { return this.surviving ? SURVIVE.readyMs : GAME.readyMs; }
  private get resultMs() {
    const base = this.surviving ? SURVIVE.resultMs : GAME.resultMs;
    // The innings that ends with him on the floor is held open long enough for
    // him to get there. Every other ball is the usual beat.
    return this.ending === 'RETIRED' ? base + SURVIVE.felledMs : base;
  }
  /** How long after the ideal moment a swing still counts as a swing at all. */
  private get swingWindow() { return this.surviving ? SURVIVE.timing.poor : GAME.timing.poor; }
  /**
   * A moment, named for the innings it happened in.
   *
   * GoatCounter has no custom properties — an event is a path and a title — so
   * the mode has to be in the name or it is not anywhere. Everything that is
   * about a session rather than an innings (the first shot, the help screen,
   * the minutes played) stays unprefixed: those are the same fact whichever
   * innings it happened in, and splitting them would halve every count for
   * nothing.
   */
  private mark(name: string, title: string) {
    track(this.surviving ? `survive-${name}` : name, this.surviving ? `Test match: ${title}` : title);
  }
  /** The same, for the moments that must not be counted twice in one session. */
  private markOnce(name: string, title: string) {
    trackOnce(this.surviving ? `survive-${name}` : name, this.surviving ? `Test match: ${title}` : title);
  }
  private setPhase(phase: GamePhase) { this.phase = phase; this.phaseStart = this.elapsed; this.hud.phase(phase, this.isPrimed, this.specials); }
  private shoot = (shot: ShotType, inputTimeMs: number) => {
    if (this.phase !== 'BALL_IN_FLIGHT' || this.attempt) return;
    // The first swing of the session, tutorial or not: a player who never plays
    // one did not understand the controls, and that is a different problem from
    // a player who played and lost.
    trackOnce('first-shot', 'First shot played');
    // A scoop with nothing to spend on it, or at a bouncer, is the block: the
    // rig and the score read the same answer.
    this.attempt = playedAs(this.delivery!, { shotType: shot, inputTimeMs }, this.charged);
    const shotType = this.attempt.shotType;
    const charging = advanceShot(this.delivery!, this.attempt, this.charged);
    const lofted = !charging && loftedDrive(this.delivery!, this.attempt);
    const sweeping = !charging && slogSweep(this.delivery!, this.attempt, this.charged);
    // The orthodox sweep is what the same swipe at the same ball becomes when
    // the meter is empty or the timing is not good enough for the slog. It
    // costs nothing, so unlike the two special strokes it needs no meter read.
    const levelled = !charging && !sweeping
      && sweeps(this.delivery!, this.attempt, gradeOf(this.delivery!, this.attempt));
    this.primed = null;
    this.scene.swing(shotType, this.elapsed, this.delivery!, charging, lofted, sweeping, levelled);
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
  private get charged() { return this.lesson < 0 && !this.surviving && this.confidence.full; }
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
    if (this.surviving) return this.hud.injury(this.health.injury, this.health.critical);
    this.hud.confidence(this.confidence.fraction, this.isPrimed);
  }
  private toggleSound = () => { this.audio.step(); this.audio.unlock(); this.hud.sound(this.audio.setting, true); };
  private togglePause = () => {
    if (this.phase === 'START' || this.phase === 'INNINGS_END' || this.hud.helpOpen) return;
    if (this.phase === 'PAUSED') { this.audio.unlock(); this.phase = this.previousPhase; this.hud.pause(false); (document.activeElement as HTMLElement | null)?.blur(); }
    else {
      this.input.cancel(); this.audio.stop(); this.previousPhase = this.phase; this.phase = 'PAUSED'; this.hud.pause(true);
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
    this.hud.leader(payload.rows[0]?.runs ?? 0, this.best);
    if (epoch !== this.boardEpoch) return;
    this.boardSeen = true;
    this.board = payload.rows;
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
   * What it does is start the game, except on the first two visits after the
   * update, where it stops for the three cards explaining what changed. The
   * stories are counted here rather than when they are closed, because a player
   * who skips on the first card has still been shown them — counting on the way
   * out would show the same three cards to the same person for ever.
   *
   * The board's own What's New key does not count against it: somebody who went
   * looking has not used up one of the two they are given.
   */
  private play = () => {
    const go = () => (this.locked ? this.start() : this.modes());
    if (!whatsNewDue()) return go();
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

  /** What rides along with the answers, none of it asked. */
  private feedbackContext(): FeedbackContext {
    const { held } = readVisits();
    return {
      mode: this.surviving ? 'survive' : 'classic',
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
    this.openBoard(tab, 'best');
  };

  /**
   * The card, under its own tab on the sheet.
   *
   * It shows the career for the game the player was last looking at, which is
   * why the mode is remembered apart from the tab: a player who came to the
   * board from a Test innings and tapped My Stats wants their Test figures,
   * not the Blast's because the Blast is first in the row.
   */
  /** The cards on the tab's rail, by mode, as each of them is painted. */
  private mineSlides: Partial<Record<BoardTab, StatsSlide>> = {};

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
  private railStats(open: BoardTab, draw: (view: StatsSheetView) => void) {
    const modes: BoardTab[] = SHOW_SURVIVE && !SURVIVE_ONLY ? ['classic', 'survive'] : [this.boardTab];
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
          cards: modes.map(one => this.mineSlides[one] ?? { facts, picture: null, failed: false }),
          at,
        });
      });
    }
  }

  private openMine() {
    this.sheetTab = 'mine';
    // The game they were last looking at, which is why the mode is remembered
    // apart from the tab.
    this.railStats(this.boardTab, view => {
      if (this.disposed || !this.hud.boardOpen || this.sheetTab !== 'mine') return;
      this.hud.statsTab(view);
    });
  }

  /** Another ladder of the same mode, from the row of tabs under the first. */
  private tabLadder = (ladder: LadderTab) => {
    if (ladder === this.boardLadder) return;
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
  private showStats = () => {
    this.mark('stats-open', 'Career card opened');
    const mode: BoardTab = this.surviving ? 'survive' : 'classic';
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
    mode: BoardTab,
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
    mode: BoardTab,
    mine: { career: AnyCareer; name: string; avatar: number; granted?: Granted | null },
    draw: (facts: StatsFacts, picture: string | null, failed: boolean) => void,
  ) {
    const standing = bestStanding(mode, placesOf(this.careerBoards[mode]?.boards ?? {}, this.player));
    const facts = statsFacts(
      mode, mine.career, { name: mine.name, avatar: mine.avatar, granted: mine.granted ?? null }, standing,
    );
    this.statsDrawn[mode] = facts;
    draw(facts, null, false);
    void statsCardImage(facts, gameLink()).then(picture => {
      // A card painted for figures the player has already moved past belongs to
      // a screen that is no longer the one they are looking at.
      if (this.disposed || this.statsDrawn[mode] !== facts) return;
      const url = URL.createObjectURL(picture);
      this.hud.holdStatsPicture(url);
      draw(facts, url, false);
    }).catch(() => {
      if (this.disposed || this.statsDrawn[mode] !== facts) return;
      draw(facts, null, true);
    });
  }

  /** Whether the innings just played was this mode's, which is what the keys are for. */
  private atEndOf(mode: BoardTab) {
    return this.phase === 'INNINGS_END' && this.surviving === (mode === 'survive');
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
    const mine = this.phase === 'INNINGS_END' && !this.surviving;
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
  private shortcuts = (event: KeyboardEvent) => {
    if (event.repeat || this.hud.helpOpen) return;
    // A player typing their name into the claim field is not pressing shortcuts.
    // Without this, "Rohit" restarts the innings on the R and Escape abandons
    // the form by pausing whatever is behind it.
    const typing = event.target instanceof HTMLElement
      && (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' || event.target.isContentEditable);
    if (typing && event.key !== 'Escape') return;
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
    if (this.hud.modesOpen) {
      if (key === 'ESCAPE') { event.preventDefault(); this.closePicker(); }
      return;
    }
    if (key === 'ENTER' && (this.phase === 'START' || this.phase === 'INNINGS_END')) {
      event.preventDefault();
      if (this.locked || this.phase === 'INNINGS_END') this.start(); else this.modes();
    }
    else if (key === 'B' && !SURVIVE_ONLY) { event.preventDefault(); this.showBoard(); }
    else if (key === 'R' && this.phase !== 'START') { event.preventDefault(); this.start(); }
    else if (key === 'ESCAPE') { event.preventDefault(); this.togglePause(); }
    else if (key === 'M') { event.preventDefault(); this.toggleSound(); }
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
      this.elapsed += dt * this.timeScale;
      this.input.flush(this.elapsed);
      this.update();
    }
    if (!document.hidden) this.scene.render(this.elapsed);
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
    if (this.phase === 'READY' && age >= this.readyMs) {
      this.delivery = this.lesson >= 0 ? tutorialDelivery(TUTORIAL[this.lesson], this.elapsed + GAME.runupMs)
        : this.chargeable(this.generator.next(this.elapsed + GAME.runupMs));
      this.attempt = null; this.outcome = null; this.bounced = false; this.specials = []; this.primed = null; this.chargeBall = false;
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
      this.scene.reset(); this.input.reset();
      // After the reset, which hands the ball back to the quick bowler.
      this.scene.spinner(spun(this.delivery));
      this.showConfidence(); this.setPhase('BOWLER_RUNUP');
    } else if (this.phase === 'BOWLER_RUNUP') {
      this.scene.runup(Math.min(1, age / GAME.runupMs));
      if (age >= GAME.runupMs) {
        this.delivery!.releaseTimeMs = this.elapsed; this.delivery!.idealContactTimeMs = this.elapsed + this.delivery!.durationMs; this.setPhase('BALL_IN_FLIGHT');
      }
    } else if (this.phase === 'BALL_IN_FLIGHT' && this.delivery) {
      const progress = flightProgress(this.delivery, this.elapsed - this.delivery.releaseTimeMs);
      this.scene.delivery(this.delivery, progress);
      const bounce = (GAME.releaseZ - this.delivery.bounceZ) / (GAME.releaseZ - GAME.contactZ);
      if (!this.bounced && progress >= bounce) { this.audio.play('bounce'); this.bounced = true; }
      if ((progress >= 1 && this.attempt) || this.elapsed >= this.delivery.idealContactTimeMs + this.swingWindow + GAME.comboMs) this.resolve();
    } else if (this.phase === 'SHOT_RESOLVE') {
      this.scene.result(this.elapsed);
      // A skied ball cracks off the bat now and is judged when it comes down.
      if (!this.contactPlayed && this.elapsed >= this.contactAt) {
        this.contactPlayed = true;
        if (this.outcome!.aerial && this.outcome!.madeBatContact) this.audio.play('hit');
      }
      if (!this.resultPresented && this.elapsed >= this.presentationAt) this.presentResult();
      if (this.elapsed >= this.resolveEndsAt) {
        this.setPhase('RESULT');
        // After the call, not over it: the sledge is what comes back from the
        // field once the ball is dead.
        if (this.sledgeDue) { this.sledgeDue = false; this.audio.play('sledge'); }
      }
    } else if (this.phase === 'RESULT' && age >= this.resultMs) {
      if (this.lesson >= 0) {
        this.lesson++;
        if (this.lesson >= TUTORIAL.length) { this.lesson = -1; track('tutorial-complete', 'Tutorial completed'); this.setPhase('START'); this.hud.tutorialComplete(); }
        else { this.setPhase('READY'); this.hud.coach(TUTORIAL[this.lesson], this.lesson + 1, TUTORIAL.length); }
      } else if (this.surviving ? this.ending : this.score.ended) this.end();
      else if (this.noticeDue) { this.noticeDue = false; this.showHurtNote(); }
      else this.setPhase('READY');
    }
  }
  private resolve() {
    const step = this.lesson >= 0 ? TUTORIAL[this.lesson] : null;
    this.outcome = step ? tutorialOutcome(step, this.delivery!, this.attempt)
      : this.surviving ? resolveSurvive(this.delivery!, this.attempt, this.rng)
      : resolveShot(this.delivery!, this.attempt, this.rng, this.charged);
    if (step) this.hud.coachPlayed(step.praise, this.outcome.madeBatContact);
    else {
      this.score.record(this.outcome); this.generator.record(this.outcome);
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
        this.hud.target(this.chasing, this.score.runs, this.score.balls, this.score.wickets);
      } else {
        this.confidence.record(this.outcome);
      }
      this.showConfidence();
      if (this.surviving && this.health.critical && !this.wasCritical) this.turnedCritical();
      // The Test match needles a batter who is stuck rather than one who has
      // simply played a few balls — see `sledgeDue`.
      if (this.surviving) {
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
  private presentResult() {
    this.resultPresented = true;
    const outcome = this.outcome!;
    if (this.lesson < 0) this.hud.score(this.score);
    this.hud.result(outcome, this.chargeMiss);
    if (outcome.hit) {
      // The blow lands with the call rather than before it, so the flash, the
      // kick and the words are one event instead of three.
      this.hud.blow(outcome.feedback);
      this.audio.play('edge');
      // The one that finishes him puts him on the ground. It is the only blow
      // that does, which is what makes it read as the end rather than as
      // another dent in the meter.
      if (this.ending === 'RETIRED') this.scene.fall(this.elapsed);
    }
    const sound = outcomeSound(outcome);
    if (sound && !(outcome.aerial && sound === 'hit')) this.audio.play(sound);
  }
  /**
   * What the board has to say about the innings just played, answered from the
   * board already on screen so nothing waits on the network at the one moment a
   * wait would be felt. A board that has not loaded is not a reason to say
   * nothing: the store ranks it properly either way, and the worst case is an
   * offer that turns out to be a place in the sixties.
   */
  private offerBoard() {
    const played = asInnings(this.score);
    const offer = cardOffer(this.boardSeen, this.board, played, Date.now(), this.player);
    // An innings that had nothing to offer stays quiet in a private window too:
    // the strip is there to say what is being missed, and a two-run innings was
    // missing nothing.
    const shown: CardOffer = this.canRegister || offer.kind === 'silent' ? offer : { kind: 'private' };
    this.hud.offerClaim(shown, readPlayer(), this.board, played, this.player);
  }

  /** The same, asked of the Test ladder and answered on the Test card. */
  private offerSurvive() {
    const played = this.survived();
    const offer = surviveOffer(this.surviveSeen, this.surviveRows, played, Date.now(), this.player);
    const shown: CardOffer = this.canRegister || offer.kind === 'silent' ? offer : { kind: 'private' };
    this.hud.offerSurviveClaim(shown, readPlayer(), this.surviveRows, played, this.player);
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
    // A private window has no place to claim, so its key is the board's.
    if (this.hud.offerKind === 'standing' || this.hud.offerKind === 'private') return this.showBoard();
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
    if (!this.canRegister) return this.showBoard();
    if (!entry || !this.player) return this.hud.openClaim();
    this.hud.claimSending(true);
    // Each mode offers its own innings to its own ladder. The store keeps the
    // two under separate keys, so the mode travels with the figures rather than
    // being inferred from their shape at the far end.
    const result = this.surviving
      ? await submitSurvive(this.player, entry.name, entry.avatar, this.survived())
      : await submitInnings(this.player, entry.name, entry.avatar, asInnings(this.score));
    if (this.disposed) return;
    if (!result.ok) {
      this.mark(result.taken ? 'claim-name-taken' : 'claim-failed',
        result.taken ? 'Name already held' : 'Claim rejected');
      return this.hud.claimFailed(result.reason ?? 'That did not go through.', result.taken === true);
    }
    this.mark('claim-done', 'Innings put on the board');
    writePlayer({ name: entry.name.trim(), avatar: entry.avatar });
    // Handed over once and kept nowhere else. If this browser does not write
    // it down now, nothing in the world can show it again — which is exactly
    // what makes it worth asking the player to put it somewhere safe.
    if (result.key) {
      keepKey(result.key);
      track('key-issued', 'Career key issued');
    }
    // Claiming a name is what puts a career already counted onto the career
    // boards, so the copies held from before it are wrong the moment this
    // returns — including the card's, which was drawn with no name on it.
    const claimed: BoardTab = this.surviving ? 'survive' : 'classic';
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
    this.hud.hurtNote(() => { if (this.phase === 'PAUSED') this.togglePause(); });
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
    if (!this.player || !this.canRegister) return;
    const mode: BoardTab = this.surviving ? 'survive' : 'classic';
    // The career's own tally, not the board's row: it carries what each batsman
    // made, which the six totals on a row cannot say.
    const tally: BlastTally | SurviveTally = this.surviving
      ? { ...this.survived(), sixes: this.score.sixes, fours: this.score.fours }
      : blastTally(this.score);
    const nonce = mintNonce();
    const send = () => countInnings<AnyCareer>(this.player!, mode, tally, readPlayer(), nonce).then(mine => {
      if (this.disposed) return true;
      if (!mine?.career) return false;
      // Read before the held record is replaced, because the climb is the
      // difference between the two and there is nowhere else it is written
      // down. The mirror stands in on the first innings of a session, when
      // nothing has been fetched yet: it is this browser's own last word on
      // the career and it is what the card would have drawn.
      this.markClimb(mode, this.myCareer[mode]?.career ?? heldCareer(mode), mine.career, mine.granted ?? null);
      this.myCareer[mode] = {
        career: mine.career, name: mine.name, avatar: mine.avatar, granted: mine.granted ?? null,
      };
      // The boards held from before this innings no longer have it on them, so
      // the next open asks again rather than drawing a career one innings old.
      delete this.careerBoards[mode];
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

  private end() {
    this.setPhase('INNINGS_END');
    this.countThisInnings();
    // Both cards get it, and it is asked for before the modes part company
    // below: the innings that just ended is a different innings in each of
    // them, but the screen it ends on is the same screen.
    this.audio.music('result');
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
      track(`survive-result-${resultOf(ending, this.score.runs, this.score.balls).toLowerCase()}`,
        `Test match ended: ${ending}`);
      track(`survive-${scoreBand(this.score.runs)}`, 'Test match runs');
      track(`survive-${ballsBand(this.score.balls)}`, 'Test match balls faced');
      // What the meter finished on, in bands, so the live spread can be read
      // against the simulator's — the tuning is done in those terms.
      track(`survive-${injuryBand(this.health.injury)}`, 'Test match injury');
      track(`survive-${blowsBand(this.health.blows.length)}`, 'Test match blows taken');
      this.hud.endSurvive(this.score, this.health, ending, this.chasing);
      // The widget follows the strip onto whichever card is up, so this card
      // has one now — and it opens the Test career, because `showStats` reads
      // the mode from the innings that has just ended.
      this.hud.career(this.canRegister, readPlayer()?.avatar ?? null);
      this.hud.offerRestorePanel = this.offerRestoreOnCard();
      this.hud.careerKey(this.careerKeyHeld(), { panel: true, bar: false });
      this.offerSurvive();
      return;
    }
    const record = this.score.runs > this.best; this.best = Math.max(this.best, this.score.runs);
    try { localStorage.setItem('hitman-best', String(this.best)); } catch { /* A session remains playable without persistence. */ }
    track('innings-end', 'Innings completed');
    track(inningsBand(this.playedMs - this.inningsFrom), 'How long the innings took');
    track(this.score.wickets >= GAME.maxWickets ? 'innings-all-out' : 'innings-overs-up',
      this.score.wickets >= GAME.maxWickets ? 'Innings ended all out' : 'Innings ended, overs up');
    track(scoreBand(this.score.runs), `Innings scored ${scoreBand(this.score.runs).replace('score-', '').replace(/-/g, ' to ')} runs`);
    // A chase answers itself the moment it ends, and the reveal replaces the
    // ordinary card: the scoreline is what the player has been waiting thirty
    // balls for, and the card behind it would be the wrong first thing to see.
    if (this.challenge.playing) { this.matchCard = record; void this.finishMatch(); return; }
    this.showBlastCard(record);
  }

  /** The five-over card, with the strip, the key and the board under it. */
  private showBlastCard(record: boolean) {
    this.hud.end(this.score, this.best, record);
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
    const from = this.challenge.ghost;
    if (!from) return;
    const ball = this.challenge.ghostBall(index);
    const ended = this.challenge.ghostEndedAt;
    // Past the end of their innings there is nothing to show but the fact of
    // it, said once, on the ball it happened: silence after that reads as the
    // feature being broken, and the moment is worth more than the secrecy.
    if (!ball) {
      if (ended === null || index !== ended) return;
      window.setTimeout(() => {
        this.hud.ghost(from.name, from.avatar, 'ALL OUT', 'out');
        window.setTimeout(() => this.hud.ghostAway(), 2000);
      }, GHOST_AFTER_MS);
      return;
    }
    const result = ball.isWicket ? 'OUT' : ball.runs === 0 ? 'DOT' : String(ball.runs);
    const kind = ball.isWicket ? 'out' : ball.runs >= 4 ? 'big' : 'runs';
    window.setTimeout(() => {
      this.hud.ghost(from.name, from.avatar, result, kind);
      window.setTimeout(() => this.hud.ghostAway(), GHOST_FOR_MS);
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

  private async createRoom(extra: { card?: string; rematchOf?: string } = {}) {
    const me = this.me;
    if (!me) return;
    this.hud.closeModes();
    const answer = await this.challenge.create(me, extra);
    if (!answer.ok || !answer.challenge) {
      this.hud.offline(answer.reason ?? null);
      return;
    }
    track(extra.rematchOf ? 'challenge-rematch' : 'challenge-set', extra.rematchOf ? 'Rematch made' : 'Match room made');
    this.cameFromLink = false;
    this.pinRoom(answer.challenge.code);
    this.showRoom();
  }

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
      void this.challenge.seen(me);
    }
  }

  /** Out of the room. Back to wherever makes sense, which is always the picker. */
  private leaveRoom() {
    this.challenge.stopWatching();
    this.hud.closeRoom();
    this.pinRoom(null);
    if (this.demoing) {
      this.demoing = false;
      try { const url = new URL(location.href); url.searchParams.delete('room'); history.replaceState(history.state, '', url); } catch { /* fine */ }
    }
    if (this.cameFromLink) { this.hud.showCover(); this.cameFromLink = false; }
    this.challenge.clear();
    this.modes();
  }
  /**
   * Whether the innings that just ended has a card to show, and whether it
   * was a record. A match ends on the room rather than the card, but the card
   * is where the Top 50 is claimed, so the room keeps a way to it.
   */
  private matchCard: boolean | null = null;
  private cameFromLink = false;
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
      case 'share': {
        this.challenge.sent = true;
        const link = challengeLink(code);
        const mine = view?.mine;
        const batted = !!mine && (mine.status === 'done' || mine.status === 'forfeit');
        const rematch = this.rematchLine;
        const message = (withScore: boolean) => {
          const text = rematch ? copy.rematch(link, rematch.them, rematch.tally)
            : batted ? copy.set(link, withScore ? mine!.runs : undefined) : copy.invite(link);
          return { text, whatsapp: whatsapp(text) };
        };
        this.hud.inviteSheet(code, message, batted && !rematch, view?.closes ?? '');
        return;
      }
      case 'nudge':
        window.open(whatsapp(copy.nudge(challengeLink(code))), '_blank', 'noopener');
        return;
      case 'play':
      case 'resume':
        this.startMatchInnings(act === 'resume');
        return;
      case 'rematch': {
        const them = view?.result?.them;
        const tally = them ? rivalryView(them.playerId, them)?.tally ?? null : null;
        this.rematchLine = them && tally ? { them: them.name, tally } : null;
        this.challenge.stopWatching();
        await this.createRoom({ rematchOf: code });
        return;
      }
      case 'new':
        this.rematchLine = null;
        this.challenge.stopWatching();
        await this.createRoom();
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
        this.showBlastCard(record);
        return;
      }
      case 'home':
      case 'solo':
      case 'retry':
        if (this.pending.length) { this.nextResult(); return; }
        this.leaveRoom();
        return;
    }
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
    this.mode = 'CLASSIC';
    this.start();
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
    // Kept fresh while the ghost is still batting, so their balls arrive in
    // time to flash. Once they are done, or if they never started, there is
    // nothing a poll could bring and it stops on its own.
    this.challenge.watch(() => {
      const ghost = this.challenge.ghost;
      if (!ghost || ghost.status !== 'batting') this.challenge.stopWatching();
    });
    if (this.challenge.ghost?.status !== 'batting') this.challenge.stopWatching();
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
      this.cameFromLink = true;
      if (!opened.ok || !opened.challenge) {
        this.hud.offline(opened.retry ? null : opened.reason ?? null);
        return;
      }
      if (this.challenge.isIn(this.player)) { this.showRoom(); return; }
      const view = this.challenge.view(this.player);
      // A room that is over for good is shown as it stands. One that is
      // finished but still open takes a third batter — that is how a forwarded
      // link becomes a leaderboard — so it is offered like any other.
      if (view && (view.state === 'expired' || view.kind === 'void')) { this.showRoom(); return; }
      // Not in it yet: who it is from, and a way in. The host, unless somebody
      // else has already batted — then the innings to beat is the one to name.
      const rows = opened.challenge.players;
      const batted = rows.find(row => row.status === 'done' || row.status === 'batting') ?? null;
      const from = batted ?? rows.find(row => row.host) ?? rows[0] ?? null;
      this.asking = 'join';
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
  private async showChallenges() {
    if (!this.player) return;
    this.hud.closeModes();
    const list = await ChallengeRun.mine(this.player);
    if (list) this.rooms = list;
    const shown = this.rooms ?? { yourMove: [], waitingOnThem: [], done: [], unseen: [] };
    this.hud.challengesOpen(shown.yourMove.length, shown.waitingOnThem.length);
    this.hud.challengeList(listSections(shown, this.player));
  }

  /** What a row of the list does. */
  private async listAct(act: 'open' | 'rival' | 'drop', code: string, playerId?: string) {
    if (!this.player) return;
    if (act === 'drop') {
      hideChallenge(code);
      const shown = this.rooms ?? { yourMove: [], waitingOnThem: [], done: [], unseen: [] };
      const rest = (rows: Challenge[]) => rows.filter(room => room.code !== code);
      this.rooms = { yourMove: rest(shown.yourMove), waitingOnThem: rest(shown.waitingOnThem), done: rest(shown.done), unseen: shown.unseen };
      this.hud.challengeList(listSections(this.rooms, this.player));
      return;
    }
    const room = [...(this.rooms?.yourMove ?? []), ...(this.rooms?.waitingOnThem ?? []), ...(this.rooms?.done ?? [])]
      .find(one => one.code === code) ?? null;
    if (act === 'rival' && playerId) {
      const row = room?.players.find(one => one.playerId === playerId) ?? null;
      const view = rivalryView(playerId, row ? { name: row.name, avatar: row.avatar } : undefined);
      if (!view) return;
      this.rival = view.them;
      this.hud.rivalry(view);
      return;
    }
    if (room) this.challenge.room = room;
    const answer = await this.challenge.open(code);
    if (!answer.ok && !room) { this.hud.offline(answer.reason ?? null); return; }
    this.cameFromLink = false;
    this.pinRoom(code);
    this.showRoom();
  }
  private rival: { playerId: string; name: string; avatar: number } | null = null;

  /** A fresh room aimed at the same person, with the message pre-addressed. */
  private async challengeRival() {
    const them = this.rival;
    if (!them) return;
    const tally = rivalryView(them.playerId, them)?.tally ?? 'Fresh start';
    this.rematchLine = { them: them.name, tally };
    await this.createRoom();
  }

  private async copyChallengeLink() {
    if (!this.challenge.code) return;
    try { await navigator.clipboard.writeText(challengeLink(this.challenge.code)); } catch { /* Then the key does nothing. */ }
  }

  private async shareChallengeLink() {
    if (!this.challenge.code) return;
    const url = challengeLink(this.challenge.code);
    try { await navigator.share?.({ url }); } catch { /* Dismissed, which is not a failure. */ }
  }

  private snapshot() {
    return { phase: this.phase, lesson: this.lesson, seed: this.seed, elapsed: Math.round(this.elapsed), balls: this.score.balls, runs: this.score.runs, wickets: this.score.wickets,
      line: this.delivery?.line ?? '—', effectiveLine: this.delivery ? effectiveLine(this.delivery) : '—', style: this.delivery?.style ?? '—', speed: this.delivery?.speedKph ?? '—',
      baseX: this.delivery?.baseTargetX.toFixed(3) ?? '—', finalX: this.delivery?.finalTargetX.toFixed(3) ?? '—',
      contactAt: Math.round(this.delivery?.idealContactTimeMs ?? 0), timingDelta: this.outcome?.timingDeltaMs?.toFixed(0) ?? '—', timingGrade: this.outcome?.timingGrade ?? '—',
      compatibility: this.outcome?.compatibility ?? '—', quality: this.outcome?.quality.toFixed(2) ?? '—', outcome: this.outcome?.feedback ?? '—', shot: this.attempt?.shotType ?? '—',
      confidence: this.confidence.value, primed: this.isPrimed, chargeMiss: this.chargeMiss ?? '—', chargeable: this.delivery ? chargeable(this.delivery) : '—', advance: this.outcome?.advance ?? false };
  }
  dispose() {
    this.disposed = true; cancelAnimationFrame(this.frameId); this.input?.dispose(); this.scene?.dispose(); this.audio.dispose();
    window.removeEventListener('keydown', this.shortcuts); window.removeEventListener('blur', this.blur); document.removeEventListener('visibilitychange', this.visibility);
  }
}


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
    const others = room.players.filter(one => one.playerId !== me);
    const lead = view.result?.them ?? others.find(one => one.status === 'done' || one.status === 'batting') ?? others[0] ?? null;
    const them = lead ? { playerId: lead.playerId, name: lead.name, avatar: lead.avatar } : null;
    const base = { code: room.code, them, others: others.length };
    switch (view.kind) {
      case 'chase': {
        const batting = others.find(one => one.status === 'batting');
        return { ...base, head: 'Your move', note: batting ? `${batting.name} is batting now` : `${lead?.name ?? 'They'} batted · beat it blind` };
      }
      case 'resume': return { ...base, head: 'Your move', note: `You were on ball ${view.mine?.balls ?? 0} · resume` };
      case 'lobby': return { ...base, head: 'Your move', note: others.length ? `${others.length === 1 ? lead?.name : `${others.length} in`} · nobody has batted` : 'Nobody has joined yet · send the link' };
      case 'waiting': return { ...base, head: 'Waiting', note: `You made ${view.mine?.runs ?? 0} · ${view.closes}` };
      case 'spectate': return { ...base, head: 'Live', note: `${view.live?.row.name} ${view.live?.needs}` };
      case 'result': {
        const result = view.result!;
        const margin = Math.abs((view.mine?.runs ?? 0) - (result.them?.runs ?? 0));
        return {
          ...base, outcome: result.outcome,
          head: result.outcome === 'W' ? 'Won' : result.outcome === 'D' ? 'Drawn' : 'Lost',
          note: result.forfeit ? 'by forfeit' : result.outcome === 'D' ? `${view.mine?.runs} each` : `${view.mine?.runs} vs ${result.them?.runs} · by ${margin}`,
        };
      }
      case 'expired': return { ...base, outcome: '—', head: 'Closed', note: view.mine && view.mine.status === 'done' ? `${lead?.name ?? 'Nobody'} never batted` : 'Nobody batted in the week' };
      case 'void': return { ...base, outcome: '—', head: 'Void', note: 'Made on an older version' };
      default: return { ...base, outcome: '—', head: 'Over', note: 'You were not in this one' };
    }
  };
  return {
    yourMove: list.yourMove.map(row),
    waitingOnThem: list.waitingOnThem.map(row),
    done: list.done.map(row),
  };
}
