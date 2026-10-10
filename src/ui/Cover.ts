/**
 * The cover, as UI v1 draws it: the poster, the profile chip that is always
 * the way to My Stats, the board widget, PLAY and HOW TO PLAY.
 *
 * A returning player's cover moves — floodlights sweeping, a camera flash in
 * the stands, dust in the light, a glint on the ball's trail, a shine across
 * the title — and a first visit's stands still, which is the handover's
 * "motion poster" against its still one. Asked for less motion, it is the
 * still for everybody (`kit.css`).
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

/** What the board widget says: your best and place, the board's leader, or only where it leads. */
export type CoverBoard =
  | { kind: 'best'; runs: number; rank: number | null }
  | { kind: 'top'; runs: number; name: string }
  | { kind: 'none' };

/** The two lines inside the widget, under their old ids so everything that wrote them still can. */
export function coverBoardLines(view: CoverBoard): string {
  if (view.kind === 'best') {
    const rank = view.rank ? ` · You are <b>#${view.rank}</b>` : '';
    return `<span id="best-label">YOUR BEST · THE BLAST</span><strong id="best"><big>${view.runs}</big> runs${rank}</strong>`;
  }
  if (view.kind === 'top') {
    return `<span id="best-label">TOP OF THE BOARD · THE BLAST</span><strong id="best"><big>${view.runs}</big> runs by ${escape(view.name)}</strong>`;
  }
  return '<span id="best-label">LEADERBOARD · THE BLAST</span><strong id="best">Top 50 in every mode</strong>';
}

/** The motion poster's layers, placed where the handover's frame 1 has them. */
const motion = () => {
  const motes = [[60, 520, 0], [110, 454, 1], [300, 488, 2], [340, 430, 0], [200, 554, 1], [250, 458, 2], [150, 390, 0], [320, 354, 1]]
    .map(([x, y, size], i) => `<img class="cover-mote" src="${MOTES[size]}" alt="" style="--x:${x};--y:${y};--size:${size + 4};--delay:${(i * 1.1).toFixed(1)}s">`)
    .join('');
  return `<div class="cover-motion" aria-hidden="true">
    <img class="cover-beam is-left" src="${BEAM_LEFT}" alt="">
    <img class="cover-beam is-right" src="${BEAM_RIGHT}" alt="">
    <img class="cover-flash" src="${FLASH}" alt=""><img class="cover-flash-dot" src="${FLASH_DOT}" alt="">
    ${motes}
    <img class="cover-glint" src="${GLINT}" alt="">
  </div>`;
};

export interface CoverView {
  player: Player | null;
  board: CoverBoard;
  /** Somebody who has batted here before: the poster moves. */
  returning: boolean;
}

export function coverMarkup(view: CoverView): string {
  return `
        <div id="intro" class="intro cover-intro${view.returning ? ' is-returning' : ''}">
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
