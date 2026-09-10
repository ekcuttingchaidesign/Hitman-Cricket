import { GAME } from '../config/gameplay';
import { ScoreManager } from '../game/ScoreManager';
import { gameLink, whatsappLink } from '../game/Share';
import { dotMatrix } from './DotMatrix';
import type { TutorialStep } from '../game/Tutorial';
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
    whatsapp: '<path d="M3.5 20.5 5 16a8 8 0 1 1 3 3l-4.5 1.5Z"/><path d="M9 9c0 3 3 6 6 6 1 0 1.5-1 1.5-1L15 13l-1.5 1S12 13.5 11 12t.5-2L10 8.5S9 9 9 9Z"/>',
  };
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
};
/* Three plates of the same ground. The first is the one the game has always
   opened on, so it is the one that is already there when the screen appears. */
const coverPlates = [
  new URL('../assets/cover.webp', import.meta.url).href,
  new URL('../assets/cover-drive.webp', import.meta.url).href,
  new URL('../assets/cover-bowled.webp', import.meta.url).href,
];
const coverTitle = new URL('../assets/title.webp', import.meta.url).href;
/**
 * A phone gets the cover art: the illustration, the title lockup and two calls
 * to action, with nothing else on the screen. A desktop keeps the card over the
 * live ground, where there is room for the keys and the pitch behind them.
 */
const coverIntro = (best: number) => `
        <div id="intro" class="intro cover-intro">
          <div class="cover-plate" aria-hidden="true">${coverPlates.map((src, i) =>
            `<img class="cover-art" src="${src}" alt="" decoding="async"${i ? '' : ' fetchpriority="high"'}>`).join('')}</div>
          <img class="cover-title" src="${coverTitle}" alt="Hitman Cricket" decoding="async">
          <div class="cover-actions">
            <p class="cover-best${best ? '' : ' hidden'}">${icon('trophy')}<span>BEST</span><strong id="best">${best} <small>RUNS</small></strong></p>
            <button id="start" class="play-button">PLAY</button>
            <button id="tutorial" class="learn-button">HOW TO PLAY</button>
          </div>
        </div>`;
const panelIntro = (best: number) => `
        <div id="intro" class="panel intro-panel">
          <div class="brand"><span class="brand-mark">H</span><span>HITMAN<span class="brand-sub">CRICKET</span></span></div>
          <span class="challenge-tag">5 OVER BATTING CHALLENGE</span>
          <h2>Small game. <br>Big innings.</h2>
          <p>Score as many runs as you can in 30 balls. <br>Three wickets. Make every shot count.</p>
          <button id="start" class="primary-button">START INNINGS ${icon('arrow')}</button>
          <button id="tutorial" class="secondary-button">FIRST TIME? PLAY 3 BALLS</button>
          <span class="start-hint keyboard-only">or press <kbd>Enter</kbd> to step up</span>
          <span class="shot-keys keyboard-only"><b>←</b><kbd>A</kbd><b>↖</b><kbd>A+W</kbd><b>↑</b><kbd>W</kbd><b>↗</b><kbd>W+D</kbd><b>→</b><kbd>D</kbd><b>↓</b><kbd>S</kbd></span>
          <span class="start-hint keyboard-only">or play the same shots on the <kbd>←</kbd> <kbd>↑</kbd> <kbd>→</kbd> arrow keys</span>
          <span class="start-hint touch-only">Swipe on the field as the ball reaches your bat. Swipe down to block.<b class="swipe-symbols">← ↖ ↑ ↗ → ↓</b></span>
          <div class="personal-best">${icon('trophy')}<div><span>PERSONAL BEST</span><strong id="best">${best} <small>RUNS</small></strong></div></div>
        </div>`;
export class HUD {
  readonly viewport: HTMLElement;
  private $ = (id: string) => document.getElementById(id)!;
  constructor(root: HTMLElement, best: number) {
    document.documentElement.classList.toggle('touch-device', matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0);
    const touch = document.documentElement.classList.contains('touch-device');
    // The cover fills the screen, so the scoreboard, the meter, the field labels
    // and the button row all wait until there is an innings to describe.
    if (touch) document.body.classList.add('start-screen');
    // Everything lives inside the field itself: the ground is the whole screen,
    // and every control the game needs sits on top of it.
    root.innerHTML = `
      <div id="viewport" class="stage">
        <div class="hud-top">
          <div class="hud-actions">
            <button id="sound" class="hud-button" aria-label="Mute sound" title="Sound (M)">${icon('sound')}</button>
            <button id="help" class="hud-button" aria-label="How to play" title="How to play">${icon('help')}</button>
            <button id="share" class="hud-button" aria-label="Share game" title="Share game">${icon('share')}</button>
            <button id="pause" class="hud-button" aria-label="Pause innings" title="Pause (Esc)" disabled>${icon('pause')}</button>
            <button id="fullscreen" class="hud-button" aria-label="Enter fullscreen" title="Fullscreen">${icon('expand')}</button>
          </div>
        </div>
        <div class="score-stack">
        <div id="scoreboard" class="scoreboard" role="group" aria-label="Scoreboard">
          <div class="board-head"><span class="board-name">HITMAN OVAL</span><span class="board-lamp"></span></div>
          <div class="board-cells">
            <div class="cell cell-wide"><span class="cell-label">TOTAL</span><span class="cell-value" id="runs"></span></div>
            <div class="cell"><span class="cell-label">WKTS</span><span class="cell-value" id="wickets"></span></div>
            <div class="cell"><span class="cell-label">OVERS</span><span class="cell-value" id="overs"></span></div>
            <div class="cell"><span class="cell-label">LAST</span><span class="cell-value" id="last"></span></div>
          </div>
        </div>
        <div id="confidence" class="confidence" role="meter" aria-label="Confidence" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
          <span class="confidence-inner">
            <span class="confidence-label" id="confidence-label">CONFIDENCE</span>
            <span class="confidence-track"><i id="confidence-fill"></i></span>
          </span>
        </div>
        </div>
        <div id="result" class="result hidden" aria-live="polite"><strong id="result-text"></strong><span id="timing"></span></div>
        <div id="phase-label" class="phase-label hidden">TAKE YOUR GUARD</div>
        <div id="coach" class="coach hidden">
          <span class="coach-step" id="coach-step">BALL 1 OF 3</span>
          <p id="coach-brief">Drive it straight back past the bowler.</p>
          <div class="coach-cue" id="coach-cue">
            <svg viewBox="0 0 120 120" class="cue-track" aria-hidden="true"><path d="M60 102V30"/><path d="M40 50 60 30l20 20"/></svg>
            <span class="cue-dot"></span>
          </div>
          <span class="coach-how" id="coach-how">Swipe up</span>
          <button id="skip-tutorial" class="ghost-button">SKIP TO INNINGS</button>
        </div>
        <div id="tutorial-done" class="modal-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="tutorial-done-title"><div class="panel"><span class="challenge-tag">TUTORIAL COMPLETE</span><h2 id="tutorial-done-title">Middle it every time.</h2><p>Straight, leg side, square cut. Read the line, swing as the ball reaches your bat, and the timing does the rest.</p><button id="tutorial-play" class="primary-button">START INNINGS ${icon('arrow')}</button></div></div>
        <div class="arena-bottom"><span>LEG SIDE <span class="direction-line"></span></span><span><span class="direction-line"></span> OFF SIDE</span></div>
${touch ? coverIntro(best) : panelIntro(best)}
        <div id="pause-overlay" class="modal-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="pause-title"><div class="panel pause-content"><p class="eyebrow">TAKE A BREATHER</p><h2 id="pause-title">Innings paused.</h2><p>The next shot can wait.</p><button id="resume" class="primary-button">RESUME INNINGS ${icon('arrow')}</button><button id="restart" class="secondary-button">RESTART INNINGS</button><span class="start-hint keyboard-only"><kbd>Esc</kbd> to resume · <kbd>R</kbd> to restart</span></div></div>
        <div id="end" class="modal-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="end-title">
          <div class="scorecard">
            <h2 id="end-title">Innings complete.</h2>
            <div class="card-figures">
              <p class="card-runs" id="final-score" role="img"></p>
              <p class="card-overs"><span id="final-overs"></span><small>Overs</small></p>
            </div>
            <div class="card-balls" id="final-balls" aria-hidden="true"></div>
            <p id="end-message" class="card-line"></p>
            <dl class="card-stats">
              <div><dt>Fours</dt><dd id="final-fours"></dd></div>
              <div><dt>Sixes</dt><dd id="final-sixes"></dd></div>
              <div><dt>Strike rate</dt><dd id="final-rate"></dd></div>
            </dl>
            <button id="again" class="key-button">PLAY AGAIN</button>
            <a id="whatsapp" class="whatsapp-key" href="https://wa.me/" target="_blank" rel="noopener noreferrer">${icon('whatsapp')} BRAG YOUR SCORE TO A FRIEND</a>
            <span class="start-hint keyboard-only">Press <kbd>R</kbd> to play again</span>
          </div>
        </div>
        <div id="share-status" class="share-status hidden" role="status"></div>
        <pre id="debug" class="debug hidden"></pre>
      </div>
      <dialog id="help-dialog"><button class="close-help hud-button" aria-label="Close instructions">×</button><p class="eyebrow">WELCOME TO HITMAN OVAL</p><h2>Make every ball count.</h2><p>Face 30 balls, with three wickets to spare. Read the ball's position as it approaches the crease and press a shot key just as it reaches your bat.</p><div class="touch-only"><p>Swipe directly on the field when the ball reaches your bat. A short, decisive swipe is enough.</p><ul><li>← Left: leg-side shot</li><li>↖ Up-left: long-on drive</li><li>↑ Up: straight drive</li><li>↗ Up-right: cover drive</li><li>→ Right: square cut, behind point</li><li>↓ Down: forward defensive</li></ul><p>One swipe per ball. A tap plays no shot. The same timing and wicket rules apply.</p></div><ul class="keyboard-only"><li><kbd>A</kbd> plays left to leg; <kbd>D</kbd> cuts it square off the back foot.</li><li><kbd>W</kbd> drives straight back toward the bowler.</li><li>Press <kbd>A</kbd> + <kbd>W</kbd> or <kbd>W</kbd> + <kbd>D</kbd> within 100 ms for a diagonal drive.</li><li><kbd>S</kbd> blocks it: bat down, no runs, and nothing can be caught off it.</li><li>The arrow keys play the same shots: <kbd>←</kbd> <kbd>↑</kbd> <kbd>→</kbd> <kbd>↓</kbd>, and pair up the same way.</li><li>One swing per ball. Wait for the ball to come to you.</li><li>Perfect timing can score four or six. Mistimed contact can be caught; missing the stumps' line can mean Bowled or LBW.</li></ul><p class="help-note"><b>The square cut.</b> Swipe out to the off (or press <kbd>D</kbd>) and he rocks onto the back foot and cuts square of the wicket, behind point. It wants width: the further outside off the ball is, the better it plays, and there is nothing in it against a ball at the stumps. It is also the one stroke that answers a bouncer outside off — the ball sits up with room to free the arms at it. Middled, it goes behind point for six or four. Anything else feathers the edge through to the keeper, and a bouncer outside off is exactly where that happens.</p><p class="help-note"><b>Defending.</b> Swipe down (or press <kbd>S</kbd>) and the batter blocks it: the ball dies at his feet for a dot, and a dead bat cannot be caught. Leave it too late, though, and the ball goes past — on the stumps, that bowls you. Blocking costs your confidence nothing, but go three balls without scoring and you will hear about it from the field.</p><p class="help-note"><b>The confidence meter.</b> Boundaries, twos and threes fill it; a ball that beats the bat drains it, a single or a block leaves it where it stands, and a wicket empties it. Full, it pulses — and when a ball you can walk at is coming, the whole field lights up gold from the bowler's run-up. Drive that one — straight, or either diagonal — and time it well, and you charge down the pitch and hit it out of the ground. Miss it and the call tells you which half you got wrong, with the meter still charged.</p><p class="help-note">Play with swipes on a phone, or A, W, D, S — or the arrow keys — on a keyboard. Use Pause to take a break or restart.</p><button id="help-done" class="primary-button">GOT IT ${icon('arrow')}</button></dialog>`;
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
    this.$('runs').innerHTML = dotMatrix(String(score.runs), `${score.runs} runs`);
    this.$('wickets').innerHTML = dotMatrix(String(score.wickets), `${score.wickets} wickets`);
    this.$('overs').innerHTML = dotMatrix(score.overs, `${score.overs} overs`);
    const last = score.history.at(-1);
    const call = last ? last.isWicket ? 'W' : String(last.runs) : '-';
    this.$('last').innerHTML = dotMatrix(call, last ? last.isWicket ? 'Out' : `${last.runs} off the last ball` : 'No ball bowled yet');
    this.$('last').className = `cell-value ${last?.isWicket ? 'wicket-color' : last && last.runs >= 4 ? 'boundary-color' : ''}`;
  }
  start() {
    document.body.classList.remove('tutorial-active', 'start-screen');
    document.body.classList.add('innings-active');
    this.viewport.classList.remove('modal-open');
    ['intro', 'end', 'pause-overlay', 'result', 'coach', 'tutorial-done'].forEach(id => this.$(id).classList.add('hidden'));
    this.viewport.classList.add('playing'); (this.$('pause') as HTMLButtonElement).disabled = false;
    this.$('phase-label').classList.remove('hidden');
  }
  phase(phase: GamePhase, primed = false) {
    const label = this.$('phase-label');
    // The charge call goes where the player is already looking — down the pitch —
    // not in the corner with the meter.
    const on = primed && (phase === 'BOWLER_RUNUP' || phase === 'BALL_IN_FLIGHT');
    label.textContent = on ? 'CHARGE IT · SWIPE UP'
      : phase === 'READY' ? 'TAKE YOUR GUARD' : phase === 'BOWLER_RUNUP' ? 'HERE COMES THE NEXT BALL' : phase === 'BALL_IN_FLIGHT' ? 'WATCH THE BALL' : '';
    label.classList.toggle('is-primed', on);
    // The edge of the field lights up too: a line of text at the bottom is easy
    // to miss in the second the ball takes to arrive.
    this.viewport.classList.toggle('charge-on', on);
    if (phase === 'READY') this.$('result').classList.add('hidden');
  }
  select(_shot: ShotType, charging = false) {
    this.$('phase-label').classList.remove('is-primed'); this.viewport.classList.remove('charge-on');
    this.$('phase-label').textContent = charging ? 'DOWN THE PITCH!' : 'SHOT COMMITTED';
  }
  /** A skied shot: say nothing about the outcome until the ball comes down. */
  airborne() { this.$('phase-label').textContent = 'UP IN THE AIR…'; }
  startTutorial() {
    this.start();
    document.body.classList.add('tutorial-active');
    (this.$('pause') as HTMLButtonElement).disabled = true;
  }
  coach(step: TutorialStep, ball: number, total: number) {
    this.$('coach-step').textContent = `BALL ${ball} OF ${total}`;
    this.$('coach-brief').textContent = step.brief;
    this.$('coach-how').innerHTML = `<span class="touch-only">${step.swipe}</span><span class="keyboard-only">Press <kbd>${step.key}</kbd></span>`;
    this.$('coach-cue').className = `coach-cue ${step.cue}`;
    this.$('coach').classList.remove('hidden');
  }
  /** Once the shot is away the cue has done its job. */
  coachPlayed(praise: string, played: boolean) {
    this.$('coach-cue').classList.add('hidden');
    this.$('coach-brief').textContent = played ? praise : 'Not that one — watch the next.';
  }
  tutorialComplete() {
    this.$('coach').classList.add('hidden'); this.$('result').classList.add('hidden');
    this.$('phase-label').textContent = '';
    this.viewport.classList.add('modal-open');
    this.$('tutorial-done').classList.remove('hidden');
    this.$('tutorial-play').focus();
  }
  /** A call, not a popup: the outcome rises off the field and fades on its own. */
  result(outcome: ShotOutcome, chargeMiss: string | null = null) {
    this.$('phase-label').textContent = '';
    const panel = this.$('result');
    panel.className = `result ${outcome.advance ? 'is-advance' : outcome.isWicket ? 'is-wicket' : outcome.runs >= 4 ? 'is-boundary' : ''}${chargeMiss ? ' is-missed-charge' : ''}`;
    this.$('result-text').textContent = outcome.feedback;
    this.$('timing').textContent = outcome.advance ? 'DOWN THE PITCH'
      : chargeMiss ?? (outcome.timingGrade === 'PERFECT' || outcome.timingGrade === 'GOOD' ? `${outcome.timingGrade} TIMING`
      : outcome.timingDeltaMs === null ? 'NO SHOT' : outcome.timingGrade === 'MISS' ? 'MISSED IT' : outcome.timingDeltaMs < 0 ? 'EARLY' : 'LATE');
    // Restart the rise-and-fade from the top for back-to-back deliveries.
    panel.style.animation = 'none'; void panel.offsetWidth; panel.style.animation = '';
  }
  pause(value: boolean) { this.viewport.classList.toggle('modal-open', value); this.$('pause-overlay').classList.toggle('hidden', !value); if (value) this.$('resume').focus(); }
  end(score: ScoreManager, best: number, isRecord: boolean) {
    this.viewport.classList.add('modal-open');
    this.$('result').classList.add('hidden'); this.$('end').classList.remove('hidden');
    this.$('phase-label').textContent = ''; (this.$('pause') as HTMLButtonElement).disabled = true;
    // The innings reads as one number. Runs carry the card; the wickets ride the
    // same baseline a third of the size, the way a board writes 87/2, and the
    // pair get one spoken label because "87 slash 2" is not how anyone says it.
    const total = this.$('final-score');
    total.innerHTML = `${score.runs}<span class="card-wickets">/${score.wickets}</span>`;
    total.setAttribute('aria-label', `${score.runs} for ${score.wickets}`);
    this.$('final-overs').textContent = score.overs;
    this.$('final-fours').textContent = String(score.fours);
    this.$('final-sixes').textContent = String(score.sixes);
    this.$('final-rate').textContent = String(score.strikeRate);
    // Every ball of the innings, in order: a bar as tall as the runs off it, and
    // a mark over the ball that got him out. It says nothing the figures do not,
    // so it speaks to nobody who cannot see it, but it is the only thing on the
    // card that shows how the innings went rather than what it came to. The
    // track is always the whole innings, so the balls he never got to face stay
    // on it as gaps: three wickets inside two overs looks like three wickets
    // inside two overs. Each bar carries its own place in the order, which is
    // what lets the stylesheet play them back in it.
    const track = this.$('final-balls');
    track.style.setProperty('--balls', String(GAME.totalBalls));
    track.innerHTML = Array.from({ length: GAME.totalBalls }, (_, i) => {
      const ball = score.history[i];
      if (!ball) return `<i class="ball-unfaced" style="--i:${i}"></i>`;
      return `<i class="${ball.isWicket ? 'ball-out' : ''}" style="--r:${Math.min(6, ball.runs)};--i:${i}"></i>`;
    }).join('');
    this.$('end').classList.toggle('is-record', isRecord);
    // What happened, then the number that makes it mean something. A best is
    // already banked by the time this runs, so it is only worth quoting back
    // when the innings did not set it.
    this.$('end-title').textContent = isRecord ? 'New personal best' : score.wickets >= 3 ? 'All out' : 'Innings complete';
    // The number is already the largest thing on the card, so the line under it
    // does not repeat it. It adds what the figures cannot: how long the innings
    // lasted, and where it stands against the last one. A best is only worth
    // quoting back when there is one, since "your best stands at 0" is a
    // sentence about nobody, and a first score is worth saying so outright.
    const faced = `${score.balls} balls faced`;
    this.$('end-message').textContent = isRecord
      ? best > 0 ? `${faced}, past your old best of ${best}.` : `${faced}. First score on the board.`
      : best > 0 ? `${faced}. Your best stands at ${best}.` : `${faced}.`;
    this.$('best').innerHTML = `${best} <small>RUNS</small>`; this.$('again').focus();
    // A real link rather than a scripted popup: it survives popup blockers and
    // opens the WhatsApp app on a phone.
    (this.$('whatsapp') as HTMLAnchorElement).href = whatsappLink(score.runs, gameLink());
  }
  /**
   * The meter reads full at 100 and pulses there. When the ball on its way is one
   * he can charge, it says so — the shot is worth knowing about, and the timing
   * is still the hard part.
   */
  confidence(fraction: number, primed: boolean) {
    const full = fraction >= 1;
    const meter = this.$('confidence');
    meter.setAttribute('aria-valuenow', String(Math.round(fraction * 100)));
    meter.classList.toggle('is-full', full);
    meter.classList.toggle('is-primed', primed);
    this.$('confidence-fill').style.width = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
    this.$('confidence-label').textContent = primed ? 'CHARGE IT — SWIPE UP' : full ? 'CONFIDENCE FULL' : 'CONFIDENCE';
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
  error() { document.body.classList.remove('start-screen'); this.$('intro').className = 'panel intro-panel'; this.$('intro').innerHTML = '<span class="challenge-tag">WEBGL UNAVAILABLE</span><h2>The ground couldn’t load.</h2><p>Enable hardware acceleration in your browser, then reload to play.</p><button class="primary-button" onclick="location.reload()">RELOAD GAME</button>'; }
}
