/**
 * Super Knockout's What's new, four cards (Figma Battle Royale page, section
 * 58, node `1178:13947`; `KNOCKOUT_STORIES` in `src/game/whats-new.ts`).
 *
 * The chrome is the stories' own in the handover's language, as the batting
 * cams' card has it: thin bars, the small orange eyebrow, the dark close key,
 * the words bottom-left in cream Jaro over a grey line. What each card shows
 * is a real piece of the mode, the same markup and classes the screens are
 * built from, so a change to the bar, the rings, the tray or a lobby seat
 * shows here without anybody remembering to redraw it:
 *
 * - `mode`: the home's poster and mark, and the format on three chips.
 * - `cut`: who is left after each over, counted off `KNOCKOUT.cuts`, and the
 *   knockout bar itself (`KnockoutBar`) in the drop, which then plays its own
 *   climb over the line.
 * - `watch`: the end screen's story rings, the header's N WATCHING, the
 *   story's tray of reactions, and reactions floating up the left edge as a
 *   match floats them: the emoji alone.
 * - `friends`: the lobby's seats, each ready, its match code, and what the
 *   top three of a full match are paid (`worthOf`).
 *
 * Between the chrome and the words is the room a piece has (`.kos-mid`),
 * which is as tall as the screen leaves it: `playKnockoutStory` measures the
 * words and shrinks a piece that does not fit. Loops and entrances are CSS;
 * the few things that change (the bar's climb, the count of watchers, the
 * code typed, the points counted) are timers here, all let go by the function
 * it returns. Under reduced motion each card stands as drawn in the design
 * and nothing moves.
 */
import { escape } from './Leaderboard';
import { cta } from './Kit';
import { avatarSrc } from '../config/board';
import { KNOCKOUT, type Track, type TrackPip } from '../game/knockout';
import { POINTS_TABLE, ordinal, worthOf } from '../game/knockout-points';
import type { KnockoutScene, Story } from '../game/whats-new';
import { KnockoutBar, knockoutBarMarkup } from './KnockoutBar';
import { KNOCKOUT_HERO, KNOCKOUT_MARK } from './KnockoutHome';

const GROUND = new URL('../assets/knockout/story-ground.webp', import.meta.url).href;
const X_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The six reactions of a watched game's tray (`KnockoutWatch.ts`, the store's `REACTIONS`). */
const TRAY = ['😂', '🔥', '👏', '😱', '🦆', '💩'];

/** Who is left after each over: everybody, then each cut's count off, and the one the final leaves. */
export function ladderOf(): { left: number; when: string }[] {
  const steps = [{ left: KNOCKOUT.seats as number, when: 'START' }];
  KNOCKOUT.cuts.forEach((cut, i) => steps.push({ left: steps[i].left - cut, when: `OVER ${i + 1}` }));
  return [...steps, { left: 1, when: 'FINAL' }];
}

/** What the top three of a full match are paid, and from how many players that is. */
export function fullMatchPoints(): { from: number; paid: [number, number, number] } {
  return { from: POINTS_TABLE[0][0], paid: worthOf(KNOCKOUT.seats) };
}

/**
 * The bar on the `cut` card, as the game would draw it early in the second
 * over of a room of twelve: two gone, two in the drop and the player one of
 * them, then the same room a ball later with the player a seat over the line.
 */
function barAt(clear: boolean): Track {
  const seats = KNOCKOUT.seats, gone = KNOCKOUT.cuts[0], drop = KNOCKOUT.cuts[1];
  const you = clear ? gone + drop : gone + drop - 1;
  const pips: TrackPip[] = Array.from({ length: seats }, (_, at) => ({
    at, you: at === you, out: at < gone, zone: at < gone ? 'gone' : at < gone + drop ? 'drop' : 'safe',
  }));
  const of = seats - gone, ballsLeft = clear ? 3 : 4;
  return {
    seats, gone, drop, pips, you, mood: clear ? 'edge' : 'drop', final: false, of, place: of - (you - gone),
    eyebrow: `BOTTOM ${drop} KNOCKED OUT IN ${ballsLeft} BALLS`, clear: clear ? 2 : null, ballsLeft,
    say: clear ? { words: '2 RUNS CLEAR', tone: 'edge' } : { words: 'NEED 5 RUNS TO BE SAFE', tone: 'drop' },
  };
}

const tag = (words: string, cls = '') => `<span class="kos-tag${cls}">${escape(words)}</span>`;

function modeScene(): { stage: string; mid: string } {
  const chips = [`${KNOCKOUT.seats} PLAYERS`, 'THE SAME BALLS', '1 WICKET'];
  return {
    stage: `<img class="kos-hero" src="${KNOCKOUT_HERO}" alt="" decoding="async" draggable="false"><span class="kos-glow"></span>`,
    mid: `
        <img class="kos-mark" src="${KNOCKOUT_MARK}" alt="" decoding="async" draggable="false">
        <ul class="kos-chips">${chips.map((chip, i) => `<li style="--i:${i}">${escape(chip)}</li>`).join('')}</ul>`,
  };
}

function cutScene(): { stage: string; mid: string } {
  const steps = ladderOf();
  return {
    stage: `<img class="kos-ground" src="${GROUND}" alt="" decoding="async" draggable="false"><span class="kos-dim"></span><span class="kos-edge"></span>`,
    mid: `
        <div class="kos-ladder">
          <i>WHO IS LEFT AFTER EACH OVER</i>
          <ol>${steps.map((step, i) => `<li style="--i:${i}"${i === steps.length - 1 ? ' class="is-last"' : ''}><b>${step.left}</b><span>${step.when}</span></li>`).join('')}</ol>
        </div>
        <div class="kos-bar">
          ${tag('THE KNOCKOUT BAR', ' is-right')}
          <div class="kos-outline">${knockoutBarMarkup(false)}</div>
        </div>`,
  };
}

function watchScene(): { stage: string; mid: string } {
  // Who is still in, as the end screen's rings name them: one of them out, greyed, as a batter out is.
  const rings = [['Sana', 0], ['Dev', 1], ['Kabir', 2], ['Riya', 3], ['Arjun', 4, 'out'], ['Zoya', 0], ['Rohan', 1]] as const;
  // Bottom to top: the one just pressed lowest and whole, the earlier ones higher and fainter.
  const floats = [['💩', 0], ['😂', 1], ['🔥', 0], ['👏', 1]] as const;
  return {
    stage: `<img class="kos-ground" src="${GROUND}" alt="" decoding="async" draggable="false"><span class="kos-dim is-deep"></span>`,
    mid: `
        <div class="kos-watching">
          <div class="kos-outline">
            <div class="ko-rings"><p class="ko-rings-head">STILL IN · TAP TO WATCH</p><div class="ko-rings-row">${rings.map(([name, face, out], i) => `
              <span class="ko-ring${out ? ' is-out' : ''}${i === 1 ? ' is-picked' : ''}" style="--i:${i}"><span class="ko-ring-face"><img src="${avatarSrc(face)}" alt="" decoding="async"></span><span class="ko-ring-out">OUT</span><b>${name}</b></span>`).join('')}
            </div></div>
          </div>
          <div class="kos-under">${tag('TAP A FACE TO WATCH')}<i class="ko-watch-n" data-watching>2 WATCHING</i></div>
        </div>
        <div class="kos-reacts">
          <div class="kos-floats">${floats.map(([emoji, lane], i) => `<span class="kos-rx" style="--i:${i};--lane:${lane}">${emoji}</span>`).join('')}</div>
          <div class="ko-watch-tray">${TRAY.map((emoji, i) => `<button type="button" tabindex="-1"${i === TRAY.length - 1 ? ' class="is-pressed"' : ''}>${emoji}</button>`).join('')}</div>
        </div>`,
  };
}

function friendsScene(): { stage: string; mid: string } {
  const seats = [['You', 0, 'Host'], ['Dev', 1, 'Ready'], ['Kabir', 2, 'Ready'], ['Riya', 3, 'Ready'], ['Arjun', 4, 'Ready']] as const;
  const { from, paid } = fullMatchPoints();
  return {
    stage: '<span class="kos-room"></span><span class="ko-grain"></span>',
    mid: `
        <div class="kos-lobby">
          <ol class="ko-people">${seats.map(([name, face, word], i) => `
            <li class="ko-lseat${i ? ' is-ready' : ' is-you'}" style="--i:${i}"><span class="ko-lseat-face"><img src="${avatarSrc(face)}" alt="" width="52" height="52" decoding="async">${
  i ? '<i class="ko-lseat-tick">✓</i>' : ''}</span><b class="ko-lseat-name">${name}</b><small class="ko-lseat-sub${i ? ' is-ready' : ''}">${word}</small></li>`).join('')}
            <li class="ko-lseat is-invite" style="--i:${seats.length}"><span class="ko-lseat-face"><i class="ko-lseat-plus">+</i></span><b class="ko-lseat-name">Invite</b></li>
          </ol>
          <div class="ko-card ko-coderow"><i>MATCH CODE</i><b class="kos-code">${[...'K7Q2'].map((c, i) => `<span style="--i:${i}">${c}</span>`).join('')}</b><span class="ko-pill is-quiet is-small">COPY</span></div>
          <div class="kos-points">
            <p><i>POINTS FOR THE TOP THREE</i><span>${from} to ${KNOCKOUT.seats} playing</span></p>
            <ol>${paid.map((points, i) => `<li${i ? '' : ' class="is-first"'} style="--i:${i}"><b data-points="${points}">+${points}</b><span>${ordinal(i + 1).toUpperCase()}</span></li>`).join('')}</ol>
          </div>
        </div>`,
  };
}

const SCENES: Record<KnockoutScene, () => { stage: string; mid: string }> = { mode: modeScene, cut: cutScene, watch: watchScene, friends: friendsScene };

export interface KnockoutStoryView {
  story: Story;
  /** The segmented bar across the top, drawn by the stories' own screen. */
  bars: string;
  where: 'intro' | 'board';
  /** What the way in says, on the card that has one. */
  opens: string;
}

export function knockoutStoryMarkup({ story, bars, where, opens }: KnockoutStoryView): string {
  const scene = story.scene!;
  const { stage, mid } = SCENES[scene]();
  const leave = where === 'board' ? 'Close' : 'Skip';
  return `
    <div class="whatsnew-sheet is-ko" data-scene="${scene}" role="document" aria-roledescription="story">
      <div class="kos-stage" role="img" aria-label="${escape(story.alt)}">${stage}</div>
      <div class="kos-shade" aria-hidden="true"></div>
      <div class="kos-mid" aria-hidden="true"><div class="kos-fit">${mid}
      </div></div>
      ${bars}
      <p class="kos-eyebrow">${escape(story.eyebrow)}</p>
      <button id="whatsnew-back" class="whatsnew-half is-back" type="button" aria-label="Previous"></button>
      <button id="whatsnew-next" class="whatsnew-half is-next" type="button" aria-label="Next"></button>
      <button id="whatsnew-done" class="cams-x" type="button" aria-label="${leave}">${X_ICON}</button>
      <div class="kos-words">
        <h2 class="kos-title">${escape(story.title)}</h2>
        <p class="kos-say">${escape(story.body ?? '')}</p>${story.opens ? `
        <div class="kos-keys">
          ${cta({ kind: 'primary', label: opens, id: 'whatsnew-open', wide: true, moving: true })}
          <button id="whatsnew-later" class="kos-later" type="button">${where === 'board' ? 'CLOSE' : 'LATER'}</button>
        </div>` : ''}
      </div>
    </div>`;
}

/**
 * The card made ready once it is in the page, and set going: the room between
 * the chrome and the words measured and the piece fitted to it, the bar
 * drawn, and whatever changes on the card put on its timers. It hands back
 * what stops all of it, for the card being left.
 */
export function playKnockoutStory(sheet: HTMLElement, scene: KnockoutScene): () => void {
  const timers: number[] = [];
  const after = (ms: number, run: () => void) => { timers.push(window.setTimeout(run, ms)); };
  const quiet = still();
  const fit = () => {
    const words = sheet.querySelector<HTMLElement>('.kos-words'), mid = sheet.querySelector<HTMLElement>('.kos-mid'), piece = sheet.querySelector<HTMLElement>('.kos-fit');
    if (!words || !mid || !piece) return;
    sheet.style.setProperty('--words', `${Math.ceil(words.offsetHeight)}px`);
    piece.style.removeProperty('--fit');
    // A piece laid from the top to the foot of its room (the ladder over the bar, the rings over the tray) fills
    // it and needs no fitting; one of a height of its own is shrunk to the room where the screen is short.
    const parts = [...piece.children].filter((el): el is HTMLElement => el instanceof HTMLElement);
    const gap = parseFloat(getComputedStyle(piece).rowGap) || 0, pad = parseFloat(getComputedStyle(piece).paddingTop) || 0;
    const room = mid.clientHeight, needs = parts.reduce((sum, el) => sum + el.offsetHeight, 0) + gap * Math.max(0, parts.length - 1) + pad;
    if (needs > room && room > 0) piece.style.setProperty('--fit', (room / needs).toFixed(4));
  };
  fit();
  const onResize = () => fit();
  window.addEventListener('resize', onResize);
  // The pictures change the piece's height as they arrive.
  sheet.querySelectorAll<HTMLImageElement>('.kos-mid img').forEach(img => { if (!img.complete) img.addEventListener('load', onResize, { once: true }); });

  let bar: KnockoutBar | null = null;
  if (scene === 'cut') {
    const box = sheet.querySelector<HTMLElement>('.ko-track');
    if (box) {
      // No knock in the hand for a climb nobody batted.
      bar = new KnockoutBar(box, sheet, true);
      bar.show(barAt(false), avatarSrc(0));
      if (!quiet) after(2600, () => { bar?.show(barAt(true), avatarSrc(0)); sheet.classList.add('is-clear'); });
    }
  }
  if (scene === 'watch' && !quiet) {
    const chip = sheet.querySelector<HTMLElement>('[data-watching]');
    if (chip) { chip.textContent = '1 WATCHING'; after(1900, () => { chip.textContent = '2 WATCHING'; chip.classList.add('is-up'); }); }
  }
  if (scene === 'friends' && !quiet) {
    // The points counted up, each from the moment its tile lands.
    sheet.querySelectorAll<HTMLElement>('[data-points]').forEach((figure, i) => {
      const to = Number(figure.dataset.points), from = 1500 + i * 160, steps = Math.min(to, 10);
      figure.textContent = '+0';
      for (let step = 1; step <= steps; step++) after(from + step * 55, () => { figure.textContent = `+${Math.round((to * step) / steps)}`; });
    });
  }
  sheet.classList.add('is-playing');
  return () => {
    timers.forEach(id => window.clearTimeout(id));
    window.removeEventListener('resize', onResize);
    bar?.show(null, '');
  };
}
