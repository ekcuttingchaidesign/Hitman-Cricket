/**
 * Super10's own page, opened by its card on Choose a mode (Figma 19B, the
 * whole scroll 497:6198): the picture full bleed behind the back key and the
 * COMING SOON tag, the logo, the line and three figures; the innings in three
 * phases with Power Surge's over bracketed in gold; two field maps; what is new
 * in it; and, pinned to the foot, the date with I'M EXCITED beside GOT IT.
 *
 * I'M EXCITED is how much the mode is wanted, counted once a browser
 * (`excitedAlready`) on GoatCounter and by the store (`super10-excited` in
 * `tally.ts`, read by `scripts/super10-report.ts`). Once pressed it stays
 * pressed, on this page and every time it is opened again.
 *
 * Super10's colour only where it is Super10's: the logo, the tag, the figures,
 * the phases and gold for Power Surge. The rest is the game's own page.
 */

import { cta, icon } from './Kit';
import { SUPER10_LOGO, SUPER10_PICTURE } from './ModeSelect';

/** The day it opens, said over the keys ('30 October'), or null until there is one. */
export const SUPER10_OPENS: string | null = '29 October';

/** Kept in the browser once I'M EXCITED is pressed, so it is counted once a browser. */
export const EXCITED_KEY = 'hitman-super10-excited';

/** Whether this browser has said it already. A browser that keeps nothing never has. */
export function excitedAlready(storage?: Pick<Storage, 'getItem'>): boolean {
  try { return (storage ?? localStorage).getItem(EXCITED_KEY) === '1'; } catch { return false; }
}

/** The line over the keys: when it opens, and once excited, that it was heard. No day set, no day said. */
export function opensLine(excited: boolean, opens: string | null = SUPER10_OPENS): string {
  if (opens) return excited ? `Noted. See you on ${opens}.` : `Coming on ${opens}`;
  return excited ? 'Noted. See you when it opens.' : 'Coming soon';
}

/** A field on the ground's own colours: the rope, the ring, the strip, the batter in blue and the side in orange. */
function fieldMap(kind: 'gaps' | 'surge'): string {
  const men: [number, number][] = kind === 'gaps'
    ? [[58, 26], [96, 22], [118, 34], [128, 58], [114, 82], [80, 96], [48, 82], [34, 58], [100, 64]]
    : [[60, 24], [100, 22], [124, 40], [132, 66], [110, 88], [74, 96], [44, 82], [62, 46], [62, 72]];
  const dots = men.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.6" class="sp-man"/>`).join('');
  const gap = kind === 'gaps'
    ? `<path d="M80 60 L14 34 A76 54 0 0 1 30 18 Z" class="sp-gap"/><line x1="80" y1="60" x2="22" y2="26" class="sp-aim"/><circle cx="22" cy="26" r="3" class="sp-ball"/>`
    : `<circle cx="62" cy="46" r="7" class="sp-ring"/><circle cx="62" cy="72" r="7" class="sp-ring"/>
       <path d="M20 34 L52 44" class="sp-in"/><path d="M20 82 L52 74" class="sp-in"/>`;
  return `<svg class="sp-map${kind === 'surge' ? ' is-surge' : ''}" viewBox="0 0 160 116" aria-hidden="true">
    <ellipse cx="80" cy="58" rx="76" ry="54" class="sp-grass"/>
    <ellipse cx="80" cy="58" rx="44" ry="31" class="sp-circle"/>
    ${gap}
    <rect x="77.5" y="46" width="5" height="14" rx="1" class="sp-strip"/>
    ${dots}
    <circle cx="80" cy="60" r="4.2" class="sp-you"/>
  </svg>`;
}

/** The rule rows' small drawings, in the tiles' Volt. */
const GLYPH = {
  stadium: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4.5h4M19 4.5h4" /><path d="M5 5v9M21 5v9" opacity=".45" stroke-width="2"/><ellipse cx="12" cy="16" rx="9" ry="4"/><path d="M10 16h4" opacity=".45" stroke-width="2"/></svg>`,
  field: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" opacity=".45" stroke-width="2"/><circle cx="12" cy="13" r="1.6" fill="currentColor" stroke="none"/><circle cx="17" cy="7" r="2.2" fill="currentColor" stroke="none"/><circle cx="19" cy="10.5" r="1.6" fill="currentColor" stroke="none"/><path d="M5.5 12.5l2 0" /></svg>`,
  board: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="10" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="4" y="10" width="4" height="9" rx="1" fill="currentColor" stroke="none" opacity=".6"/><rect x="16" y="12" width="4" height="7" rx="1" fill="currentColor" stroke="none" opacity=".6"/></svg>`,
};

const rule = (tile: string, title: string, line: string) => `
            <div class="sp-rule"><span class="sp-tile">${tile}</span><span class="sp-rule-text"><b>${title}</b><span>${line}</span></span></div>`;

const over = (n: number) => `<i class="${n <= 3 ? 'is-powerplay' : n <= 7 ? 'is-middle' : 'is-death'}">${n}</i>`;

const bolt = `<svg class="sp-bolt" viewBox="0 0 12 12" aria-hidden="true"><path d="M7 .5 1.5 7H6l-1 4.5L10.5 5H6z"/></svg>`;

/** The page, drawn once into the HUD and opened over Choose a mode. */
export function super10PageMarkup(excited: boolean): string {
  return `
        <div id="super10-page" class="modal-overlay sp-screen hidden" role="dialog" aria-modal="true" aria-labelledby="super10-title">
          <div class="sp-glow" aria-hidden="true"></div>
          <div class="ms-grain" aria-hidden="true"></div>
          <div class="sp-scroll">
            <div class="sp-hero">
              <img class="sp-picture" src="${SUPER10_PICTURE}" alt="" decoding="async">
              <div class="sp-hero-top">
                <button id="super10-back" class="k-icon-button" aria-label="Back" title="Back">${icon('arrow-left')}</button>
                <span class="sp-tag">COMING TOMORROW</span>
              </div>
              <div class="sp-lockup">
                <h2 id="super10-title" class="sp-logo"><img src="${SUPER10_LOGO}" alt="Super10"></h2>
                <p class="sp-tagline">TEN OVERS OF REAL <b>T10.</b></p>
                <p class="sp-line">Five wickets, five bowlers and a field that fights back.</p>
              </div>
            </div>
            <div class="sp-body">
              <div class="sp-figures">
                <span class="sp-card sp-figure"><b>10</b><span>overs</span></span>
                <span class="sp-card sp-figure"><b>5</b><span>wickets</span></span>
                <span class="sp-card sp-figure"><b>5</b><span>bowlers</span></span>
              </div>
              <section class="sp-card sp-innings">
                <h3 class="sp-head">THE INNINGS</h3>
                <p class="sp-note">Ten overs in three phases. Each bowler sets his own field.</p>
                <div class="sp-ladder">
                  <span class="sp-surge">${bolt}POWER SURGE · ONE OVER</span>
                  <span class="sp-bracket"></span>
                  <span class="sp-overs">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(over).join('')}</span>
                  <span class="sp-phases">
                    <span class="is-powerplay"><b>POWERPLAY</b>Two men back</span>
                    <span class="is-middle"><b>MIDDLE</b>Five men back</span>
                    <span class="is-death"><b>DEATH</b>Pace to finish</span>
                  </span>
                </div>
              </section>
              <div class="sp-fields">
                <section class="sp-card sp-field">
                  <h3 class="sp-head">FIND THE GAPS</h3>
                  ${fieldMap('gaps')}
                  <p class="sp-note">Your swipe aims it. Through a gap it races away; at a fielder, it’s a single.</p>
                </section>
                <section class="sp-card sp-field is-surge">
                  <h3 class="sp-head">${bolt}POWER SURGE</h3>
                  ${fieldMap('surge')}
                  <p class="sp-note">Take it before the 6th, 7th or 8th: two men come in. Unused, it starts itself in the 9th.</p>
                </section>
              </div>
              <section class="sp-card sp-rules">
                <h3 class="sp-head">WHAT’S NEW</h3>
                ${rule('<b class="sp-five">5</b>', 'Five bowlers', 'Two overs each, never two in a row: swing with the new ball, seam, spin, sling and a death bowler.')}
                ${rule(GLYPH.stadium, 'A new stadium', 'Super10 opens a ground of its own, played under lights with a big screen and LED stumps.')}
                ${rule(GLYPH.field, 'The field reads you', 'Keep hitting one area and the bowler puts men there. Only a middled six clears a man on the rope.')}
                ${rule(GLYPH.board, 'Its own board', 'Your best Super10 total, ranked against everybody’s.')}
              </section>
            </div>
          </div>
          <div class="sp-keys">
            <p id="super10-when" class="sp-when">${opensLine(excited)}</p>
            <div class="sp-key-row">
              <button id="super10-excited" class="sp-excited${excited ? ' is-done' : ''}" type="button"${excited ? ' aria-pressed="true"' : ' aria-pressed="false"'}>
                <span class="sp-excited-face">${bolt}<span class="sp-excited-word">${excited ? 'EXCITED!' : 'I’M EXCITED'}</span></span>
                <span class="sp-sparks" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>
              </button>
              ${cta({ kind: 'primary', label: 'GOT IT', id: 'super10-got-it' })}
            </div>
          </div>
        </div>`;
}
