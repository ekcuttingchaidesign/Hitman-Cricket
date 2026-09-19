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
import { advanceShot, gradeOf, loftedDrive, slogSweep, sweeps, chargeable, sweepable, resolveShot } from './game/ShotResolver';
import { TUTORIAL, tutorialDelivery, tutorialOutcome } from './game/Tutorial';
import type { Delivery, Ending, GamePhase, ShotAttempt, ShotOutcome, ShotType } from './game/types';
import { GameScene } from './scene/GameScene';
import { HUD } from './ui/HUD';
import {
  fetchBoard, fetchSurviveBoard, submitInnings, submitSurvive,
  type BoardPayload, type SurvivePayload,
} from './game/board-api';
import { readPlayer, writePlayer } from './game/player';
import { cardOffer, type BoardTab, type CardOffer } from './ui/Leaderboard';
import { openFeedback } from './ui/Feedback';
import { feedbackGiven, type FeedbackContext } from './game/feedback';
import { asSurvive, surviveOffer } from './ui/SurviveBoard';
import type { SurviveRow } from './game/survive-board';
import { playerId } from './game/identity';
import { asInnings } from './ui/Leaderboard';
import type { BoardRow } from './game/leaderboard';
import {
  ballsBand, blowsBand, counting, inningsBand, injuryBand, marksPassed, scoreBand, track, trackOnce,
} from './game/analytics';
import { hurtNoteSeen, markHurtNoteSeen } from './game/private-mode';
import { readVisits, today, visiting, writeVisits } from './game/visits';
/** The phases that count as playing. Not the cover, the end card or a pause. */
const LIVE: GamePhase[] = ['READY', 'BOWLER_RUNUP', 'BALL_IN_FLIGHT', 'SHOT_RESOLVE', 'RESULT'];
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
 */
const CHARGE_ONLY = !!import.meta.env.VITE_CHARGE_ONLY;
/**
 * How slowly the clock runs through the charge, for comparing playtest
 * builds against each other. Half speed unless a build says otherwise; 1 is
 * no slow motion at all.
 */
const CHARGE_SLOWMO = Number(import.meta.env.VITE_CHARGE_SLOWMO) || 0.5;

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
  /** Which ladder the sheet is showing, which is the tab drawn as the live one. */
  private boardTab: BoardTab = 'classic';
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
    try { this.best = Math.max(0, Math.min(180, Number(localStorage.getItem('hitman-best')) || 0)); } catch { /* Storage may be disabled. */ }
    this.hud = new HUD(root, this.best);
    // Neither of these is allowed to hold up an innings. Settling the id touches
    // three stores, one of which can hang; the board is a network call that may
    // never answer. Both run alongside the game, and the cover's trophy line
    // picks up the board's leader if and when one arrives.
    void playerId().then(id => { this.player = id; }).catch(() => {});
    this.countVisit();
    // A survive-only build has no board behind it and no screen that opens one,
    // so it does not go looking. On GitHub Pages that request is a guaranteed
    // 404 on every load — harmless, since a board that never answers is already
    // handled, but a console full of red is a bad first impression for somebody
    // who was handed the link to give an opinion on the batting.
    if (!SURVIVE_ONLY) void this.loadBoard();
    try { this.scene = new GameScene(this.hud.viewport); } catch (error) { console.error(error); track('webgl-fail', 'WebGL unavailable'); this.hud.error(); return; }
    this.input = new InputManager(() => this.phase === 'BALL_IN_FLIGHT', this.clockAt, this.shoot, this.hud.viewport);
    // The play key opens the picker rather than an innings — unless a link has
    // already named the mode, in which case it is that mode's play key.
    this.hud.on('start', () => (this.locked ? this.start() : this.modes()));
    this.hud.on('mode-classic', () => { this.hud.closeModes(); this.choose('CLASSIC'); });
    this.hud.on('mode-survive', () => { this.hud.closeModes(); this.choose('SURVIVE'); });
    this.hud.on('modes-cancel', () => this.hud.closeModes());
    this.hud.on('survive-again', this.start);
    this.hud.on('survive-modes', this.modes);
    this.hud.on('again', this.start); this.hud.on('pause', this.togglePause); this.hud.on('resume', this.togglePause);
    this.hud.on('tutorial', this.startTutorial); this.hud.on('skip-tutorial', this.start); this.hud.on('tutorial-play', this.start);
    this.hud.on('sound', this.toggleSound);
    this.hud.on('restart', this.start);
    this.hud.on('share', () => { void this.hud.share(); });
    this.hud.on('board', this.showBoard);
    // Both ladders exist, so the sheet carries a way between them.
    this.hud.showBoardTabs(SHOW_SURVIVE && !SURVIVE_ONLY);
    this.hud.onBoardTab = this.tabBoard;
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
    } else if (!SHOW_SURVIVE) {
      // Nothing to pick between, so Play is the classic innings and the picker
      // never opens. The same lock a named mode uses, arrived at from the build
      // rather than from the link.
      this.mode = 'CLASSIC';
      this.locked = true;
      this.hud.lockMode(false);
    }
    // The cover has music of its own. It is asked for rather than waited on:
    // a browser that will not play it yet is not a failure, it is a browser
    // nobody has touched, and the first touch of the page lets it through.
    this.audio.music('cover');
    this.frameId = requestAnimationFrame(this.frame);
    if (this.debug) Object.defineProperty(window, '__cricket', { configurable: true, value: {
      snapshot: () => this.snapshot(), batter: () => this.scene.inspectBatter(), bowler: () => this.scene.inspectBowler(),
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
  private modes = () => { this.audio.music('cover'); this.hud.modes(); };
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
  /** `?charge=1` likewise. Only the classic innings has a meter to fill. */
  private chargeOnly = CHARGE_ONLY || new URLSearchParams(location.search).get('charge') === '1';
  /**
   * The ball the charge is for, in place of whatever was drawn: on the stumps,
   * on a length, at a medium pacer's speed, and the meter filled to walk at it.
   * Nothing else about the innings changes — the same scoring, the same
   * wickets — so a mistimed charge is still a mistimed charge.
   */
  private chargeable(delivery: Delivery): Delivery {
    if (!this.chargeOnly || this.surviving || this.lesson >= 0) return delivery;
    this.confidence.value = CONFIDENCE_FULL;
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
  private setPhase(phase: GamePhase) { this.phase = phase; this.phaseStart = this.elapsed; this.hud.phase(phase, !!this.isPrimed); }
  private shoot = (shotType: ShotType, inputTimeMs: number) => {
    if (this.phase !== 'BALL_IN_FLIGHT' || this.attempt) return;
    // The first swing of the session, tutorial or not: a player who never plays
    // one did not understand the controls, and that is a different problem from
    // a player who played and lost.
    trackOnce('first-shot', 'First shot played');
    this.attempt = { shotType, inputTimeMs };
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
  private set primed(value: 'CHARGE' | 'SWEEP' | null) {
    if (value === 'CHARGE') this.chargeBall = true;
    if (value === this.isPrimed) return;
    this.isPrimed = value; this.showConfidence();
    this.hud.phase(this.phase, !!value);
  }
  private get primed() { return this.isPrimed; }
  private isPrimed: 'CHARGE' | 'SWEEP' | null = null;
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
  private toggleSound = () => { this.audio.setMuted(!this.audio.muted); this.audio.unlock(); this.hud.sound(this.audio.muted); };
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
    const payload = await fetchBoard();
    if (this.disposed || !payload) return;
    this.boardSeen = true;
    this.board = payload.rows;
    this.hud.leader(payload.rows[0]?.runs ?? 0, this.best);
  }

  /** The Test fifty, the same way. The cover quotes the other one, not this. */
  private async loadSurviveBoard() {
    const payload = await fetchSurviveBoard();
    if (this.disposed || !payload) return;
    this.surviveSeen = true;
    this.surviveRows = payload.rows;
  }

  /**
   * The board, opened. The sheet goes up straight away saying it is fetching,
   * rather than the button doing nothing for a second and then a screen
   * appearing — and if the fetch fails it says so instead of showing an empty
   * fifty or, worse, fifty invented names.
   */
  private showBoard = () => {
    this.mark('board-open', 'Board opened');
    // Mid-innings the board is a distraction with a ball on its way, so it
    // pauses first, the way the instructions do. The pause card is still behind
    // it when the sheet is put away, which is the point.
    if (!['START', 'PAUSED', 'INNINGS_END'].includes(this.phase)) this.togglePause();
    // The board a player asks for is the board for the innings they are in. The
    // other one is a tab away, and never the one they land on.
    this.boardActions = false;
    this.openBoard(this.surviving ? 'survive' : 'classic');
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

  /** The other ladder, from the tab over the sheet. */
  private tabBoard = (mode: BoardTab) => {
    if (mode === this.boardTab) return;
    this.mark(`board-tab-${mode}`, 'The other board opened from a tab');
    this.openBoard(mode);
  };

  private openBoard(mode: BoardTab) {
    if (mode === 'survive') this.showSurviveBoard();
    else this.showClassicBoard();
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
    const mine = this.phase === 'INNINGS_END' && !this.surviving;
    const view = { youId: this.player, yours: mine ? asInnings(this.score) : null, actions: this.boardActions && mine };
    if (this.board.length) this.hud.board({ ...view, rows: this.board, state: 'ready' as const });
    else this.hud.board({ ...view, rows: [], state: 'loading' as const });
    void fetchBoard().then(payload => {
      if (this.disposed || !this.hud.boardOpen || this.boardTab !== 'classic') return;
      if (payload) { this.boardSeen = true; this.board = payload.rows; }
      this.hud.board({ ...view, rows: this.board, state: payload ? 'ready' : 'offline' });
    });
  }

  /** The same opening, over the Test ladder. */
  private showSurviveBoard() {
    this.boardTab = 'survive';
    const mine = this.phase === 'INNINGS_END' && this.surviving;
    const view = { youId: this.player, yours: mine ? this.survived() : null, actions: this.boardActions && mine };
    this.hud.surviveBoard({
      ...view,
      rows: this.surviveRows,
      state: this.surviveRows.length ? 'ready' as const : 'loading' as const,
    });
    void fetchSurviveBoard().then(payload => {
      // A fetch that lands after the player has tabbed away belongs to a sheet
      // that is no longer on screen, and drawing it would put the other ladder
      // back under the tab they just chose.
      if (this.disposed || !this.hud.boardOpen || this.boardTab !== 'survive') return;
      if (payload) { this.surviveSeen = true; this.surviveRows = payload.rows; }
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
      if (key === 'ESCAPE') { event.preventDefault(); this.hud.closeModes(); }
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
    if (this.debug) this.hud.debug(this.snapshot());
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
    // Half speed. It ran at a third, and with the run down the pitch now
    // inside the window as well as the hit, a third of that read as a
    // replay rather than a beat: over a second and a half of him walking at
    // the ball. Half keeps the run readable and the hit still lands.
    return since < 340 ? this.chargeSlowmo : 1;
  }
  private update() {
    const age = this.elapsed - this.phaseStart;
    if (this.phase === 'READY' && age >= this.readyMs) {
      this.delivery = this.lesson >= 0 ? tutorialDelivery(TUTORIAL[this.lesson], this.elapsed + GAME.runupMs)
        : this.chargeable(this.generator.next(this.elapsed + GAME.runupMs));
      this.attempt = null; this.outcome = null; this.bounced = false; this.primed = null; this.chargeBall = false;
      // The ball is settled before the bowler moves, so the call goes out with
      // him. Held to the flight it gave the player under a second to see the
      // cue, change the shot he had in mind and time it — and that was most of
      // why a full meter kept going unspent.
      this.primed = !this.charged ? null
        : chargeable(this.delivery) ? 'CHARGE'
        : sweepable(this.delivery) ? 'SWEEP' : null;
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
    if (!result.ok) { this.mark('claim-failed', 'Claim rejected'); return this.hud.claimFailed(result.reason ?? 'That did not go through.'); }
    this.mark('claim-done', 'Innings put on the board');
    writePlayer({ name: entry.name.trim(), avatar: entry.avatar });
    // The board is where the place the player just took is written, so that is
    // where they are taken — with the keys carried onto it, since it is now the
    // screen they are on.
    this.hud.claimDone();
    // Each call answers with its own ladder's board; which one came back is
    // decided by which one was asked, so the mode is what reads it.
    if (this.surviving) {
      if (result.board) this.surviveRows = (result.board as SurvivePayload).rows;
      this.boardActions = true;
      return this.openBoard('survive');
    }
    if (result.board) this.board = (result.board as BoardPayload).rows;
    // Drawn from what the store just handed back rather than fetched again, so
    // the place the player took is on screen and not a cached fifty from before
    // they took it. The tab is set by hand for the same reason.
    this.boardTab = 'classic';
    this.boardActions = true;
    this.hud.board({ rows: this.board, youId: this.player, state: 'ready', actions: true });
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

  private end() {
    this.setPhase('INNINGS_END');
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
    this.hud.end(this.score, this.best, record);
    // On every card, first innings included. It was held back for a second
    // innings on the theory that the first card belongs to the score and the
    // board — but a line nobody ever sees asks nothing at all, and most people
    // who play once play once.
    this.hud.offerFeedback({ card: true, cover: this.best > 0 });
    this.offerBoard();
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
