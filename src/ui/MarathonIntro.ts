/**
 * The Test Marathon's rules, the first time it is played: four cards over the
 * ground, an icon each, a few words, NEXT and SKIP.
 *
 * Only what changes how the mode is played. Not the five-hundred-ball stop,
 * which a player reaches perhaps once and which reads as a target if it is the
 * first thing they are told; not the levels by name, which are told on the
 * screen when they come. Two of the four point at the thing they are about —
 * the Focus meter on the scoreboard, and the pause key the declaration lives
 * behind — so the rule is learned where it will be used.
 *
 * Shown the first two times a Marathon starts, because the first is often
 * skipped by a thumb already reaching for the pitch; SKIP ends it for good.
 */

export interface IntroStep {
  title: string;
  line: string;
  art: string;
  /** The element on the screen this card is about, lit in the dark around it. */
  spot?: string;
}

const svg = (body: string) => `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const INTRO_STEPS: readonly IntroStep[] = [
  {
    title: 'Three batters',
    line: 'Bat until all three are gone.',
    // Three bats stood up, the first in front.
    art: svg('<path d="M14 44 18 14h6l4 30Z"/><path d="M21 44v10"/><path d="M28 44 32 12h6l4 32Z" opacity=".75"/><path d="M35 44v10" opacity=".75"/><path d="M42 44 46 14h6l4 30Z" opacity=".5"/><path d="M49 44v10" opacity=".5"/>'),
  },
  {
    title: 'Focus to settle',
    line: 'Thirty balls of focus, then confidence builds.',
    art: svg('<path d="M6 32s10-16 26-16 26 16 26 16-10 16-26 16S6 32 6 32Z"/><circle cx="32" cy="32" r="8"/><circle cx="32" cy="32" r="2.5" fill="currentColor"/>'),
    spot: 'settle',
  },
  {
    title: 'The pitch wears',
    line: 'It gets tougher as the innings goes on.',
    // The strip from above, cracking.
    art: svg('<rect x="20" y="6" width="24" height="52" rx="3"/><path d="M27 16l4 5-3 5 5 4M37 34l-4 4 3 5-4 4M26 46l3 3"/>'),
  },
  {
    title: 'Declare, then register',
    line: 'Declare from pause after twenty overs and put your score on the board.',
    // A flag on the stumps.
    art: svg('<path d="M18 58V10M18 12h24l-6 8 6 8H18"/><path d="M32 58V40M42 58V40M30 38h14"/>'),
    spot: 'pause',
  },
];

/** The card for one step: the icon, where it is, the words, and the keys. */
export function introCardMarkup(step: IntroStep, index: number, count: number): string {
  const last = index === count - 1;
  return `
      <span class="mi-art">${step.art}</span>
      <span class="mi-dots" aria-hidden="true">${Array.from({ length: count }, (_, i) => `<i${i === index ? ' class="is-on"' : ''}></i>`).join('')}</span>
      <h2 id="mi-title" class="mi-title">${step.title}</h2>
      <p class="mi-line">${step.line}</p>
      <span class="mi-keys">
        <button id="mi-skip" class="ghost-link mi-skip" type="button">${last ? '' : 'SKIP'}</button>
        <button id="mi-next" class="key-button mi-next" type="button">${last ? "LET'S BAT" : 'NEXT'}</button>
      </span>`;
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
