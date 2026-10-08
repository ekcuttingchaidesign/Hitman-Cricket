/**
 * Changing the name a player bats under, from the key card on My Stats.
 *
 * Once a month. A name is how the boards, the career boards and a friend's
 * Rivals link know somebody, and changing it freely was the other way to stand
 * on the board as somebody new — so the sheet says so before anybody types,
 * rather than after the store has turned them down.
 *
 * Everything else moves with the name: the rows, the careers, and the key the
 * player already saved, which opens the new name as well as the old. The old
 * name stays theirs. Nobody else can pick it up, and going back to it is free.
 */

import { MARK } from './CareerKey';
import { escape } from './Leaderboard';

export interface RenameView {
  /** The name to open with: the one they bat under now. */
  name: string;
  /** True while the store is being asked. */
  sending?: boolean;
  /** Why the last try was turned down, in words the player can act on. */
  error?: string | null;
  /** It worked, under this name. */
  done?: string | null;
}

export function renameMarkup(view: RenameView): string {
  const { name, sending = false, error = null, done = null } = view;
  if (done) {
    return `
    <div class="key-modal" role="dialog" aria-modal="true" aria-labelledby="rename-done-title">
      <div class="key-sheet restore-sheet is-done">
        <div class="key-face">
          <span class="key-mark is-big" aria-hidden="true">${MARK}</span>
          <h2 id="rename-done-title">You bat as ${escape(done)} now</h2>
          <p class="key-sheet-say">Your runs, your rank and your career went with you, and your
            career key opens the new name.</p>
          <button id="rename-done" class="key-sheet-key is-whatsapp" type="button">DONE</button>
        </div>
      </div>
    </div>`;
  }
  return `
    <div class="key-modal" role="dialog" aria-modal="true" aria-labelledby="rename-title">
      <div class="key-sheet restore-sheet">
        <form id="rename-form" class="key-face">
          <span class="key-mark is-big" aria-hidden="true">${MARK}</span>
          <h2 id="rename-title">Change your name</h2>
          <p class="key-sheet-say">Your runs, rank and career move with you, and the career key
            you saved works with the new name.</p>
          <label class="restore-field"><span>New name</span>
            <input id="rename-name" type="text" maxlength="14" autocomplete="nickname"
              enterkeyhint="done" placeholder="Up to 14 characters" value="${escape(name)}" required>
          </label>
          ${error ? `<p id="rename-error" class="claim-error" role="alert">${escape(error)}</p>` : ''}
          <button id="rename-send" type="submit" class="key-sheet-key is-whatsapp"${
  sending ? ' disabled' : ''}>${sending ? 'CHANGING…' : 'CHANGE MY NAME'}</button>
          <p class="key-fine">You can change your name once every 30 days. Your old name stays
            yours, so nobody else can take it.</p>
          <button id="rename-close" class="key-ghost" type="button">Close</button>
        </form>
      </div>
    </div>`;
}
