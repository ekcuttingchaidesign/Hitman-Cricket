/**
 * The career key, everywhere it is shown.
 *
 * A player is a random id kept in their browser, and browsers throw those
 * away — Safari clears script storage after seven idle days, and a new phone
 * or a cleared browser does it outright. Before careers that cost one best
 * score. Now it costs everything somebody has accumulated, and the longer
 * they play the more it costs them, which is the wrong way round.
 *
 * The key is three words and two digits they can keep. Paired with the name
 * they bat under, it brings the record back. Two things rather than one
 * because names are public on the board: anybody can type `Rohit`, so the
 * name alone can never be enough, and the key alone points at nothing.
 *
 * Every placement below is the same component wearing a different size. They
 * all end at one modal, and the modal is the only place a key is ever saved —
 * which is the whole reason it exists. A one-tap copy on the widget looked
 * kinder and was worse: people tap it by reflex, the clipboard is a single
 * slot and gets overwritten by the next thing they copy, and we would have
 * recorded a save and retired every prompt for somebody holding nothing.
 */

import { escape } from './Leaderboard';
import { cta, icon } from './Kit';

/** What this browser can say about the player's key. */
export type KeyState =
  /** Held, and never yet saved anywhere. The state that does the persuading. */
  | 'unsaved'
  /** Saved once. The widget stays, quietly, because a saved key still gets lost. */
  | 'saved'
  /**
   * There is a key, but not on this device.
   *
   * Only a scrambled copy is kept on our side, so a key that was shown once
   * and not written down cannot be shown again by anybody. Saying so is the
   * only honest state: a key nobody can produce is worse offered than refused.
   */
  | 'lost';

export interface KeyView {
  state: KeyState;
  /** The key itself, absent where this device does not hold it. */
  code?: string | null;
}

/** Three words and two digits, as it is written everywhere it appears. */
export function keyText(words: readonly string[], digits: number): string {
  return `${words.join('-')}-${String(digits).padStart(2, '0')}`;
}

/** The key's mark, which every placement of it wears. */
export const MARK = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 7.5a4.5 4.5 0 1 0-4.24 4.49L9.5 13.25v2h-2v2h-2v2.5H2v-3.29l6.51-6.5A4.5 4.5 0 0 1 15 7.5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="16.4" cy="7.1" r="1.35" fill="currentColor"/></svg>`;

/**
 * The permanent one, under the cards on My Stats.
 *
 * It sits below the rail rather than inside it. There are two cards on that
 * screen and one key — a key that swiped away with the Blast card would read
 * as the Blast's key, with the Test match's somewhere behind it.
 */
export function keyCardMarkup(view: KeyView): string {
  const lost = view.state === 'lost';
  const saved = view.state === 'saved';
  // UI v1's ticket stub, as on the innings card: the key on its holographic
  // strip, the perforation, and SAVE beyond it. Lost, the strip says there is
  // no key on this phone and the key makes one.
  return `
    <section class="key-pass k-ticket is-${view.state}" aria-labelledby="key-card-title">
      <div class="k-ticket-key">
        <div class="k-ticket-label k-t-overline">${icon('key')}<span id="key-card-title">Career key</span>
          <button id="key-info" class="key-info" type="button" aria-label="What is a career key?"><span aria-hidden="true">i</span></button>
        </div>
        ${lost
          ? '<p class="key-line">No key on this phone. Make one: it is what brings this record back.</p>'
          : `<p class="key-serial k-ticket-pill"><span>${escape(view.code ?? '')}</span></p>`}
        ${saved ? '<button id="key-new" class="key-ghost" type="button">Make a new key</button>' : ''}
      </div>
      <span class="k-ticket-perf" aria-hidden="true"></span>
      <div class="k-ticket-save">${cta({ kind: 'save', label: lost ? 'MAKE IT' : 'SAVE', id: 'key-save' })}</div>
    </section>`;
}

/**
 * The one on the innings-end card, above the keys and under Career Stats.
 *
 * The same words in less room: the card underneath it is the thing the player
 * came to look at, and this is not allowed to push the keys off the bottom.
 */
export function keyPanelMarkup(view: KeyView): string {
  // UI v1's ticket stub: the key on its holographic strip, the perforation,
  // and SAVE on the far side of it.
  return `
    <section class="key-panel k-ticket" aria-labelledby="key-panel-title">
      <div class="k-ticket-key">
        <div class="k-ticket-label k-t-overline">${icon('key')}<span id="key-panel-title">Career key</span></div>
        <p class="key-serial k-ticket-pill"><span>${escape(view.code ?? '')}</span></p>
      </div>
      <span class="k-ticket-perf" aria-hidden="true"></span>
      <div class="k-ticket-save">${cta({ kind: 'save', label: 'SAVE', id: 'key-panel-save' })}</div>
    </section>`;
}

/**
 * The end card's version of the lost state: a name, and no key behind it.
 *
 * This slot used to show such a player nothing at all — the key panel was
 * drawn only where a key existed, and the offer to restore only where no name
 * did, so somebody holding a name without a key fell between the two. That is
 * every player who was on the board before keys existed, which on the day this
 * shipped was all of them, and the end of an innings is the one moment the
 * game has their attention.
 */
export function keyMissingPanelMarkup(): string {
  return `
    <section class="key-panel is-missing" aria-labelledby="key-missing-title">
      <div class="key-panel-face">
        <span class="key-mark" aria-hidden="true">${MARK}</span>
        <div class="key-panel-say">
          <h3 id="key-missing-title">No career key yet</h3>
          <p class="key-panel-line">It is what brings this record back on a new phone.</p>
        </div>
        <button id="key-missing-go" class="key-panel-key" type="button">MAKE IT</button>
      </div>
    </section>`;
}

/**
 * The line on the mode picker, which is the busiest screen in the game.
 *
 * One line rather than a panel, and capped at two showings: every tap of Play
 * comes through here, and anything standing over those two cards for long
 * becomes furniture — at which point it stops being read, and takes the other
 * placements' credibility with it.
 */
export function keyBarMarkup(): string {
  return `
    <button id="key-bar" class="key-bar" type="button">
      <span class="key-mark" aria-hidden="true">${MARK}</span>
      <span class="key-bar-say">Save your career key</span>
      <span class="key-bar-go">SAVE</span>
    </button>`;
}

/**
 * The first key a player is ever handed, the moment they claim a name.
 *
 * Dismissed by hand and never on a timer. It arrives on the same beat as the
 * board opening on the row they have just taken, and a message that takes
 * itself away while somebody is looking at their own name is a message that
 * was never read.
 *
 * The innings-end card's row rather than a card of its own. A card here stood
 * on two rows of the board and the whole of the widget under it — on the one
 * screen where what is underneath is the thing the player came to see. The row
 * says the same in one line, and the sentence it drops is the sentence the
 * save sheet opens with, one press away.
 */
export function keyToastMarkup(view: KeyView): string {
  return `
    <div class="key-toast" role="status">
      <div class="key-panel-face">
        <span class="key-mark" aria-hidden="true">${MARK}</span>
        <div class="key-panel-say">
          <h3>Your career key</h3>
          <p class="key-serial is-inline"><span>${escape(view.code ?? '')}</span></p>
        </div>
        <button id="key-toast-save" class="key-panel-key" type="button">SAVE</button>
        <button id="key-toast-close" class="key-toast-close" type="button" aria-label="Close">
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
    </div>`;
}

/**
 * Where a key is actually saved, and the only place it is.
 *
 * WhatsApp first and heavier because it is the one that finishes the job:
 * a copy lives in a single slot that the next copy overwrites, and leaves the
 * player homework. Sending it to themselves lands it somewhere they can paste
 * from on a phone they do not own yet.
 */
export function keyModalMarkup(view: KeyView): string {
  // UI v1's save sheet (133:6560): from the foot, the key on its holographic
  // strip, the screenshot first, then the picture, WhatsApp and a copy.
  return `
    <div class="key-modal" role="dialog" aria-modal="true" aria-labelledby="key-modal-title">
      <div class="key-sheet ks-sheet">
        <i class="ks-grab" aria-hidden="true"></i>
        <div class="ks-head">
          <span class="ks-mark" aria-hidden="true">${icon('key')}</span>
          <h2 id="key-modal-title" class="ks-title">SAVE YOUR CAREER KEY</h2>
          <button id="key-modal-close" class="ks-close" type="button" aria-label="Close">${icon('close')}</button>
        </div>
        <p class="key-serial ks-key"><span>${escape(view.code ?? '')}</span></p>
        <p class="ks-say">This and your name bring your record back: every run, every innings, your tier and your place on the board. Without it, a new phone or a cleared browser starts you at nought.</p>
        <p class="key-hero ks-hint">${icon('scan')}<span><b>Screenshot this screen</b><small>The surest way to keep it. Your phone already knows how.</small></span></p>
        ${cta({ kind: 'primary', label: 'SAVE AS IMAGE', id: 'key-image', wide: true })}
        <div class="ks-more">
          ${cta({ kind: 'share-wide', label: 'WHATSAPP', id: 'key-whatsapp' })}
          ${cta({ kind: 'secondary', label: 'COPY', id: 'key-copy' })}
        </div>
        <p id="key-trouble" class="key-trouble hidden" role="alert"></p>
        <p class="ks-fine">Put it somewhere you’ll still have in a year. A copied key lasts until the next thing you copy; a picture outlives both.</p>
      </div>
    </div>`;
}

/** What the sheet explains when it is opened to explain rather than to save (133:6719). */
export function keyAboutMarkup(code: string | null = null): string {
  return `
    <div class="key-modal" role="dialog" aria-modal="true" aria-labelledby="key-about-title">
      <div class="key-sheet ks-sheet">
        <i class="ks-grab" aria-hidden="true"></i>
        <div class="ks-head">
          <span class="ks-mark" aria-hidden="true">${icon('key')}</span>
          <h2 id="key-about-title" class="ks-title">WHAT IS A CAREER KEY?</h2>
          <button class="ks-close" type="button" data-close aria-label="Close">${icon('close')}</button>
        </div>
        <p class="ks-say is-lead">This game has no accounts. Who you are is kept by your browser, and browsers forget: after a week away, on a new phone, or the moment somebody clears their history.</p>
        <div class="ks-example">
          <span class="k-t-overline">Three words and two numbers</span>
          <p class="key-serial ks-key is-small"><span>${escape(code ?? 'stamina-lofted-fielder-30')}</span></p>
          <p class="ks-say">Type it with the name you bat under and your whole record comes back.</p>
        </div>
        <p class="ks-safe"><span aria-hidden="true">${SHIELD}</span>It only works with your name, so a key on its own is no use to anybody who finds it.</p>
        ${cta({ kind: 'primary', label: 'GOT IT', id: 'key-about-close', wide: true })}
      </div>
    </div>`;
}

const SHIELD = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3 4.5 6v5.5c0 4.4 3.1 8.2 7.5 9.5 4.4-1.3 7.5-5.1 7.5-9.5V6L12 3Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m8.8 12.2 2.2 2.2 4.2-4.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/**
 * What is left under Career Stats once the panel has done its job.
 *
 * The panel goes the moment a key is saved, and something has to say where the
 * key went — a way in that disappears the first time it is used teaches people
 * the screen is not stable.
 */
export const KEY_SUBTEXT = 'See your stats, save your key';
