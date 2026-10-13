/**
 * The Test Marathon's rules, the first time it is played: a coachmark over the
 * ground, one rule at a time (Figma 133:12311 to 133:12387). The ground is
 * dimmed, and the thing a rule is about is outlined in the dark with its name
 * on a tag. The words are on a card at the foot: the game and how far through
 * the cards the player is, a title, a line, and SKIP and NEXT. The first cut
 * put each rule on a green and gold card, the second on the bare dark with a
 * dotted arrow up to what it meant; the redraw keeps the second's pointing
 * and gives the words the first one's card back.
 *
 * They open with how to hit (`ShotsIntro.ts`), the card every mode's first
 * innings starts with, and then only what changes how the mode is played. Not
 * the five-hundred-ball stop, which a player reaches perhaps once and which
 * reads as a target if it is the first thing they are told; not the levels by
 * name, which are told on the screen when they come. Three of the rules point
 * at the thing they are about — the wickets on the scoreboard, the Focus meter,
 * and the pause key the declaration lives behind — and the fourth marks the
 * pitch, so each rule is learned where it will be used.
 *
 * Shown the first two times a Marathon starts, because the first is often
 * skipped by a thumb already reaching for the pitch; SKIP ends it for good.
 */

import { SHOTS_STEP, shotsCompass } from './ShotsIntro';
import { cta } from './Kit';

export interface IntroStep {
  title: string;
  line: string;
  /** The element on the screen this card is about, outlined in the dark round it. */
  spot?: string;
  /** What the outline's tag calls it. */
  tag?: string;
  /** The swipes card: its drawing is `shotsCompass`, which depends on the batter's hand. */
  shots?: boolean;
  /** The pitch, marked in front of the batter where it wears. */
  pitch?: boolean;
}

/** The game a set of cards is for, named at the head of each in its colour. */
export interface IntroGame { name: string; tone: string }

export const INTRO_STEPS: readonly IntroStep[] = [
  // How to hit, first: the card a first innings in any mode opens with, so a
  // Marathon's cards and a Blast's start the same way (`ShotsIntro.ts`).
  SHOTS_STEP,
  {
    title: 'Three batters',
    line: 'Bat until all three are gone. Each wicket brings the next batter in.',
    spot: 'wickets',
    tag: 'Wickets left',
  },
  {
    title: 'Focus to settle',
    line: 'Survive thirty balls to settle in. Then your confidence starts to build.',
    spot: 'settle',
    tag: 'Focus meter',
  },
  {
    title: 'The pitch wears',
    line: 'It gets tougher as the innings goes on. Expect more bounce and turn late.',
    pitch: true,
  },
  {
    // Every finished innings goes on the board. "Declare, then register" was
    // read by a player as two steps owed before a score could count — the
    // declaration is a choice, to keep a score before the wickets go.
    title: 'Every innings counts',
    line: 'All out or declared, your score goes on the board. Declare from pause after 20 overs to keep it.',
    spot: 'pause',
    tag: 'Pause',
  },
];

/** The strip from above, cracking: the wear card's drawing (Figma 133:12366). */
const CRACK = '<svg viewBox="0 0 56 56" fill="none" stroke="#F5EFE6" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
  + '<path d="M35 4.66667H21C18.4227 4.66667 16.3333 6.756 16.3333 9.33333V46.6667C16.3333 49.244 18.4227 51.3333 21 51.3333H35C37.5773 51.3333 39.6667 49.244 39.6667 46.6667V9.33333C39.6667 6.756 37.5773 4.66667 35 4.66667Z"/>'
  + '<path d="M25.6667 14L30.3333 18.6667L25.6667 23.3333L30.3333 28L25.6667 32.6667L30.3333 37.3333"/></svg>';

/** What a card draws over the ground: the swipes, or the pitch marked. A spotlight is drawn by the HUD, which can see the target. */
export function introStageMarkup(step: IntroStep, left = false): string {
  if (step.shots) return shotsCompass(left);
  if (step.pitch) return `<span class="mi-pitch">${CRACK}</span>`;
  return '';
}

/** The card's words: the game and where the player is in the cards, the title and the line under it. */
export function introCardMarkup(step: IntroStep, index: number, count: number, game: IntroGame): string {
  const pills = Array.from({ length: count }, (_, i) => `<i class="${i < index ? 'is-done' : i === index ? 'is-on' : ''}"></i>`).join('');
  return `
      <div class="mi-head"><span class="mi-mode"><i></i><span id="mi-mode">${game.name}</span></span>`
    + `<span class="mi-dots" aria-hidden="true"${count < 2 ? ' hidden' : ''}>${pills}</span></div>
      <h2 id="mi-title" class="mi-title">${step.title}</h2>
      <p class="mi-line">${step.line}</p>`;
}

/**
 * The card's keys: SKIP and NEXT, and BACK and LET'S BAT on the last of
 * several. A card on its own has nothing to go back to and nothing to skip.
 */
export function introKeysMarkup(index: number, count: number, finish = false): string {
  const last = index === count - 1;
  // Opened from HOW TO PLAY on the cover there is no innings waiting behind
  // the cards, so the last one offers the two ways on: a Blast now, or a mode.
  if (last && finish) {
    return `
      <div class="mi-finish">
        ${cta({ kind: 'secondary', label: 'CHOOSE A MODE', id: 'mi-modes', wide: false })}
        ${cta({ kind: 'primary', label: 'PLAY NOW', id: 'mi-next' })}
      </div>
      <button id="mi-back" class="mi-skip" type="button"${count < 2 ? ' hidden' : ''}>Back</button>`;
  }
  const side = last
    ? `<button id="mi-back" class="mi-skip" type="button"${count < 2 ? ' hidden' : ''}>Back</button>`
    : '<button id="mi-skip" class="mi-skip" type="button">Skip</button>';
  return `${side}${cta({ kind: 'primary', label: last ? 'LET’S BAT' : 'NEXT', id: 'mi-next' })}`;
}

const KEY = 'hitman-marathon-intro';
/** Showings before it stops asking on its own. */
export const INTRO_SHOWINGS = 2;

/** Whether this browser should be shown the rules, by what it remembers. */
export function introDue(read: () => string | null = () => localStorage.getItem(KEY)): boolean {
  try {
    const held = read();
    return held !== 'done' && (Number(held) || 0) < INTRO_SHOWINGS;
  } catch { return false; }
}

/** One more showing, or done for good. A browser that cannot remember is not asked again this visit. */
export function noteIntro(how: 'shown' | 'skipped') {
  try {
    if (how === 'skipped') { localStorage.setItem(KEY, 'done'); return; }
    localStorage.setItem(KEY, String((Number(localStorage.getItem(KEY)) || 0) + 1));
  } catch { /* Nothing to remember it in. */ }
}
