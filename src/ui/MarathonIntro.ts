/**
 * The Test Marathon's rules, the first time it is played: a coachmark over the
 * ground, one rule at a time — a line drawing, a few words, NEXT and SKIP, on
 * the dark rather than in a card. The first cut put each rule on a green and
 * gold card at the foot of the screen, and the playtest asked for a coachmark
 * instead: the screen itself, dimmed, with the thing a rule is about popping
 * out of it and a dotted arrow from the words to it.
 *
 * They open with how to hit (`ShotsIntro.ts`), the card every mode's first
 * innings starts with, and then only what changes how the mode is played. Not
 * the five-hundred-ball stop, which a player reaches perhaps once and which
 * reads as a target if it is the first thing they are told; not the levels by
 * name, which are told on the screen when they come. Two of the rules point at
 * the thing they are about — the Focus meter on the scoreboard, and the pause
 * key the declaration lives behind — so the rule is learned where it will be
 * used.
 *
 * Shown the first two times a Marathon starts, because the first is often
 * skipped by a thumb already reaching for the pitch; SKIP ends it for good.
 */

import { SHOTS_STEP, shotsCompass } from './ShotsIntro';

export interface IntroStep {
  title: string;
  line: string;
  art: string;
  /** The element on the screen this card is about, lit in the dark around it. */
  spot?: string;
  /** The swipes card: its drawing is `shotsCompass`, which depends on the batter's hand. */
  shots?: boolean;
}

// White line drawings with the one thing that moves picked out in green, as
// a coachmark draws its hand and the arrows beside it.
const svg = (body: string) => `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const INTRO_STEPS: readonly IntroStep[] = [
  // How to hit, first: the card a first innings in any mode opens with, so a
  // Marathon's cards and a Blast's start the same way (`ShotsIntro.ts`).
  SHOTS_STEP,
  {
    title: 'Three batters',
    line: 'Bat until all three are gone',
    // The helmet from the design (Figma, node 12-127): the shell with its peak
    // and its vent, and the grille, all in white.
    art: `<svg viewBox="100 66 428 384" fill="none" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M118 268C108 268 106 256 110 246C128 150 200 80 290 78C370 76 440 130 468 212L502 212C512 212 518 222 514 230C512 236 506 238 500 238L268 262L276 300C277 307 272 312 266 312L186 312C181 312 177 309 176 304L162 268ZM182 216H234A17 17 0 0 1 234 250H182A17 17 0 0 1 182 216Z"/><circle cx="190" cy="233" r="6" fill="currentColor"/><circle cx="226" cy="233" r="6" fill="currentColor"/><path stroke="currentColor" stroke-width="15" stroke-linecap="round" stroke-linejoin="round" d="M192 316V368L224 436H456C470 436 476 428 478 416L486 340C487 330 480 324 470 325L262 340C256 341 252 336 252 330V316M198 386H482M332 338V436M414 331V436"/></svg>`,
  },
  {
    title: 'Focus to settle',
    line: 'Thirty balls of focus, then confidence builds',
    art: svg('<path d="M6 32s10-16 26-16 26 16 26 16-10 16-26 16S6 32 6 32Z"/><circle class="acc" cx="32" cy="32" r="8"/><circle cx="32" cy="32" r="2.5" fill="currentColor"/>'),
    spot: 'settle',
  },
  {
    title: 'The pitch wears',
    line: 'It gets tougher as the innings goes on',
    // The strip from above, cracking.
    art: svg('<rect x="20" y="6" width="24" height="52" rx="3"/><path class="acc" d="M27 16l4 5-3 5 5 4M37 34l-4 4 3 5-4 4M26 46l3 3"/>'),
  },
  {
    // Every finished innings goes on the board. "Declare, then register" was
    // read by a player as two steps owed before a score could count — the
    // declaration is a choice, to keep a score before the wickets go.
    title: 'Every innings counts',
    line: 'All out or declared, your score goes on the board. Declare from pause after 20 overs to keep it',
    // A flag on the stumps.
    art: svg('<path d="M18 58V10"/><path class="acc" d="M18 12h24l-6 8 6 8H18"/><path d="M32 58V40M42 58V40M30 38h14"/>'),
    spot: 'pause',
  },
];

/** The words for one step: the drawing, the title and the line under it. */
export function introCardMarkup(step: IntroStep, left = false): string {
  return `
      <span class="mi-art${step.shots ? ' is-shots' : ''}">${step.shots ? shotsCompass(left) : step.art}</span>
      <h2 id="mi-title" class="mi-title">${step.title}</h2>
      <p class="mi-line">${step.line}</p>`;
}

/** The foot of the screen: where the player is in the four, SKIP, and NEXT. */
export function introKeysMarkup(index: number, count: number, finish = false): string {
  const last = index === count - 1;
  // Opened from HOW TO PLAY on the cover there is no innings waiting behind
  // the cards, so the last one offers the two ways on: a Blast now, or a mode.
  if (last && finish) {
    return `
      <span class="mi-dots" aria-hidden="true"${count < 2 ? ' hidden' : ''}>${Array.from({ length: count }, (_, i) => `<i${i === index ? ' class="is-on"' : ''}></i>`).join('')}</span>
      <div class="mi-finish">
        <button id="mi-modes" class="k-cta k-cta--secondary" type="button"><span class="k-cta-face"><span>CHOOSE A MODE</span></span></button>
        <button id="mi-next" class="k-cta k-cta--primary" type="button"><span class="k-cta-face"><span>PLAY NOW</span></span></button>
      </div>
      <button id="mi-skip" class="mi-skip" type="button" hidden>Skip</button>`;
  }
  return `
      <button id="mi-skip" class="mi-skip" type="button"${last ? ' hidden' : ''}>Skip</button>
      <span class="mi-dots" aria-hidden="true"${count < 2 ? ' hidden' : ''}>${Array.from({ length: count }, (_, i) => `<i${i === index ? ' class="is-on"' : ''}></i>`).join('')}</span>
      <button id="mi-next" class="mi-next" type="button">${last ? "Let's bat" : 'Next'}</button>`;
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
