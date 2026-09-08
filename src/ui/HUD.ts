import { ScoreManager } from '../game/ScoreManager';
import type { GamePhase, ShotOutcome, ShotType } from '../game/types';
const icon = (name: string) => {
  const paths: Record<string, string> = {
    sound: '<path d="m11 5-6 4H2v6h3l6 4V5Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
    muted: '<path d="m11 5-6 4H2v6h3l6 4V5Z"/><path d="m16 9 5 6m0-6-5 6"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3h.01"/>',
    expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    share: '<path d="M12 16V3m-4 4 4-4 4 4M5 12v8h14v-8"/>',
    trophy: '<path d="M8 3h8v6a4 4 0 0 1-8 0V3Zm4 10v7m-4 1h8M8 5H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4"/>',
  };
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
};
export class HUD {
  readonly viewport: HTMLElement;
  private $ = (id: string) => document.getElementById(id)!;
  constructor(root: HTMLElement, best: number) {
    document.documentElement.classList.toggle('touch-device', matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0);
    // Everything lives inside the field itself: the ground is the whole screen,
    // and every control the game needs sits on top of it.
    root.innerHTML = `
      <div id="viewport" class="stage">
        <div class="hud-top">
          <span class="ground-label"><span class="small-dot"></span> HITMAN OVAL</span>
          <div class="hud-actions">
            <button id="sound" class="hud-button" aria-label="Mute sound" title="Sound (M)">${icon('sound')}</button>
            <button id="help" class="hud-button" aria-label="How to play" title="How to play">${icon('help')}</button>
            <button id="share" class="hud-button" aria-label="Share game" title="Share game">${icon('share')}</button>
            <button id="pause" class="hud-button" aria-label="Pause innings" title="Pause (Esc)" disabled>${icon('pause')}</button>
            <button id="fullscreen" class="hud-button" aria-label="Enter fullscreen" title="Fullscreen">${icon('expand')}</button>
          </div>
        </div>
        <div id="scoreboard" class="scoreboard"><div class="score-main"><span class="score-caption">YOUR INNINGS</span><strong><span id="runs">0</span><span class="score-slash">/</span><span id="wickets">0</span></strong></div><div class="score-overs"><strong id="overs">0.0</strong><span>OF 5 OVERS</span></div><div class="last-ball"><span>LAST BALL</span><strong id="last">—</strong></div></div>
        <div id="result" class="result hidden" aria-live="polite"><strong id="result-text"></strong><span id="timing"></span></div>
        <div id="phase-label" class="phase-label hidden">TAKE YOUR GUARD</div>
        <div class="arena-bottom"><span>LEG SIDE <span class="direction-line"></span></span><span><span class="direction-line"></span> OFF SIDE</span></div>
        <div id="intro" class="panel intro-panel">
          <div class="brand"><span class="brand-mark">H</span><span>HITMAN<span class="brand-sub">CRICKET</span></span></div>
          <span class="challenge-tag">5 OVER BATTING CHALLENGE</span>
          <h2>Small game. <br>Big innings.</h2>
          <p>Score as many runs as you can in 30 balls. <br>Three wickets. Make every shot count.</p>
          <button id="start" class="primary-button">START INNINGS ${icon('arrow')}</button>
          <span class="start-hint keyboard-only">or press <kbd>Enter</kbd> to step up</span>
          <span class="shot-keys keyboard-only"><b>←</b><kbd>A</kbd><b>↖</b><kbd>A+W</kbd><b>↑</b><kbd>W</kbd><b>↗</b><kbd>W+D</kbd><b>→</b><kbd>D</kbd></span>
          <span class="start-hint touch-only">Swipe on the field as the ball reaches your bat.<b class="swipe-symbols">← ↖ ↑ ↗ →</b></span>
          <div class="personal-best">${icon('trophy')}<div><span>PERSONAL BEST</span><strong id="best">${best} <small>RUNS</small></strong></div></div>
        </div>
        <div id="pause-overlay" class="modal-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="pause-title"><div class="panel pause-content"><p class="eyebrow">TAKE A BREATHER</p><h2 id="pause-title">Innings paused.</h2><p>The next shot can wait.</p><button id="resume" class="primary-button">RESUME INNINGS ${icon('arrow')}</button><button id="restart" class="secondary-button">RESTART INNINGS</button><span class="start-hint keyboard-only"><kbd>Esc</kbd> to resume · <kbd>R</kbd> to restart</span></div></div>
        <div id="end" class="modal-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="end-title"><div class="panel end-content"><span class="challenge-tag" id="end-tag">INNINGS COMPLETE</span><h2 id="end-title">That's a wrap.</h2><div class="final-score" id="final-score">0<small>/0</small></div><p id="end-message"></p><div class="final-stats"><div><strong id="final-overs">0.0</strong><span>OVERS</span></div><div><strong id="final-fours">0</strong><span>FOURS</span></div><div><strong id="final-sixes">0</strong><span>SIXES</span></div><div><strong id="final-rate">0</strong><span>STRIKE RATE</span></div></div><button id="again" class="primary-button">PLAY AGAIN ${icon('arrow')}</button><span class="start-hint">A fresh innings. A bigger score. <kbd class="keyboard-only">R</kbd></span></div></div>
        <div id="share-status" class="share-status hidden" role="status"></div>
        <pre id="debug" class="debug hidden"></pre>
      </div>
      <dialog id="help-dialog"><button class="close-help hud-button" aria-label="Close instructions">×</button><p class="eyebrow">WELCOME TO HITMAN OVAL</p><h2>Make every ball count.</h2><p>Face 30 balls, with three wickets to spare. Read the ball's position as it approaches the crease and press a shot key just as it reaches your bat.</p><div class="touch-only"><p>Swipe directly on the field when the ball reaches your bat. A short, decisive swipe is enough.</p><ul><li>← Left: leg-side shot</li><li>↖ Up-left: long-on drive</li><li>↑ Up: straight drive</li><li>↗ Up-right: cover drive</li><li>→ Right: off-side shot</li></ul><p>One swipe per ball. Taps and downward swipes do not play a shot. The same timing and wicket rules apply.</p></div><ul class="keyboard-only"><li><kbd>A</kbd> plays left to leg; <kbd>D</kbd> plays right to off.</li><li><kbd>W</kbd> drives straight back toward the bowler.</li><li>Press <kbd>A</kbd> + <kbd>W</kbd> or <kbd>W</kbd> + <kbd>D</kbd> within 100 ms for a diagonal drive.</li><li>One swing per ball. Wait for the ball to come to you.</li><li>Perfect timing can score four or six. Mistimed contact can be caught; missing the stumps' line can mean Bowled or LBW.</li></ul><p class="help-note">Play with swipes on a phone or A, W, D on a keyboard. Use Pause to take a break or restart.</p><button id="help-done" class="primary-button">GOT IT ${icon('arrow')}</button></dialog>`;
    this.viewport = this.$('viewport'); this.score(new ScoreManager());
    if (!document.fullscreenEnabled) this.$('fullscreen').classList.add('hidden');
    const dialog = this.$('help-dialog') as HTMLDialogElement;
    this.$('help-done').onclick = () => dialog.close();
    dialog.querySelector<HTMLButtonElement>('.close-help')!.onclick = () => dialog.close();
  }
  on(id: string, fn: () => void) { this.$(id).addEventListener('click', fn); }
  help() { (this.$('help-dialog') as HTMLDialogElement).showModal(); }
  get helpOpen() { return (this.$('help-dialog') as HTMLDialogElement).open; }
  score(score: ScoreManager) {
    this.$('runs').textContent = String(score.runs); this.$('wickets').textContent = String(score.wickets); this.$('overs').textContent = score.overs;
    const last = score.history.at(-1); this.$('last').textContent = last ? last.isWicket ? 'W' : String(last.runs) : '—';
    this.$('last').className = last?.isWicket ? 'wicket-color' : last && last.runs >= 4 ? 'boundary-color' : '';
  }
  start() {
    document.body.classList.add('innings-active');
    this.viewport.classList.remove('modal-open');
    ['intro', 'end', 'pause-overlay', 'result'].forEach(id => this.$(id).classList.add('hidden'));
    this.viewport.classList.add('playing'); (this.$('pause') as HTMLButtonElement).disabled = false;
    this.$('phase-label').classList.remove('hidden');
  }
  phase(phase: GamePhase) {
    this.$('phase-label').textContent = phase === 'READY' ? 'TAKE YOUR GUARD' : phase === 'BOWLER_RUNUP' ? 'HERE COMES THE NEXT BALL' : phase === 'BALL_IN_FLIGHT' ? 'WATCH THE BALL' : '';
    if (phase === 'READY') this.$('result').classList.add('hidden');
  }
  select(_shot: ShotType) { this.$('phase-label').textContent = 'SHOT COMMITTED'; }
  /** A skied shot: say nothing about the outcome until the ball comes down. */
  airborne() { this.$('phase-label').textContent = 'UP IN THE AIR…'; }
  /** A call, not a popup: the outcome rises off the field and fades on its own. */
  result(outcome: ShotOutcome) {
    this.$('phase-label').textContent = '';
    const panel = this.$('result');
    panel.className = `result ${outcome.isWicket ? 'is-wicket' : outcome.runs >= 4 ? 'is-boundary' : ''}`;
    this.$('result-text').textContent = outcome.feedback;
    this.$('timing').textContent = outcome.timingGrade === 'PERFECT' || outcome.timingGrade === 'GOOD' ? `${outcome.timingGrade} TIMING`
      : outcome.timingDeltaMs === null ? 'NO SHOT' : outcome.timingGrade === 'MISS' ? 'MISSED IT' : outcome.timingDeltaMs < 0 ? 'EARLY' : 'LATE';
    // Restart the rise-and-fade from the top for back-to-back deliveries.
    panel.style.animation = 'none'; void panel.offsetWidth; panel.style.animation = '';
  }
  pause(value: boolean) { this.viewport.classList.toggle('modal-open', value); this.$('pause-overlay').classList.toggle('hidden', !value); if (value) this.$('resume').focus(); }
  end(score: ScoreManager, best: number, isRecord: boolean) {
    this.viewport.classList.add('modal-open');
    this.$('result').classList.add('hidden'); this.$('end').classList.remove('hidden');
    this.$('phase-label').textContent = ''; (this.$('pause') as HTMLButtonElement).disabled = true;
    this.$('final-score').innerHTML = `${score.runs}<small>/${score.wickets}</small>`;
    this.$('final-overs').textContent = score.overs; this.$('final-fours').textContent = String(score.fours); this.$('final-sixes').textContent = String(score.sixes); this.$('final-rate').textContent = String(score.strikeRate);
    this.$('end-tag').textContent = isRecord ? 'A NEW PERSONAL BEST' : 'INNINGS COMPLETE';
    this.$('end-message').textContent = score.wickets >= 3 ? 'All out. The crease is calling for a comeback.' : 'Five overs in the books. Can you go one better?';
    this.$('best').innerHTML = `${best} <small>RUNS</small>`; this.$('again').focus();
  }
  sound(muted: boolean) { this.$('sound').innerHTML = icon(muted ? 'muted' : 'sound'); this.$('sound').setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound'); }
  debug(data: object) { this.$('debug').classList.remove('hidden'); this.$('debug').textContent = Object.entries(data).map(([k, v]) => `${k}: ${v}`).join('\n'); }
  async share() {
    const url = new URL(location.pathname, location.origin).href;
    try {
      if (navigator.share) { await navigator.share({ title: 'Hitman Cricket', text: 'Five overs. Three wickets. Can you beat my score?', url }); return; }
      await navigator.clipboard.writeText(url);
      this.$('share-status').textContent = 'Game link copied. Send it to your friends.';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      this.$('share-status').textContent = `Copy this game link: ${url}`;
    }
    this.$('share-status').classList.remove('hidden');
  }
  error() { this.$('intro').innerHTML = '<span class="challenge-tag">WEBGL UNAVAILABLE</span><h2>The ground couldn’t load.</h2><p>Enable hardware acceleration in your browser, then reload to play.</p><button class="primary-button" onclick="location.reload()">RELOAD GAME</button>'; }
}
