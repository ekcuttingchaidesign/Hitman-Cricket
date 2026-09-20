import { GAME } from '../config/gameplay';
import { ScoreManager } from '../game/ScoreManager';
import {
  gameLink, shareFileName, shareFileType, shareText, statsFileName, statsShareText,
  statsStoryText, statsWhatsappLink, whatsappLink,
} from '../game/Share';
import { track } from '../game/analytics';
import { feedbackGiven } from '../game/feedback';
import { canShareImage, cardFacts, prepareShareAssets, scorecardImage } from '../game/ShareCard';
import type { CardFacts } from '../game/ShareCard';
import {
  BOARD_TABS, actionsMarkup, boardMarkup, boardTabsMarkup, escape, kitMarkup, peekMarkup, pickerMarkup,
  standingPeek,
  type BoardTab, type BoardView, type CardOffer, type SheetTab,
} from './Leaderboard';
import {
  surviveActions, surviveBest, surviveBoardMarkup, survivePeekMarkup, surviveStandingPeek,
  type SurviveBoardView,
} from './SurviveBoard';
import type { BoardRow, Innings } from '../game/leaderboard';
import type { SurviveInnings, SurviveRow } from '../game/survive-board';
import {
  careerBoardMarkup, ladderTabsMarkup, laddersOf,
  type CareerBoardView, type LadderTab,
} from './CareerBoard';
import { statsSheetMarkup, type StatsSheetView, type StatsSlide } from './StatsSheet';
import { storiesMarkup, type StoriesWhere } from './WhatsNew';
import { STORIES } from '../game/whats-new';
import {
  statsCardImage, statsExplain, statsStoryImage, type StatsFacts,
} from '../game/StatsCard';
import { AVATARS, kitDeal } from '../config/board';
import { careerSeen, markCareerSeen as rememberCareerSeen } from '../game/private-mode';
import { dotMatrix } from './DotMatrix';
import type { TutorialStep } from '../game/Tutorial';
import type { Ending, GamePhase, ShotOutcome, ShotType } from '../game/types';
import { HEALTH, SURVIVE } from '../config/survive';
import { resultOf, type Result } from '../game/Survive';
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
    back: '<path d="M20 12H4m6-6-6 6 6 6"/>',
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
/* The mode cards' plates. The Blast borrows the cover's drive — the same shot,
   the same kit — and the Test match has its own, in whites with a red ball. */
const blastPlate = new URL('../assets/cover-drive.webp', import.meta.url).href;
const survivePlate = new URL('../assets/survive-cover.webp', import.meta.url).href;
/* The three plates the result card stands on. The loss is used twice: a man
   carried off and a man bowled twelve short are the same picture of the same
   over, and what separates them is the line above it, not the art. */
const resultPlates: Record<Result, string> = {
  WON: new URL('../assets/result-won.webp', import.meta.url).href,
  DRAWN: new URL('../assets/result-drawn.webp', import.meta.url).href,
  HURT: new URL('../assets/result-hurt.webp', import.meta.url).href,
  ALMOST: new URL('../assets/result-lost.webp', import.meta.url).href,
  LOST: new URL('../assets/result-lost.webp', import.meta.url).href,
};
/* What each card says, and the word it puts on the result line. */
const RESULT_SAID: Record<Result, { title: string; line: string; stamp: string }> = {
  WON: { title: 'You did the impossible!', line: 'thats a legendary knock from a tailender', stamp: 'MATCH WON' },
  DRAWN: { title: 'Thats warrior instincts!', line: 'Survived the fiery attack and saved the match', stamp: 'MATCH DRAWN' },
  HURT: { title: 'Ouch! that hurts', line: 'Thats too many blows on the body', stamp: 'MATCH LOST' },
  ALMOST: { title: 'You almost did it', line: 'Few balls more and it would\u2019ve been legendary', stamp: 'MATCH LOST' },
  LOST: { title: 'They got you', line: 'One wicket was all they needed', stamp: 'MATCH LOST' },
};
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
            <button id="feedback-open" class="cover-feedback hidden" type="button">WHAT DO YOU THINK?</button>
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
          <button id="feedback-open" class="ghost-link hidden" type="button">Tell me what you think</button>
        </div>`;
/** Which special stroke the ball on its way is for, when the meter is full to play it. */
export type Primed = 'CHARGE' | 'SWEEP' | 'SCOOP' | 'REVERSE' | null;
/** The call for each, over the meter and down the pitch. */
const CUES: Record<NonNullable<Primed>, string> = {
  CHARGE: 'CHARGE IT — SWIPE UP', SWEEP: 'SWEEP IT — SWIPE TO LEG',
  SCOOP: 'SCOOP IT — SWIPE DOWN-LEFT', REVERSE: 'REVERSE IT — SWIPE DOWN-RIGHT',
};
/**
 * The swipe guide: the eight directions a thumb can go, as faint spokes over
 * the pitch in front of the crease, shown only while there is a meter to spend
 * and a ball on its way. Which spokes light up is the ball's business — the
 * charge's three drives, the sweep's two leg-side swipes, a scoop's diagonal —
 * and the rest stay dim, so the guide says where the special strokes are
 * without shouting about the ordinary ones. Degrees clockwise from straight up.
 */
const SWIPE_SPOKES: readonly { dir: string; angle: number }[] = [
  { dir: 'STRAIGHT', angle: 0 }, { dir: 'COVER', angle: 45 }, { dir: 'CUT', angle: 90 }, { dir: 'REVERSE', angle: 135 },
  { dir: 'DEFEND', angle: 180 }, { dir: 'SCOOP', angle: 225 }, { dir: 'LEG', angle: 270 }, { dir: 'LONG_ON', angle: 315 },
];
/** Which spokes each special stroke is played off. */
const SPECIAL_SPOKES: Record<NonNullable<Primed>, readonly string[]> = {
  CHARGE: ['STRAIGHT', 'LONG_ON', 'COVER'], SWEEP: ['LEG', 'LONG_ON'], SCOOP: ['SCOOP'], REVERSE: ['REVERSE'],
};
function swipeGuide() {
  const from = 22, to = 84;
  const gradients: string[] = [], spokes: string[] = [];
  for (const { dir, angle } of SWIPE_SPOKES) {
    const a = angle * Math.PI / 180, sin = Math.sin(a), cos = -Math.cos(a);
    const x1 = (sin * from).toFixed(1), y1 = (cos * from).toFixed(1), x2 = (sin * to).toFixed(1), y2 = (cos * to).toFixed(1);
    // A streak: nothing at the hub, brightest a third of the way out, gone by
    // the tip — light leaving the thumb, not a pointer. Two colours per
    // spoke, cream and gold, and the class picks which shows.
    for (const [tone, colour] of [['plain', '#ffffff'], ['gold', '#ffc766']] as const)
      gradients.push(`<linearGradient id="sg-${tone}-${dir}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">`
        + `<stop offset="0" stop-color="${colour}" stop-opacity="0"/><stop offset=".32" stop-color="${colour}" stop-opacity="1"/><stop offset="1" stop-color="${colour}" stop-opacity="0"/></linearGradient>`);
    const line = (cls: string, tone: string) => `<line class="${cls}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="url(#sg-${tone}-${dir})"/>`;
    spokes.push(`<g class="spoke" data-dir="${dir}">${line('glow plain', 'plain')}${line('core plain', 'plain')}${line('glow gold', 'gold')}${line('core gold', 'gold')}`
      + `<line class="run" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/></g>`);
  }
  return `<svg id="swipe-guide" class="swipe-guide" viewBox="-100 -100 200 200" aria-hidden="true"><defs>`
    + `<filter id="sg-blur" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="1.8"/></filter>${gradients.join('')}</defs>`
    + `<circle class="hub" r="2.6"/>${spokes.join('')}</svg>`;
}
export class HUD {
  readonly viewport: HTMLElement;
  /** The innings the card is showing, for whatever the share buttons draw. */
  private shared: CardFacts | null = null;
  /** The kit the picker is on, and what this browser last batted under. */
  private kit = 0;
  private claimed: { name: string; avatar: number } | null = null;
  /**
   * How this player's five kits are dealt: the order they are laid out in and
   * the one the form opens on. Dealt off their id, so it is the same every time
   * they see it and different from the next player's.
   */
  private deal = kitDeal(null);
  /**
   * What the strip's one key does. The strip has two states and they want
   * opposite things of the same key: an innings worth registering opens the form,
   * and an innings already beaten by the player's own row has nothing to register
   * and opens the board instead.
   */
  private offer: CardOffer = { kind: 'silent' };
  /** Whether the player is on the board already, which the submit key says. */
  private onBoard = false;
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
            <!--
              The row used to carry six, which over the top of the ground read
              as a menu bar rather than a game. Three of them were ways to a
              screen reachable from the cover or the innings card — the
              instructions, a share, fullscreen — and those are gone.

              The board and the pause stay, but only while a ball is actually
              being bowled: they are the two things a player wants *mid*-over
              and the two that have no other door on a phone, where there is no
              Escape key. The is-playing class is what decides, in styles.css.

              The three retired keys are hidden rather than deleted, because
              the game drives them by id from a dozen places and a hidden key
              answers a click exactly the way a visible one does.
            -->
            <button id="board" class="hud-button is-playing" aria-label="Top 50 board" title="Top 50 (B)">${icon('trophy')}</button>
            <button id="pause" class="hud-button is-playing" aria-label="Pause innings" title="Pause (Esc)" disabled>${icon('pause')}</button>
            <button id="help" class="hud-button is-retired" aria-label="How to play" title="How to play" tabindex="-1" aria-hidden="true">${icon('help')}</button>
            <button id="share" class="hud-button is-retired" aria-label="Share game" title="Share game" tabindex="-1" aria-hidden="true">${icon('share')}</button>
            <button id="fullscreen" class="hud-button is-retired" aria-label="Enter fullscreen" title="Fullscreen" tabindex="-1" aria-hidden="true">${icon('expand')}</button>
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
            <span class="confidence-head">
              <span class="confidence-label" id="confidence-label">CONFIDENCE</span>
              <span class="injury-cap" id="injury-cap" hidden></span>
            </span>
            <span class="confidence-track"><i id="confidence-fill"></i></span>
          </span>
        </div>
        <div id="survive-card" class="survive-card hidden" role="group" aria-label="Match situation">
          <div class="sc-head">
            <span class="sc-score" id="sc-score" aria-live="polite"></span>
            <span class="sc-chase"><span class="sc-label">TARGET</span><b id="sc-target"></b></span>
          </div>
          <div class="sc-feet">
            <span class="sc-cell"><span class="sc-label">TO WIN</span><b id="sc-need"></b></span>
            <span class="sc-cell"><span class="sc-label">BALLS LEFT</span><b id="sc-balls"></b></span>
          </div>
        </div>
        </div>
        <div id="hit-burst" class="hit-burst" aria-hidden="true"><em id="hit-where"></em></div>
        <div id="result" class="result hidden" aria-live="polite"><strong id="result-text"></strong><span id="timing"></span></div>
        ${swipeGuide()}
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
        <div id="stats-overlay" class="modal-overlay stats-overlay hidden" role="dialog" aria-modal="true" aria-label="Your career card"></div>
        <div id="whatsnew-overlay" class="modal-overlay whatsnew-overlay hidden" role="dialog" aria-modal="true" aria-label="What's new"></div>
        <div id="pause-overlay" class="modal-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="pause-title"><div class="scorecard pause-card"><p class="pause-eyebrow">TAKE A BREATHER</p><h2 id="pause-title">Innings paused.</h2><p class="pause-line">The next shot can wait.</p><button id="resume" class="key-button">RESUME INNINGS</button><div class="card-shares"><button id="restart" class="story-key">RESTART</button><button id="change-mode" class="story-key">CHANGE MODE</button></div><button id="feedback-pause" class="ghost-link hidden" type="button">Tell me what you think</button><span class="start-hint keyboard-only"><kbd>Esc</kbd> to resume · <kbd>R</kbd> to restart</span></div></div>
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
            <div id="card-board" class="card-board hidden">
              <p class="card-board-head" id="card-board-head"></p>
              <div id="card-peek"></div>
              <button id="claim" class="key-button claim-key">REGISTER SCORE ON LEADERBOARD</button>
              <form id="card-claim" class="card-claim hidden">
                <div id="claim-picker"></div>
                <label class="claim-field"><span>Name</span><input id="claim-name" name="name" type="text" maxlength="14" autocomplete="nickname" enterkeyhint="done" placeholder="Up to 14 characters" required></label>
                <p id="claim-error" class="claim-error hidden" role="alert"></p>
                <button id="claim-send" type="submit" class="key-button claim-key">PUT ME ON THE BOARD</button>
                <button id="claim-cancel" type="button" class="ghost-link">Not now</button>
              </form>
            </div>
            <button id="card-career" class="career-widget hidden" type="button">
              <span id="career-kit" class="career-kit"></span>
              <span class="career-words">Career Stats<em id="career-new" class="career-new">NEW</em></span>
              <span class="career-go" aria-hidden="true">${icon('arrow')}</span>
            </button>
            <div class="card-keys">
              <button id="again" class="key-button">PLAY AGAIN</button>
              <button id="card-share" class="share-key" type="button">${icon('whatsapp')}<span>SHARE</span></button>
            </div>
            <button id="feedback-card" class="ghost-link hidden" type="button">Tell me what you think</button>
            <span class="start-hint keyboard-only">Press <kbd>R</kbd> to play again</span>
          </div>
        </div>
        <div id="modes" class="modal-overlay mode-screen hidden" role="dialog" aria-modal="true" aria-labelledby="modes-title">
          <div class="mode-sheet">
            <div class="mode-top">
              <button id="modes-cancel" class="mode-back" aria-label="Back" title="Back">${icon('back')}</button>
              <h2 id="modes-title" class="mode-heading">Select Mode</h2>
            </div>
            <button id="mode-classic" class="mode-card">
              <span class="mode-plate"><img src="${blastPlate}" alt="" decoding="async" /></span>
              <span class="mode-body">
                <span class="mode-name">The Blast</span>
                <span class="mode-copy">Five overs, three wickets, nothing to lose. Find the gaps, clear the ropes, and put a record on the board.</span>
                <span class="mode-key">PLAY THE BLAST</span>
              </span>
            </button>
            <button id="mode-survive" class="mode-card mode-survive">
              <span class="mode-flag">NEW</span>
              <span class="mode-plate"><img src="${survivePlate}" alt="" decoding="async" /></span>
              <span class="mode-body">
                <span class="mode-name">Test Survival</span>
                <span class="mode-copy">You are the last man standing. 60 balls to survive. Chase or Draw the match for the glory.</span>
                <span class="mode-key">PLAY TEST SURVIVAL</span>
              </span>
            </button>
          </div>
        </div>
        <div id="end-survive" class="modal-overlay result-screen hidden" role="dialog" aria-modal="true" aria-labelledby="survive-title">
          <div class="result-card">
            <span class="result-plate"><img id="survive-plate" src="" alt="" decoding="async" /></span>
            <div class="result-body">
              <h2 id="survive-title" class="result-headline"></h2>
              <p id="survive-message" class="result-sub"></p>
              <hr class="result-rule" />
              <p class="result-stamp" id="survive-stamp"></p>
              <div class="result-figures">
                <p class="result-score" id="survive-score" role="img"></p>
                <p class="result-balls" id="survive-overs"></p>
              </div>
              <div class="card-balls" id="survive-track" aria-hidden="true"></div>
              <hr class="result-rule" />
              <dl class="result-stats">
                <div><dt>Runs</dt><dd id="survive-runs"></dd></div>
                <div><dt>Blows Taken</dt><dd id="survive-blows"></dd></div>
                <div><dt>Injury</dt><dd id="survive-health"></dd></div>
              </dl>
              <div id="survive-strip" class="survive-strip"></div>
              <div class="result-keys">
                <button id="survive-again" class="play-button">PLAY AGAIN</button>
                <button id="survive-modes" class="learn-button">MODE SELECTION</button>
              </div>
              <span class="start-hint keyboard-only">Press <kbd>R</kbd> to bat again</span>
            </div>
          </div>
        </div>
        <div id="hurt-note" class="hurt-note hidden" role="alertdialog" aria-labelledby="hurt-note-title">
          <div class="hurt-note-card">
            <p class="hurt-note-eyebrow">PHYSIO ON</p>
            <h2 id="hurt-note-title">He's not going to take much more.</h2>
            <p class="hurt-note-line">Block and the ball keeps hitting you. Play at it and you risk the edge. There's no safe option left &mdash; pick which way you'd rather go out.</p>
            <button id="hurt-note-done" class="key-button">BAT ON</button>
          </div>
        </div>
        <div id="share-status" class="share-status hidden" role="status"></div>
        <pre id="debug" class="debug hidden"></pre>
      </div>
      <dialog id="help-dialog"><button class="close-help hud-button" aria-label="Close instructions">×</button><p class="eyebrow">WELCOME TO HITMAN OVAL</p><h2>Make every ball count.</h2><p>Face 30 balls, with three wickets to spare. Read the ball's position as it approaches the crease and press a shot key just as it reaches your bat.</p><div class="touch-only"><p>Swipe directly on the field when the ball reaches your bat. A short, decisive swipe is enough.</p><ul><li>← Left: leg-side shot</li><li>↖ Up-left: long-on drive</li><li>↑ Up: straight drive</li><li>↗ Up-right: cover drive</li><li>→ Right: square cut, behind point</li><li>↓ Down: forward defensive</li><li>↙ Down-left: the scoop, over the keeper (meter full)</li><li>↘ Down-right: the reverse scoop, over the slips (meter full)</li></ul><p>One swipe per ball. A tap plays no shot. The same timing and wicket rules apply.</p></div><ul class="keyboard-only"><li><kbd>A</kbd> plays left to leg; <kbd>D</kbd> cuts it square off the back foot.</li><li><kbd>W</kbd> drives straight back toward the bowler.</li><li>Press <kbd>A</kbd> + <kbd>W</kbd> or <kbd>W</kbd> + <kbd>D</kbd> within 100 ms for a diagonal drive.</li><li><kbd>S</kbd> blocks it: bat down, no runs, and nothing can be caught off it. With the meter full, <kbd>S</kbd> + <kbd>A</kbd> scoops it over the keeper and <kbd>S</kbd> + <kbd>D</kbd> reverse-scoops it over the slips.</li><li>The arrow keys play the same shots: <kbd>←</kbd> <kbd>↑</kbd> <kbd>→</kbd> <kbd>↓</kbd>, and pair up the same way.</li><li>One swing per ball. Wait for the ball to come to you.</li><li>Perfect timing can score four or six. Mistimed contact can be caught; missing the stumps' line can mean Bowled or LBW.</li></ul><p class="help-note"><b>The square cut.</b> Swipe out to the off (or press <kbd>D</kbd>) and he rocks onto the back foot and cuts square of the wicket, behind point. It wants width: the further outside off the ball is, the better it plays, and there is nothing in it against a ball at the stumps. It is also the one stroke that answers a bouncer outside off — the ball sits up with room to free the arms at it. Middled, it goes behind point for six or four. Anything else feathers the edge through to the keeper, and a bouncer outside off is exactly where that happens.</p><p class="help-note"><b>Defending.</b> Swipe down (or press <kbd>S</kbd>) and the batter blocks it: the ball dies at his feet for a dot, and a dead bat cannot be caught. Leave it too late, though, and the ball goes past — on the stumps, that bowls you. Blocking costs your confidence nothing, but go three balls without scoring and you will hear about it from the field.</p><p class="help-note"><b>The confidence meter.</b> Boundaries, twos and threes fill it; a ball that beats the bat drains it, a single or a block leaves it where it stands, and a wicket empties it. Full, it pulses — and when a ball you can walk at is coming, the whole field lights up gold from the bowler's run-up. Drive that one — straight, or either diagonal — and time it well, and you charge down the pitch and hit it out of the ground. Miss it and the call tells you which half you got wrong, with the meter still charged.</p><p class="help-note"><b>The scoops.</b> With the meter full, swipe down and to the left (or press <kbd>S</kbd> + <kbd>A</kbd>) at a ball on middle or leg and he crouches, gets the face under it and ramps it over the keeper's shoulder; swipe down and to the right (<kbd>S</kbd> + <kbd>D</kbd>) at one on or outside off and he kneels and reverses it over the slips. Timed perfectly it is six, a shade under is four, held back is ones and twos. Poor timing is a top edge to the keeper, and a ball missed altogether has only your pads between it and the stumps. Neither works on a bouncer, and playing one at the wrong line is playing at air. Either way the meter is spent.</p><p class="help-note">Play with swipes on a phone, or A, W, D, S — or the arrow keys — on a keyboard. Use Pause to take a break or restart.</p><button id="help-done" class="primary-button">GOT IT ${icon('arrow')}</button></dialog>`;
    this.viewport = this.$('viewport'); this.score(new ScoreManager());
    if (!document.fullscreenEnabled) this.$('fullscreen').classList.add('hidden');
    this.$('card-share').addEventListener('click', () => void this.shareScore());
    this.$('card-career').addEventListener('click', () => { this.markCareerSeen(); this.onStatsOpen?.(); });
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
    this.sheet(boardMarkup(view), 'classic', 'best', view.actions ? this.actions('classic') : '');
  }

  /**
   * The Test board. The same overlay and the same keys — only the rows and the
   * ladder they are ordered by differ, and those are the markup's business.
   */
  surviveBoard(view: SurviveBoardView) {
    this.sheet(surviveBoardMarkup(view), 'survive', 'best', view.actions ? this.actions('survive') : '');
  }

  /**
   * A career board. The same overlay, the same keys and the same rows — what
   * differs is that it is ranking a total rather than an innings, and which
   * total is the board's own business rather than this method's.
   */
  careerBoard(view: CareerBoardView & { actions?: boolean }) {
    this.sheet(
      careerBoardMarkup(view), view.mode, view.board.key,
      view.actions ? this.actions(view.mode) : '',
    );
  }


  /**
   * The innings-end keys, under the sheet that is standing in for the card.
   * Each mode's own, because the Test card offers the mode picker where the
   * Blast's offers the way of sending an innings out.
   */
  private actions(mode: BoardTab) { return mode === 'survive' ? surviveActions() : actionsMarkup(); }

  /** What the card key does. The game decides: the figures are the game's. */
  onStatsOpen: (() => void) | null = null;

  /**
   * The Career Stats widget under the innings card: whose career it is, and
   * whether it is still news.
   *
   * The NEW pill comes off the moment it is opened, once, for good. A badge
   * that says NEW on the fortieth innings is a badge nobody reads any more,
   * and worse, it teaches the player that the flags on this screen mean
   * nothing.
   */
  career(show: boolean, kit: number | null) {
    const widget = this.$('card-career');
    widget.classList.toggle('hidden', !show);
    if (!show) return;
    this.$('career-kit').innerHTML = kit === null ? '' : kitMarkup(kit, '');
    this.$('career-new').classList.toggle('hidden', careerSeen());
  }

  private markCareerSeen() {
    this.$('career-new').classList.add('hidden');
    rememberCareerSeen();
  }
  /** The facts the card on screen was drawn from, held for the share keys. */
  private statsShown: StatsFacts | null = null;
  /** The object URLs of the drawn cards, revoked when the sheet is put away. */
  private statsPictures = new Set<string>();

  /**
   * The career card, over everything else.
   *
   * Drawn whole each time it is opened, the same way the board is, and for a
   * better reason: the picture in it *is* the picture that gets shared, so
   * there is nothing to keep around and patch — either the card is current or
   * it is the wrong card to be sending anybody.
   */
  /**
   * The card, under the My Stats tab of the board sheet. Same markup and same
   * keys as the page below; what differs is that a tab has no way out of its
   * own — the row above it is the way out.
   */
  /**
   * Which card of the rail is in front.
   *
   * Held on the HUD rather than read off the rail, because the rail is rebuilt
   * every time either card finishes painting — and a player who has already
   * swiped to their Test figures must not be carried back to the Blast because
   * a picture landed. It is the screen's memory of where they are, and the
   * scroll is put back to match it after every redraw.
   */
  private statsAt = 0;
  private statsCards: StatsSlide[] = [];

  /**
   * The card, under the My Stats tab of the board sheet. Same markup and same
   * keys as the page below; what differs is that a tab has no way out of its
   * own — the row above it is the way out.
   */
  statsTab(view: StatsSheetView) {
    this.holdStats(view);
    this.sheet(statsSheetMarkup({ ...view, at: this.statsAt, where: 'sheet' }), 'mine', 'best');
    this.wireStatsKeys();
  }

  stats(view: StatsSheetView) {
    const overlay = this.$('stats-overlay');
    // The page goes up before the picture exists and is drawn again when it
    // lands, so only the first of those may take the focus — the second would
    // pull it back off whichever key the player had already reached for.
    const opening = overlay.classList.contains('hidden');
    this.holdStats(view);
    overlay.innerHTML = statsSheetMarkup({ ...view, at: this.statsAt, where: 'page' });
    overlay.classList.remove('hidden');
    this.viewport.classList.add('modal-open');
    this.wireStatsKeys();
    const back = this.$('stats-back');
    back.onclick = () => this.closeStats();
    if (opening) back.focus();
  }

  /**
   * Takes the cards in, and keeps the player where they were standing.
   *
   * A rail that has changed length — a second card arriving, or a build that
   * only plays one game — starts again at the front. A rail of the same cards
   * being redrawn does not.
   */
  private holdStats(view: StatsSheetView) {
    if (view.cards.length !== this.statsCards.length) this.statsAt = view.at ?? 0;
    this.statsAt = Math.min(Math.max(0, this.statsAt), Math.max(0, view.cards.length - 1));
    this.statsCards = view.cards;
    this.statsShown = view.cards[this.statsAt]?.facts ?? null;
  }

  /**
   * The two share keys, wired the same wherever the card is standing. Both
   * presentations draw the same markup, so both get the same behaviour from
   * one place rather than each remembering to do it.
   */
  private wireStatsKeys() {
    this.$('stats-whatsapp').onclick = () => void this.shareStats('card');
    this.$('stats-story').onclick = () => void this.shareStats('story');
    this.wireStatsRail();
    // Every figure on the card, and every figure in the text fallback under it.
    // One selector for both, because what a tap does is the same either way and
    // the fallback is the presentation least likely to be tried by hand.
    for (const tap of document.querySelectorAll<HTMLElement>('[data-stat]')) {
      const label = tap.dataset.stat ?? '';
      tap.onclick = () => this.explainStat(label);
      // The fallback's cells are not buttons, so they need the keys spelled out.
      if (tap.tagName !== 'BUTTON') {
        tap.onkeydown = event => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          this.explainStat(label);
        };
      }
    }
  }

  /** The toast under the card, and the handle that takes it away again. */
  private statsToast = 0;

  /**
   * What a figure counts, said from the bottom of the screen.
   *
   * A career card is a dozen numbers and about half of them are counting
   * something with a rule inside it — a hundred needs the wicket still
   * standing, a draw is not a loss, the highest score and the best unbeaten one
   * are different figures. None of that fits on the card, and a player who
   * cannot find out is left to infer it from a number that will not move.
   *
   * It goes away on its own because it is an aside, not a dialogue: nothing is
   * being asked, so nothing should have to be dismissed.
   */
  private explainStat(label: string) {
    const says = statsExplain(label);
    const toast = document.getElementById('stats-toast');
    if (!says || !toast) return;
    toast.innerHTML = `<b>${escape(label)}</b><span>${escape(says)}</span>`;
    // Off and on again, so a second tap while the first is still up replays the
    // rise rather than swapping the words inside a toast that is already there.
    toast.classList.remove('is-up');
    void toast.offsetWidth;
    toast.classList.add('is-up');
    window.clearTimeout(this.statsToast);
    this.statsToast = window.setTimeout(() => toast.classList.remove('is-up'), 4600);
  }

  /**
   * The rail: where it is put back to, what a swipe changes, and the dots.
   *
   * The keys under the cards send whichever card is in front, so what "in
   * front" means has to be a fact the screen keeps rather than something the
   * share key works out at the moment it is pressed — by then the rail may
   * have been redrawn twice.
   */
  private wireStatsRail() {
    const rail = document.getElementById('stats-rail');
    if (!rail || !rail.classList.contains('is-rail')) return;
    // No animation on the way back: this is not the player moving, it is the
    // screen being rebuilt underneath them, and it should look like nothing
    // happened at all.
    this.railTo(rail, this.statsAt, 'auto');
    rail.onscroll = () => {
      // Whichever card's middle is nearest the rail's middle. Dividing the
      // scroll by the rail's width would be the same thing only if a card were
      // as wide as the rail — and a card exactly as wide as the rail is a card
      // with nothing peeking past it, which is the one thing this must not be.
      const at = this.railAt(rail);
      if (at === this.statsAt || at < 0 || at >= this.statsCards.length) return;
      this.statsAt = at;
      this.statsShown = this.statsCards[at]?.facts ?? this.statsShown;
      for (const dot of document.querySelectorAll<HTMLElement>('.stats-dot')) {
        const on = Number(dot.dataset.slide) === at;
        dot.classList.toggle('is-on', on);
        dot.setAttribute('aria-selected', String(on));
      }
    };
    for (const dot of document.querySelectorAll<HTMLButtonElement>('.stats-dot')) {
      dot.onclick = () => this.railTo(rail, Number(dot.dataset.slide), 'smooth');
    }
  }

  /** Which card is in front of the rail right now. */
  private railAt(rail: HTMLElement) {
    const middle = rail.scrollLeft + rail.clientWidth / 2;
    const slides = [...rail.querySelectorAll<HTMLElement>('.stats-slide')];
    let at = 0;
    let nearest = Infinity;
    slides.forEach((slide, i) => {
      const gap = Math.abs(slide.offsetLeft - rail.offsetLeft + slide.offsetWidth / 2 - middle);
      if (gap < nearest) { nearest = gap; at = i; }
    });
    return at;
  }

  /**
   * Puts a card in front. The scroll listener above does the rest.
   *
   * The last card is scrolled to its right edge rather than its left, because
   * that is where its snap point is: a rail only as long as its cards cannot
   * bring the last one's left edge to the left of the screen.
   */
  private railTo(rail: HTMLElement, at: number, behavior: ScrollBehavior) {
    const slides = [...rail.querySelectorAll<HTMLElement>('.stats-slide')];
    const slide = slides[at];
    if (!slide) return;
    const left = slide.offsetLeft - rail.offsetLeft;
    const end = at === slides.length - 1;
    rail.scrollTo({ left: end ? left + slide.offsetWidth - rail.clientWidth : left, behavior });
  }

  /** Hands the drawn picture to the sheet once it has been painted. */
  holdStatsPicture(url: string | null) {
    if (url) this.statsPictures.add(url);
  }

  /**
   * Lets go of every picture the cards minted — once nothing is still showing
   * one.
   *
   * The card has two homes and they can both be up at once: the page opened
   * from the innings card, with the board's own My Stats tab underneath it. A
   * picture revoked while the tab behind is still pointing at it leaves that
   * tab holding a broken image the moment the page comes down, so whichever of
   * the two closes second is the one that clears up.
   */
  private dropStatsPictures() {
    const showing = !this.$('stats-overlay').classList.contains('hidden')
      || !this.$('board-overlay').classList.contains('hidden');
    if (showing) return;
    for (const url of this.statsPictures) URL.revokeObjectURL(url);
    this.statsPictures.clear();
  }

  /**
   * What's new, over everything.
   *
   * The whole screen is redrawn on every card rather than the contents being
   * swapped, which is what restarts the bar's animation without a second
   * mechanism for restarting it: the bar is a CSS animation on an element that
   * did not exist a moment ago, so it always runs from the start.
   */
  private storyAt = 0;
  private storyWhere: StoriesWhere = 'intro';
  private storyHold = 0;
  /** What to do when the stories are finished with. The game decides. */
  onStoriesDone: (() => void) | null = null;

  /** How long one card holds before it moves on by itself. */
  static readonly STORY_MS = 7000;

  private storyLocked = false;

  stories(where: StoriesWhere, locked = false) {
    this.storyWhere = where;
    this.storyLocked = locked;
    this.storyAt = 0;
    this.drawStory();
  }

  private drawStory() {
    const overlay = this.$('whatsnew-overlay');
    overlay.innerHTML = storiesMarkup({
      at: this.storyAt, where: this.storyWhere, holdMs: HUD.STORY_MS, locked: this.storyLocked,
    });
    overlay.classList.remove('hidden');
    this.viewport.classList.add('modal-open');
    this.$('whatsnew-next').onclick = () => this.stepStory(1);
    this.$('whatsnew-back').onclick = () => this.stepStory(-1);
    this.$('whatsnew-done').onclick = () => this.closeStories();
    this.$('whatsnew-done').focus();
    window.clearTimeout(this.storyHold);
    this.storyHold = window.setTimeout(() => this.stepStory(1), HUD.STORY_MS);
  }

  /** Forward off the last card is the way out, the same as the key under it. */
  private stepStory(by: number) {
    const next = this.storyAt + by;
    if (next >= STORIES.length) return this.closeStories();
    this.storyAt = Math.max(0, next);
    this.drawStory();
  }

  get storiesOpen() { return !this.$('whatsnew-overlay').classList.contains('hidden'); }

  closeStories() {
    window.clearTimeout(this.storyHold);
    this.$('whatsnew-overlay').classList.add('hidden');
    this.$('whatsnew-overlay').innerHTML = '';
    const stacked = ['board-overlay', 'stats-overlay', 'end', 'end-survive', 'modes', 'pause-overlay']
      .some(id => !this.$(id).classList.contains('hidden'));
    this.viewport.classList.toggle('modal-open', stacked);
    const done = this.onStoriesDone;
    this.onStoriesDone = null;
    done?.();
  }

  get statsOpen() { return !this.$('stats-overlay').classList.contains('hidden'); }

  /** What the page's back key does. The game decides where back is. */
  onStatsBack: (() => void) | null = null;

  closeStats() {
    if (this.onStatsBack) return this.onStatsBack();
    this.dropStats();
  }

  /** Puts the page away and hands the screen back to whatever was under it. */
  dropStats() {
    window.clearTimeout(this.statsToast);
    this.$('stats-overlay').classList.add('hidden');
    this.$('stats-overlay').innerHTML = '';
    this.statsShown = null;
    this.statsCards = [];
    this.statsAt = 0;
    // The pictures were minted for this sheet and nothing else is holding them.
    this.dropStatsPictures();
    // The board is usually still underneath, and the darkened ground only lifts
    // when nothing is left standing on it.
    const stacked = ['board-overlay', 'end', 'end-survive', 'modes', 'pause-overlay', 'tutorial-done']
      .some(id => !this.$(id).classList.contains('hidden'));
    this.viewport.classList.toggle('modal-open', stacked);
    if (!this.$('board-overlay').classList.contains('hidden')) {
      document.getElementById('board-tab-mine')?.focus();
    } else if (this.$('end-survive').classList.contains('hidden')) {
      this.$('board').focus();
    }
  }

  /**
   * Sends the career out as a picture.
   *
   * Both keys draw the same card; the story one stands it on the cover art in a
   * 9:16 frame with the address painted on, because a picture in a story is a
   * picture and no text travels with it.
   *
   * The WhatsApp caption carries the playable link, which is the whole
   * difference between a brag and an invitation — a thread full of somebody's
   * numbers is a thread where nobody can go and beat them. Where the browser
   * will not hand a file to another app, the wa.me link still opens WhatsApp
   * with that text, so the link survives even when the picture cannot.
   */
  private async shareStats(kind: 'card' | 'story') {
    const facts = this.statsShown;
    if (!facts) return;
    track(kind === 'story' ? 'stats-share-story' : 'stats-share-whatsapp',
      kind === 'story' ? 'Shared the career card to a story' : 'Shared the career card to WhatsApp');
    const url = gameLink();
    const lead = facts.hero[0] ?? { label: 'runs', value: 0 };
    const caption = kind === 'story'
      ? statsStoryText(lead, facts.innings, url)
      : statsShareText(lead, facts.innings, url);
    const status = this.$('stats-status');
    if (!canShareImage()) {
      // No file can leave this browser. WhatsApp's own link still carries the
      // text and the address; the story has no such fallback but a saved file.
      if (kind === 'card') { window.open(statsWhatsappLink(lead, facts.innings, url), '_blank', 'noopener'); return; }
      await this.saveStats(facts, url, caption);
      return;
    }
    try {
      const picture = kind === 'story'
        ? await statsStoryImage(facts, url)
        : await statsCardImage(facts, url);
      const file = new File([picture], statsFileName(kind), {
        type: kind === 'story' ? 'image/jpeg' : 'image/png',
      });
      await navigator.share({ files: [file], text: caption });
    } catch (error) {
      // A cancelled sheet is the player changing their mind, not a failure.
      if (error instanceof DOMException && error.name === 'AbortError') return;
      status.textContent = 'Could not open the share sheet. Saving the picture instead.';
      status.classList.remove('hidden');
      await this.saveStats(facts, url, caption);
    }
  }

  /** No share sheet: put the picture in the downloads folder and say so. */
  private async saveStats(facts: StatsFacts, url: string, caption: string) {
    const status = this.$('stats-status');
    try {
      const picture = await statsStoryImage(facts, url);
      const href = URL.createObjectURL(picture);
      const link = document.createElement('a');
      link.href = href; link.download = statsFileName('story');
      link.click();
      setTimeout(() => URL.revokeObjectURL(href), 10_000);
      status.textContent = `Card saved. Post it with: ${caption}`;
    } catch {
      status.textContent = 'Could not build the picture on this browser.';
    }
    status.classList.remove('hidden');
  }

  /**
   * Whether this build plays both modes.
   *
   * It used to decide whether the tab row was drawn at all — one mode, one
   * board, and a row of tabs over it would be two names for one thing. The row
   * now carries the player's own card as well, which exists in every build, so
   * it is always drawn and this only decides whether the *other* game is on it.
   */
  private bothModes = false;
  showBoardTabs(on: boolean) { this.bothModes = on; }
  /** What a tab does. The game decides, because the rows are the game's. */
  onBoardTab: ((tab: SheetTab) => void) | null = null;
  /** What the sheet's What's New key does. */
  onBoardStories: (() => void) | null = null;
  /** The same, for the row of ladders inside one mode. */
  onLadderTab: ((ladder: LadderTab) => void) | null = null;

  /**
   * The game whose board the card was reached from.
   *
   * A build that plays one mode takes the other mode's tab off the row, and on
   * the card's own tab that used to take both of them off — leaving My Stats
   * standing alone with no way back to the board it was opened from. The row is
   * the only way between these screens, so the one game this build has stays on
   * it wherever the player is standing.
   */
  private lastGame: BoardTab = 'classic';

  private sheet(markup: string, tab: SheetTab, ladder: LadderTab, actions = '') {
    const overlay = this.$('board-overlay');
    const surviving = tab === 'survive';
    // The card's tab has no ladders under it: a career is one thing and there
    // is nothing to re-sort. The row is dropped rather than drawn empty, or the
    // sheet would keep a gap where the player's eye expects a control.
    const mine = tab === 'mine';
    if (!mine) this.lastGame = tab;
    // The tabs and the sheet are one column, so the sheet can still have the
    // rest of the screen and scroll inside it.
    //
    // Two rows of them, and the second exists whether or not the first does:
    // the ladders inside a mode are this mode's ladders, so a build that plays
    // one mode still has a career and still has a card, while a build that
    // plays both needs the row above to get between them.
    const tabs = `${boardTabsMarkup(tab)}${mine ? '' : ladderTabsMarkup(tab as BoardTab, ladder)}`;
    // The keys stand under the sheet rather than inside it. They are what to do
    // next, which is not a fact about a leaderboard — sealed into its foot they
    // read as part of the board, and a board with a PLAY AGAIN in it is a board
    // nobody can tell where it ends.
    overlay.innerHTML = `<div class="board-stack${mine ? ' is-mine' : ''}">${tabs}${markup}${actions}</div>`;
    for (const other of BOARD_TABS) {
      const key = document.getElementById(other.id);
      if (!key) continue;
      // A build that plays one mode still has a card, so the row is always
      // drawn — the other game's tab is simply taken off it.
      const here = mine ? this.lastGame : tab;
      if (!this.bothModes && other.tab !== 'mine' && other.tab !== here) { key.remove(); continue; }
      key.onclick = () => { if (other.tab !== tab) this.onBoardTab?.(other.tab); };
    }
    if (!mine) {
      for (const other of laddersOf(tab as BoardTab)) {
        this.$(`board-ladder-${other.key}`).onclick = () => {
          if (other.key !== ladder) this.onLadderTab?.(other.key);
        };
      }
    }
    // The ladder strip scrolls sideways where the tabs do not fit, and the
    // sheet is drawn whole every time — so without this, opening the card on a
    // narrow phone puts the tab you are standing on off the right-hand edge and
    // the strip looks like it has forgotten which one is live. Its own
    // `scrollLeft` rather than `scrollIntoView`, which would move the page too.
    if (!mine) {
      const live = this.$(`board-ladder-${ladder}`);
      const strip = live.parentElement;
      if (strip) strip.scrollLeft = live.offsetLeft - (strip.clientWidth - live.clientWidth) / 2;
    }
    overlay.classList.remove('hidden');
    this.viewport.classList.add('modal-open');
    // The backdrop is the whole overlay, so a click that lands on the sheet is
    // not a click on the way out.
    overlay.onclick = event => { if (event.target === overlay) this.closeBoard(); };
    // The card's tab has no X: the row of tabs above it is the way out, and a
    // cross inside a tab would be a way out of the tab to the same tab.
    const close = document.getElementById('board-close');
    if (close) close.onclick = () => this.closeBoard();
    // The way into the stories for somebody who never saw them, or who saw them
    // and wants another look. It sits beside the close key on every sheet.
    const news = document.getElementById('board-new');
    if (news) news.onclick = () => this.onBoardStories?.();
    // The sheet's own keys, when it is carrying them. They are the card's keys
    // under different ids, so they do the same things.
    const again = document.getElementById('board-again');
    if (!again) {
      // No keys on this sheet, so the focus goes to the way out — and the card's
      // tab has no X, which is why this is looked up rather than assumed. It was
      // assumed, and the throw took the rest of this method with it: the picture
      // was painted by a call that never came back, so the card's own tab sat on
      // "Drawing your card…" for good.
      const way = document.getElementById('board-close') ?? document.getElementById(`board-tab-${tab}`);
      way?.focus();
      return;
    }
    again.onclick = () => { this.closeBoard(); this.$(surviving ? 'survive-again' : 'again').click(); };
    if (surviving) {
      // The Test card offers the picker rather than the share keys, so the
      // sheet standing in for it offers the same thing — and drops it on a
      // build where the card has no picker to offer either.
      const modes = this.$('board-modes');
      if (this.$('survive-modes').classList.contains('hidden')) modes.remove();
      else modes.onclick = () => { this.closeBoard(); this.$('survive-modes').click(); };
    } else {
      this.$('board-share').addEventListener('click', () => void this.shareScore());
    }
    again.focus();
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
    // The next open of the board starts at the front of the rail again.
    this.statsCards = [];
    this.statsAt = 0;
    this.dropStatsPictures();
    // The pause card and the innings card are both modals in their own right, so
    // the darkened ground only lifts if the board was the last thing on it.
    const stacked = ['end', 'end-survive', 'modes', 'pause-overlay', 'tutorial-done']
      .some(id => !this.$(id).classList.contains('hidden'));
    this.viewport.classList.toggle('modal-open', stacked);
    // In Survive the hud row is not on screen while the card is, so there is
    // nothing there to hand the focus back to.
    if (this.$('end-survive').classList.contains('hidden')) this.$('board').focus();
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
  start(surviving = false) {
    document.body.classList.remove('tutorial-active', 'start-screen');
    document.body.classList.add('innings-active');
    document.body.classList.toggle('survive-mode', surviving);
    this.viewport.classList.remove('modal-open');
    this.viewport.classList.remove('hurt-on');
    // Both full-screen overlays put the hud row away while they are up.
    this.viewport.classList.remove('picking-mode', 'result-open');
    ['intro', 'end', 'end-survive', 'pause-overlay', 'result', 'coach', 'tutorial-done', 'modes']
      .forEach(id => this.$(id).classList.add('hidden'));
    this.$('survive-card').classList.toggle('hidden', !surviving);
    // The share keys belong to the classic innings: the picture they draw is a
    // five-over scorecard and there is no Test one to draw yet. The board key
    // works in both, because each mode now has a ladder of its own behind it
    // and the key opens whichever one is being played.
    (this.$('share') as HTMLButtonElement).disabled = surviving;
    (this.$('board') as HTMLButtonElement).disabled = false;
    this.viewport.classList.add('playing'); (this.$('pause') as HTMLButtonElement).disabled = false;
    this.$('phase-label').classList.remove('hidden');
  }
  /**
   * `specials` is every special stroke this ball is for, `primed` the one the
   * call names. The guide lights a spoke for each of them.
   */
  phase(phase: GamePhase, primed: Primed = null, specials: readonly NonNullable<Primed>[] = primed ? [primed] : []) {
    const label = this.$('phase-label');
    // The call goes where the player is already looking — down the pitch —
    // not in the corner with the meter, and it names the stroke this ball is
    // for, because each of the four is swiped for differently.
    const on = !!primed && (phase === 'BOWLER_RUNUP' || phase === 'BALL_IN_FLIGHT');
    this.guide(on, specials);
    label.textContent = on ? CUES[primed!].replace(' — ', ' · ')
      : phase === 'READY' ? 'TAKE YOUR GUARD' : phase === 'BOWLER_RUNUP' ? 'HERE COMES THE NEXT BALL' : phase === 'BALL_IN_FLIGHT' ? 'WATCH THE BALL' : '';
    label.classList.toggle('is-primed', on);
    // The edge of the field lights up too: a line of text at the bottom is easy
    // to miss in the second the ball takes to arrive.
    this.viewport.classList.toggle('charge-on', on);
    if (phase === 'READY') this.$('result').classList.add('hidden');
  }
  /** The swipe guide over the pitch: on with the spokes that spend the meter lit, or off. */
  private guide(on: boolean, specials: readonly NonNullable<Primed>[]) {
    const guide = this.$('swipe-guide');
    guide.classList.toggle('is-on', on);
    const lit = new Set(specials.flatMap(special => SPECIAL_SPOKES[special]));
    guide.querySelectorAll<SVGGElement>('.spoke').forEach(spoke => spoke.classList.toggle('is-special', lit.has(spoke.dataset.dir!)));
  }
  select(_shot: ShotType, charging = false) {
    this.$('phase-label').classList.remove('is-primed'); this.viewport.classList.remove('charge-on');
    this.$('swipe-guide').classList.remove('is-on');
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
    // Last innings' claim does not carry over to this one, and neither does what
    // the board had to say about it: the strip is silent until this innings has
    // been measured, so a stale key is never left behind to be pressed.
    //
    // These two are cleared before the form is put away, not after. Closing it
    // relabels the submit key, and it reads the pair to decide what the key
    // says — so clearing them second leaves last innings' wording on it.
    this.offer = { kind: 'silent' };
    this.onBoard = false;
    this.closeClaim();
    // The Test card may be holding the strip. Take it back before hiding it, or
    // an innings that earns a place here unhides one sitting in the other card.
    this.hostStrip(false);
    this.$('card-board').classList.add('hidden');
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
    this.shared = cardFacts(score, best, isRecord);
    // Fonts and cover art, fetched while the player is still reading the card,
    // so the first tap on a share button does not wait on the network.
    void prepareShareAssets();
  }
  /**
   * The leaderboard, inside the card, when this innings has earned a place on
   * it.
   *
   * Not a fourth key and not a screen of its own: a strip between the figures
   * and the keys carrying where the innings landed, the two rows it landed
   * between, and the one thing to do about it. The row above and the row below
   * are the whole point — "fifth has 106" is what makes 101 mean something, and
   * a place on its own does not.
   *
   * `place` is what the browser worked out from the board it has. It is a good
   * guess, not the answer: the store ranks the innings itself, and what comes
   * back is what the full board then shows.
   */
  offerClaim(
    offer: CardOffer,
    known: { name: string; avatar: number } | null,
    rows: readonly BoardRow[],
    yours: Innings,
    playerId: string | null = null,
  ) {
    this.strip(offer, known, playerId, false, {
      best: standing => `Your best score is still <b>${standing.runs}</b>`,
      peek: place => (rows.length ? peekMarkup(rows, place, yours, known?.avatar ?? null) : ''),
      held: place => (rows.length ? standingPeek(rows, place) : ''),
    });
  }

  /**
   * The same strip, for the Test card. The one thing it says differently is
   * what a standing row still stands *for*: on the other board that is a
   * number, and here a number on its own would be the least interesting thing
   * about it — a hundred is a win and sixty blocked balls is a draw, and those
   * are what a player would be sorry to lose.
   */
  offerSurviveClaim(
    offer: CardOffer,
    known: { name: string; avatar: number } | null,
    rows: readonly SurviveRow[],
    yours: SurviveInnings,
    playerId: string | null = null,
  ) {
    this.strip(offer, known, playerId, true, {
      best: standing => `Your best still stands &mdash; <b>${surviveBest(rows, standing.place)}</b>`,
      peek: place => (rows.length ? survivePeekMarkup(rows, place, yours, known?.avatar ?? null) : ''),
      held: place => (rows.length ? surviveStandingPeek(rows, place) : ''),
    });
  }

  /**
   * The strip itself, which is one element moved between the two cards rather
   * than one per card. The form inside it carries the picker, the name field
   * and the listeners the game hung on them, and two of everything under two
   * sets of ids would be two of every bug as well — so the Test card borrows
   * the strip for as long as it is the card on screen.
   */
  private strip(
    offer: CardOffer,
    known: { name: string; avatar: number } | null,
    playerId: string | null,
    surviving: boolean,
    say: {
      best(standing: { runs: number; place: number }): string;
      peek(place: number): string;
      held(place: number): string;
    },
  ) {
    this.claimed = known;
    this.deal = kitDeal(playerId);
    this.offer = offer;
    if (offer.kind === 'silent') return;
    this.hostStrip(surviving);
    this.onBoard = offer.kind === 'standing';
    const key = this.$('claim');
    // Cleared up front, so the two "view leaderboard" states cannot inherit a
    // shimmer from an offer the player has already answered.
    key.classList.remove('is-offer');
    if (offer.kind === 'private') {
      // The innings was good enough and the window cannot keep a player id, so
      // the strip says so plainly rather than offering a form that would file a
      // row nobody could ever come back to. The board is still worth a look.
      this.$('card-board-head').innerHTML =
        `${icon('trophy')}<span>Private window — this innings can’t go on the board</span>`;
      this.$('card-peek').innerHTML =
        '<p class="peek-note">Open the game in a normal tab to register a score.</p>';
      key.textContent = 'VIEW LEADERBOARD';
    } else if (offer.kind === 'standing') {
      // Their own row is the news, not this innings. What it says is what still
      // stands, and the only thing left to offer is the board it stands on.
      this.$('card-board-head').innerHTML = `${icon('trophy')}<span>${say.best(offer)}</span>`;
      this.$('card-peek').innerHTML = say.held(offer.place);
      key.textContent = 'VIEW LEADERBOARD';
    } else {
      this.$('card-board-head').innerHTML = offer.place
        ? `${icon('trophy')}<span>Congrats! You secured <b>${ordinal(offer.place)}</b> position on leaderboard</span>`
        : `${icon('trophy')}<span>Put this innings on the board</span>`;
      // With no board fetched there is nothing to sit between, so the strip is
      // the banner and the key alone rather than three empty rows.
      this.$('card-peek').innerHTML = offer.place ? say.peek(offer.place) : '';
      key.textContent = 'REGISTER SCORE ON LEADERBOARD';
      // The shimmer belongs to the offer, not to the key. This is the one
      // state where the key is asking for something rather than going
      // somewhere, and a light running across it is what makes a player look
      // at it twice. On "view leaderboard" the same light would be a door
      // waving at somebody who has already decided.
      key.classList.add('is-offer');
    }
    this.$('card-board').classList.remove('hidden');
  }

  /** Which card the strip is living in at the moment. */
  private stripHost: 'end' | 'end-survive' = 'end';

  /**
   * The strip, moved to whichever card is about to go up. A move rather than a
   * copy: the ids go with it, so every method that reaches for `card-board`,
   * `claim` or `card-claim` goes on working without knowing which card it is
   * standing in.
   */
  private hostStrip(surviving: boolean) {
    const host = surviving ? 'end-survive' : 'end';
    if (this.stripHost === host) return;
    const strip = this.$('card-board');
    if (surviving) this.$('survive-strip').append(strip);
    else this.$('end').querySelector('.scorecard')!.insertBefore(strip, this.$('end').querySelector('.card-keys'));
    this.stripHost = host;
  }

  /** What the strip's key should do: open the form, or open the board. */
  get offerKind() { return this.offer.kind; }

  /**
   * Whether the player already has a row this innings is about to replace. The
   * submit key says so, because "put me on the board" is the wrong sentence for
   * somebody who is on it and about to move up.
   */
  onTheBoard(already: boolean) { this.onBoard = already; }

  /** The form, once the player has asked for it. */
  get claimOpen() { return !this.$('card-claim').classList.contains('hidden'); }

  /**
   * The strip morphs rather than the card growing: the peek and the register
   * key step aside and the picker and the field take exactly their place, so
   * nothing above moves while the player is filling it in.
   */
  openClaim() {
    this.$('card-peek').classList.add('hidden');
    this.$('claim').classList.add('hidden');
    this.$('card-claim').classList.remove('hidden');
    this.$(this.stripHost).classList.add('is-claiming');
    // A returning player's own kit, or the one this player was dealt. Never kit
    // zero: opening on the same kit for everybody is what put one colour all
    // over the board.
    this.kit = this.claimed?.avatar ?? this.deal.opening;
    this.$('claim-picker').innerHTML = pickerMarkup(this.kit, this.deal.order);
    this.$('claim-picker').querySelectorAll<HTMLButtonElement>('.kit-option').forEach(option => {
      option.onclick = () => this.chooseKit(Number(option.dataset.kit));
    });
    const field = this.$('claim-name') as HTMLInputElement;
    field.value = this.claimed?.name ?? '';
    this.$('claim-error').classList.add('hidden');
    this.claimSending(false);
    field.focus();
  }

  private chooseKit(kit: number) {
    this.kit = ((kit % AVATARS) + AVATARS) % AVATARS;
    // Which kit a disc is, off the disc itself. It used to be its position in
    // the row, which was the same thing only while the row was in kit order —
    // and it is dealt now, so the ring would have landed on the wrong face.
    this.$('claim-picker').querySelectorAll<HTMLButtonElement>('.kit-option').forEach(option => {
      const mine = Number(option.dataset.kit) === this.kit;
      option.classList.toggle('is-chosen', mine);
      option.setAttribute('aria-checked', String(mine));
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
    send.textContent = sending ? 'SENDING…' : this.onBoard ? 'UPDATE MY RANK' : 'PUT ME ON THE BOARD';
  }

  /** The store turned it down, and the player can do something about it. */
  claimFailed(reason: string) {
    this.claimSending(false);
    this.$('claim-error').textContent = reason;
    this.$('claim-error').classList.remove('hidden');
  }

  /**
   * Done. The strip has nothing left to say, so it goes — the player is about
   * to be looking at the whole board instead, which is where the place they
   * just took is written.
   */
  claimDone() {
    this.closeClaim();
    this.$('card-board').classList.add('hidden');
  }

  /** Out of the form, back to the peek, with the offer still standing. */
  closeClaim() {
    this.$('card-claim').classList.add('hidden');
    this.$('card-peek').classList.remove('hidden');
    this.$('claim').classList.remove('hidden');
    this.$(this.stripHost).classList.remove('is-claiming');
    this.claimSending(false);
  }

  /**
   * Sends the innings out, as one key rather than two.
   *
   * It used to be a WhatsApp anchor beside an Instagram button, which was two
   * keys asking the same question and getting the same answer: on a phone both
   * ended in the system share sheet, and choosing between them before seeing
   * it was a decision nobody had the information to make. So this opens the
   * sheet with the card in it and lets the phone offer everywhere it can go —
   * WhatsApp and Instagram included.
   *
   * The caption carries the playable link, which is the whole difference
   * between a score and an invitation. Where the browser will not hand a file
   * to another app at all, WhatsApp's own link still opens with that text, so
   * the link travels even when the picture cannot.
   */
  private async shareScore() {
    const facts = this.shared;
    if (!facts) return;
    // The tap, not the delivery: whether the sheet was then sent or dismissed
    // is between the player and their phone, and no browser tells us.
    track('share-innings', 'Shared the innings');
    const url = gameLink();
    const caption = shareText(facts.runs, url);
    if (!canShareImage()) {
      window.open(whatsappLink(facts.runs, url), '_blank', 'noopener');
      return;
    }
    const status = this.$('share-status');
    try {
      const picture = await scorecardImage(facts);
      const file = new File([picture], shareFileName(facts.runs, 'card'), { type: shareFileType('card') });
      await navigator.share({ files: [file], text: caption });
    } catch (error) {
      // A cancelled sheet is the player changing their mind, not a failure.
      if (error instanceof DOMException && error.name === 'AbortError') return;
      status.textContent = 'Could not open the share sheet. Saving the picture instead.';
      status.classList.remove('hidden');
      await this.saveShare(facts, caption);
    }
  }

  /**
   * No share sheet: put the picture in the downloads folder and say so, with
   * the caption printed out so the link is still there to copy. The card
   * rather than the story frame, because the card is what the key offered.
   */
  private async saveShare(facts: CardFacts, caption: string) {
    const status = this.$('share-status');
    try {
      const picture = await scorecardImage(facts);
      const href = URL.createObjectURL(picture);
      const link = document.createElement('a');
      link.href = href; link.download = shareFileName(facts.runs, 'card');
      link.click();
      setTimeout(() => URL.revokeObjectURL(href), 10_000);
      status.textContent = `Picture saved. Post it with: ${caption}`;
    } catch {
      status.textContent = 'Could not build the picture on this browser.';
    }
    status.classList.remove('hidden');
  }

  /**
   * The meter reads full at 100 and pulses there. When the ball on its way is one
   * he can charge or sweep, it says which — the shot is worth knowing about, and
   * the timing is still the hard part.
   */
  confidence(fraction: number, primed: Primed) {
    const full = fraction >= 1;
    const meter = this.$('confidence');
    meter.setAttribute('aria-valuenow', String(Math.round(fraction * 100)));
    meter.classList.toggle('is-full', full);
    meter.classList.toggle('is-primed', !!primed);
    // The housing is shared and a player can come back here straight from a
    // Test match, so this undoes Survive rather than assuming a fresh meter:
    // without it the classic innings inherited a red, pulsing, inverted bar.
    meter.classList.remove('is-injury', 'is-hurt');
    meter.setAttribute('aria-label', 'Confidence');
    this.$('injury-cap').hidden = true;
    this.viewport.classList.remove('hurt-on');
    this.$('confidence-fill').style.width = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
    // Four special strokes now, and they are swiped for differently. Saying
    // "charge it" over a ball that wants a sweep is worse than saying nothing.
    this.$('confidence-label').textContent = primed ? CUES[primed]
      : full ? 'CONFIDENCE FULL' : 'CONFIDENCE';
  }
  /**
   * The batter's injury, in the housing the confidence meter uses in the other
   * innings — the two never appear together, and a second meter would only be a
   * second thing to read in the second a ball takes to arrive.
   *
   * At critical the whole field takes a red edge. It pulses hard for three
   * beats and then holds, which is deliberate: nothing heals in this mode, so a
   * batter can be critical for a third of an innings, and a border pulsing at
   * two hertz for ninety seconds is a headache rather than a warning. The hold
   * says the same thing and goes on saying it.
   */
  /**
   * The injury meter.
   *
   * Two things are deliberately fixed here. The label stays the single word
   * INJURY whatever state he is in — it used to become ONE MORE AND HE IS OFF,
   * which is twenty-two characters where six had been, and the meter visibly
   * grew to hold them. A gauge that changes size when the news gets bad draws
   * the eye to the movement rather than to the reading, and it shoved the
   * scoreboard beside it about mid-innings.
   *
   * And the right-hand slot carries the figure rather than a caption. A
   * percentage is the same width at every value, says more than the word
   * RETIRE HURT did, and leaves the critical state to be told the way it should
   * be told: in colour, by the meter's own pulse and the red edge on the field.
   * The overlay names it once, the first time it happens, and after that the
   * player knows.
   */
  injury(fraction: number, critical: boolean) {
    const meter = this.$('confidence');
    const percent = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
    meter.setAttribute('aria-label', 'Injury');
    meter.setAttribute('aria-valuenow', String(percent));
    meter.classList.remove('is-full', 'is-primed');
    meter.classList.add('is-injury');
    meter.classList.toggle('is-hurt', critical);
    this.$('confidence-fill').style.width = `${percent}%`;
    this.$('injury-cap').hidden = false;
    this.$('injury-cap').textContent = `${percent}%`;
    this.$('confidence-label').textContent = 'INJURY';
    this.viewport.classList.toggle('hurt-on', critical);
  }

  /**
   * The one time the mode explains the injury meter.
   *
   * Shown the first ball the batter is critical and never again on this device,
   * because it is a lesson rather than a warning: after it the meter's own
   * colour and the red edge on the field say the same thing without a panel.
   *
   * What it says is a trade rather than advice, and that is deliberate. The
   * obvious counsel — get behind it, defend — is the one thing the numbers say
   * not to do: blocking is what lets the ball through to the body, and a batter
   * who defends his way out of a critical meter retires hurt about six times
   * more often than one who keeps playing. So it names both costs and leaves
   * the choice where it belongs.
   */
  hurtNote(onClose: () => void) {
    const note = this.$('hurt-note');
    note.classList.remove('hidden');
    this.viewport.classList.add('modal-open');
    const done = () => {
      note.classList.add('hidden');
      this.viewport.classList.remove('modal-open');
      onClose();
    };
    (this.$('hurt-note-done') as HTMLButtonElement).onclick = done;
    (this.$('hurt-note-done') as HTMLButtonElement).focus();
  }
  get hurtNoteOpen() { return !this.$('hurt-note').classList.contains('hidden'); }

  /** The mode picker. Skipped entirely when a link has already named the mode. */
  modes() {
    // Whatever was over the ground goes first. The picker is a screen, and both
    // end cards sit later in the markup on the same layer — opened from one of
    // them the picker appeared *behind* it, which read as the key doing nothing.
    ['end', 'end-survive'].forEach(id => this.$(id).classList.add('hidden'));
    this.viewport.classList.remove('result-open');
    this.$('modes').classList.remove('hidden');
    this.viewport.classList.add('modal-open');
    // This screen is not a card over the ground, it replaces it — so the row of
    // hud keys goes with it. They sit above the overlay and were being drawn
    // straight across the title.
    this.viewport.classList.add('picking-mode');
    (this.$('mode-classic') as HTMLButtonElement).focus();
  }
  closeModes() {
    this.$('modes').classList.add('hidden');
    this.viewport.classList.remove('picking-mode');
    if (this.$('end').classList.contains('hidden') && this.$('end-survive').classList.contains('hidden')) {
      this.viewport.classList.remove('modal-open');
    }
  }
  get modesOpen() { return !this.$('modes').classList.contains('hidden'); }
  /**
   * Hide the way back to the picker. A link that names one mode is a link to
   * that mode, and offering to leave it is how a playtester ends up filing
   * feedback about the wrong game.
   */
  lockMode(surviveOnly = false) {
    this.$('survive-modes').classList.add('hidden');
    // Including the way out of the pause card. A link that names one mode is a
    // link to that mode wherever the player is standing when they ask.
    this.$('change-mode').classList.add('hidden');
    // A build with no board behind it should not offer a way to one. The key is
    // on the cover under two different ids depending on whether the screen got
    // the phone layout or the desktop one.
    if (surviveOnly) document.body.classList.add('survive-only');
  }

  /**
   * The match situation, which in this mode is the whole scoreboard.
   *
   * The dot-matrix board belongs to the other innings: it counts wickets that
   * cannot go past one and overs that say nothing a batter needs, and it spells
   * a running total in a typeface built for three digits at a glance rather than
   * for reading against a target. Here the only four numbers that matter are
   * where the side is, where it needs to get to, and the two ways of getting
   * there running out — so those are the four, and the board they replace is
   * hidden for the innings.
   */
  target(teamScore: number, runs: number, balls: number, wickets = 0) {
    const need = Math.max(0, SURVIVE.target - runs);
    const left = Math.max(0, SURVIVE.totalBalls - balls);
    this.$('sc-score').textContent = `${teamScore + runs}/${9 + Math.min(1, wickets)}`;
    this.$('sc-target').textContent = `${teamScore + SURVIVE.target}`;
    this.$('sc-need').textContent = `${need}`;
    this.$('sc-balls').textContent = `${left}`;
    this.$('survive-card').classList.toggle('is-close', need <= 18 || left <= 12);
  }

  /**
   * A blow, answered.
   *
   * Nothing said anything when the batter was hit until he was already critical,
   * so the meter moved in silence and the first a player knew of it was
   * the red border — by which point the information was too late to bat on. This
   * is the hit itself: the screen takes the impact, the damage flies off him,
   * and the body part is named. It lasts about half a second and then the game
   * carries on, which is the difference between feedback and an interruption.
   */
  blow(where: string) {
    const burst = this.$('hit-burst');
    this.$('hit-where').textContent = where;
    // Restarting a CSS animation needs the class off, a reflow, and the class on.
    burst.classList.remove('is-on');
    this.viewport.classList.remove('struck');
    void burst.offsetWidth;
    burst.classList.add('is-on');
    this.viewport.classList.add('struck');
    window.setTimeout(() => this.viewport.classList.remove('struck'), 520);
  }

  /**
   * How a Test match finished. The headline is the result rather than the score,
   * because in this mode the score is not the point — and a retirement names the
   * battering rather than the last blow, so that a routine defensive shot never
   * looks like the thing that killed him.
   */
  endSurvive(score: ScoreManager, health: { value: number; blows: unknown[] }, ending: Ending, teamScore: number) {
    // The ending is the rule; the result is what the card says about it. They
    // are different lists — see `resultOf`.
    const result = resultOf(ending, score.runs, score.balls);
    const said = RESULT_SAID[result];
    // The same housekeeping the other card does: last innings' offer is not
    // this one's, and the strip is silent until `offerSurviveClaim` says
    // otherwise.
    this.offer = { kind: 'silent' };
    this.onBoard = false;
    this.closeClaim();
    this.hostStrip(true);
    this.$('card-board').classList.add('hidden');
    const total = teamScore + score.runs;
    // Nine down when he walked out; only being dismissed makes it ten. Retiring
    // hurt does not cost the side a wicket, which is the whole difference
    // between the two ways of losing this.
    const down = 9 + score.wickets;
    const left = SURVIVE.totalBalls - score.balls;
    (this.$('survive-plate') as HTMLImageElement).src = resultPlates[result];
    this.$('survive-title').textContent = said.title;
    this.$('survive-message').textContent = said.line;
    this.$('survive-stamp').textContent = said.stamp;
    const runs = this.$('survive-score');
    runs.innerHTML = `${total}<span class="card-wickets">/${down}</span>`;
    runs.setAttribute('aria-label', `${total} for ${down}`);
    // The drawn card is the one that counts up rather than down. Surviving the
    // ten overs *was* the job, so it says what was seen off; every other card
    // says what was left, because that is the size of the miss.
    this.$('survive-overs').textContent = result === 'DRAWN'
      ? `${score.balls} balls survived`
      : `${left} ${left === 1 ? 'ball' : 'balls'} remaining`;
    // Cricket's star: not out unless they actually got him. It is the whole
    // point of the won card — a hundred not out from a number eleven.
    this.$('survive-runs').textContent = `${score.runs}${score.wickets ? '' : '*'}`;
    this.$('survive-blows').textContent = String(health.blows.length);
    // Stated as the bar states it, so the card does not invert the one number a
    // player just spent an innings watching. Off the meter's own full rather
    // than a literal hundred: the two have to agree, and a retirement has to
    // read as 100% however much punishment the meter is set to hold.
    const injury = Math.round((1 - Math.max(0, health.value) / HEALTH.full) * 100);
    this.$('survive-health').textContent = `${injury}%`;
    this.ballTrack('survive-track', score, SURVIVE.totalBalls);
    this.$('end-survive').className = `modal-overlay result-screen result-${result.toLowerCase()}`;
    this.viewport.classList.add('modal-open', 'result-open');
    this.viewport.classList.remove('hurt-on');
    this.$('survive-again').focus();
  }

  /**
   * The innings as a row of bars, one per ball, in the order they were bowled.
   * Lifted out of the classic card so both modes draw it the same way — the
   * balls he never faced stay on it as gaps, which is what makes a short innings
   * look short rather than merely end early.
   */
  private ballTrack(id: string, score: ScoreManager, balls: number) {
    const track = this.$(id);
    track.style.setProperty('--balls', String(balls));
    track.innerHTML = Array.from({ length: balls }, (_, i) => {
      const ball = score.history[i];
      if (!ball) return `<i class="ball-unfaced" style="--i:${i}"></i>`;
      const mark = ball.isWicket ? 'ball-out' : ball.hit ? 'ball-hit' : '';
      return `<i class="${mark}" style="--r:${Math.min(6, ball.runs)};--i:${i}"></i>`;
    }).join('');
  }

  /**
   * The quiet lines that open the questionnaire.
   *
   * Three of them — the cover, the innings-end card and the pause card — and
   * every one is a ghost link rather than a key, because none of them is ever
   * the thing the player came to that screen to do. The button row is
   * deliberately not a fourth: it is six keys already, it sits over a live ball,
   * and a form is not something to reach for mid-over.
   *
   * Once the form has been answered every one of them goes for good. A link
   * that keeps asking after it has been answered is not an invitation any more.
   */
  offerFeedback(where: { cover?: boolean; card?: boolean; pause?: boolean }) {
    const given = feedbackGiven();
    const offer = (id: string, on: boolean | undefined) => {
      const key = document.getElementById(id);
      if (key && on !== undefined) key.classList.toggle('hidden', given || !on);
    };
    offer('feedback-open', where.cover);
    offer('feedback-card', where.card);
    offer('feedback-pause', where.pause);
  }

  sound(muted: boolean) { this.$('sound').innerHTML = icon(muted ? 'muted' : 'sound'); this.$('sound').setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound'); }
  debug(data: object) { this.$('debug').classList.remove('hidden'); this.$('debug').textContent = Object.entries(data).map(([k, v]) => `${k}: ${v}`).join('\n'); }
  async share() {
    track('share-link', 'Shared the game link');
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

