import { ADVANCE, CONFIDENCE_FULL, GAME } from './config/gameplay';
import { Confidence } from './game/Confidence';
import { Sledger } from './game/Sledge';
import { GameAudio, outcomeSound } from './game/Audio';
import { DeliveryGenerator } from './game/DeliveryGenerator';
import { effectiveLine, flightProgress } from './game/DeliveryTrajectory';
import { InputManager } from './game/InputManager';
import { ScoreManager } from './game/ScoreManager';
import { SeededRandom } from './game/SeededRandom';
import { advanceShot, chargeable, resolveShot } from './game/ShotResolver';
import { TUTORIAL, tutorialDelivery, tutorialOutcome } from './game/Tutorial';
import type { Delivery, GamePhase, ShotAttempt, ShotOutcome, ShotType } from './game/types';
import { GameScene } from './scene/GameScene';
import { HUD } from './ui/HUD';
import { inventedBoard } from './game/board-fixture';
import { playerId } from './game/identity';
import { asInnings } from './ui/Leaderboard';
import type { BoardRow } from './game/leaderboard';
export class Game {
  private phase: GamePhase = 'START';
  private previousPhase: GamePhase = 'READY';
  private elapsed = 0; private phaseStart = 0; private previousFrame = 0; private frameId = 0;
  private score = new ScoreManager();
  /** Full, it buys one charge down the pitch. */
  private confidence = new Confidence();
  /** Three balls that went nowhere and the fielders have something to say. */
  private sledger = new Sledger();
  private sledgeDue = false;
  private rng = new SeededRandom(1); private generator = new DeliveryGenerator(this.rng);
  private delivery: Delivery | null = null; private attempt: ShotAttempt | null = null; private outcome: ShotOutcome | null = null;
  private best = 0; private bounced = false; private seed = 0;
  /**
   * The board, and who the board thinks you are. Both are stand-ins for the two
   * endpoints that are not built yet: the rows are invented and the id is only
   * ever compared against them, so nothing here reaches the network. When
   * `GET /api/board` exists it fills the same field with the same shape, and
   * the screen that draws it does not change.
   */
  private board: BoardRow[] = inventedBoard();
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
  private disposed = false;
  constructor(root: HTMLElement) {
    try { this.best = Math.max(0, Math.min(180, Number(localStorage.getItem('hitman-best')) || 0)); } catch { /* Storage may be disabled. */ }
    this.hud = new HUD(root, this.best, this.board[0]?.runs ?? 0);
    // Settling the id touches three stores, one of which can hang, so it runs
    // alongside the game rather than in front of it. Nothing waits on it.
    void playerId().then(id => { this.player = id; }).catch(() => {});
    try { this.scene = new GameScene(this.hud.viewport); } catch (error) { console.error(error); this.hud.error(); return; }
    this.input = new InputManager(() => this.phase === 'BALL_IN_FLIGHT', () => this.elapsed, this.shoot, this.hud.viewport);
    this.hud.on('start', this.start); this.hud.on('again', this.start); this.hud.on('pause', this.togglePause); this.hud.on('resume', this.togglePause);
    this.hud.on('tutorial', this.startTutorial); this.hud.on('skip-tutorial', this.start); this.hud.on('tutorial-play', this.start);
    this.hud.on('sound', this.toggleSound);
    this.hud.on('restart', this.start);
    this.hud.on('share', () => { void this.hud.share(); });
    this.hud.on('board', this.showBoard);
    this.hud.on(document.getElementById('cover-board') ? 'cover-board' : 'panel-board', this.showBoard);
    this.hud.on('help', () => { if (!['START', 'PAUSED', 'INNINGS_END'].includes(this.phase)) this.togglePause(); this.hud.help(); });
    this.hud.on('fullscreen', () => {
      if (document.fullscreenElement) void document.exitFullscreen();
      else if (this.hud.viewport.requestFullscreen) void this.hud.viewport.requestFullscreen().catch(() => {});
    });
    window.addEventListener('keydown', this.shortcuts); document.addEventListener('visibilitychange', this.visibility);
    window.addEventListener('blur', this.blur);
    this.frameId = requestAnimationFrame(this.frame);
    if (this.debug) Object.defineProperty(window, '__cricket', { configurable: true, value: {
      snapshot: () => this.snapshot(), batter: () => this.scene.inspectBatter(), bowler: () => this.scene.inspectBowler(),
      // Fills the meter so the charge can be driven straight from a test.
      fillConfidence: () => { this.confidence.value = CONFIDENCE_FULL; this.showConfidence(); },
    } });
  }
  start = () => {
    this.lesson = -1;
    this.audio.stop(); this.audio.unlock(); this.score = new ScoreManager(); this.confidence = new Confidence(); this.sledger = new Sledger(); this.sledgeDue = false;
    const param = new URLSearchParams(location.search).get('seed');
    this.seed = param !== null && Number.isFinite(Number(param)) ? Number(param) >>> 0 : crypto.getRandomValues(new Uint32Array(1))[0];
    this.rng = new SeededRandom(this.seed); this.generator = new DeliveryGenerator(this.rng);
    this.delivery = null; this.attempt = null; this.outcome = null; this.elapsed = 0; this.primed = false;
    this.input.reset(); this.scene.reset(); this.hud.start(); this.hud.score(this.score); this.showConfidence(); this.setPhase('READY');
    (document.activeElement as HTMLElement | null)?.blur();
  };
  /** Three scripted balls, no wickets, and a way out at any point. */
  startTutorial = () => {
    this.audio.stop(); this.audio.unlock(); this.score = new ScoreManager();
    this.delivery = null; this.attempt = null; this.outcome = null; this.elapsed = 0; this.lesson = 0; this.primed = false; this.confidence = new Confidence(); this.sledger = new Sledger(); this.sledgeDue = false;
    this.input.reset(); this.scene.reset(); this.hud.startTutorial(); this.showConfidence(); this.setPhase('READY');
    this.hud.coach(TUTORIAL[0], 1, TUTORIAL.length);
    (document.activeElement as HTMLElement | null)?.blur();
  };
  private setPhase(phase: GamePhase) { this.phase = phase; this.phaseStart = this.elapsed; this.hud.phase(phase, this.isPrimed); }
  private shoot = (shotType: ShotType, inputTimeMs: number) => {
    if (this.phase !== 'BALL_IN_FLIGHT' || this.attempt) return;
    this.attempt = { shotType, inputTimeMs };
    const charging = advanceShot(this.delivery!, this.attempt, this.charged);
    this.primed = false;
    this.scene.swing(shotType, this.elapsed, this.delivery!, charging);
    this.hud.select(shotType, charging);
  };
  /** Confidence is only a shot outside the tutorial, where nothing is scored. */
  private get charged() { return this.lesson < 0 && this.confidence.full; }
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
  private showConfidence() { this.hud.confidence(this.confidence.fraction, this.isPrimed); }
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
  private showBoard = () => {
    // Mid-innings the board is a distraction with a ball on its way, so it
    // pauses first, the way the instructions do. The pause card is still behind
    // it when the sheet is put away, which is the point.
    if (!['START', 'PAUSED', 'INNINGS_END'].includes(this.phase)) this.togglePause();
    const played = this.phase === 'INNINGS_END' ? asInnings(this.score) : null;
    this.hud.board({ rows: this.board, youId: this.player, yours: played });
  };
  private visibility = () => { if (document.hidden && !['START', 'INNINGS_END', 'PAUSED'].includes(this.phase)) this.togglePause(); };
  private blur = () => { if (!['START', 'INNINGS_END', 'PAUSED'].includes(this.phase)) this.togglePause(); };
  private shortcuts = (event: KeyboardEvent) => {
    if (event.repeat || this.hud.helpOpen) return;
    const key = event.key.toUpperCase();
    // The board is the thing on top while it is open, so it answers first: Esc
    // puts it away rather than pausing whatever is behind it, and the keys that
    // start an innings would otherwise start one under a sheet nobody closed.
    if (this.hud.boardOpen) {
      if (key === 'ESCAPE' || key === 'B') { event.preventDefault(); this.hud.closeBoard(); }
      return;
    }
    if (key === 'ENTER' && (this.phase === 'START' || this.phase === 'INNINGS_END')) { event.preventDefault(); this.start(); }
    else if (key === 'B') { event.preventDefault(); this.showBoard(); }
    else if (key === 'R' && this.phase !== 'START') { event.preventDefault(); this.start(); }
    else if (key === 'ESCAPE') { event.preventDefault(); this.togglePause(); }
    else if (key === 'M') { event.preventDefault(); this.toggleSound(); }
  };
  private frame = (time: number) => {
    if (this.disposed) return;
    const dt = this.previousFrame ? Math.min(time - this.previousFrame, 60) : 0; this.previousFrame = time;
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
    if (this.phase === 'READY' && age >= GAME.readyMs) {
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
      if ((progress >= 1 && this.attempt) || this.elapsed >= this.delivery.idealContactTimeMs + GAME.timing.poor + GAME.comboMs) this.resolve();
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
    } else if (this.phase === 'RESULT' && age >= GAME.resultMs) {
      if (this.lesson >= 0) {
        this.lesson++;
        if (this.lesson >= TUTORIAL.length) { this.lesson = -1; this.setPhase('START'); this.hud.tutorialComplete(); }
        else { this.setPhase('READY'); this.hud.coach(TUTORIAL[this.lesson], this.lesson + 1, TUTORIAL.length); }
      } else if (this.score.ended) this.end(); else this.setPhase('READY');
    }
  }
  private resolve() {
    const step = this.lesson >= 0 ? TUTORIAL[this.lesson] : null;
    this.outcome = step ? tutorialOutcome(step, this.delivery!, this.attempt)
      : resolveShot(this.delivery!, this.attempt, this.rng, this.charged);
    if (step) this.hud.coachPlayed(step.praise, this.outcome.madeBatContact);
    else {
      this.score.record(this.outcome); this.generator.record(this.outcome);
      this.confidence.record(this.outcome); this.showConfidence();
      this.sledgeDue = this.sledger.record(this.outcome);
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
    const sound = outcomeSound(outcome);
    if (sound && !(outcome.aerial && sound === 'hit')) this.audio.play(sound);
  }
  private end() {
    this.setPhase('INNINGS_END'); const record = this.score.runs > this.best; this.best = Math.max(this.best, this.score.runs);
    try { localStorage.setItem('hitman-best', String(this.best)); } catch { /* A session remains playable without persistence. */ }
    this.hud.end(this.score, this.best, record);
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
