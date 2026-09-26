import { GAME } from '../config/gameplay';
import { ScoreManager } from '../game/ScoreManager';
import {
  gameLink, shareFileName, shareFileType, shareText, statsFileName,
  statsStoryText, statsWhatsappLink, whatsappLink,
} from '../game/Share';
import { track, trackOnce } from '../game/analytics';
import { feedbackGiven } from '../game/feedback';
import { canShareImage, cardFacts, prepareShareAssets, scorecardImage } from '../game/ShareCard';
import type { ChallengeRow } from '../game/challenge-api';
import type { RivalryView, RoomView } from '../game/Challenge';
import { playFilm, type Film, type Playing } from './Lottie';
import type { Player } from '../game/player';
import { decodeInnings } from '../game/ball-string';
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
  keyAboutMarkup, keyBarMarkup, keyMissingPanelMarkup, keyModalMarkup, keyPanelMarkup, keyToastMarkup,
  type KeyView,
} from './CareerKey';
import {
  RESTORE_TAKEN, restoreLinkMarkup, restoreMarkup, restorePanelMarkup,
  type LocalCareer, type RestoreView,
} from './Restore';
import {
  statsExplain, statsStoryImage, type StatsFacts,
} from '../game/StatsCard';
import { AVATARS, kitDeal } from '../config/board';
import { careerSeen, markCareerSeen as rememberCareerSeen } from '../game/private-mode';
import { dotMatrix } from './DotMatrix';
import type { TutorialStep } from '../game/Tutorial';
import type { Ending, GamePhase, ShotOutcome, ShotType } from '../game/types';
import { HEALTH, SURVIVE } from '../config/survive';
import { resultOf, type Result } from '../game/Survive';
import type { SoundSetting } from '../game/Audio';
/** 1st, 2nd, 3rd, 12th. The board sheet spells them the same way. */
const ordinal = (n: number) => {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${suffix}`;
};
/** Each setting of the sound key: its picture, what it is, and what a press does. */
const SOUND_SETTINGS: Record<SoundSetting, [string, string, string]> = {
  on: ['sound', 'Sound on', 'Turn the music off'],
  effects: ['effects', 'Music off · game sounds on', 'Turn all sound off'],
  off: ['muted', 'All sound off', 'Turn sound on'],
};
const icon = (name: string) => {
  const paths: Record<string, string> = {
    sound: '<path d="m11 5-6 4H2v6h3l6 4V5Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
    muted: '<path d="m11 5-6 4H2v6h3l6 4V5Z"/><path d="m16 9 5 6m0-6-5 6"/>',
    // A note struck through: the game's music off, its sounds still on.
    effects: '<path d="M9 17V5l10-2v12"/><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="15" r="2.5"/><path d="m3 3 18 18"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3h.01"/>',
    expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    back: '<path d="M20 12H4m6-6-6 6 6 6"/>',
    share: '<path d="M12 16V3m-4 4 4-4 4 4M5 12v8h14v-8"/>',
    story: '<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M12 8v6m-3-3 3-3 3 3"/>',
    trophy: '<path d="M8 3h8v6a4 4 0 0 1-8 0V3Zm4 10v7m-4 1h8M8 5H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4"/>',
    whatsapp: '<path d="M3.5 20.5 5 16a8 8 0 1 1 3 3l-4.5 1.5Z"/><path d="M9 9c0 3 3 6 6 6 1 0 1.5-1 1.5-1L15 13l-1.5 1S12 13.5 11 12t.5-2L10 8.5S9 9 9 9Z"/>',
    /* Drawn at the same stroke as the rest, so the list's remove key belongs to
       the same set as the sound and share keys rather than being a stray glyph. */
    close: '<path d="m7 7 10 10M17 7 7 17"/>',
    /* Two bats crossed: the mark of a match against somebody. */
    versus: '<path d="m5 19 5-5m-5 0 5 5M5 5l14 14M19 5 5 19"/>',
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
/* The challenge plate ships in `public/` rather than `src/assets/`, so it is a
   bare relative path for the same reason the kits are: the browser resolves it
   against the page, which is right under a GitHub Pages subdirectory and at a
   domain root alike. A leading slash would look at the top of github.io. */
const challengePlate = 'challenge_mode.png';
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
            <button id="sound" class="hud-button" aria-label="Sound on. Turn the music off" title="Sound (M)">${icon('sound')}</button>
            <span id="sound-note" class="sound-note" role="status"></span>
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
        <div id="key-overlay" class="hidden"></div>
        <div id="restore-overlay" class="hidden"></div>
        <div id="pause-overlay" class="modal-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="pause-title"><div class="scorecard pause-card"><p class="pause-eyebrow">TAKE A BREATHER</p><h2 id="pause-title">Innings paused.</h2><p class="pause-line">The next shot can wait.</p><button id="resume" class="key-button">RESUME INNINGS</button><div class="card-shares"><button id="restart" class="story-key">RESTART</button><button id="change-mode" class="story-key">CHANGE MODE</button></div><button id="feedback-pause" class="ghost-link hidden" type="button">Tell me what you think</button><span class="start-hint keyboard-only"><kbd>Esc</kbd> to resume · <kbd>R</kbd> to restart</span></div><p class="pause-foot">Only finished innings count towards your career. Start again and this score is gone.</p></div>
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
              <p id="claim-why" class="claim-why">Registering is also how your career survives a new phone.</p>
              <form id="card-claim" class="card-claim hidden">
                <div id="claim-picker"></div>
                <label class="claim-field"><span>Name</span><input id="claim-name" name="name" type="text" maxlength="14" autocomplete="nickname" enterkeyhint="done" placeholder="Up to 14 characters" required></label>
                <p id="claim-error" class="claim-error hidden" role="alert"></p>
                <p id="claim-back" class="claim-back hidden"></p>
                <button id="claim-send" type="submit" class="key-button claim-key">PUT ME ON THE BOARD</button>
                <button id="claim-cancel" type="button" class="ghost-link">Not now</button>
              </form>
            </div>
            <button id="card-career" class="career-widget hidden" type="button">
              <span id="career-kit" class="career-kit"></span>
              <span class="career-words">Career Stats<em id="career-new" class="career-new">NEW</em></span>
              <span class="career-go" aria-hidden="true">${icon('arrow')}</span>
            </button>
            <div id="card-key" class="card-key hidden"></div>
            <div class="card-keys">
              <button id="challenge-set" class="key-button challenge-key">CHALLENGE A FRIEND<em>with this innings</em></button>
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
            <button id="mode-challenge" class="mode-hero" type="button">
              <span id="mode-challenge-flag" class="mode-flag">NEW</span>
              <span class="mode-hero-plate"><img src="${challengePlate}" alt="" decoding="async" /></span>
              <span class="mode-hero-body">
                <span class="mode-hero-name">Play 1 vs 1</span>
                <span class="mode-hero-sub">with a friend</span>
                <span class="mode-key">PLAY</span>
              </span>
            </button>
            <div class="mode-grid">
              <button id="mode-classic" class="mode-card" type="button">
                <span class="mode-plate"><img src="${blastPlate}" alt="" decoding="async" /></span>
                <span class="mode-body">
                  <span class="mode-name">The Blast</span>
                  <span class="mode-copy">5 overs. 3 wickets. Find the gaps, clear the ropes, set the record.</span>
                </span>
              </button>
              <button id="mode-survive" class="mode-card mode-survive" type="button">
                <span class="mode-plate"><img src="${survivePlate}" alt="" decoding="async" /></span>
                <span class="mode-body">
                  <span class="mode-name">Test Survival</span>
                  <span class="mode-copy">Last man standing. Survive 60 balls. Chase the target or hold out for the draw.</span>
                </span>
              </button>
            </div>
            <div id="mode-key" class="key-slot hidden"></div>
            <button id="modes-challenges" class="mode-row" type="button">
              <span class="mode-row-mark" aria-hidden="true">${icon('versus')}</span>
              <span class="mode-row-say"><b>My challenges</b><em id="modes-challenges-note">Every match you're in, and how it went</em></span>
              <span id="modes-challenges-count" class="mode-row-count hidden"></span>
              <span class="mode-row-go" aria-hidden="true">${icon('arrow')}</span>
            </button>
          </div>
        </div>
        <div id="challenge-room" class="modal-overlay room-screen hidden" role="dialog" aria-modal="true" aria-labelledby="room-title">
          <div class="room-sheet">
            <div class="mode-top room-top">
              <button id="room-back" class="mode-back" aria-label="Back" title="Back">${icon('back')}</button>
              <h2 id="room-title" class="mode-heading">Match room</h2>
              <span id="room-closes" class="room-closes"></span>
            </div>
            <div id="room-anim" class="room-anim hidden" aria-hidden="true"></div>
            <span id="room-tag" class="challenge-tag hidden"></span>
            <h3 id="room-lead" class="room-lead"></h3>
            <p id="room-sub" class="room-sub"></p>
            <ul id="room-players" class="room-players"></ul>
            <div id="room-scoreline" class="challenge-scoreline hidden"></div>
            <p id="room-note" class="room-note"></p>
            <div id="room-keys" class="room-keys"></div>
          </div>
        </div>
        <div id="challenge-share" class="modal-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="challenge-share-title">
          <div class="panel challenge-panel">
            <span class="challenge-tag">THE LINK</span>
            <h2 id="challenge-share-title">Now make someone regret opening WhatsApp.</h2>
            <p id="challenge-code" class="challenge-code" role="img"></p>
            <div class="challenge-message">
              <span class="challenge-message-label">MESSAGE</span>
              <p id="challenge-preview"></p>
            </div>
            <label id="challenge-toggle" class="challenge-toggle hidden">
              <input id="challenge-show-score" type="checkbox">
              <span>Put my score in the message</span>
            </label>
            <p id="challenge-share-note" class="challenge-note">Anyone with the link can bat &middot; closes in 7 days</p>
            <a id="challenge-whatsapp" class="whatsapp-key" href="https://wa.me/" target="_blank" rel="noopener noreferrer">${icon('whatsapp')}<span>SEND ON WHATSAPP</span></a>
            <div class="challenge-alt">
              <button id="challenge-copy" class="quiet-key" type="button">COPY LINK</button>
              <button id="challenge-more" class="quiet-key" type="button">MORE APPS</button>
            </div>
            <button id="challenge-share-done" class="ghost-link" type="button">Back to the room</button>
          </div>
        </div>
        <div id="challenge-join" class="modal-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="challenge-join-title">
          <div class="panel challenge-panel">
            <p id="challenge-from" class="challenge-from"><span id="challenge-from-kit" class="board-kit"></span><span class="challenge-from-who"><b id="challenge-from-name"></b><em id="challenge-from-closes"></em></span></p>
            <h2 id="challenge-join-title">30 balls. Beat a score you can't see.</h2>
            <p id="challenge-join-copy"></p>
            <p id="challenge-as" class="challenge-as hidden"><span id="challenge-as-kit" class="board-kit"></span><span class="challenge-as-who">Batting as <b id="challenge-as-name"></b></span><button id="challenge-rename" type="button" class="ghost-link">Not you?</button></p>
            <label id="challenge-name-field" class="claim-field hidden"><span>Your name</span><input id="challenge-name" name="challenge-name" type="text" maxlength="14" autocomplete="nickname" enterkeyhint="go" placeholder="Up to 14 characters"></label>
            <p id="challenge-join-error" class="claim-error hidden" role="alert"></p>
            <button id="challenge-bat" class="key-button" type="button">LET'S GO</button>
            <button id="challenge-solo" class="ghost-link" type="button">Bat solo instead</button>
          </div>
        </div>
        <div id="challenge-list" class="modal-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="challenge-list-title">
          <div class="panel challenge-panel">
            <div class="challenge-panel-top">
              <h2 id="challenge-list-title">My challenges</h2>
              <button id="challenge-list-done" class="board-close" type="button" aria-label="Close">${icon('close')}</button>
            </div>
            <p id="challenge-list-copy" class="challenge-note"></p>
            <div id="challenge-sections" class="challenge-sections"></div>
            <button id="challenge-list-new" class="key-button" type="button">START A NEW MATCH</button>
          </div>
        </div>
        <div id="challenge-rivalry" class="modal-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="rivalry-tally">
          <div class="panel challenge-panel">
            <p id="rivalry-who" class="challenge-from"></p>
            <h2 id="rivalry-tally"></h2>
            <p id="rivalry-sub"></p>
            <div id="rivalry-form" class="rivalry-form" aria-label="Last five"></div>
            <dl id="rivalry-facts" class="rivalry-facts"></dl>
            <button id="rivalry-again" class="key-button" type="button">CHALLENGE AGAIN</button>
            <button id="rivalry-back" class="ghost-link" type="button">Back to the list</button>
          </div>
        </div>
        <div id="challenge-offline" class="modal-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="challenge-offline-title">
          <div class="panel challenge-panel">
            <span class="challenge-tag">NO SIGNAL</span>
            <h2 id="challenge-offline-title">Can't reach the match.</h2>
            <p id="challenge-offline-copy">A match needs a connection to swap scores with your friend. A solo innings works anywhere.</p>
            <button id="challenge-offline-retry" class="key-button" type="button">TRY AGAIN</button>
            <button id="challenge-offline-solo" class="ghost-link" type="button">Bat solo instead</button>
          </div>
        </div>
        <div id="end-survive" class="modal-overlay result-screen hidden" role="dialog" aria-modal="true" aria-labelledby="survive-title">
          <div class="result-card">
            <span class="result-plate"><img id="survive-plate" src="" alt="" decoding="async" /></span>
            <div class="result-body">
              <h2 id="survive-title" class="result-headline"></h2>
              <p id="survive-message" class="result-sub"></p>
              <hr class="result-rule" />
              <div class="result-band">
                <div class="result-figures">
                  <p class="result-stamp" id="survive-stamp"></p>
                  <p class="result-score" id="survive-score" role="img"></p>
                  <p class="result-balls" id="survive-overs"></p>
                </div>
                <dl class="result-stats">
                  <div><dt>Runs</dt><dd id="survive-runs"></dd></div>
                  <div><dt>Blows taken</dt><dd id="survive-blows"></dd></div>
                  <div><dt>Injury</dt><dd id="survive-health"></dd></div>
                </dl>
              </div>
              <div id="survive-strip" class="survive-strip"></div>
              <div class="result-keys">
                <button id="survive-again" class="play-button">PLAY AGAIN</button>
                <button id="survive-modes" class="learn-button change-key">CHANGE MODE</button>
              </div>
              <span class="start-hint keyboard-only">Press <kbd>R</kbd> to bat again</span>
            </div>
          </div>
        </div>
        <div id="ghost-flash" class="ghost-flash hidden" role="status" aria-live="polite"><span id="ghost-who" class="ghost-who"></span><span id="ghost-result" class="ghost-result"></span></div>
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
    this.sheet(boardMarkup(view), 'classic', 'best', this.actions('classic', !!view.actions));
  }

  /**
   * The Test board. The same overlay and the same keys — only the rows and the
   * ladder they are ordered by differ, and those are the markup's business.
   */
  surviveBoard(view: SurviveBoardView) {
    this.sheet(surviveBoardMarkup(view), 'survive', 'best', this.actions('survive', !!view.actions));
  }

  /**
   * A career board. The same overlay, the same keys and the same rows — what
   * differs is that it is ranking a total rather than an innings, and which
   * total is the board's own business rather than this method's.
   */
  careerBoard(view: CareerBoardView & { actions?: boolean }) {
    this.sheet(
      careerBoardMarkup(view), view.mode, view.board.key,
      this.actions(view.mode, !!view.actions),
    );
  }


  /**
   * The innings-end keys, under the sheet that is standing in for the card.
   * Each mode's own, because the Test card offers the mode picker where the
   * Blast's offers the way of sending an innings out.
   *
   * Called whether or not there are keys to draw, because the two rows that
   * can ride above them do not depend on there being any. The board opened
   * from the cover carries no PLAY AGAIN — and that is exactly the board a
   * returning player opens first, so an offer that came only with the keys was
   * an offer absent from the one screen it was added for.
   */
  private actions(mode: BoardTab, keyed: boolean) {
    const keys = keyed ? (mode === 'survive' ? surviveActions() : actionsMarkup()) : '';
    // The first key rides above them in the same column. Floating it over the
    // foot of the board put it on top of these keys, which kept the focus they
    // had — so the ring of a key nobody could see showed around the widget
    // covering it, and a return press still reached it.
    // A key just minted outranks an offer to bring one back: somebody holding
    // a brand new key is plainly not the player who lost one.
    if (this.keyPending) return `${keyToastMarkup(this.keyPending)}${keys}`;
    // And the board is the other place worth asking. Somebody with no name is
    // looking at a ladder they are not on — which is exactly the screen a
    // returning player opens first to find out their record is gone.
    return `${this.offerRestoreOnBoard ? restorePanelMarkup('board-restore') : ''}${keys}`;
  }

  /**
   * Whether the board should carry the offer under its rows. The game decides:
   * it knows whether a name is claimed and whether the offer has been waved
   * away. Not counted against the innings-end cap — the board is a screen
   * somebody chose to open, not a card pushed in front of them.
   */
  offerRestoreOnBoard = false;

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
    this.sheet(statsSheetMarkup({
      ...view, careerKey: this.keyView, at: this.statsAt, where: 'sheet', offerRestore: this.offerRestore,
    }), 'mine', 'best');
    this.wireRestoreLink();
    this.wireStatsKeys();
  }

  stats(view: StatsSheetView) {
    const overlay = this.$('stats-overlay');
    // The page goes up before the picture exists and is drawn again when it
    // lands, so only the first of those may take the focus — the second would
    // pull it back off whichever key the player had already reached for.
    const opening = overlay.classList.contains('hidden');
    this.holdStats(view);
    overlay.innerHTML = statsSheetMarkup({
      ...view, careerKey: this.keyView, at: this.statsAt, where: 'page', offerRestore: this.offerRestore,
    });
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
    this.$('stats-brag').onclick = () => void this.shareStats();
    // The key card is only on the sheet where the player has one.
    const save = document.getElementById('key-save');
    // On `lost` that one key asks for a new one instead of saving a key this
    // browser does not hold — the card says so in the same breath, so the key
    // under it has to mean what the card just said.
    if (save) save.onclick = () => (this.keyView?.state === 'lost' ? this.onNewKey?.() : this.openKeySheet(false, 'stats'));
    const about = document.getElementById('key-info');
    if (about) about.onclick = () => this.openKeySheet(true);
    const fresh = document.getElementById('key-new');
    if (fresh) fresh.onclick = () => this.onNewKey?.();
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
    // Once per label per session. Counted per tap, one player prodding the same
    // figure six times would read as six players not understanding it; what is
    // worth knowing is how many sessions reached for an explanation at all, and
    // which figure they reached for. A label everybody taps is a label that is
    // not doing its job.
    trackOnce(`stats-tap-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
      `Asked what ${label} counts`);
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
      // The rail was built so the card behind peeks past the edge, on the
      // argument that a player who can see there is something there will go and
      // look. That is a claim about behaviour and this is the only thing that
      // can say whether it was true.
      trackOnce('stats-swipe', 'Swiped to the other card');
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
    // Which card they were standing on when they left. Opening was already
    // counted and answers nothing on its own: three cards read to the end and
    // three cards abandoned on the first look identical from the other side,
    // and they mean opposite things about whether the update introduced itself.
    // `is-last` rather than a number, because the count will change and a
    // dashboard comparing "left on 3" across two updates would be comparing
    // the middle of one with the end of the other.
    track(this.storyAt >= STORIES.length - 1 ? 'whatsnew-read-all' : `whatsnew-left-${this.storyAt + 1}`,
      'How far the What\u2019s new stories were read');
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
  /**
   * One key, one picture, and the phone's own sheet to choose where it goes.
   *
   * It was two — one wearing WhatsApp's mark and one Instagram's — which named
   * two destinations out of the dozen the share sheet offers and made the card
   * look like it belonged to them. The sheet is already the chooser; a screen
   * that chooses first is a screen doing the sheet's job worse.
   *
   * The tall picture rather than the square one, because one asset has to work
   * in both places: nine by sixteen posts as a story untouched and still reads
   * in a chat, where a square card posted as a story is a square card with grey
   * above and below it.
   */
  private async shareStats() {
    const facts = this.statsShown;
    if (!facts) return;
    track('stats-brag', 'Bragged about the career card');
    const url = gameLink();
    const lead = facts.hero[0] ?? { label: 'runs', value: 0 };
    const caption = statsStoryText(lead, facts.innings, url);
    const status = this.$('stats-status');
    if (!canShareImage()) {
      // No file can leave this browser, so the picture cannot go anywhere the
      // player chooses. WhatsApp's own link still carries the words and the
      // address, which is more use than a file in a downloads folder.
      window.open(statsWhatsappLink(lead, facts.innings, url), '_blank', 'noopener');
      return;
    }
    try {
      const picture = await statsStoryImage(facts, url);
      const file = new File([picture], statsFileName('story'), { type: 'image/jpeg' });
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
    const keySave = document.getElementById('key-toast-save');
    if (keySave) keySave.onclick = () => this.openKeySheet(false, 'toast');
    const keyShut = document.getElementById('key-toast-close');
    if (keyShut) keyShut.onclick = () => this.keyToast(null);
    const backGo = document.getElementById('board-restore-go');
    if (backGo) backGo.onclick = () => this.onRestoreOpen?.('board');
    const backShut = document.getElementById('board-restore-close');
    if (backShut) {
      backShut.onclick = () => {
        document.getElementById('board-restore-go')?.closest('.restore-panel')?.remove();
        this.onRestoreDismiss?.();
      };
    }
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
    // The first key is laid over the board and belongs to it. Left behind it
    // would stand on the cover with nothing underneath it to explain it.
    this.keyToast(null);
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
    // Said where the key is asking, and nowhere else. One class on the strip
    // rather than a toggle at each of the three places the form opens and
    // closes: the footnote then cannot fall out of step with the key it is
    // under, because the same state draws both.
    this.$('card-board').classList.toggle('is-asking', offer.kind === 'claim');
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
    // The career widget goes with it. It is the same one thing — a way to your
    // own figures from the card you have just finished on — and both modes want
    // it in the same place, under the board and above the keys. Moved rather
    // than duplicated, for the reason the strip is moved: the ids travel, so
    // everything that reaches for `card-career` goes on working without knowing
    // which card it is standing in. The career key rides along for the same
    // reason — it was left behind on the Blast card at first, so a Test innings
    // ended on a card with no key on it and nothing said why.
    const moving = [this.$('card-board'), this.$('card-career'), this.$('card-key')];
    if (surviving) this.$('survive-strip').append(...moving);
    else {
      const card = this.$('end').querySelector('.scorecard')!;
      const keys = this.$('end').querySelector('.card-keys');
      for (const one of moving) card.insertBefore(one, keys);
    }
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
    this.$('claim-back').classList.add('hidden');
    this.$('claim-back').innerHTML = '';
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

  /**
   * The store turned it down, and the player can do something about it.
   *
   * One refusal is not like the others. A name already held is the only moment
   * in this game where a player who has lost their record gives us evidence of
   * it: they typed the name they have always batted under, and it is taken,
   * and the person holding it is almost always them. So that one comes with a
   * way back rather than a wall — with the name they typed carried over, since
   * retyping it ten seconds later would read as the screen not listening.
   */
  claimFailed(reason: string, taken = false) {
    this.claimSending(false);
    this.$('claim-error').textContent = reason;
    this.$('claim-error').classList.remove('hidden');
    const back = this.$('claim-back');
    back.classList.toggle('hidden', !taken);
    back.innerHTML = taken ? restoreLinkMarkup('claim-restore', RESTORE_TAKEN) : '';
    if (taken) this.$('claim-restore').onclick = () => this.openRestore(this.claimEntry.name);
  }

  /**
   * The screen that takes a key back, wherever it was opened from.
   *
   * Held open while the store is asked rather than closed on submit: a wrong
   * key is the likely outcome the first time somebody reads their own
   * handwriting, and a screen that shuts on every try makes the second try a
   * journey instead of a correction.
   */
  openRestore(name = '', local: LocalCareer | null = null) {
    this.restoreView = { name, local, sending: false, error: null };
    this.drawRestore();
  }

  /** What the player is offering. */
  get restoreEntry() {
    return {
      name: (this.$('restore-name') as HTMLInputElement).value,
      key: (this.$('restore-key') as HTMLInputElement).value,
    };
  }

  /** The form, while the store is thinking about it. */
  restoreSending(sending: boolean) {
    if (!this.restoreView) return;
    this.restoreView = { ...this.restoreView, sending, error: sending ? null : this.restoreView.error };
    this.drawRestore();
  }

  /** Turned down, and the key field left holding what they typed to correct it. */
  restoreFailed(reason: string) {
    if (!this.restoreView) return;
    this.restoreView = { ...this.restoreView, sending: false, error: reason };
    this.drawRestore();
  }

  closeRestore() {
    this.restoreView = null;
    this.$('restore-overlay').classList.add('hidden');
    this.$('restore-overlay').innerHTML = '';
    const stacked = ['board-overlay', 'stats-overlay', 'end', 'end-survive', 'modes', 'pause-overlay']
      .some(id => !this.$(id).classList.contains('hidden'));
    this.viewport.classList.toggle('modal-open', stacked);
  }

  get restoreOpen() { return !this.$('restore-overlay').classList.contains('hidden'); }

  /** What the game does with a name and a key. The store is the game's. */
  onRestore: ((entry: { name: string; key: string }) => void) | null = null;

  /**
   * Asking for a key to replace the one this browser does not have.
   *
   * The only way out of `lost`. A key is shown once and kept nowhere but a
   * salted hash, so the one that was issued cannot be produced again by
   * anybody — a new one is the only thing that can be offered, and making it
   * is what stops the old one working.
   */
  onNewKey: (() => void) | null = null;

  /**
   * It worked, said on the screen the player was already on.
   *
   * A toast rather than a screen of its own: what they wanted was their record,
   * and the record is behind this — so the right thing to do is get out of the
   * way and let them see it, not stand in front of it with good news.
   */
  restoreDone(name: string) {
    this.restoreView = { done: { name } };
    this.drawRestore();
  }

  private restoreView: RestoreView | null = null;

  /**
   * Whether the game wants the way back offered where it fits.
   *
   * Asked rather than remembered, for the reason `keyNow` is asked: the answer
   * changes underneath this screen. Somebody claims a name; somebody brings a
   * record back. Held as a field it was set true once at startup and stayed
   * true — so the offer went on standing at the foot of My Stats for a player
   * who had just used it, and for every registered player who never needed it.
   */
  restoreNow: (() => boolean) | null = null;
  private get offerRestore() { return this.restoreNow?.() ?? false; }

  /**
   * Takes the board's offer off the screen it is already standing on.
   *
   * The flag beside it decides whether one is *drawn*, and the board is only
   * drawn when it is opened — so a record brought back from the board itself
   * left the offer sitting under it, asking a player who had just answered it.
   * The node is removed the same way its own cross removes it.
   */
  dropBoardRestore() {
    document.getElementById('board-restore-go')?.closest('.restore-panel')?.remove();
  }

  /** The link on an empty card, which is drawn with the card and so rewired with it. */
  private wireRestoreLink() {
    const link = document.getElementById('stats-restore');
    if (link) link.onclick = () => this.onRestoreOpen?.('stats');
  }

  /** Where the offer was taken up, so the game can say which door was used. */
  onRestoreOpen: ((from: string) => void) | null = null;

  /**
   * Drawn whole every time, so the three states it has — asking, checking,
   * refused — cannot drift apart. What that costs is the caret: the fields are
   * written back from what was in them, and focus is put where the player was.
   */
  private drawRestore() {
    const overlay = this.$('restore-overlay');
    if (!this.restoreView) return this.closeRestore();
    const held = this.restoreOpen && document.getElementById('restore-name')
      ? { name: (this.$('restore-name') as HTMLInputElement).value,
        key: (this.$('restore-key') as HTMLInputElement).value }
      : null;
    overlay.innerHTML = restoreMarkup(this.restoreView);
    overlay.classList.remove('hidden');
    this.viewport.classList.add('modal-open');
    const scrim = overlay.firstElementChild as HTMLElement | null;
    if (scrim) scrim.onclick = event => { if (event.target === scrim) this.closeRestore(); };
    if (this.restoreView.done) {
      const away = this.$('restore-done');
      away.onclick = () => this.closeRestore();
      away.focus();
      return;
    }
    const name = this.$('restore-name') as HTMLInputElement;
    const key = this.$('restore-key') as HTMLInputElement;
    if (held) { name.value = held.name; key.value = held.key; }
    this.$('restore-close').onclick = () => this.closeRestore();
    (this.$('restore-form') as HTMLFormElement).onsubmit = event => {
      event.preventDefault();
      if (this.restoreView?.sending) return;
      this.onRestore?.(this.restoreEntry);
    };
    if (this.restoreView.sending) return;
    // Back to whichever field still needs something: the name where it is
    // empty, the key otherwise — which is also where a refused try belongs.
    (name.value ? key : name).focus();
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

  /**
   * The career key, wherever it is being shown.
   *
   * One object drives four placements and the modal, because they are one
   * message: a key copied from the card on the innings screen has to retire
   * the line on the mode picker too, and a player asked twice concludes the
   * first answer did not take.
   */
  /**
   * What the player's key is, asked for rather than remembered.
   *
   * It was a field, written only where a key was drawn — the picker and the
   * end of an innings. Everywhere else read whatever those had last left
   * behind, so a player who registered and went straight to the board found
   * the field still holding the null from before they had a name, and My
   * Stats left the card out. A key is a fact about storage that four screens
   * ask about at four different moments; the only version that cannot go
   * stale is the one read when the question is asked.
   */
  keyNow: (() => KeyView | null) | null = null;

  private get keyView(): KeyView | null { return this.keyNow?.() ?? null; }
  /** What the modal's two keys do. The game owns the saving. */
  /**
   * What a save key does. Answering `false` means nothing was saved — the
   * clipboard refused, or the browser blocked the window — and the sheet stays
   * up saying so, because a sheet that closes on a save that did not happen is
   * the lie this whole widget exists to avoid.
   */
  onKeySave: ((how: 'whatsapp' | 'copy' | 'image') => Promise<boolean> | boolean) | null = null;

  careerKey(view: KeyView | null, where: { panel: boolean; bar: boolean }) {
    const panel = this.$('card-key');
    const bar = this.$('mode-key');
    const show = !!view && view.state !== 'lost';
    // One slot, three occupants, never two at once. A key for whoever holds
    // one; the way to make one for whoever holds a name without one; and the
    // way back for whoever holds neither. They are decided by the same two
    // facts and cannot overlap, so the player sees one object on that strip of
    // card that changes what it says, rather than three arguing over the room.
    //
    // The middle one was missing, and the hole it left was the whole board:
    // every name claimed before keys existed has none, so every one of those
    // players finished an innings and was shown nothing.
    const missing = !!view && view.state === 'lost' && where.panel;
    const offering = !show && !missing && where.panel && this.offerRestorePanel;
    panel.classList.toggle('hidden', !((show && where.panel) || missing || offering));
    bar.classList.toggle('hidden', !(show && where.bar));
    if (show && where.panel) {
      panel.innerHTML = keyPanelMarkup(view!);
      this.$('key-panel-save').onclick = () => this.openKeySheet(false, 'card');
    } else if (missing) {
      panel.innerHTML = keyMissingPanelMarkup();
      this.$('key-missing-go').onclick = () => this.onNewKey?.();
      trackOnce('key-missing-card', 'Offered a key at the end of an innings');
    } else if (offering) {
      panel.innerHTML = restorePanelMarkup('restore-panel');
      this.$('restore-panel-go').onclick = () => this.onRestoreOpen?.('card');
      this.$('restore-panel-close').onclick = () => {
        panel.classList.add('hidden');
        panel.innerHTML = '';
        this.onRestoreDismiss?.();
      };
      this.onRestoreShown?.();
    }
    if (show && where.bar) {
      bar.innerHTML = keyBarMarkup();
      this.$('key-bar').onclick = () => this.openKeySheet(false, 'bar');
    }
    // Emptied rather than only hidden. These nodes are shared between the two
    // end cards and moved between them, so a slot left holding what it held
    // last time is a widget waiting to reappear on a screen that never asked
    // for it — which is exactly how the key ended up on the Blast card.
    if (!((show && where.panel) || missing || offering)) panel.innerHTML = '';
    if (!(show && where.bar)) bar.innerHTML = '';
  }

  /**
   * Whether the end card's one slot is carrying anything at the moment.
   *
   * Asked before that slot is redrawn from outside the end card, because
   * drawing the offer into it is what counts a showing against its cap — so a
   * redraw aimed at a screen the player is not looking at would spend one of
   * the two times they will ever be asked.
   */
  get keyPanelShowing() { return !this.$('card-key').classList.contains('hidden'); }

  /**
   * Whether the end of an innings should carry the offer instead of a key.
   * The game decides — it knows whether a name is claimed, and it is the game
   * that remembers how often this has been asked.
   */
  offerRestorePanel = false;

  /** Counted where it is drawn, so a card that never appeared is never counted. */
  onRestoreShown: (() => void) | null = null;

  /** Taken away by hand, which is for good. */
  onRestoreDismiss: (() => void) | null = null;

  /** The only place a key is saved, whichever of the four opened it. */
  openKeySheet(about = false, where: 'card' | 'stats' | 'bar' | 'toast' = 'card') {
    if (!this.keyView) return;
    // Where the sheet was reached from, and that it was reached at all. This is
    // the denominator every save figure needs: "how many copied" answers
    // nothing without "how many were standing in front of the offer".
    trackOnce(about ? 'key-about' : `key-sheet-${where}`,
      about ? 'Asked what a career key is' : `Save sheet opened from the ${where}`);
    this.keySheetKind = about ? 'about' : 'save';
    this.keySheetSaved = false;
    const overlay = this.$('key-overlay');
    overlay.innerHTML = about ? keyAboutMarkup() : keyModalMarkup(this.keyView);
    overlay.classList.remove('hidden');
    this.viewport.classList.add('modal-open');
    const shut = () => this.closeKeySheet();
    this.$(about ? 'key-about-close' : 'key-modal-close').onclick = shut;
    // The ground around the sheet closes it, which is what every other modal
    // on this game does and what a thumb reaches for first. Only the ground:
    // the test is that the press landed on the scrim itself rather than
    // bubbled up from something inside the sheet.
    const scrim = overlay.firstElementChild as HTMLElement | null;
    if (scrim) scrim.onclick = event => { if (event.target === scrim) shut(); };
    if (about) return;
    // The picture is the screenshot made pressable, so it stands where the
    // screenshot is recommended rather than among the two that send the key
    // somewhere. It takes a moment to paint and a moment more for the phone to
    // offer somewhere to put it, so the key says what it is doing.
    this.$('key-image').onclick = async () => {
      const key = this.$('key-image') as HTMLButtonElement;
      if (key.disabled) return;
      const was = key.textContent;
      key.disabled = true;
      key.textContent = 'SAVING…';
      const done = await this.onKeySave?.('image');
      if (done !== false) this.keySheetSaved = true;
      key.disabled = false;
      key.textContent = was;
      if (done === false) {
        this.keyTrouble('Could not save the picture. Screenshot this screen instead.');
      }
    };
    this.$('key-whatsapp').onclick = async () => {
      const done = await this.onKeySave?.('whatsapp');
      if (done !== false) this.keySheetSaved = true;
      if (done === false) {
        return this.keyTrouble('Could not open WhatsApp. Screenshot this screen, or copy it instead.');
      }
      // WhatsApp is about to take the screen anyway, so there is nothing for
      // this sheet to stay open for.
      shut();
    };
    this.$('key-copy').onclick = async () => {
      const key = this.$('key-copy');
      const done = await this.onKeySave?.('copy');
      if (done !== false) this.keySheetSaved = true;
      if (done === false) {
        return this.keyTrouble('Could not copy. Screenshot this screen instead \u2014 the key is above.');
      }
      // Said on the key that was pressed, and the sheet left standing. A copy
      // is invisible: nothing moves, no app opens, and a sheet that simply
      // closed was the only answer somebody got — indistinguishable from a key
      // that did nothing, which is what the last one actually was. Standing
      // also leaves the screen up for the screenshot recommended above it.
      key.textContent = 'COPIED';
      key.classList.add('is-done');
      window.clearTimeout(this.copySaid);
      this.copySaid = window.setTimeout(() => {
        key.textContent = 'COPY';
        key.classList.remove('is-done');
      }, 2200);
    };
  }

  /** How long the copy key has left to say so. */
  private copySaid = 0;

  /** Which sheet is up, and whether it has done anything for the player yet. */
  private keySheetKind: 'save' | 'about' | null = null;
  private keySheetSaved = false;

  /** Said inside the sheet, because the sheet is what is on the screen. */
  private keyTrouble(says: string) {
    const line = document.getElementById('key-trouble');
    if (!line) return;
    line.textContent = says;
    line.classList.remove('hidden');
  }

  closeKeySheet() {
    // Left without saving anything through the game.
    //
    // As close as a browser gets to counting screenshots, which it cannot do at
    // all: no platform tells a page one was taken. So this counts the people a
    // screenshot would be hiding in — everybody who read the sheet, was told
    // to screenshot it, and closed it without pressing a key. Some of them took
    // the picture and some of them walked away, and the two cannot be told
    // apart from here. Read beside the three save figures it is still the
    // number worth having: if it dwarfs them, the sheet is being obeyed or
    // ignored, and which of those it is wants asking a player rather than a
    // counter.
    if (this.keySheetKind === 'save' && !this.keySheetSaved) {
      track('key-sheet-left', 'Left the save sheet without saving through the game');
    }
    this.keySheetKind = null;
    window.clearTimeout(this.copySaid);
    this.$('key-overlay').classList.add('hidden');
    this.$('key-overlay').innerHTML = '';
    const stacked = ['board-overlay', 'stats-overlay', 'end', 'end-survive', 'modes', 'pause-overlay']
      .some(id => !this.$(id).classList.contains('hidden'));
    this.viewport.classList.toggle('modal-open', stacked);
  }

  get keySheetOpen() { return !this.$('key-overlay').classList.contains('hidden'); }

  /**
   * The first key, the moment a name is claimed. Closed by hand, never a clock.
   *
   * Set before the board is drawn: it is a row of the board's own column, so
   * the sheet that follows carries it. Taken off by hand rather than by drawing
   * the sheet again, because the sheet is drawn whole — redrawing it to remove
   * one row would put the ladder strip and the scroll back where they started.
   */
  keyToast(view: KeyView | null) {
    this.keyPending = view;
    if (!view) this.viewport.querySelector('.board-stack .key-toast')?.remove();
  }

  private keyPending: KeyView | null = null;

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
    (this.$('mode-challenge') as HTMLButtonElement).focus();
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
   * Takes the Test card off the picker while that mode is behind its flag.
   *
   * Hidden rather than removed, and the picker still opens: challenging a
   * friend is the second thing to choose between now, so the screen has a job
   * whether or not the Test match is on offer.
   */
  hideSurviveCard() { this.$('mode-survive').classList.add('hidden'); }

  /**
   * The end card the picker was opened from, put back the way it was.
   *
   * `modes` takes both cards off the screen, because the picker is a screen
   * rather than something that stands over one. That is right on the way in
   * and has to be undone on the way out: backing out of the picker with the
   * card still hidden leaves the ground on its own, with the final score on it
   * and every key dead, because the innings is over and nothing is listening.
   */
  showResult(surviving: boolean) {
    this.$(surviving ? 'end-survive' : 'end').classList.remove('hidden');
    this.viewport.classList.add('modal-open', 'result-open');
    this.$(surviving ? 'survive-again' : 'again').focus();
  }
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
    this.$('end-survive').className = `modal-overlay result-screen result-${result.toLowerCase()}`;
    this.viewport.classList.add('modal-open', 'result-open');
    this.viewport.classList.remove('hurt-on');
    this.$('survive-again').focus();
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

  /* ── The match room ────────────────────────────────────────────────── */

  /** What the room's keys do. The game decides; this only says which was pressed. */
  onRoomAct: ((act: RoomAct) => void) | null = null;
  /** What a row of the list does: opens its room, opens the rivalry, or goes. */
  onListAct: ((act: 'open' | 'rival' | 'drop', code: string, playerId?: string) => void) | null = null;
  private film: Playing | null = null;

  /**
   * The match room, as one person sees it.
   *
   * One screen for the lobby, the live scores and the result, because it is one
   * link: the same room opened on Tuesday and on Thursday is the same place
   * with more in it. What changes is the line at the top, which rows have a
   * score on them, and which keys stand at the foot. The rows are drawn from
   * the room and nothing else, so a poll that finds a new ball redraws the
   * screen and the screen is right.
   */
  room(view: RoomView, extra: { interstitial?: { index: number; total: number }; sent?: boolean; card?: boolean } = {}) {
    // The sheets over the room go; the room itself stays where it is, so a
    // redraw from a poll never blinks it off under a thumb.
    this.shutSheets();
    this.$('intro').classList.add('hidden');
    const said = roomCopy(view, extra);
    this.$('room-title').textContent = said.title;
    this.$('room-closes').textContent = view.closes;
    const tag = this.$('room-tag');
    tag.textContent = said.tag ?? '';
    tag.classList.toggle('hidden', !said.tag);
    this.$('room-lead').textContent = said.lead;
    this.$('room-sub').textContent = said.sub;
    const note = this.$('room-note');
    note.textContent = said.note ?? '';
    note.classList.toggle('hidden', !said.note);

    // Everything below is written only when it has changed. A poll every two
    // seconds that rewrote the rows would replay their entrance every two
    // seconds, restart the film, and pull the keys out from under a press.
    const drawn = this.roomDrawn;
    const scoreline = this.$('room-scoreline');
    const players = this.$('room-players');
    if (view.result) {
      const html = view.result.players.map(row => scoreline_(row, view.result!.you)).join('');
      if (drawn.scoreline !== html) { scoreline.innerHTML = html; drawn.scoreline = html; }
      scoreline.classList.remove('hidden');
      players.classList.add('hidden');
    } else {
      const html = view.players.map(row => roomRow(row, view)).join('')
        + (view.players.length < 2 && (view.kind === 'lobby' || view.kind === 'waiting')
          ? `<li class="room-player is-empty"><span id="room-wait" class="room-wait" aria-hidden="true"></span><span class="room-who"><b>${view.kind === 'waiting' ? 'Nobody has opened the link yet' : 'Waiting for a friend to join\u2026'}</b><small>Send it on. They can bat now or later.</small></span></li>`
          : '');
      if (drawn.players !== html) { players.innerHTML = html; drawn.players = html; drawn.film = ''; }
      players.classList.remove('hidden');
      scoreline.classList.add('hidden');
    }

    // The film. A result gets its own; a lobby with nobody in it gets the ball
    // bouncing where the second row will be; anything else gets nothing.
    const anim = this.$('room-anim');
    const which: Film | '' = view.result
      ? (view.result.outcome === 'W' ? 'win' : view.result.outcome === 'D' ? 'draw' : 'lose')
      : this.viewport.querySelector('#room-wait') ? 'waiting' : '';
    if (drawn.film !== which) {
      this.film?.destroy();
      this.film = null;
      anim.className = 'room-anim hidden';
      if (which === 'waiting') {
        const wait = this.viewport.querySelector<HTMLElement>('#room-wait');
        if (wait) this.film = playFilm(wait, 'waiting', { loop: true });
      } else if (which) {
        anim.classList.remove('hidden');
        anim.classList.add(`is-${which}`);
        this.film = playFilm(anim, which);
      }
      drawn.film = which;
    }

    const keys = said.keys.map(roomKey).join('');
    if (drawn.keys !== keys) {
      this.$('room-keys').innerHTML = keys;
      drawn.keys = keys;
    }
    this.viewport.classList.toggle('result-room', !!view.result);
    this.viewport.classList.add('modal-open', 'picking-mode');
    const wasOpen = this.roomOpen;
    this.$('challenge-room').classList.remove('hidden');
    if (!wasOpen) this.viewport.querySelector<HTMLElement>('#room-keys .key-button, #room-keys .whatsapp-key')?.focus();
  }
  private roomDrawn = { players: '', scoreline: '', keys: '', film: '' as Film | '' };

  /** A room that could not be reached, with the two ways on. */
  offline(reason: string | null = null) {
    this.shut();
    this.$('intro').classList.add('hidden');
    this.$('challenge-offline-copy').textContent = reason
      ?? 'A match needs a connection to swap scores with your friend. A solo innings works anywhere.';
    this.open('challenge-offline');
    this.$('challenge-offline-retry').focus();
  }

  closeRoom() {
    this.film?.destroy();
    this.film = null;
    this.roomDrawn = { players: '', scoreline: '', keys: '', film: '' };
    this.$('challenge-room').classList.add('hidden');
    this.viewport.classList.remove('result-room');
    const held = ['end', 'end-survive', 'modes'].some(id => !this.$(id).classList.contains('hidden'));
    if (!held) this.viewport.classList.remove('modal-open', 'picking-mode');
  }

  get roomOpen() { return !this.$('challenge-room').classList.contains('hidden'); }

  /**
   * The link, ready to go.
   *
   * The message is shown as it will land, because the hook is the whole job of
   * this screen and nobody should have to send it to find out what it says. The
   * score toggle only appears once there is a score, and starts off: the number
   * is the one thing the mode hides for five overs, so putting it in a
   * notification has to be a decision rather than a default.
   */
  inviteSheet(code: string, message: (withScore: boolean) => { text: string; whatsapp: string }, hasScore: boolean, closes: string) {
    this.shut();
    this.$('challenge-code').innerHTML = [...code].map(char => `<span>${char}</span>`).join('');
    this.$('challenge-code').setAttribute('aria-label', `Match code ${[...code].join(' ')}`);
    const toggle = this.$('challenge-show-score') as HTMLInputElement;
    this.$('challenge-toggle').classList.toggle('hidden', !hasScore);
    toggle.checked = false;
    const draw = () => {
      const { text, whatsapp } = message(toggle.checked);
      this.$('challenge-preview').textContent = text;
      (this.$('challenge-whatsapp') as HTMLAnchorElement).href = whatsapp;
    };
    toggle.onchange = draw;
    draw();
    this.$('challenge-share-note').textContent = `Anyone with the link can bat · ${closes}`;
    this.open('challenge-share');
    this.$('challenge-whatsapp').focus();
  }

  /**
   * The screen a link lands on.
   *
   * A first-timer meets this and nothing else — no cover, no picker, no
   * tutorial. They tapped something that said "play cricket with me", and every
   * screen between them and a bat is a screen that loses some of them.
   */
  challengeFrom(from: ChallengeRow | null, closes: string, player: Player | null, batted: boolean) {
    this.shut();
    // The cover goes, and stays gone. Somebody arriving on a link was told they
    // were about to play cricket with a friend; a title screen and a Top 50 key
    // behind the panel are two things they did not ask for and one of them is a
    // way out of the thing they came for.
    this.$('intro').classList.add('hidden');
    const who = this.$('challenge-from');
    who.classList.toggle('hidden', !from);
    if (from) {
      this.$('challenge-from-kit').outerHTML = kitMarkup(from.avatar, from.name).replace('board-kit', 'board-kit" id="challenge-from-kit');
      this.$('challenge-from-name').textContent = `${from.name} challenged you`;
      this.$('challenge-from-closes').textContent = closes;
    }
    this.$('challenge-join-title').textContent = batted
      ? "30 balls. Beat a score you can't see."
      : '30 balls each. Winner takes the bragging rights.';
    this.$('challenge-join-copy').textContent = batted
      ? `${from?.name ?? 'Your friend'} has batted. You'll see what they did ball by ball — and their score on your last one.`
      : `Bat now or bat later. Whoever bats first is the one to beat, and the other sees it land ball by ball.`;
    this.$('challenge-bat').textContent = "LET'S GO";
    this.$('challenge-solo').classList.remove('hidden');
    this.identify(player);
  }

  /**
   * The same panel, asking the one question a match needs from somebody who
   * has never given a name. It is only ever reached that way: a player the game
   * already knows is never asked twice.
   */
  challengeWhoAreYou(player: Player | null) {
    this.shut();
    this.$('intro').classList.add('hidden');
    this.$('challenge-from').classList.add('hidden');
    this.$('challenge-join-title').textContent = 'Who should they be scared of?';
    this.$('challenge-join-copy').textContent = 'Your friend sees this name on the match. No sign-up, no password.';
    this.$('challenge-bat').textContent = 'OPEN THE ROOM';
    this.$('challenge-solo').classList.add('hidden');
    this.identify(player);
  }

  /**
   * Who this browser bats as, on either mode of the panel.
   *
   * A player the game already knows is shown rather than asked: the name and kit
   * are the ones their id carries, and being made to type a name they have
   * already given is the difference between a game and a form. `Not you?` is
   * there for the shared phone, and is the only way the field appears.
   */
  private identify(player: Player | null) {
    const field = this.$('challenge-name') as HTMLInputElement;
    const wrap = this.$('challenge-name-field');
    const known = this.$('challenge-as');
    field.value = player?.name ?? '';
    this.$('challenge-join-error').classList.add('hidden');
    if (player) {
      this.$('challenge-as-kit').outerHTML = kitMarkup(player.avatar, player.name).replace('board-kit', 'board-kit" id="challenge-as-kit');
      this.$('challenge-as-name').textContent = player.name;
      known.classList.remove('hidden');
      wrap.classList.add('hidden');
    } else {
      known.classList.add('hidden');
      wrap.classList.remove('hidden');
    }
    this.open('challenge-join');
    (player ? this.$('challenge-bat') : field).focus();
  }

  /** The way to a different name, for the phone that gets handed round. */
  challengeRename() {
    this.$('challenge-as').classList.add('hidden');
    this.$('challenge-name-field').classList.remove('hidden');
    const field = this.$('challenge-name') as HTMLInputElement;
    field.focus();
    field.select();
  }

  /** What the joiner typed, for the caller to take or refuse. */
  get challengeName() { return (this.$('challenge-name') as HTMLInputElement).value; }

  challengeJoinError(reason: string | null) {
    const line = this.$('challenge-join-error');
    line.textContent = reason ?? '';
    line.classList.toggle('hidden', !reason);
  }

  /**
   * One ball of the other innings, flashed between deliveries.
   *
   * Never during one: the ball is in the air for the best part of a second and a
   * number moving beside it is a number that costs somebody their wicket. The
   * caller owns the timing; this only puts it up and takes it down.
   */
  ghost(who: string, avatar: number, result: string, kind: 'runs' | 'out' | 'big') {
    const flash = this.$('ghost-flash');
    this.$('ghost-who').innerHTML = `${kitMarkup(avatar, who)}<span>${escapeName(who)}</span>`;
    this.$('ghost-result').textContent = result;
    flash.classList.toggle('is-out', kind === 'out');
    flash.classList.toggle('is-big', kind === 'big');
    flash.classList.remove('hidden');
    // Two frames, so the browser has laid the element out before the class that
    // animates it arrives — otherwise it appears already finished.
    requestAnimationFrame(() => requestAnimationFrame(() => flash.classList.add('is-up')));
  }

  ghostAway() {
    const flash = this.$('ghost-flash');
    flash.classList.remove('is-up');
    setTimeout(() => flash.classList.add('hidden'), 240);
  }

  /**
   * Every match this person is in, in the order it needs them.
   *
   * Sections rather than tabs: the whole list fits on a screen, and what
   * somebody wants to know is "is anything waiting on me", which a section
   * heading answers before a row is read. A row goes at its owner's say-so;
   * that tidies the list, and the room is still there for everyone else in it.
   */
  challengeList(sections: ListSections) {
    this.shut();
    this.$('intro').classList.add('hidden');
    const total = sections.yourMove.length + sections.waitingOnThem.length + sections.done.length;
    this.$('challenge-list-copy').textContent = total
      ? 'Tap a match to open it. Tap a name for the head-to-head.'
      : '';
    const section = (title: string, rows: ListRowView[]) => rows.length
      ? `<h3 class="challenge-section-head">${title} <em>${rows.length}</em></h3><ul class="challenge-rows">${rows.map(listRow).join('')}</ul>`
      : '';
    this.$('challenge-sections').innerHTML = total
      ? section('Your move', sections.yourMove) + section('Waiting on them', sections.waitingOnThem) + section('Done', sections.done)
      : `<ul class="challenge-rows"><li class="challenge-row is-empty">Nothing here yet. Open a match and send the link to someone who thinks they can bat.</li></ul>`;
    this.open('challenge-list');
    this.$('challenge-list-done').focus();
  }

  /** The head-to-head against one person. */
  rivalry(view: RivalryView) {
    this.shut();
    this.$('rivalry-who').innerHTML = `${kitMarkup(view.them.avatar, view.them.name)}<span class="challenge-from-who"><b>You vs ${escapeName(view.them.name)}</b><em>${view.wins + view.losses + view.draws} match${view.wins + view.losses + view.draws === 1 ? '' : 'es'}${view.draws ? ` · ${view.draws} drawn` : ''}</em></span>`;
    this.$('rivalry-tally').textContent = `${view.wins} – ${view.losses}`;
    this.$('rivalry-sub').textContent = view.wins === view.losses
      ? 'All square. Somebody has to blink.'
      : view.wins > view.losses ? `${view.tally}. Keep it that way.` : `${view.tally}. Time to do something about it.`;
    this.$('rivalry-form').innerHTML = view.form.length
      ? `<span class="rivalry-form-label">Last ${view.form.length}</span>${view.form.map(one => `<i class="is-${one}">${one}</i>`).join('')}`
      : '';
    this.$('rivalry-facts').innerHTML = [
      ['Best score', `You ${view.bestMine} · ${escapeName(view.them.name)} ${view.bestTheirs}`],
      ['Sixes', `You ${view.sixesMine} · ${escapeName(view.them.name)} ${view.sixesTheirs}`],
    ].map(([what, said]) => `<div><dt>${what}</dt><dd>${said}</dd></div>`).join('');
    this.$('rivalry-again').textContent = `CHALLENGE ${view.them.name.toUpperCase()} AGAIN`;
    this.open('challenge-rivalry');
    this.$('rivalry-again').focus();
  }

  /** How many matches need this person, worn on the hero card and the list's row. */
  challengesOpen(yourMove: number, waiting: number) {
    const flag = this.$('mode-challenge-flag');
    flag.textContent = yourMove > 0 ? 'YOUR MOVE' : waiting > 0 ? `${waiting} LIVE` : 'NEW';
    flag.classList.toggle('is-open', yourMove > 0 || waiting > 0);
    flag.classList.toggle('is-move', yourMove > 0);
    const count = this.$('modes-challenges-count');
    count.textContent = String(yourMove);
    count.classList.toggle('hidden', yourMove <= 0);
    this.$('modes-challenges-note').textContent = yourMove > 0
      ? `${yourMove} waiting on you`
      : waiting > 0 ? `${waiting} waiting on them` : "Every match you're in, and how it went";
  }

  /** Puts one of the challenge screens up, and the overlay state with it. */
  private open(id: string) {
    this.viewport.classList.add('modal-open');
    this.$(id).classList.remove('hidden');
  }

  /** Puts the cover back, for a joiner who chose to bat alone instead. */
  showCover() { this.$('intro').classList.remove('hidden'); }

  /** Takes every challenge screen down. Called before putting one up. */
  shut() {
    this.shutSheets();
    if (this.roomOpen) this.closeRoom();
  }

  /** The sheets that stand over the room, and not the room. */
  private shutSheets() {
    for (const id of ['challenge-share', 'challenge-join', 'challenge-list', 'challenge-rivalry', 'challenge-offline']) {
      this.$(id).classList.add('hidden');
    }
  }

  /** And the overlay with them, when nothing else is holding it. */
  closeChallenge() {
    this.shut();
    const held = ['end', 'end-survive', 'modes'].some(id => !this.$(id).classList.contains('hidden'));
    if (!held) this.viewport.classList.remove('modal-open');
  }

  /**
   * The sound key, drawn as the setting it is on. Three settings on one key
   * means a press has to say where it landed, or the middle one is a mystery
   * icon: the note under the key does that, and only when the key is pressed.
   */
  sound(setting: SoundSetting, pressed = false) {
    const [art, says, next] = SOUND_SETTINGS[setting];
    this.$('sound').innerHTML = icon(art);
    this.$('sound').setAttribute('aria-label', `${says}. ${next}`);
    if (!pressed) return;
    const note = this.$('sound-note');
    note.textContent = says;
    note.classList.remove('is-up'); void note.offsetWidth; note.classList.add('is-up');
    clearTimeout(this.soundNote);
    this.soundNote = window.setTimeout(() => note.classList.remove('is-up'), 1600);
  }
  private soundNote = 0;
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


/** What the room's keys can ask for. */
export type RoomAct =
  | 'invite' | 'share' | 'play' | 'resume' | 'nudge' | 'rematch' | 'home' | 'join' | 'new' | 'next' | 'retry' | 'solo' | 'list' | 'card';

/** One key at the foot of the room. */
interface RoomKey {
  act: RoomAct | 'tell';
  label: string;
  kind: 'key' | 'whatsapp' | 'quiet' | 'ghost';
  /** A link rather than a key, for the ones that open WhatsApp. */
  href?: string;
}

/**
 * What the room says to this person, and which keys it offers.
 *
 * Every state of the same link is here, and every one is a place rather than a
 * dead end: an expired room offers a fresh one, a room made on an older game
 * offers a fresh one, a room you were never in offers a way in. The taunts are
 * kept because they are the voice of the thing; the rest is plain.
 */
function roomCopy(
  view: RoomView, extra: { interstitial?: { index: number; total: number }; sent?: boolean; card?: boolean },
): { title: string; tag: string | null; lead: string; sub: string; note: string | null; keys: RoomKey[] } {
  const said = roomWords(view, extra);
  // The innings that just ended has a card, and the card is where the Top 50
  // is claimed — so the room keeps a way to it, under the keys that matter.
  if (extra.card && (view.kind === 'waiting' || view.kind === 'spectate' || view.kind === 'result')) {
    said.keys.splice(said.keys.length - 1, 0, { kind: 'quiet', act: 'card', label: 'YOUR SCORECARD' });
  }
  return said;
}

function roomWords(
  view: RoomView, extra: { interstitial?: { index: number; total: number }; sent?: boolean },
): { title: string; tag: string | null; lead: string; sub: string; note: string | null; keys: RoomKey[] } {
  const you = view.mine;
  const others = view.players.filter(row => row.playerId !== you?.playerId);
  const other = others[0] ?? null;
  const first = (row: ChallengeRow | null) => row?.name ?? 'your friend';
  const rows = (kind: RoomKey['kind'], act: RoomKey['act'], label: string, href?: string): RoomKey => ({ kind, act, label, href });
  const back = rows('ghost', 'home', 'Back to the menu');

  switch (view.kind) {
    case 'lobby': {
      const joined = others.length > 0;
      const host = !!you?.host;
      if (joined) {
        return {
          title: 'Match room', tag: null,
          lead: others.length === 1 ? `${first(other)} is in.` : `${others.length} of them are in.`,
          sub: 'Tap Play when you’re ready. You don’t have to start together — whoever bats first is the one to beat, and the other sees it land ball by ball.',
          note: `Anyone with the link can bat · ${view.closes}`,
          keys: [rows('key', 'play', 'PLAY NOW'), rows('quiet', 'invite', 'SHARE THE LINK AGAIN'), back],
        };
      }
      if (!host) {
        return {
          title: 'Match room', tag: null,
          lead: 'You’re in.',
          sub: `Nobody has batted yet. Go first and set the score, or wait — ${first(view.players.find(row => row.host) ?? null)} sees what you did either way.`,
          note: `Link live · ${view.closes}`,
          keys: [rows('key', 'play', 'PLAY NOW'), back],
        };
      }
      return extra.sent
        ? {
          title: 'Match room', tag: null,
          lead: 'Link sent. Now bat.',
          sub: 'They can join while you bat and you’ll see each other’s balls land, or open it tonight and chase what you set. Either way, nobody waits.',
          note: `Link stays live for 7 days · ${view.closes}`,
          keys: [rows('key', 'play', 'PLAY NOW'), rows('quiet', 'invite', 'SHARE AGAIN'), back],
        }
        : {
          title: 'Match room', tag: null,
          lead: 'Now make someone regret opening WhatsApp.',
          sub: 'Send the link. They bat their 30, you bat yours — together now, or whenever they get round to it. Nobody sees a score till their own last ball.',
          note: 'Link stays live for 7 days',
          keys: [rows('whatsapp', 'invite', 'INVITE ON WHATSAPP'), rows('key', 'play', 'PLAY NOW'), back],
        };
    }
    case 'chase': {
      const batting = others.find(row => row.status === 'batting');
      const done = others.filter(row => row.status === 'done' || row.status === 'forfeit');
      const lead = batting ? `${batting.name} is batting right now.` : done.length === 1 ? `${done[0].name} has batted.` : `${done.length} of them have batted.`;
      return {
        title: 'Match room', tag: null,
        lead,
        sub: batting
          ? 'Jump in. You’ll see what they did on each ball, one ball behind your own — and the scores on your last.'
          : '30 balls. Beat a score you can’t see. You’ll get their innings ball by ball, and the total on your thirtieth.',
        note: `Their score stays hidden till your last ball · ${view.closes}`,
        keys: [rows('key', 'play', 'PLAY NOW'), back],
      };
    }
    case 'resume': {
      const balls = you?.balls ?? 0;
      return {
        title: 'Welcome back', tag: null,
        lead: `You were on ball ${balls}.`,
        sub: 'Your innings is saved ball by ball. Pick it up where you left it — the balls already faced stay faced.',
        note: 'No restarts. That’s the deal.',
        keys: [rows('key', 'resume', `RESUME FROM BALL ${balls + 1}`), back],
      };
    }
    case 'waiting':
      return {
        title: 'Match room', tag: null,
        lead: 'Your innings is in.',
        sub: others.length
          ? `${others.map(row => row.name).join(', ')} ${others.length === 1 ? 'has' : 'have'} the link and ${others.length === 1 ? 'hasn’t' : 'haven’t'} batted yet. You’ll be told the moment it happens.`
          : 'Nobody has opened the link yet. Send it on — they can bat tonight or on Thursday and it still counts.',
        note: `Your score counts toward your career either way · ${view.closes}`,
        keys: [rows('whatsapp', 'nudge', others.length ? 'NUDGE ON WHATSAPP' : 'SEND THE LINK'), rows('quiet', 'share', 'COPY THE LINK'), back],
      };
    case 'spectate': {
      const live = view.live!;
      return {
        title: 'Live', tag: 'THEY’RE BATTING',
        lead: `${live.row.name} ${live.needs}.`,
        sub: 'Stay and watch it land, or go — the result finds you either way.',
        note: `Ball ${live.row.balls} of ${GAME.totalBalls}`,
        keys: [rows('ghost', 'home', 'Leave · the result will be in My challenges')],
      };
    }
    case 'result': {
      const result = view.result!;
      const away = extra.interstitial;
      const tag = away ? `WHILE YOU WERE AWAY${away.total > 1 ? ` · ${away.index} OF ${away.total}` : ''}` : result.tag;
      const keys: RoomKey[] = [
        rows('key', 'rematch', 'REMATCH'),
        rows('whatsapp', 'tell', result.tell, result.whatsapp),
        away && away.index < away.total ? rows('ghost', 'next', 'Next result') : rows('ghost', 'home', 'Back to the menu'),
      ];
      return { title: 'Result', tag, lead: result.title, sub: result.sub, note: null, keys };
    }
    case 'expired': {
      const batted = you && (you.status === 'done' || you.status === 'forfeit');
      return {
        title: 'Closed', tag: 'A WEEK IS A WEEK',
        lead: 'This one closed.',
        sub: batted
          ? `${other ? first(other) : 'Nobody'} didn’t bat within the week. Your ${you!.runs} stays in your career; no result goes down against anybody.`
          : 'Nobody batted within the week, so there is nothing to decide.',
        note: null,
        keys: [rows('key', 'new', other ? `CHALLENGE ${other.name.toUpperCase()} AGAIN` : 'START A NEW MATCH'), back],
      };
    }
    case 'void':
      return {
        title: 'Match room', tag: 'OLDER VERSION',
        lead: 'Made on an older version of the game.',
        sub: 'The scoring changed since this was set, so a result here wouldn’t be fair on either of you. No win or loss recorded.',
        note: null,
        keys: [rows('key', 'new', 'START A FRESH MATCH'), back],
      };
    case 'spectator': {
      const settled = view.players.filter(row => row.status === 'done' || row.status === 'forfeit');
      const top = settled[0];
      const second = settled[1];
      const lead = top && second
        ? top.score === second.score ? `${top.name} and ${second.name} tied.` : `${top.name} beat ${second.name} by ${top.runs - second.runs}.`
        : 'This match is over.';
      const joinable = view.state !== 'expired';
      return {
        title: 'Match room', tag: 'YOU WEREN’T IN THIS ONE',
        lead, sub: joinable
          ? 'But the room’s still open. Bat your 30 and see where you land against them both.'
          : 'It closed before you got here. Start one and drag them both into it.',
        note: null,
        keys: [rows('key', joinable ? 'join' : 'new', joinable ? 'BAT · BEAT THEM BOTH' : 'CHALLENGE THEM'), back],
      };
    }
  }
}

function roomKey(key: RoomKey): string {
  const cls = key.kind === 'key' ? 'key-button' : key.kind === 'whatsapp' ? 'whatsapp-key' : key.kind === 'quiet' ? 'quiet-key' : 'ghost-link';
  if (key.href) {
    return `<a class="${cls}" data-act="${key.act}" href="${key.href}" target="_blank" rel="noopener noreferrer">${icon('whatsapp')}<span>${key.label}</span></a>`;
  }
  const glyph = key.kind === 'whatsapp' ? icon('whatsapp') : '';
  return `<button class="${cls}" data-act="${key.act}" type="button">${glyph}<span>${key.label}</span></button>`;
}

/**
 * One person in the room: who, and where they are.
 *
 * The score is the one thing that changes with who is looking. Somebody who
 * has not batted sees that a friend has, and the ball count, and a pair of
 * question marks where the runs go — that is the whole mode, said on a row.
 */
function roomRow(row: ChallengeRow, view: RoomView): string {
  const you = row.playerId === view.mine?.playerId;
  const hide = view.blind && !you;
  const name = you ? 'You' : escapeName(row.name);
  let what: string;
  let figure = '';
  switch (row.status) {
    case 'joined':
      what = you ? 'not batted yet' : 'in the room · not batted';
      break;
    case 'batting':
      what = `batting · ball ${row.balls} of ${GAME.totalBalls}`;
      figure = hide ? `<strong class="room-score is-hidden">??</strong>` : `<strong class="room-score">${row.runs}<em>/${row.wickets}</em></strong>`;
      break;
    case 'forfeit':
      what = `gave it up on ball ${row.balls}`;
      figure = hide ? `<strong class="room-score is-hidden">??</strong>` : `<strong class="room-score">${row.runs}<em>/${row.wickets}</em></strong>`;
      break;
    default:
      what = row.wickets >= GAME.maxWickets ? `all out · ${row.balls} balls` : `done · ${row.balls} balls`;
      figure = hide ? `<strong class="room-score is-hidden" title="Hidden till your last ball">??</strong>` : `<strong class="room-score">${row.runs}<em>/${row.wickets}</em></strong>`;
  }
  const bar = row.status === 'batting'
    ? `<span class="room-bar" aria-hidden="true"><i style="width:${Math.round(row.balls / GAME.totalBalls * 100)}%"></i></span>`
    : '';
  return `<li class="room-player is-${row.status}${you ? ' is-you' : ''}" data-player="${row.playerId}">
    ${kitMarkup(row.avatar, row.name)}
    <span class="room-who"><b>${name}${row.host ? ' <i>host</i>' : ''}</b><small>${what}</small>${bar}</span>
    ${figure}
  </li>`;
}

/**
 * One innings on the result: who, what they made, and the same ball-by-ball
 * track the end card draws — so the two screens are plainly the same game.
 *
 * The balls nobody faced stay on the track as gaps, which is what makes an
 * innings that ended in two overs *look* like one that ended in two overs.
 */
function scoreline_(row: ChallengeRow, you: string): string {
  const balls = decodeInnings(row.card);
  const track = Array.from({ length: GAME.totalBalls }, (_, i) => {
    const ball = balls[i];
    if (!ball) return '<i class="is-unfaced"></i>';
    return `<i class="${ball.isWicket ? 'is-out' : ''}" style="--r:${Math.min(6, ball.runs)}"></i>`;
  }).join('');
  const mine = row.playerId === you;
  const note = row.status === 'forfeit' ? ' <em>· walked</em>' : '';
  return `<div class="challenge-innings${mine ? ' is-you' : ''}">
    <div class="challenge-innings-head">
      <span class="challenge-innings-name">${kitMarkup(row.avatar, row.name)}<span>${mine ? 'You' : escapeName(row.name)}${note}</span></span>
      <span class="challenge-innings-figures"><small>${row.sixes}<i>6s</i> ${row.fours}<i>4s</i></small><span class="challenge-innings-runs">${row.runs}<em>/${row.wickets}</em></span></span>
    </div>
    <div class="challenge-track" aria-hidden="true">${track}</div>
  </div>`;
}

/** The three sections of the list. */
export interface ListSections {
  yourMove: ListRowView[];
  waitingOnThem: ListRowView[];
  done: ListRowView[];
}

/** One row of the list. */
export interface ListRowView {
  code: string;
  /** Who it is against: the other person, or the leader of a group, or nobody yet. */
  them: { playerId: string; name: string; avatar: number } | null;
  /** How many others are in it, for a group. */
  others: number;
  /** The word on the row: what it needs, or how it went. */
  head: string;
  /** The line under it. */
  note: string;
  /** For a settled row: how it went for this person. */
  outcome?: 'W' | 'L' | 'D' | '—';
}

/**
 * A row: who it was against, what it needs, and a way to be rid of it.
 *
 * The name is a key of its own — the head-to-head lives behind it — and the
 * rest of the row opens the room. The remove key is big enough for a thumb
 * and quiet enough not to look like the point of the row.
 */
function listRow(row: ListRowView): string {
  const who = row.them
    ? `<button class="challenge-row-who" type="button" data-rival="${row.them.playerId}" data-code="${row.code}">${kitMarkup(row.them.avatar, row.them.name)}<span>${escapeName(row.them.name)}${row.others > 1 ? ` <i>+${row.others - 1}</i>` : ''}</span></button>`
    : `<span class="challenge-row-who is-nobody"><span class="board-kit is-empty" aria-hidden="true">?</span><span>Nobody yet</span></span>`;
  const badge = row.outcome ? `<span class="challenge-row-outcome is-${row.outcome === '—' ? 'none' : row.outcome}">${row.outcome}</span>` : '';
  return `<li class="challenge-row" data-code="${row.code}">
    <button class="challenge-row-open" type="button" data-open="${row.code}" aria-label="Open this match">
      ${who}
      <span class="challenge-row-what"><b>${row.head}</b><em>${row.note}</em></span>
      ${badge}
    </button>
    <button class="challenge-row-drop" type="button" data-drop="${row.code}" aria-label="Remove this match from the list">${icon('close')}</button>
  </li>`;
}

/** A name is somebody else's text, so it never reaches innerHTML as it stands. */
export function escapeName(name: string): string {
  return name.replace(/[&<>"']/g, char =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char));
}
