import { GAME } from './config/gameplay';
import { GameAudio } from './game/Audio';
import { DeliveryGenerator } from './game/DeliveryGenerator';
import { effectiveLine } from './game/DeliveryTrajectory';
import { InputManager } from './game/InputManager';
import { ScoreManager } from './game/ScoreManager';
import { SeededRandom } from './game/SeededRandom';
import { resolveShot } from './game/ShotResolver';
import type { Delivery, GamePhase, ShotAttempt, ShotOutcome, ShotType } from './game/types';
import { GameScene } from './scene/GameScene';
import { HUD } from './ui/HUD';
export class Game {
  private phase: GamePhase = 'START';
  private previousPhase: GamePhase = 'READY';
  private elapsed = 0; private phaseStart = 0; private previousFrame = 0; private frameId = 0;
  private score = new ScoreManager();
  private rng = new SeededRandom(1); private generator = new DeliveryGenerator(this.rng);
  private delivery: Delivery | null = null; private attempt: ShotAttempt | null = null; private outcome: ShotOutcome | null = null;
  private best = 0; private bounced = false; private seed = 0;
  private scene!: GameScene;
  private hud: HUD;
  private input!: InputManager;
  private audio = new GameAudio();
  private debug = new URLSearchParams(location.search).get('debug') === '1';
  private disposed = false;
  constructor(root: HTMLElement) {
    try { this.best = Math.max(0, Math.min(180, Number(localStorage.getItem('hitman-best')) || 0)); } catch { /* Storage may be disabled. */ }
    this.hud = new HUD(root, this.best);
    try { this.scene = new GameScene(this.hud.viewport); } catch (error) { console.error(error); this.hud.error(); return; }
    this.input = new InputManager(() => this.phase === 'BALL_IN_FLIGHT', () => this.elapsed, this.shoot);
    this.hud.on('start', this.start); this.hud.on('again', this.start); this.hud.on('pause', this.togglePause); this.hud.on('resume', this.togglePause);
    this.hud.on('sound', this.toggleSound);
    this.hud.on('help', () => { if (!['START', 'PAUSED', 'INNINGS_END'].includes(this.phase)) this.togglePause(); this.hud.help(); });
    this.hud.on('fullscreen', () => {
      if (document.fullscreenElement) void document.exitFullscreen(); else void this.hud.viewport.requestFullscreen().catch(() => {});
    });
    window.addEventListener('keydown', this.shortcuts); document.addEventListener('visibilitychange', this.visibility);
    window.addEventListener('blur', this.blur);
    this.frameId = requestAnimationFrame(this.frame);
    if (this.debug) Object.defineProperty(window, '__cricket', { configurable: true, value: { snapshot: () => this.snapshot() } });
  }
  start = () => {
    this.audio.unlock(); this.score = new ScoreManager();
    const param = new URLSearchParams(location.search).get('seed');
    this.seed = param !== null && Number.isFinite(Number(param)) ? Number(param) >>> 0 : crypto.getRandomValues(new Uint32Array(1))[0];
    this.rng = new SeededRandom(this.seed); this.generator = new DeliveryGenerator(this.rng);
    this.delivery = null; this.attempt = null; this.outcome = null; this.elapsed = 0;
    this.input.reset(); this.scene.reset(); this.hud.start(); this.hud.score(this.score); this.setPhase('READY');
    (document.activeElement as HTMLElement | null)?.blur();
  };
  private setPhase(phase: GamePhase) { this.phase = phase; this.phaseStart = this.elapsed; this.hud.phase(phase); }
  private shoot = (shotType: ShotType, inputTimeMs: number) => {
    if (this.phase !== 'BALL_IN_FLIGHT' || this.attempt) return;
    this.attempt = { shotType, inputTimeMs }; this.scene.swing(shotType, this.elapsed); this.hud.select(shotType);
  };
  private toggleSound = () => { this.audio.muted = !this.audio.muted; this.audio.unlock(); this.hud.sound(this.audio.muted); };
  private togglePause = () => {
    if (this.phase === 'START' || this.phase === 'INNINGS_END' || this.hud.helpOpen) return;
    if (this.phase === 'PAUSED') { this.phase = this.previousPhase; this.hud.pause(false); (document.activeElement as HTMLElement | null)?.blur(); }
    else { this.previousPhase = this.phase; this.phase = 'PAUSED'; this.hud.pause(true); }
  };
  private visibility = () => { if (document.hidden && !['START', 'INNINGS_END', 'PAUSED'].includes(this.phase)) this.togglePause(); };
  private blur = () => { if (!['START', 'INNINGS_END', 'PAUSED'].includes(this.phase)) this.togglePause(); };
  private shortcuts = (event: KeyboardEvent) => {
    if (event.repeat || this.hud.helpOpen) return;
    const key = event.key.toUpperCase();
    if (key === 'ENTER' && (this.phase === 'START' || this.phase === 'INNINGS_END')) { event.preventDefault(); this.start(); }
    else if (key === 'R' && this.phase !== 'START') { event.preventDefault(); this.start(); }
    else if (key === 'ESCAPE') { event.preventDefault(); this.togglePause(); }
    else if (key === 'M') { event.preventDefault(); this.toggleSound(); }
  };
  private frame = (time: number) => {
    if (this.disposed) return;
    const dt = this.previousFrame ? Math.min(time - this.previousFrame, 60) : 0; this.previousFrame = time;
    if (this.phase !== 'PAUSED' && !document.hidden) {
      this.elapsed += dt;
      this.input.flush(this.elapsed);
      this.update();
    }
    if (!document.hidden) this.scene.render(this.elapsed);
    if (this.debug) this.hud.debug(this.snapshot());
    this.frameId = requestAnimationFrame(this.frame);
  };
  private update() {
    const age = this.elapsed - this.phaseStart;
    if (this.phase === 'READY' && age >= GAME.readyMs) {
      this.delivery = this.generator.next(this.elapsed + GAME.runupMs);
      this.attempt = null; this.outcome = null; this.bounced = false; this.scene.reset(); this.input.reset(); this.setPhase('BOWLER_RUNUP');
    } else if (this.phase === 'BOWLER_RUNUP') {
      this.scene.runup(Math.min(1, age / GAME.runupMs));
      if (age >= GAME.runupMs) {
        this.delivery!.releaseTimeMs = this.elapsed; this.delivery!.idealContactTimeMs = this.elapsed + this.delivery!.durationMs; this.setPhase('BALL_IN_FLIGHT');
      }
    } else if (this.phase === 'BALL_IN_FLIGHT' && this.delivery) {
      const progress = (this.elapsed - this.delivery.releaseTimeMs) / this.delivery.durationMs;
      this.scene.delivery(this.delivery, progress);
      const bounce = (GAME.releaseZ - this.delivery.bounceZ) / (GAME.releaseZ - GAME.contactZ);
      if (!this.bounced && progress >= bounce) { this.audio.play('bounce'); this.bounced = true; }
      if ((progress >= 1 && this.attempt) || this.elapsed >= this.delivery.idealContactTimeMs + GAME.timing.poor + GAME.comboMs) this.resolve();
    } else if (this.phase === 'SHOT_RESOLVE') {
      this.scene.result(this.elapsed);
      if (age >= GAME.hitAnimationMs) this.setPhase('RESULT');
    } else if (this.phase === 'RESULT' && age >= GAME.resultMs) {
      if (this.score.ended) this.end(); else this.setPhase('READY');
    }
  }
  private resolve() {
    this.outcome = resolveShot(this.delivery!, this.attempt, this.rng); this.score.record(this.outcome); this.input.reset();
    this.scene.hit(this.outcome, this.attempt?.shotType, this.delivery!, this.elapsed); this.hud.score(this.score); this.hud.result(this.outcome, this.delivery!);
    if (this.outcome.isWicket) this.audio.play('wicket'); else if (this.outcome.runs === 6) this.audio.play('six'); else if (this.outcome.madeBatContact) this.audio.play('hit');
    this.setPhase('SHOT_RESOLVE');
  }
  private end() {
    this.setPhase('INNINGS_END'); const record = this.score.runs > this.best; this.best = Math.max(this.best, this.score.runs);
    try { localStorage.setItem('hitman-best', String(this.best)); } catch { /* A session remains playable without persistence. */ }
    this.hud.end(this.score, this.best, record);
  }
  private snapshot() {
    return { phase: this.phase, seed: this.seed, elapsed: Math.round(this.elapsed), balls: this.score.balls, runs: this.score.runs, wickets: this.score.wickets,
      line: this.delivery?.line ?? '—', effectiveLine: this.delivery ? effectiveLine(this.delivery) : '—', style: this.delivery?.style ?? '—', speed: this.delivery?.speedKph ?? '—',
      baseX: this.delivery?.baseTargetX.toFixed(3) ?? '—', finalX: this.delivery?.finalTargetX.toFixed(3) ?? '—',
      contactAt: Math.round(this.delivery?.idealContactTimeMs ?? 0), timingDelta: this.outcome?.timingDeltaMs?.toFixed(0) ?? '—', timingGrade: this.outcome?.timingGrade ?? '—',
      compatibility: this.outcome?.compatibility ?? '—', quality: this.outcome?.quality.toFixed(2) ?? '—', outcome: this.outcome?.feedback ?? '—', shot: this.attempt?.shotType ?? '—' };
  }
  dispose() {
    this.disposed = true; cancelAnimationFrame(this.frameId); this.input?.dispose(); this.scene?.dispose(); this.audio.dispose();
    window.removeEventListener('keydown', this.shortcuts); window.removeEventListener('blur', this.blur); document.removeEventListener('visibilitychange', this.visibility);
  }
}
