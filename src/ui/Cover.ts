/**
 * The cover, as UI v1 draws it: the poster, the profile chip that is always
 * the way to My Stats, the board widget, PLAY and HOW TO PLAY.
 *
 * It is a motion poster (the handover's section 11): the floodlights stand
 * where they are, and what moves is the air — smoke drifting through the
 * light, dust rising in it, camera flashes in the stands, a glint along the
 * ball's trail, a shine across the title, a halo breathing behind PLAY, the
 * board widget's live line turning over — with the scene laid out in depth, so
 * the poster, the smoke and the dust slide at three speeds as a finger, a
 * pointer or the phone's tilt moves them (`coverParallax`), and drift a little
 * on their own when nothing does. Asked for less motion, all of it stops and
 * the poster is a still with one line (`styles.css`, `HUD.coverBoard`).
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

/**
 * Dust in the light: twenty-eight specks, laid out by a fixed shuffle so every load
 * draws the same air — x and y in the design's pixels, size, how long one
 * rise takes, and how far into it the speck starts.
 */
const DUST = Array.from({ length: 28 }, (_, i) => {
  const r = (n: number) => ((Math.sin((i + 1) * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
  return { x: Math.round(20 + r(1) * 362), y: Math.round(260 + r(2) * 340), size: +(2.5 + r(3) * 4.5).toFixed(1), rise: +(9 + r(4) * 7).toFixed(1), at: +(-r(5) * 16).toFixed(1), sway: Math.round(-14 + r(6) * 28) };
});

/** Smoke: soft banks drifting across the stands and round the lamps, each on its own slow clock. */
const SMOKE = [
  { x: -80, y: 400, w: 320, h: 120, every: 24, at: 0, travel: 50 },
  { x: 170, y: 430, w: 330, h: 130, every: 30, at: -9, travel: -56 },
  { x: -30, y: 520, w: 360, h: 120, every: 34, at: -20, travel: 42 },
  { x: -70, y: 170, w: 170, h: 140, every: 20, at: -5, travel: 26 },
  { x: 300, y: 170, w: 170, h: 140, every: 22, at: -14, travel: -26 },
  { x: 220, y: 330, w: 240, h: 110, every: 28, at: -3, travel: -34 },
]

/** The motion poster's layers, by depth: the light in the scene, the smoke, then the dust nearest. */
const motion = () => {
  // Three flashes in the stands, each on a clock of its own so together they
  // fall at uneven gaps: as near to random as a stylesheet gets.
  const flashes = [[70, 240, 2.1, 0], [310, 190, 2.9, -1.1], [140, 290, 1.7, -0.6]]
    .map(([x, y, every, delay]) => `<span class="cover-flash" style="--x:${x};--y:${y};--every:${every}s;--delay:${delay}s"><img src="${FLASH}" alt=""><img class="cover-flash-dot" src="${FLASH_DOT}" alt=""></span>`)
    .join('');
  const smoke = SMOKE.map(p => `<span class="cover-puff" style="--x:${p.x};--y:${p.y};--w:${p.w};--h:${p.h};--every:${p.every}s;--at:${p.at}s;--travel:${p.travel}"></span>`).join('');
  const dust = DUST.map(d => `<span class="cover-mote" style="--x:${d.x};--y:${d.y};--size:${d.size};--rise:${d.rise}s;--at:${d.at}s;--sway:${d.sway}"></span>`).join('');
  return `<div class="cover-motion" aria-hidden="true">
    <div class="cover-layer is-light" style="--depth:.3">
      <img class="cover-beam is-left" src="${BEAM_LEFT}" alt="">
      <img class="cover-beam is-right" src="${BEAM_RIGHT}" alt="">
      ${flashes}
      <img class="cover-glint" src="${GLINT}" alt="">
    </div>
    <div class="cover-layer is-smoke" style="--depth:.65">${smoke}</div>
    <div class="cover-layer is-dust" style="--depth:1">${dust}</div>
  </div>`;
};

/**
 * The parallax: the layers slide at their depths towards wherever a finger or
 * a pointer is on the cover, or the way the phone is tilted where a browser
 * gives that without asking, and drift on a slow figure-of-eight of their own
 * when nothing moves them. Eased, so a flick is a glide. Nothing runs while
 * the cover is away or the page is hidden, nor at all for a page asked to keep
 * still. Answers with the way to stop it.
 */
export function coverParallax(intro: HTMLElement): () => void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};
  const target = { x: 0, y: 0 };
  const now = { x: 0, y: 0 };
  let frame = 0;
  const aim = (x: number, y: number) => {
    target.x = Math.max(-1, Math.min(1, x));
    target.y = Math.max(-1, Math.min(1, y));
  };
  const pointer = (event: PointerEvent) => {
    const box = intro.getBoundingClientRect();
    aim(((event.clientX - box.left) / box.width) * 2 - 1, ((event.clientY - box.top) / box.height) * 2 - 1);
  };
  const tilt = (event: DeviceOrientationEvent) => {
    if (event.gamma === null || event.beta === null) return;
    aim(event.gamma / 25, (event.beta - 45) / 25);
  };
  const settle = () => aim(0, 0);
  intro.addEventListener('pointermove', pointer);
  intro.addEventListener('pointerleave', settle);
  // iOS asks before it hands the tilt over, and a cover should not ask for
  // anything; there the finger and the drift carry it.
  const asks = typeof (DeviceOrientationEvent as unknown as { requestPermission?: unknown }).requestPermission === 'function';
  if (!asks) window.addEventListener('deviceorientation', tilt);
  const step = (t: number) => {
    frame = requestAnimationFrame(step);
    if (document.hidden || intro.classList.contains('hidden')) return;
    const driftX = Math.sin(t / 5200) * 0.35, driftY = Math.sin(t / 3700) * 0.22;
    now.x += (target.x + driftX - now.x) * 0.045;
    now.y += (target.y + driftY - now.y) * 0.045;
    intro.style.setProperty('--px', now.x.toFixed(3));
    intro.style.setProperty('--py', now.y.toFixed(3));
  };
  frame = requestAnimationFrame(step);
  return () => {
    cancelAnimationFrame(frame);
    intro.removeEventListener('pointermove', pointer);
    intro.removeEventListener('pointerleave', settle);
    window.removeEventListener('deviceorientation', tilt);
  };
}

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
            ${cta({ kind: 'primary', label: 'PLAY', id: 'start', wide: true, moving: true })}
            ${cta({ kind: 'secondary', label: 'HOW TO PLAY', id: 'tutorial' })}
            <button id="feedback-open" class="cover-feedback hidden" type="button">What do you think of the game?</button>
          </div>
        </div>`;
}
