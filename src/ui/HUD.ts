import { GAME, STYLES } from '../config/gameplay';
import { ScoreManager } from '../game/ScoreManager';
import type { Delivery, GamePhase, ShotOutcome, ShotType } from '../game/types';
const icon = (name: string) => {
  const paths: Record<string, string> = {
    sound: '<path d="m11 5-6 4H2v6h3l6 4V5Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
    muted: '<path d="m11 5-6 4H2v6h3l6 4V5Z"/><path d="m16 9 5 6m0-6-5 6"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3h.01"/>',
    expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    trophy: '<path d="M8 3h8v6a4 4 0 0 1-8 0V3Zm4 10v7m-4 1h8M8 5H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4"/>',
  };
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
};
const controls = [
  ['LEG', 'A', 'Leg side', '↖'], ['LONG_ON', 'A + W', 'Long on', '↖'], ['STRAIGHT', 'W', 'Straight', '↑'], ['COVER_LONG_OFF', 'W + D', 'Cover drive', '↗'], ['OFF', 'D', 'Off side', '↗'],
];
export class HUD {
  readonly viewport: HTMLElement;
  private $ = (id: string) => document.getElementById(id)!;
  constructor(root: HTMLElement, best: number) {
    root.innerHTML = `
      <header class="topbar">
        <a class="brand" href="./" aria-label="Hitman Cricket home"><span class="brand-mark">H</span><span>HITMAN<span class="brand-sub">CRICKET</span></span></a>
        <div class="header-caption"><span class="small-dot"></span> THE 5 OVER CHALLENGE</div>
        <div class="header-actions"><button id="sound" class="icon-button" aria-label="Mute sound" title="Sound (M)">${icon('sound')}</button><button id="help" class="icon-button" aria-label="How to play" title="How to play">${icon('help')}</button><span class="desktop-badge">DESKTOP EDITION</span></div>
      </header>
      <main>
        <div class="page-heading"><div><p class="eyebrow">THE GROUND IS YOURS</p><h1>Own the crease<span>.</span></h1></div><div class="personal-best">${icon('trophy')}<div><span>PERSONAL BEST</span><strong id="best">${best} <small>RUNS</small></strong></div></div></div>
        <div class="game-layout">
          <section class="arena" aria-label="Cricket batting game">
            <div id="viewport" class="viewport">
              <div class="arena-top"><span class="ground-label"><span class="small-dot"></span> HITMAN OVAL</span><div class="arena-actions"><button id="pause" class="arena-button" aria-label="Pause innings" title="Pause (Esc)" disabled>${icon('pause')}</button><button id="fullscreen" class="arena-button" aria-label="Enter fullscreen" title="Fullscreen">${icon('expand')}</button></div></div>
              <div id="scoreboard" class="scoreboard"><div class="score-main"><span class="score-caption">YOUR INNINGS</span><strong><span id="runs">0</span><span class="score-slash">/</span><span id="wickets">0</span></strong></div><div class="score-overs"><strong id="overs">0.0</strong><span>OF 5 OVERS</span></div><div class="last-ball"><span>LAST BALL</span><strong id="last">—</strong></div></div>
              <div id="intro" class="intro-panel"><span class="challenge-tag">5 OVER BATTING CHALLENGE</span><h2>Small game.<br>Big innings.</h2><p>Score as many runs as possible in 30 balls.<br>Three wickets. Make every shot count.</p><button id="start" class="primary-button">START INNINGS ${icon('arrow')}</button><span class="start-hint">or press <kbd>Enter</kbd> to step up</span></div>
              <div id="result" class="result hidden" aria-live="polite"><span id="timing"></span><strong id="result-text"></strong><small id="delivery-info"></small></div>
              <div id="phase-label" class="phase-label hidden">TAKE YOUR GUARD</div>
              <div id="pause-overlay" class="modal-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="pause-title"><div class="pause-content"><p class="eyebrow">TAKE A BREATHER</p><h2 id="pause-title">Innings paused.</h2><p>The next shot can wait.</p><button id="resume" class="primary-button">RESUME INNINGS ${icon('arrow')}</button><span class="start-hint"><kbd>Esc</kbd> to resume · <kbd>R</kbd> to restart</span></div></div>
              <div id="end" class="modal-overlay end-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="end-title"><div class="end-content"><span class="challenge-tag" id="end-tag">INNINGS COMPLETE</span><h2 id="end-title">That's a wrap.</h2><div class="final-score" id="final-score">0<small>/0</small></div><p id="end-message"></p><div class="final-stats"><div><strong id="final-overs">0.0</strong><span>OVERS</span></div><div><strong id="final-fours">0</strong><span>FOURS</span></div><div><strong id="final-sixes">0</strong><span>SIXES</span></div><div><strong id="final-rate">0</strong><span>STRIKE RATE</span></div></div><button id="again" class="primary-button">PLAY AGAIN ${icon('arrow')}</button><span class="start-hint">A fresh innings. A bigger score. <kbd>R</kbd></span></div></div>
              <div class="arena-bottom"><span>LEG SIDE <span class="direction-line"></span></span><span class="crease-hint" id="crease-hint">READ THE BALL. FIND YOUR TIMING.</span><span><span class="direction-line"></span> OFF SIDE</span></div>
              <pre id="debug" class="debug hidden"></pre>
            </div>
            <div class="over-strip"><span class="over-title">THIS OVER</span><div id="over-balls" class="over-balls"></div><span id="balls-left" class="balls-left">30 balls to make your mark</span></div>
          </section>
          <aside class="guide"><div class="guide-title"><span class="eyebrow">THE PLAYBOOK</span><span class="guide-number">01—05</span></div><h2>Pick your shot.</h2><p>Watch the line. Swing as the ball<br class="wide-only"> reaches your bat.</p>
            <div class="shot-list">${controls.map(([shot, keys, label, arrow]) => `<div class="shot-row" data-shot="${shot}"><span class="shot-direction">${arrow}</span><span class="shot-name">${label}</span><span class="key-group">${keys.split(' + ').map(k => `<kbd>${k}</kbd>`).join('<span>+</span>')}</span></div>`).join('')}</div>
            <div class="timing-guide"><span class="eyebrow">TIMING IS EVERYTHING</span><div class="timing-scale"><span>EARLY</span><span class="perfect-label">PERFECT</span><span>LATE</span></div><div class="timing-meter"><i></i><i></i><i></i><i></i><i></i><b></b></div><p>A clean connection sends it to the rope.<br>A perfect one can clear it.</p></div>
            <div class="rules"><div><strong>05</strong><span>OVERS</span></div><div><strong>30</strong><span>BALLS</span></div><div><strong>03</strong><span>WICKETS</span></div></div>
          </aside>
        </div>
        <footer><span><span class="small-dot"></span> NO DOWNLOADS. JUST CRICKET.</span><span><kbd>Esc</kbd> Pause <i></i> <kbd>M</kbd> Sound <i></i> <kbd>R</kbd> Restart</span><span>BUILT FOR THE LOVE OF THE GAME.</span></footer>
      </main>
      <dialog id="help-dialog"><button class="close-help icon-button" aria-label="Close instructions">×</button><p class="eyebrow">WELCOME TO HITMAN OVAL</p><h2>Make every ball count.</h2><p>Face 30 balls, with three wickets to spare. Read the ball's position as it approaches the crease and press a shot key just as it reaches your bat.</p><ul><li><kbd>A</kbd> plays left to leg; <kbd>D</kbd> plays right to off.</li><li><kbd>W</kbd> drives straight back toward the bowler.</li><li>Press <kbd>A</kbd> + <kbd>W</kbd> or <kbd>W</kbd> + <kbd>D</kbd> within 100 ms for a diagonal drive.</li><li>One swing per ball. Wait for the ball to come to you.</li><li>Perfect timing can score four or six. Mistimed contact can be caught; missing the stumps' line can mean Bowled or LBW.</li></ul><p class="help-note">A physical keyboard and a desktop browser are required.</p><button id="help-done" class="primary-button">GOT IT ${icon('arrow')}</button></dialog>`;
    this.viewport = this.$('viewport'); this.score(new ScoreManager());
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
    const offset = score.balls && score.balls % 6 === 0 ? score.balls - 6 : Math.floor(score.balls / 6) * 6;
    this.$('over-balls').innerHTML = Array.from({ length: 6 }, (_, i) => {
      const ball = score.history[offset + i];
      return `<span class="over-ball ${ball ? ball.isWicket ? 'wicket-ball' : ball.runs >= 4 ? 'boundary-ball' : 'played-ball' : ''}">${ball ? ball.isWicket ? 'W' : ball.runs : '<span></span>'}</span>`;
    }).join('');
    this.$('balls-left').textContent = score.balls ? `${GAME.totalBalls - score.balls} BALLS LEFT · ${score.strikeRate} SR` : '30 balls to make your mark';
  }
  start() {
    ['intro', 'end', 'pause-overlay', 'result'].forEach(id => this.$(id).classList.add('hidden'));
    this.viewport.classList.add('playing'); (this.$('pause') as HTMLButtonElement).disabled = false;
    this.$('phase-label').classList.remove('hidden');
  }
  phase(phase: GamePhase) {
    this.$('phase-label').textContent = phase === 'READY' ? 'TAKE YOUR GUARD' : phase === 'BOWLER_RUNUP' ? 'HERE COMES THE NEXT BALL' : phase === 'BALL_IN_FLIGHT' ? 'WATCH THE BALL' : '';
    if (phase === 'READY') { this.$('result').classList.add('hidden'); document.querySelectorAll('.shot-row').forEach(e => e.classList.remove('selected')); }
  }
  select(shot: ShotType) { document.querySelector(`[data-shot="${shot}"]`)?.classList.add('selected'); this.$('phase-label').textContent = 'SHOT COMMITTED'; }
  result(outcome: ShotOutcome, delivery: Delivery) {
    this.$('phase-label').textContent = '';
    this.$('result').className = `result ${outcome.isWicket ? 'is-wicket' : outcome.runs >= 4 ? 'is-boundary' : ''}`;
    this.$('result-text').textContent = outcome.feedback;
    this.$('timing').textContent = outcome.timingGrade === 'PERFECT' || outcome.timingGrade === 'GOOD' ? `${outcome.timingGrade} TIMING` : outcome.timingDeltaMs === null ? 'NO SHOT' : outcome.timingGrade === 'MISS' ? 'MISSED IT' : outcome.timingDeltaMs < 0 ? 'EARLY' : 'LATE';
    this.$('delivery-info').textContent = `${delivery.speedKph} KM/H · ${STYLES[delivery.style].label}`;
  }
  pause(value: boolean) { this.$('pause-overlay').classList.toggle('hidden', !value); if (value) this.$('resume').focus(); }
  end(score: ScoreManager, best: number, isRecord: boolean) {
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
  error() { this.$('intro').innerHTML = '<span class="challenge-tag">WEBGL UNAVAILABLE</span><h2>The ground couldn’t load.</h2><p>Enable hardware acceleration in your browser, then reload to play.</p><button class="primary-button" onclick="location.reload()">RELOAD GAME</button>'; }
}
