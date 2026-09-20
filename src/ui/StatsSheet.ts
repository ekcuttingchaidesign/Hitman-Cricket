import { escape } from './Leaderboard';
import { statsAlt, statsExplain, statsHitBoxes, type StatsFacts } from '../game/StatsCard';

/**
 * The career card, as a screen of its own.
 *
 * It is a sheet over the board rather than another tab inside it, and the
 * difference is what the thing is for. Every tab on that sheet answers "where
 * do I stand" and is read against the rows around it; this answers "what have I
 * done", belongs to one person, and its whole point is that it leaves — so it
 * is a destination you go to and come back from, with two keys under it, rather
 * than one more pill in a strip of ladders.
 *
 * What it shows is the painted picture itself, not a DOM copy of it. That is
 * deliberate and it is the only arrangement that guarantees the card somebody
 * shares is the card they were looking at when they decided to: a second
 * rendering would drift from the first the day one of them gained a figure.
 * The cost is that a canvas has nothing to say to a screen reader, which is
 * what the alt text and the figure list below the keys are for.
 */

/**
 * Where the card is being shown.
 *
 * `sheet` is the My Stats tab on the leaderboard — it sits under the tab row,
 * so it has no way out of its own and no heading; the tabs are the way out.
 * `page` is the screen the innings-end card's Career Stats widget opens, which
 * is a place the player has travelled *to* rather than a tab they switched to,
 * so it carries a back key and stands alone.
 *
 * One markup function for both, because it is one card with one pair of keys
 * under it — two would drift the first time either was touched.
 */
export type StatsWhere = 'sheet' | 'page';

export interface StatsSheetView {
  facts: StatsFacts;
  where?: StatsWhere;
  /** The drawn card, once it has been painted. Null while it is being drawn. */
  picture?: string | null;
  /** Set where the picture could not be drawn at all. */
  failed?: boolean;
  /** Whether this browser will hand a file to another app. */
  canShare?: boolean;
}

export function statsSheetMarkup(view: StatsSheetView): string {
  const { facts, picture = null, failed = false, where = 'page' } = view;
  return `
    <div class="stats-sheet-inner is-${where}" role="document">${where === 'page' ? `
      <div class="stats-head">
        <button id="stats-back" class="stats-back" type="button">${backMark()}<span>Back</span></button>
        <p class="stats-head-title">Career stats</p>
      </div>` : ''}
      <div class="stats-stage">${
        picture
          ? `<div class="stats-frame">
        <img class="stats-shot" src="${picture}" alt="${escape(statsAlt(facts))}">
        ${tapsMarkup(facts)}
      </div>`
          : failed
            ? fallbackMarkup(facts)
            : `<div class="stats-drawing" role="status" aria-live="polite">Drawing your card…</div>`
      }</div>
      <div class="stats-ctas">
        <button id="stats-whatsapp" class="key-button stats-key is-whatsapp" type="button">
          ${whatsappMark()}<span>BRAG STATS ON WHATSAPP</span>
        </button>
        <button id="stats-story" class="key-button stats-key is-story" type="button">
          ${instaMark()}<span>SHARE TO INSTA STORY</span>
        </button>
      </div>
      <p id="stats-status" class="stats-status hidden" role="status" aria-live="polite"></p>
      <p class="stats-note">${facts.played
        ? 'Tap any figure to see what it counts. The link to play rides along with the card.'
        : 'Play an innings and these figures start filling up.'}</p>
      <div id="stats-toast" class="stats-toast" role="status" aria-live="polite"></div>
    </div>`;
}

/**
 * An invisible key over every figure on the painted card.
 *
 * The card is a picture, which is what makes it shareable and also what leaves
 * it with nothing to press. These are the presses: one transparent button laid
 * over each number, placed in percentages of the picture so they stay on their
 * figures at every width, and carrying the figure's name for the toast to look
 * up. A figure with no explanation gets no button rather than a dead one.
 *
 * They are real buttons rather than a click handler doing arithmetic on the
 * pointer position, so a keyboard can walk them and a screen reader announces
 * the figure and the fact that there is something behind it.
 */
function tapsMarkup(facts: StatsFacts): string {
  const keys = statsHitBoxes(facts).filter(box => statsExplain(box.label)).map(box => {
    const place = `left:${box.left.toFixed(3)}%;top:${box.top.toFixed(3)}%`
      + `;width:${box.width.toFixed(3)}%;height:${box.height.toFixed(3)}%`;
    const said = `${escape(box.label)}, ${box.value}. What this counts`;
    return `<button class="stats-tap" type="button" data-stat="${escape(box.label)}" style="${place}"`
      + `><span class="stats-tap-say">${said}</span></button>`;
  });
  return `<div class="stats-taps">${keys.join('')}</div>`;
}

/**
 * What the sheet shows where the card could not be painted — an old browser, a
 * canvas that would not give back an image, a font that never arrived. The
 * figures are the thing, so they are shown as figures rather than the screen
 * apologising and offering nothing.
 */
function fallbackMarkup(facts: StatsFacts): string {
  return `
        <div class="stats-plain">
          <p class="board-eyebrow">${escape(facts.modeName.toUpperCase())} &middot; CAREER</p>
          <h2 id="stats-title">${escape(facts.name)}</h2>
          <p class="stats-plain-line">${facts.innings} innings played${
            facts.standing ? ` &middot; ${escape(facts.standing)}` : ''}</p>
          <p class="stats-badge" style="--tier:${escape(facts.tier.theme.accent)}">
            <b>${escape(facts.tier.name)}</b><small>${escape(facts.nextLine)}</small>
          </p>
          <dl class="stats-grid">${[...facts.hero, ...facts.figures].map((figure, i) => `
            <div class="stats-cell${i < facts.hero.length ? ' is-lead' : ''}"${
  statsExplain(figure.label) ? ` data-stat="${escape(figure.label)}" role="button" tabindex="0"` : ''}>
              <dt>${escape(figure.label)}</dt>
              <dd>${figure.value}</dd>
            </div>`).join('')}
          </dl>
          <p class="stats-plain-note">The picture could not be drawn on this browser, so here are the figures.</p>
        </div>`;
}

/**
 * The two marks, inline rather than fetched. They are eighteen pixels of path
 * each and the keys they sit on are the two most-pressed things on this screen;
 * a request apiece would leave both keys wordless for the moment that matters.
 */
function whatsappMark(): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 1.67c2.2 0 4.27.86 5.83 2.42a8.2 8.2 0 0 1 2.41 5.82c0 4.54-3.7 8.24-8.25 8.24a8.23 8.23 0 0 1-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.26-8.24Zm-2.6 4.3c-.16-.35-.32-.36-.47-.37h-.4c-.14 0-.36.05-.55.26-.19.21-.72.7-.72 1.71s.74 1.98.84 2.12c.1.13 1.43 2.29 3.53 3.12 1.75.69 2.1.55 2.48.52.38-.04 1.23-.5 1.4-.99.17-.49.17-.9.12-.99-.05-.09-.19-.14-.4-.24-.21-.1-1.23-.61-1.42-.68-.19-.07-.33-.1-.47.1-.14.21-.54.68-.66.82-.12.14-.24.16-.45.05-.21-.1-.88-.32-1.68-1.03-.62-.55-1.04-1.24-1.16-1.44-.12-.21-.01-.32.09-.42.09-.1.21-.24.31-.37.1-.12.14-.21.21-.35.07-.14.03-.26-.02-.36-.05-.1-.46-1.12-.63-1.53Z"/></svg>`;
}

function instaMark(): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M7.8 2h8.4A5.8 5.8 0 0 1 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8A5.8 5.8 0 0 1 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2Zm0 1.8A4 4 0 0 0 3.8 7.8v8.4a4 4 0 0 0 4 4h8.4a4 4 0 0 0 4-4V7.8a4 4 0 0 0-4-4H7.8ZM12 6.9a5.1 5.1 0 1 1 0 10.2 5.1 5.1 0 0 1 0-10.2Zm0 1.8a3.3 3.3 0 1 0 0 6.6 3.3 3.3 0 0 0 0-6.6Zm5.4-3.2a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4Z"/></svg>`;
}

/** The way back, on the page presentation. A chevron and the word. */
function backMark(): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M14.5 5.5 8 12l6.5 6.5"/></svg>`;
}
