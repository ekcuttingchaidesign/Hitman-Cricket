import { ADVANCE, CONFIDENCE_FULL, GAME } from './config/gameplay';
import { SPECIALS as SURVIVE_SPECIALS, STYLES as SURVIVE_STYLES, SURVIVE } from './config/survive';
import { Confidence } from './game/Confidence';
import { Health } from './game/Health';
import { endingOf, resolveSurvive, sledgeDue, teamScore } from './game/Survive';
import { CLASSIC_LIMITS, type InningsLimits } from './game/ScoreManager';
import { CLASSIC_PLAN, type BowlingPlan } from './game/DeliveryGenerator';
import { Sledger } from './game/Sledge';
import { GameAudio, outcomeSound } from './game/Audio';
import { DeliveryGenerator } from './game/DeliveryGenerator';
import { effectiveLine, flightProgress } from './game/DeliveryTrajectory';
import { InputManager } from './game/InputManager';
import { ScoreManager } from './game/ScoreManager';
import { SeededRandom } from './game/SeededRandom';
import { advanceShot, chargeable, resolveShot } from './game/ShotResolver';
import { TUTORIAL, tutorialDelivery, tutorialOutcome } from './game/Tutorial';
import type { Delivery, Ending, GamePhase, ShotAttempt, ShotOutcome, ShotType } from './game/types';
import { GameScene } from './scene/GameScene';
import { HUD } from './ui/HUD';
import { fetchBoard, submitInnings } from './game/board-api';
import { readPlayer, writePlayer } from './game/player';
import { cardOffer } from './ui/Leaderboard';
import { playerId } from './game/identity';
import { asInnings } from './ui/Leaderboard';
import type { BoardRow } from './game/leaderboard';
/** Which innings is being played. The two share a loop and almost nothing else. */
export type GameMode = 'CLASSIC' | 'SURVIVE';

const SURVIVE_LIMITS: InningsLimits = {
  totalBalls: SURVIVE.totalBalls, maxWickets: SURVIVE.maxWickets, ballsPerOver: SURVIVE.ballsPerOver,
};
const SURVIVE_PLAN: BowlingPlan = {
  styles: SURVIVE_STYLES, specials: SURVIVE_SPECIALS, travelScale: SURVIVE.travelScale,
  // This bowler is aiming: the bouncer goes at the head and the express ball at
  // fifth stump, rather than both being dealt whatever line comes next.
  aimed: true,
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
  private rng = new SeededRandom(1); private generator = new DeliveryGenerator(this.rng);
  private delivery: Delivery | null = null; private attempt: ShotAttempt | null = null; private outcome: ShotOutcome | null = null;
  private best = 0; private bounced = false; private seed = 0;
  /** The fifty as last fetched, and who the board thinks you are. */
  private board: BoardRow[] = [];
  /**
   * Whether the board has ever answered. Not the same as holding rows: a board
   * that answered with nothing is the launch-day board, and somebody has to be
   * allowed to be first on it.
   */
  private boardSeen = false;
  private player: string | null = null;
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
  constructor(root: HTMLElement) {
    try { this.best = Math.max(0, Math.min(180, Number(localStorage.getItem('hitman-best')) || 0)); } catch { /* Storage may be disabled. */ }
    this.hud = new HUD(root, this.best);
    // Neither of these is allowed to hold up an innings. Settling the id touches
    // three stores, one of which can hang; the board is a network call that may
    // never answer. Both run alongside the game, and the cover's trophy line
    // picks up the board's leader if and when one arrives.
    void playerId().then(id => { this.player = id; }).catch(() => {});
    void this.loadBoard();
    try { this.scene = new GameScene(this.hud.viewport); } catch (error) { console.error(error); this.hud.error(); return; }
    this.input = new InputManager(() => this.phase === 'BALL_IN_FLIGHT', this.clockAt, this.shoot, this.hud.viewport);
    // The play key opens the picker rather than an innings — unless a link has
    // already named the mode, in which case it is that mode's play key.
    this.hud.on('start', () => (this.locked ? this.start() : this.hud.modes()));
    this.hud.on('mode-classic', () => { this.hud.closeModes(); this.choose('CLASSIC'); });
    this.hud.on('mode-survive', () => { this.hud.closeModes(); this.choose('SURVIVE'); });
    this.hud.on('modes-cancel', () => this.hud.closeModes());
    this.hud.on('survive-again', this.start);
    this.hud.on('survive-modes', () => { this.hud.closeModes(); this.hud.modes(); });
    this.hud.on('again', this.start); this.hud.on('pause', this.togglePause); this.hud.on('resume', this.togglePause);
    this.hud.on('tutorial', this.startTutorial); this.hud.on('skip-tutorial', this.start); this.hud.on('tutorial-play', this.start);
    this.hud.on('sound', this.toggleSound);
    this.hud.on('restart', this.start);
    this.hud.on('share', () => { void this.hud.share(); });
    this.hud.on('board', this.showBoard);
    this.hud.on('claim', this.startClaim);
    this.hud.on('claim-cancel', () => this.hud.closeClaim());
    (this.hud.viewport.querySelector('#card-claim') as HTMLFormElement).addEventListener('submit', event => {
      event.preventDefault();
      void this.sendClaim();
    });
    this.hud.on(document.getElementById('cover-board') ? 'cover-board' : 'panel-board', this.showBoard);
    this.hud.on('help', () => { if (!['START', 'PAUSED', 'INNINGS_END'].includes(this.phase)) this.togglePause(); this.hud.help(); });
    this.hud.on('fullscreen', () => {
      if (document.fullscreenElement) void document.exitFullscreen();
      else if (this.hud.viewport.requestFullscreen) void this.hud.viewport.requestFullscreen().catch(() => {});
    });
    window.addEventListener('keydown', this.shortcuts); document.addEventListener('visibilitychange', this.visibility);
    window.addEventListener('blur', this.blur);
    // A bundle built survive-only plays one innings and offers no way out of
    // it — that is the whole of what makes it publishable somewhere with no
    // board behind it. A `?mode=` link does the same thing at runtime.
    const named = import.meta.env.VITE_SURVIVE_ONLY
      ? 'SURVIVE'
      : new URLSearchParams(location.search).get('mode')?.toUpperCase();
    if (named === 'SURVIVE' || named === 'CLASSIC') {
      this.mode = named as GameMode;
      this.locked = true;
      this.hud.lockMode();
    }
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
  /** Pick an innings. The mode is remembered, so Play Again replays the same one. */
  choose = (mode: GameMode) => { this.mode = mode; this.start(); };
  start = () => {
    this.lesson = -1;
    this.audio.stop(); this.audio.unlock();
    this.score = new ScoreManager(this.limits); this.confidence = new Confidence(); this.health = new Health();
    this.sledger = new Sledger(); this.sledgeDue = false; this.ending = null;
    const param = new URLSearchParams(location.search).get('seed');
    this.seed = param !== null && Number.isFinite(Number(param)) ? Number(param) >>> 0 : crypto.getRandomValues(new Uint32Array(1))[0];
    this.rng = new SeededRandom(this.seed);
    // The score at the other end is drawn first, off the innings seed, so that
    // the same seed always walks out to the same scoreboard. Drawing it from the
    // clock would have made a share card a lie the moment it was reloaded.
    this.chasing = this.surviving ? teamScore(this.rng) : 0;
    this.generator = new DeliveryGenerator(this.rng, this.plan);
    this.delivery = null; this.attempt = null; this.outcome = null; this.elapsed = 0; this.primed = false;
    this.input.reset(); this.scene.reset(); this.scene.whites(this.surviving);
    this.hud.start(this.surviving);
    this.hud.score(this.score); this.showConfidence();
    if (this.surviving) this.hud.target(this.chasing, this.score.runs, this.score.balls, this.score.wickets);
    this.setPhase('READY');
    (document.activeElement as HTMLElement | null)?.blur();
  };
  /** Three scripted balls, no wickets, and a way out at any point. */
  startTutorial = () => {
    this.mode = 'CLASSIC';
    this.scene.whites(false);
    this.audio.stop(); this.audio.unlock(); this.score = new ScoreManager();
    this.delivery = null; this.attempt = null; this.outcome = null; this.elapsed = 0; this.lesson = 0; this.primed = false; this.confidence = new Confidence(); this.sledger = new Sledger(); this.sledgeDue = false;
    this.input.reset(); this.scene.reset(); this.hud.startTutorial(); this.showConfidence(); this.setPhase('READY');
    this.hud.coach(TUTORIAL[0], 1, TUTORIAL.length);
    (document.activeElement as HTMLElement | null)?.blur();
  };
  private get surviving() { return this.mode === 'SURVIVE'; }
  private get limits() { return this.surviving ? SURVIVE_LIMITS : CLASSIC_LIMITS; }
  private get plan() { return this.surviving ? SURVIVE_PLAN : CLASSIC_PLAN; }
  private get readyMs() { return this.surviving ? SURVIVE.readyMs : GAME.readyMs; }
  private get resultMs() {
    const base = this.surviving ? SURVIVE.resultMs : GAME.resultMs;
    // The innings that ends with him on the floor is held open long enough for
    // him to get there. Every other ball is the usual beat.
    return this.ending === 'RETIRED' ? base + SURVIVE.felledMs : base;
  }
  /** How long after the ideal moment a swing still counts as a swing at all. */
  private get swingWindow() { return this.surviving ? SURVIVE.timing.poor : GAME.timing.poor; }
  private setPhase(phase: GamePhase) { this.phase = phase; this.phaseStart = this.elapsed; this.hud.phase(phase, this.isPrimed); }
  private shoot = (shotType: ShotType, inputTimeMs: number) => {
    if (this.phase !== 'BALL_IN_FLIGHT' || this.attempt) return;
    this.attempt = { shotType, inputTimeMs };
    const charging = advanceShot(this.delivery!, this.attempt, this.charged);
    this.primed = false;
    this.scene.swing(shotType, this.elapsed, this.delivery!, charging);
    this.hud.select(shotType, charging);
  };
  /**
   * Confidence is only a shot outside the tutorial, where nothing is scored —
   * and it does not exist at all in Survive. A tailender walking down the pitch
   * at a man bowling at 170 is not a shot, it is a decision to be hit.
   */
  private get charged() { return this.lesson < 0 && !this.surviving && this.confidence.full; }
  /** This ball can be charged, and the meter is full to do it. */
  private set primed(value: boolean) {
    if (value) this.chargeBall = true;
    if (value === this.isPrimed) return;
    this.isPrimed = value; this.showConfidence();
    this.hud.phase(this.phase, value);
  }
  private get primed() { return this.isPrimed; }
  private isPrimed = false;
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
    if (this.surviving) return this.hud.health(this.health.fraction, this.health.critical);
    this.hud.confidence(this.confidence.fraction, this.isPrimed);
  }
  private toggleSound = () => { this.audio.setMuted(!this.audio.muted); this.audio.unlock(); this.hud.sound(this.audio.muted); };
  private togglePause = () => {
    if (this.phase === 'START' || this.phase === 'INNINGS_END' || this.hud.helpOpen) return;
    if (this.phase === 'PAUSED') { this.audio.unlock(); this.phase = this.previousPhase; this.hud.pause(false); (document.activeElement as HTMLElement | null)?.blur(); }
    else { this.input.cancel(); this.audio.stop(); this.previousPhase = this.phase; this.phase = 'PAUSED'; this.hud.pause(true); }
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

  /**
   * The board, opened. The sheet goes up straight away saying it is fetching,
   * rather than the button doing nothing for a second and then a screen
   * appearing — and if the fetch fails it says so instead of showing an empty
   * fifty or, worse, fifty invented names.
   */
  private showBoard = () => {
    // Mid-innings the board is a distraction with a ball on its way, so it
    // pauses first, the way the instructions do. The pause card is still behind
    // it when the sheet is put away, which is the point.
    if (!['START', 'PAUSED', 'INNINGS_END'].includes(this.phase)) this.togglePause();
    const played = this.phase === 'INNINGS_END' ? asInnings(this.score) : null;
    const view = { youId: this.player, yours: played };
    if (this.board.length) this.hud.board({ ...view, rows: this.board, state: 'ready' as const });
    else this.hud.board({ ...view, rows: [], state: 'loading' as const });
    void fetchBoard().then(payload => {
      if (this.disposed || !this.hud.boardOpen) return;
      if (payload) { this.boardSeen = true; this.board = payload.rows; }
      this.hud.board({ ...view, rows: this.board, state: payload ? 'ready' : 'offline' });
    });
  };
  private visibility = () => { if (document.hidden && !['START', 'INNINGS_END', 'PAUSED'].includes(this.phase)) this.togglePause(); };
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
      if (this.locked || this.phase === 'INNINGS_END') this.start(); else this.hud.modes();
    }
    else if (key === 'B' && !this.surviving) { event.preventDefault(); this.showBoard(); }
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
   * The charge, and only the charge, gets a beat of slow motion off the bat. The
   * ball is already resolved by then, so nothing the player can still affect is
   * running slowly — the clock only stretches the replay of a shot he has won.
   */
  private get timeScale() {
    if (this.phase !== 'SHOT_RESOLVE' || !this.outcome?.advance) return 1;
    const since = this.elapsed - this.contactAt;
    return since >= 0 && since < 340 ? 0.38 : 1;
  }
  private update() {
    const age = this.elapsed - this.phaseStart;
    if (this.phase === 'READY' && age >= this.readyMs) {
      this.delivery = this.lesson >= 0 ? tutorialDelivery(TUTORIAL[this.lesson], this.elapsed + GAME.runupMs)
        : this.generator.next(this.elapsed + GAME.runupMs);
      this.attempt = null; this.outcome = null; this.bounced = false; this.primed = false; this.chargeBall = false;
      // The ball is settled before the bowler moves, so the call goes out with
      // him. Held to the flight it gave the player under a second to see the
      // cue, change the shot he had in mind and time it — and that was most of
      // why a full meter kept going unspent.
      this.primed = this.charged && chargeable(this.delivery);
      this.scene.reset(); this.input.reset(); this.showConfidence(); this.setPhase('BOWLER_RUNUP');
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
        if (this.lesson >= TUTORIAL.length) { this.lesson = -1; this.setPhase('START'); this.hud.tutorialComplete(); }
        else { this.setPhase('READY'); this.hud.coach(TUTORIAL[this.lesson], this.lesson + 1, TUTORIAL.length); }
      } else if (this.surviving ? this.ending : this.score.ended) this.end(); else this.setPhase('READY');
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
      // The Test match needles on a clock rather than on a run of quiet balls.
      this.sledgeDue = this.surviving ? sledgeDue(this.score.balls) : this.sledger.record(this.outcome);
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
    this.hud.offerClaim(
      cardOffer(this.boardSeen, this.board, played, Date.now(), this.player),
      readPlayer(), this.board, played, this.player,
    );
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
    if (this.hud.offerKind === 'standing') return this.showBoard();
    this.hud.openClaim();
  };

  /**
   * The innings, offered. The store ranks it and answers with the board it
   * made, so where the player actually landed comes back rather than being
   * guessed at — and the board on screen is up to date the moment they open it.
   */
  private async sendClaim() {
    const entry = this.hud.claimEntry.name ? this.hud.claimEntry : readPlayer();
    if (!entry || !this.player) return this.hud.openClaim();
    this.hud.claimSending(true);
    const result = await submitInnings(this.player, entry.name, entry.avatar, asInnings(this.score));
    if (this.disposed) return;
    if (!result.ok) return this.hud.claimFailed(result.reason ?? 'That did not go through.');
    writePlayer({ name: entry.name.trim(), avatar: entry.avatar });
    if (result.board) this.board = result.board.rows;
    // The board is where the place the player just took is written, so that is
    // where they are taken — with the keys carried onto it, since it is now the
    // screen they are on.
    this.hud.claimDone();
    this.hud.board({ rows: this.board, youId: this.player, state: 'ready', actions: true });
  }

  private end() {
    this.setPhase('INNINGS_END');
    if (this.surviving) {
      // Survive keeps its own best and its own card, and is deliberately kept
      // off the classic board: the two innings are not comparable and a Survive
      // score standing next to a thirty-ball one would be nonsense in both
      // directions. Its own board is the next piece of work.
      this.hud.endSurvive(this.score, this.health, this.ending ?? 'DRAWN', this.chasing);
      return;
    }
    const record = this.score.runs > this.best; this.best = Math.max(this.best, this.score.runs);
    try { localStorage.setItem('hitman-best', String(this.best)); } catch { /* A session remains playable without persistence. */ }
    this.hud.end(this.score, this.best, record);
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
