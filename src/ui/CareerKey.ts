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

const MARK = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 7.5a4.5 4.5 0 1 0-4.24 4.49L9.5 13.25v2h-2v2h-2v2.5H2v-3.29l6.51-6.5A4.5 4.5 0 0 1 15 7.5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="16.4" cy="7.1" r="1.35" fill="currentColor"/></svg>`;

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
  return `
    <section class="key-pass is-${view.state}" aria-labelledby="key-card-title">
      <div class="key-foil" aria-hidden="true"></div>
      <div class="key-face">
        <div class="key-stamp">
          <span class="key-mark" aria-hidden="true">${MARK}</span>
          <h3 id="key-card-title">Your career key</h3>
          <button id="key-info" class="key-info" type="button" aria-label="What is a career key?">
            <span aria-hidden="true">i</span>
          </button>
        </div>
        ${lost ? '' : `<p class="key-serial">${escape(view.code ?? '')}</p>`}
        <p class="key-line">${lost
          ? 'Not on this phone. A key is only ever shown once, so it cannot be shown again \u2014 but you can make another.'
          : 'The only way back to your record if this browser forgets you'}</p>
        <button id="key-save" class="key-save" type="button">${
          lost ? 'MAKE A NEW KEY' : saved ? 'SAVE IT AGAIN' : 'SAVE YOUR KEY'}</button>
        ${saved ? '<button id="key-new" class="key-ghost" type="button">Make a new key</button>' : ''}
      </div>
    </section>`;
}

/**
 * The one on the innings-end card, above the keys and under Career Stats.
 *
 * The same words in less room: the card underneath it is the thing the player
 * came to look at, and this is not allowed to push the keys off the bottom.
 */
export function keyPanelMarkup(view: KeyView): string {
  return `
    <section class="key-panel" aria-labelledby="key-panel-title">
      <div class="key-foil" aria-hidden="true"></div>
      <div class="key-panel-face">
        <span class="key-mark" aria-hidden="true">${MARK}</span>
        <div class="key-panel-say">
          <h3 id="key-panel-title">Your career key</h3>
          <p class="key-serial is-inline">${escape(view.code ?? '')}</p>
        </div>
        <button id="key-panel-save" class="key-panel-key" type="button">SAVE</button>
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
      <span class="key-foil" aria-hidden="true"></span>
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
 */
export function keyToastMarkup(view: KeyView): string {
  return `
    <div class="key-toast" role="status">
      <div class="key-foil" aria-hidden="true"></div>
      <div class="key-face">
        <button id="key-toast-close" class="key-toast-close" type="button" aria-label="Close">
          <span aria-hidden="true">&times;</span>
        </button>
        <div class="key-stamp">
          <span class="key-mark" aria-hidden="true">${MARK}</span>
          <h3>Your career key</h3>
        </div>
        <p class="key-serial">${escape(view.code ?? '')}</p>
        <p class="key-line">Keep it somewhere. It is the only way back to your record if this browser forgets you.</p>
        <button id="key-toast-save" class="key-save" type="button">SAVE YOUR KEY</button>
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
  return `
    <div class="key-modal" role="dialog" aria-modal="true" aria-labelledby="key-modal-title">
      <div class="key-sheet">
        <div class="key-foil" aria-hidden="true"></div>
        <div class="key-face">
        <span class="key-mark is-big" aria-hidden="true">${MARK}</span>
        <h2 id="key-modal-title">Save your career key</h2>
        <p class="key-serial is-big">${escape(view.code ?? '')}</p>
        <p class="key-sheet-say">This and your name bring your record back — every run, every
          innings, your tier and your place on the board. Without it, a new phone or a cleared
          browser starts you at nought.</p>
        <button id="key-whatsapp" class="key-sheet-key is-whatsapp" type="button">SEND IT TO MY WHATSAPP</button>
        <button id="key-copy" class="key-sheet-key is-copy" type="button">COPY</button>
        <p class="key-fine">Put it somewhere you will still have in a year. A copied key only
          lasts until the next thing you copy.</p>
        <button id="key-modal-close" class="key-ghost" type="button">Close</button>
        </div>
      </div>
    </div>`;
}

/** What the modal explains when it is opened to explain rather than to save. */
export function keyAboutMarkup(): string {
  return `
    <div class="key-modal" role="dialog" aria-modal="true" aria-labelledby="key-about-title">
      <div class="key-sheet">
        <div class="key-foil" aria-hidden="true"></div>
        <div class="key-face">
        <span class="key-mark is-big" aria-hidden="true">${MARK}</span>
        <h2 id="key-about-title">What is a career key?</h2>
        <p class="key-sheet-say">This game has no accounts. Who you are is kept by your browser,
          and browsers forget — after a week away, on a new phone, or the moment somebody
          clears their history.</p>
        <p class="key-sheet-say">Your career key is three words and two numbers that survive that.
          Type it with the name you bat under and your whole record comes back.</p>
        <p class="key-fine">It only works with your name, so a key on its own is no use to
          anybody who finds it.</p>
        <button id="key-about-close" class="key-ghost" type="button">Close</button>
        </div>
      </div>
    </div>`;
}

/**
 * What is left under Career Stats once the panel has done its job.
 *
 * The panel goes the moment a key is saved, and something has to say where the
 * key went — a way in that disappears the first time it is used teaches people
 * the screen is not stable.
 */
export const KEY_SUBTEXT = 'See your stats, save your key';
