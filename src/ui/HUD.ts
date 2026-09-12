import { GAME } from '../config/gameplay';
import { ScoreManager } from '../game/ScoreManager';
import { gameLink, shareFileName, shareFileType, shareText, storyText, whatsappLink } from '../game/Share';
import { canShareImage, cardFacts, prepareShareAssets, scorecardImage, storyImage } from '../game/ShareCard';
import type { CardFacts } from '../game/ShareCard';
import { boardMarkup, pickerMarkup, type BoardView } from './Leaderboard';
import { AVATARS } from '../config/board';
import { dotMatrix } from './DotMatrix';
import type { TutorialStep } from '../game/Tutorial';
import type { GamePhase, ShotOutcome, ShotType } from '../game/types';
/** 1st, 2nd, 3rd, 12th. The board sheet spells them the same way. */
const ordinal = (n: number) => {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${suffix}`;
};
const icon = (name: string) => {
  const paths: Record<string, string> = {
    sound: '<path d="m11 5-6 4H2v6h3l6 4V5Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
    muted: '<path d="m11 5-6 4H2v6h3l6 4V5Z"/><path d="m16 9 5 6m0-6-5 6"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3h.01"/>',
    expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    share: '<path d="M12 16V3m-4 4 4-4 4 4M5 12v8h14v-8"/>',
    story: '<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M12 8v6m-3-3 3-3 3 3"/>',
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
/* The trophy line is the way onto the board from the cover, so it is always
   there. What it quotes is not: a best of nought is a sentence about nobody, so
   until there is one it quotes the board's leader instead — and the board is
   fetched, so until that arrives it quotes nothing and says only where it goes. */
const trophyLine = (best: number, top: number) =>
  best > 0 ? { label: 'BEST', runs: best } : top > 0 ? { label: 'TOP OF THE BOARD', runs: top } : null;
const trophyFigure = (best: number, top: number) => {
  const line = trophyLine(best, top);
  return line
    ? `<span id="best-label">${line.label}</span><strong id="best">${line.runs} <small>RUNS</small></strong>`
    : `<span id="best-label">TOP 50</span><strong id="best"></strong>`;
};
const coverIntro = (best: number, top: number) => `
        <div id="intro" class="intro cover-intro">
          <div class="cover-plate" aria-hidden="true">${coverPlates.map((src, i) =>
            `<img class="cover-art" src="${src}" alt="" decoding="async"${i ? '' : ' fetchpriority="high"'}>`).join('')}</div>
          <img class="cover-title" src="${coverTitle}" alt="Hitman Cricket" decoding="async">
          <div class="cover-actions">
            <button id="cover-board" class="cover-best">${icon('trophy')}${trophyFigure(best, top)}</button>
            <button id="start" class="play-button">PLAY</button>
            <button id="tutorial" class="learn-button">HOW TO PLAY</button>
          </div>
        </div>`;
const panelIntro = (best: number, top: number) => `
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
          <button id="panel-board" class="personal-best">${icon('trophy')}<div>${trophyFigure(best, top)}</div>${icon('arrow')}</button>
        </div>`;
export class HUD {
  readonly viewport: HTMLElement;
  /** The innings the card is showing, for whatever the share buttons draw. */
  private shared: CardFacts | null = null;
  /** The kit the picker is on, and what this browser last batted under. */
  private kit = 0;
  private claimed: { name: string; avatar: number } | null = null;
  private claimPlace: number | null = null;
  private $ = (id: string) => document.getElementById(id)!;
  constructor(root: HTMLElement, best: number, top = 0) {
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
            <button id="board" class="hud-button" aria-label="Top 50 board" title="Top 50 (B)">${icon('trophy')}</button>
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
${touch ? coverIntro(best, top) : panelIntro(best, top)}
        <div id="board-overlay" class="modal-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="board-title"></div>
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
            <div id="card-keys" class="card-keys">
              <button id="again" class="key-button">PLAY AGAIN</button>
              <button id="claim" class="key-button claim-key hidden"></button>
              <div class="card-shares">
                <a id="whatsapp" class="whatsapp-key" href="https://wa.me/" target="_blank" rel="noopener noreferrer">${icon('whatsapp')}<span class="key-long">BRAG YOUR SCORE TO A FRIEND</span><span class="key-short">SHARE</span></a>
                <button id="story" class="story-key">${icon('story')}<span class="key-long">SHARE SCORE IN STORY</span><span class="key-short">STORY</span></button>
              </div>
              <button id="claim-skip" class="ghost-link hidden">Play again instead</button>
            </div>
            <form id="card-claim" class="card-claim hidden">
              <p class="claim-line" id="claim-line"></p>
              <div id="claim-picker"></div>
              <label class="claim-field"><span>Name</span><input id="claim-name" name="name" type="text" maxlength="14" autocomplete="nickname" enterkeyhint="done" placeholder="Up to 14 characters" required></label>
              <p id="claim-error" class="claim-error hidden" role="alert"></p>
              <button id="claim-send" type="submit" class="key-button">PUT ME ON THE BOARD</button>
              <button id="claim-cancel" type="button" class="ghost-link">Not now</button>
            </form>
            <span class="start-hint keyboard-only">Press <kbd>R</kbd> to play again</span>
          </div>
        </div>
        <div id="share-status" class="share-status hidden" role="status"></div>
        <pre id="debug" class="debug hidden"></pre>
      </div>
      <dialog id="help-dialog"><button class="close-help hud-button" aria-label="Close instructions">×</button><p class="eyebrow">WELCOME TO HITMAN OVAL</p><h2>Make every ball count.</h2><p>Face 30 balls, with three wickets to spare. Read the ball's position as it approaches the crease and press a shot key just as it reaches your bat.</p><div class="touch-only"><p>Swipe directly on the field when the ball reaches your bat. A short, decisive swipe is enough.</p><ul><li>← Left: leg-side shot</li><li>↖ Up-left: long-on drive</li><li>↑ Up: straight drive</li><li>↗ Up-right: cover drive</li><li>→ Right: square cut, behind point</li><li>↓ Down: forward defensive</li></ul><p>One swipe per ball. A tap plays no shot. The same timing and wicket rules apply.</p></div><ul class="keyboard-only"><li><kbd>A</kbd> plays left to leg; <kbd>D</kbd> cuts it square off the back foot.</li><li><kbd>W</kbd> drives straight back toward the bowler.</li><li>Press <kbd>A</kbd> + <kbd>W</kbd> or <kbd>W</kbd> + <kbd>D</kbd> within 100 ms for a diagonal drive.</li><li><kbd>S</kbd> blocks it: bat down, no runs, and nothing can be caught off it.</li><li>The arrow keys play the same shots: <kbd>←</kbd> <kbd>↑</kbd> <kbd>→</kbd> <kbd>↓</kbd>, and pair up the same way.</li><li>One swing per ball. Wait for the ball to come to you.</li><li>Perfect timing can score four or six. Mistimed contact can be caught; missing the stumps' line can mean Bowled or LBW.</li></ul><p class="help-note"><b>The square cut.</b> Swipe out to the off (or press <kbd>D</kbd>) and he rocks onto the back foot and cuts square of the wicket, behind point. It wants width: the further outside off the ball is, the better it plays, and there is nothing in it against a ball at the stumps. It is also the one stroke that answers a bouncer outside off — the ball sits up with room to free the arms at it. Middled, it goes behind point for six or four. Anything else feathers the edge through to the keeper, and a bouncer outside off is exactly where that happens.</p><p class="help-note"><b>Defending.</b> Swipe down (or press <kbd>S</kbd>) and the batter blocks it: the ball dies at his feet for a dot, and a dead bat cannot be caught. Leave it too late, though, and the ball goes past — on the stumps, that bowls you. Blocking costs your confidence nothing, but go three balls without scoring and you will hear about it from the field.</p><p class="help-note"><b>The confidence meter.</b> Boundaries, twos and threes fill it; a ball that beats the bat drains it, a single or a block leaves it where it stands, and a wicket empties it. Full, it pulses — and when a ball you can walk at is coming, the whole field lights up gold from the bowler's run-up. Drive that one — straight, or either diagonal — and time it well, and you charge down the pitch and hit it out of the ground. Miss it and the call tells you which half you got wrong, with the meter still charged.</p><p class="help-note">Play with swipes on a phone, or A, W, D, S — or the arrow keys — on a keyboard. Use Pause to take a break or restart.</p><button id="help-done" class="primary-button">GOT IT ${icon('arrow')}</button></dialog>`;
    this.viewport = this.$('viewport'); this.score(new ScoreManager());
    if (!document.fullscreenEnabled) this.$('fullscreen').classList.add('hidden');
    this.$('whatsapp').addEventListener('click', event => this.shareScore(event, 'card'));
    this.$('story').addEventListener('click', event => this.shareScore(event, 'story'));
    const dialog = this.$('help-dialog') as HTMLDialogElement;
    this.$('help-done').onclick = () => dialog.close();
    dialog.querySelector<HTMLButtonElement>('.close-help')!.onclick = () => dialog.close();
  }
  on(id: string, fn: () => void) { this.$(id).addEventListener('click', fn); }
  help() { (this.$('help-dialog') as HTMLDialogElement).showModal(); }
  get helpOpen() { return (this.$('help-dialog') as HTMLDialogElement).open; }
  /**
   * The board, drawn whole every time it is opened. Fifty rows is a few
   * thousand nodes and it is opened between innings rather than during one, so
   * there is nothing to be gained by keeping them around and patching them:
   * a fresh sheet is always the rows it was handed.
   */
  board(view: BoardView) {
    const overlay = this.$('board-overlay');
    overlay.innerHTML = boardMarkup(view);
    overlay.classList.remove('hidden');
    this.viewport.classList.add('modal-open');
    // The backdrop is the whole overlay, so a click that lands on the sheet is
    // not a click on the way out.
    overlay.onclick = event => { if (event.target === overlay) this.closeBoard(); };
    this.$('board-close').onclick = () => this.closeBoard();
    this.$('board-close').focus();
  }
  get boardOpen() { return !this.$('board-overlay').classList.contains('hidden'); }
  /**
   * The board's leader, once it has been fetched. The cover quotes it while the
   * player has no best of their own — so the line goes from naming only where it
   * leads to naming a score to chase, without the screen being rebuilt.
   */
  leader(top: number, best: number) {
    if (best > 0 || top <= 0) return;
    this.$('best-label').textContent = document.getElementById('cover-board') ? 'TOP OF THE BOARD' : 'TOP 50 BOARD';
    this.$('best').innerHTML = `${top} <small>RUNS</small>`;
  }
  /** Puts the sheet away and hands the screen back to whatever was under it. */
  closeBoard() {
    this.$('board-overlay').classList.add('hidden');
    this.$('board-overlay').innerHTML = '';
    // The pause card and the innings card are both modals in their own right, so
    // the darkened ground only lifts if the board was the last thing on it.
    const stacked = ['end', 'pause-overlay', 'tutorial-done'].some(id => !this.$(id).classList.contains('hidden'));
    this.viewport.classList.toggle('modal-open', stacked);
    this.$('board').focus();
  }
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
    // Last innings' claim does not carry over to this one.
    this.$('end').classList.remove('is-claimed', 'is-offering');
    this.closeClaim();
    this.$('claim').classList.add('hidden');
    this.$('claim-skip').classList.add('hidden');
    this.$('again').classList.remove('hidden');
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
    // The trophy line was quoting the board's leader while there was no best of
    // your own. There is one now, so it goes back to quoting yours.
    if (best > 0) {
      this.$('best-label').textContent = document.getElementById('cover-board') ? 'BEST' : 'PERSONAL BEST';
      this.$('best').innerHTML = `${best} <small>RUNS</small>`;
    }
    this.$('again').focus();
    // The href is the floor, not the plan: a wa.me link carries text and nothing
    // else, so it is what a browser that cannot hand a file to another app falls
    // back to. Where one can, the click below sends the picture instead.
    (this.$('whatsapp') as HTMLAnchorElement).href = whatsappLink(score.runs, gameLink());
    this.shared = cardFacts(score, best, isRecord);
    // Fonts and cover art, fetched while the player is still reading the card,
    // so the first tap on a share button does not wait on the network.
    void prepareShareAssets();
  }
  /**
   * The innings-end card's button area, in whichever of its three states this
   * innings has earned. The card does not grow to hold a claim form: it is
   * already 349 px tall on a landscape phone with three keys on it, so the
   * button area is what changes and everything above it — the score, the ball
   * track, the stats — stays exactly where the player is already looking.
   *
   * `place` is what the browser worked out from the board it has. It is a good
   * guess, not the answer: the store ranks the innings itself and the line above
   * the buttons is rewritten with what it says.
   */
  offerClaim(place: number | null, known: { name: string; avatar: number } | null) {
    const key = this.$('claim') as HTMLButtonElement;
    key.textContent = place ? `CLAIM ${ordinal(place)} PLACE` : 'PUT ME ON THE BOARD';
    key.classList.remove('hidden');
    // The claim is the thing to do next, so it takes the primary key's place
    // rather than becoming a fourth one there is no room for.
    this.$('again').classList.add('hidden');
    this.$('claim-skip').classList.remove('hidden');
    // The offer costs the card a line it did not have. On a short screen the
    // stylesheet takes that line back from somewhere else.
    this.$('end').classList.add('is-offering');
    this.claimed = known;
    this.claimPlace = place;
  }

  /** The form, once the player has asked for it. */
  get claimOpen() { return !this.$('card-claim').classList.contains('hidden'); }
  openClaim() {
    this.$('card-keys').classList.add('hidden');
    this.$('card-claim').classList.remove('hidden');
    // On a short screen the card cannot hold the figures and the form at once,
    // and the form is the task. The stylesheet decides what gives.
    this.$('end').classList.add('is-claiming');
    this.$('claim-line').textContent = this.claimPlace
      ? `${ordinal(this.claimPlace)} on the board, if you claim it.`
      : 'Put this innings on the board.';
    this.kit = this.claimed?.avatar ?? 0;
    this.$('claim-picker').innerHTML = pickerMarkup(this.kit);
    this.$('claim-picker').querySelectorAll<HTMLButtonElement>('.kit-option').forEach(option => {
      option.onclick = () => this.chooseKit(Number(option.dataset.kit));
    });
    const field = this.$('claim-name') as HTMLInputElement;
    field.value = this.claimed?.name ?? '';
    this.$('claim-error').classList.add('hidden');
    field.focus();
  }

  private chooseKit(kit: number) {
    this.kit = ((kit % AVATARS) + AVATARS) % AVATARS;
    this.$('claim-picker').querySelectorAll<HTMLButtonElement>('.kit-option').forEach((option, i) => {
      option.classList.toggle('is-chosen', i === this.kit);
      option.setAttribute('aria-checked', String(i === this.kit));
    });
  }

  /** What the player is offering: the kit they picked and the name they typed. */
  get claimEntry() {
    return { name: (this.$('claim-name') as HTMLInputElement).value, avatar: this.kit };
  }

  /** The form, while the store is thinking about it. */
  claimSending(sending: boolean) {
    const send = this.$('claim-send') as HTMLButtonElement;
    send.disabled = sending;
    send.textContent = sending ? 'SENDING…' : 'PUT ME ON THE BOARD';
  }

  /** The store turned it down, and the player can do something about it. */
  claimFailed(reason: string) {
    this.claimSending(false);
    this.$('claim-error').textContent = reason;
    this.$('claim-error').classList.remove('hidden');
  }

  /**
   * Done. The buttons come back, with where the innings actually landed written
   * above them — the store's answer, not the browser's guess.
   */
  claimDone(place: number | null) {
    this.closeClaim();
    this.$('end').classList.remove('is-offering');
    this.$('claim').classList.add('hidden');
    this.$('claim-skip').classList.add('hidden');
    this.$('again').classList.remove('hidden');
    this.$('end-message').textContent = place
      ? `${ordinal(place)} on the board.`
      : 'On the board.';
    this.$('end').classList.add('is-claimed');
    this.$('again').focus();
  }

  /** Out of the form, back to the keys, with the offer still standing. */
  closeClaim() {
    this.$('card-claim').classList.add('hidden');
    this.$('card-keys').classList.remove('hidden');
    this.$('end').classList.remove('is-claiming');
    this.claimSending(false);
  }

  /** The offer withdrawn: the player would rather just play again. */
  declineClaim() {
    this.closeClaim();
    this.$('end').classList.remove('is-offering');
    this.$('claim').classList.add('hidden');
    this.$('claim-skip').classList.add('hidden');
    this.$('again').classList.remove('hidden');
    this.$('again').focus();
  }

  /**
   * Sends the innings out as a picture. Both buttons draw the same card; the
   * story one stands it on the cover art in a 9:16 frame with the address
   * painted on, because a picture in a story is a picture. Link stickers get
   * added inside Instagram or WhatsApp, not by whoever sent the image, so the
   * only link that survives the trip is one a person can read and type.
   *
   * A wa.me link cannot carry a file, so where the browser can hand a file to
   * another app this takes over the click and goes through the share sheet
   * instead. Where it cannot, the anchor's own href still opens WhatsApp with
   * the text, and the story button offers the picture as a download.
   */
  private async shareScore(event: Event, kind: 'card' | 'story') {
    const facts = this.shared;
    if (!facts) return;
    const url = gameLink();
    const caption = kind === 'story' ? storyText(facts.runs, url) : shareText(facts.runs, url);
    if (kind === 'story') event.preventDefault();
    if (!canShareImage()) {
      // WhatsApp's own link still works for the text; the story has no such
      // fallback but a saved file, so say which one happened.
      if (kind === 'story') await this.saveShare(facts, caption);
      return;
    }
    event.preventDefault();
    const status = this.$('share-status');
    try {
      const picture = kind === 'story' ? await storyImage(facts, url) : await scorecardImage(facts);
      const file = new File([picture], shareFileName(facts.runs, kind), { type: shareFileType(kind) });
      await navigator.share({ files: [file], text: caption });
    } catch (error) {
      // A cancelled sheet is the player changing their mind, not a failure.
      if (error instanceof DOMException && error.name === 'AbortError') return;
      status.textContent = 'Could not open the share sheet. Saving the picture instead.';
      status.classList.remove('hidden');
      await this.saveShare(facts, caption);
    }
  }

  /** No share sheet: put the picture in the downloads folder and say so. */
  private async saveShare(facts: CardFacts, caption: string) {
    const status = this.$('share-status');
    try {
      const kind = 'story';
      const picture = await storyImage(facts, gameLink());
      const href = URL.createObjectURL(picture);
      const link = document.createElement('a');
      link.href = href; link.download = shareFileName(facts.runs, kind);
      link.click();
      setTimeout(() => URL.revokeObjectURL(href), 10_000);
      status.textContent = 'Story picture saved. Post it with: ' + caption;
    } catch {
      status.textContent = 'Could not build the picture on this browser.';
    }
    status.classList.remove('hidden');
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
