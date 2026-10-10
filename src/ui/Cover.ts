/**
 * The cover, as UI v1 draws it: the poster, the profile chip that is always
 * the way to My Stats, the board widget, PLAY and HOW TO PLAY.
 *
 * It is a motion poster (the handover's section 11): the batter never moves,
 * only light, air and the screen around him — floodlights sweeping from their
 * lamps, camera flashes in the stands, dust drifting up through the light, a
 * glint along the ball's trail, a shine across the title, a halo breathing
 * behind PLAY, and the board widget's live line turning over every few
 * seconds. Asked for less motion, all of it stops and the poster is a still
 * with one line (`styles.css`, `HUD.coverBoard`).
 *
 * The ids the game and its browser checks press are the ones the old cover
 * had: `#start`, `#tutorial`, `#cover-board`, `#feedback-open`, and the
 * `#best-label` / `#best` lines inside the widget.
 */

import { avatarSrc } from '../config/board';
import type { Player } from '../game/player';
import { escape } from './Leaderboard';
import { cta, icon } from './Kit';

const POSTER = new URL('../assets/entry/cover-poster.webp', import.meta.url).href;
const TITLE = new URL('../assets/title.webp', import.meta.url).href;
const BEAM_LEFT = new URL('../assets/entry/beam-left.svg', import.meta.url).href;
const BEAM_RIGHT = new URL('../assets/entry/beam-right.svg', import.meta.url).href;
const FLASH = new URL('../assets/entry/flash.svg', import.meta.url).href;
const FLASH_DOT = new URL('../assets/entry/flash-dot.svg', import.meta.url).href;
const MOTES = [
  new URL('../assets/entry/mote-4.svg', import.meta.url).href,
  new URL('../assets/entry/mote-5.svg', import.meta.url).href,
  new URL('../assets/entry/mote-6.svg', import.meta.url).href,
];
const GLINT = new URL('../assets/entry/glint.svg', import.meta.url).href;

/**
 * The profile chip: the player's kit and name over "My stats", or a grey
 * figure and GUEST before there is a name. The same chip opens My Stats from
 * the cover, mode select and the board.
 */
export function profileChip(player: Player | null, id = 'cover-profile'): string {
  const face = player
    ? `<img class="k-profile-face" src="${avatarSrc(player.avatar)}" alt="" width="36" height="36">`
    : `<span class="k-profile-face is-guest">${icon('user')}</span>`;
  return `<button type="button" id="${id}" class="k-profile" aria-label="My stats${player ? `, ${escape(player.name)}` : ''}">
    ${face}<span class="k-profile-text"><span class="k-profile-who">${player ? escape(player.name) : 'GUEST'}</span><span class="k-profile-what">My stats</span></span>
  </button>`;
}

/** One of the board widget's lines: your best and place, the leader, a big score made lately, or only where it leads. */
export type CoverBoard =
  | { kind: 'best'; runs: number; rank: number | null }
  | { kind: 'top'; runs: number; name: string }
  | { kind: 'recent'; runs: number; name: string; ago: number }
  | { kind: 'none' };

/** Within this long a score is "just now"; within a day, "today". */
const JUST_NOW_MS = 30 * 60 * 1000;
export const RECENT_MS = 24 * 60 * 60 * 1000;

/** The two lines inside the widget, under their old ids so everything that wrote them still can. */
export function coverBoardLines(view: CoverBoard): string {
  if (view.kind === 'best') {
    const rank = view.rank ? ` · You are <b>#${view.rank}</b>` : '';
    return `<span id="best-label">YOUR BEST · THE BLAST</span><strong id="best"><big>${view.runs}</big> runs${rank}</strong>`;
  }
  if (view.kind === 'top') {
    return `<span id="best-label">TOP OF THE BOARD · THE BLAST</span><strong id="best"><big>${view.runs}</big> runs by ${escape(view.name)}</strong>`;
  }
  if (view.kind === 'recent') {
    const now = view.ago < JUST_NOW_MS;
    return `<span id="best-label">${now ? 'JUST NOW' : 'TODAY'} · THE BLAST</span><strong id="best">${escape(view.name)} ${now ? 'just scored' : 'scored'} ${view.runs}${now ? '' : ' today'}</strong>`;
  }
  return '<span id="best-label">LEADERBOARD · THE BLAST</span><strong id="best">Top 50 in every mode</strong>';
}

/** The motion poster's layers, placed where the handover's frames have them. */
const motion = () => {
  const motes = [[60, 520, 0], [110, 454, 1], [300, 488, 2], [340, 430, 0], [200, 554, 1], [250, 458, 2], [150, 390, 0], [320, 354, 1]]
    .map(([x, y, size], i) => `<img class="cover-mote" src="${MOTES[size]}" alt="" style="--x:${x};--y:${y};--size:${size + 4};--delay:${(i * -1).toFixed(1)}s">`)
    .join('');
  // Three flashes in the stands, each on a clock of its own so together they
  // fall at uneven gaps: as near to random as a stylesheet gets.
  const flashes = [[70, 240, 2.1, 0], [310, 190, 2.9, -1.1], [140, 290, 1.7, -0.6]]
    .map(([x, y, every, delay]) => `<span class="cover-flash" style="--x:${x};--y:${y};--every:${every}s;--delay:${delay}s"><img src="${FLASH}" alt=""><img class="cover-flash-dot" src="${FLASH_DOT}" alt=""></span>`)
    .join('');
  return `<div class="cover-motion" aria-hidden="true">
    <img class="cover-beam is-left" src="${BEAM_LEFT}" alt="">
    <img class="cover-beam is-right" src="${BEAM_RIGHT}" alt="">
    ${flashes}
    ${motes}
    <img class="cover-glint" src="${GLINT}" alt="">
  </div>`;
};

export interface CoverView {
  player: Player | null;
  board: CoverBoard;
}

export function coverMarkup(view: CoverView): string {
  return `
        <div id="intro" class="intro cover-intro">
          <div class="cover-plate" aria-hidden="true">
            <img class="cover-art" src="${POSTER}" alt="" decoding="async" fetchpriority="high">
            ${motion()}
          </div>
          <div class="cover-top">${profileChip(view.player)}</div>
          <div class="cover-title-wrap"><img class="cover-title" src="${TITLE}" alt="Hitman Cricket" decoding="async"><span class="cover-shine" aria-hidden="true"></span></div>
          <div class="cover-actions">
            <button id="cover-board" type="button" class="cover-best">
              <span class="cover-best-trophy">${icon('trophy')}</span>
              <span class="cover-best-text">${coverBoardLines(view.board)}</span>
              ${icon('chevron-right', 'cover-best-chevron')}
            </button>
            ${cta({ kind: 'primary', label: 'PLAY', id: 'start', wide: true })}
            ${cta({ kind: 'secondary', label: 'HOW TO PLAY', id: 'tutorial' })}
            <button id="feedback-open" class="cover-feedback hidden" type="button">What do you think of the game?</button>
          </div>
        </div>`;
}
