/**
 * Bringing a record back.
 *
 * The problem this answers is that we cannot tell a wiped player from a new
 * one. Both arrive with empty storage and no history, and there is exactly one
 * moment in the game where the difference shows: a player types the name they
 * have always batted under and the store says somebody already has it. That
 * somebody is them. Everywhere else this screen is offered, it is offered
 * quietly, because everywhere else we are guessing.
 *
 * Two things are asked for, and it has to be two. Names are public — they are
 * printed down the board — so a name alone could be typed by anybody who can
 * read. The key alone points at nobody, because what is stored against it is a
 * hash and a hash is not a lookup. Together they are the only pair that means
 * "this is mine".
 *
 * The key gets one field rather than five. It was five — three words and two
 * digits, each in its own box, so that reading it off paper was a matter of
 * filling in blanks. That was solving the wrong problem: the key was saved to
 * WhatsApp or the clipboard, so the way it comes back is a paste, and a paste
 * into five boxes is five times the work it should be.
 */

import { escape } from './Leaderboard';

/** Innings sitting on this device that no record has counted yet. */
export interface LocalCareer {
  innings: number;
  runs: number;
}

export interface RestoreView {
  /**
   * The name to open with. Set where the player has just been told it is taken,
   * because that is the one entry point where we know it — and where retyping
   * what they typed ten seconds ago would read as the screen not listening.
   */
  name?: string;
  /**
   * What is already here, where there is anything. Absent in the ordinary case:
   * a genuinely wiped phone has nothing, so the question never appears and the
   * screen stays two fields and a key.
   */
  local?: LocalCareer | null;
  /** True while the store is being asked. */
  sending?: boolean;
  /** Why the last try was turned down, in words the player can act on. */
  error?: string | null;
  /**
   * It worked. Said here rather than behind the screen, because this is the
   * one action in the game whose result a player cannot see for themselves:
   * every other key shows its work immediately, and a form that simply closes
   * leaves somebody wondering whether their record came back or not.
   */
  done?: { name: string; merged: boolean } | null;
}

export function restoreMarkup(view: RestoreView): string {
  const { name = '', local = null, sending = false, error = null, done = null } = view;
  if (done) return doneMarkup(done);
  return `
    <div class="key-modal" role="dialog" aria-modal="true" aria-labelledby="restore-title">
      <div class="key-sheet restore-sheet">
        <form id="restore-form" class="key-face">
          <span class="key-mark is-big" aria-hidden="true">${MARK}</span>
          <h2 id="restore-title">Bring your record back</h2>
          <p class="key-sheet-say">Your name and your career key, together. The key is the three
            words and two numbers you saved — paste it in whole.</p>
          <label class="restore-field"><span>The name you bat under</span>
            <input id="restore-name" type="text" maxlength="14" autocomplete="nickname"
              enterkeyhint="next" placeholder="Up to 14 characters" value="${escape(name)}" required>
          </label>
          <label class="restore-field"><span>Your career key</span>
            <input id="restore-key" type="text" autocomplete="off" autocapitalize="none"
              autocorrect="off" spellcheck="false" enterkeyhint="done"
              placeholder="yorker-sprint-cover-47" required>
          </label>
          ${local ? mergeMarkup(local) : ''}
          ${error ? `<p id="restore-error" class="claim-error" role="alert">${escape(error)}</p>` : ''}
          <button id="restore-send" type="submit" class="key-sheet-key is-whatsapp"${
  sending ? ' disabled' : ''}>${sending ? 'CHECKING…' : 'BRING IT BACK'}</button>
          <p class="key-fine">A key on its own is no use to anybody who finds it — it only opens
            the name it was made for.</p>
          <button id="restore-close" class="key-ghost" type="button">Close</button>
        </form>
      </div>
    </div>`;
}

/** Back, and with it. The key underneath goes where the record is. */
function doneMarkup(done: { name: string; merged: boolean }): string {
  return `
    <div class="key-modal" role="dialog" aria-modal="true" aria-labelledby="restore-done-title">
      <div class="key-sheet restore-sheet is-done">
        <div class="key-face">
          <span class="key-mark is-big" aria-hidden="true">${MARK}</span>
          <h2 id="restore-done-title">Welcome back, ${escape(done.name)}</h2>
          <p class="key-sheet-say">Your record is yours again \u2014 every innings, every run, your
            tier and your place on the board.${done.merged
    ? ' The innings you played on this phone have been added to it.'
    : ''}</p>
          <button id="restore-done" class="key-sheet-key is-whatsapp" type="button">SEE MY RECORD</button>
        </div>
      </div>
    </div>`;
}

/**
 * The question that only exists when there is something to ask about.
 *
 * Somebody who played a few innings before realising they could restore has
 * earned those runs, and the whole point of this feature is that runs are not
 * lost. So it is ticked: the safe answer is the default, and the unsafe one
 * costs a deliberate press. It is still a question rather than a silent merge,
 * because on a borrowed phone the innings underneath belong to somebody else.
 */
function mergeMarkup(local: LocalCareer): string {
  const innings = `${local.innings} ${local.innings === 1 ? 'innings' : 'innings'}`;
  return `
          <div class="restore-merge">
            <p class="restore-merge-say">This phone has <b>${innings}</b> and
              <b>${local.runs} ${local.runs === 1 ? 'run' : 'runs'}</b> on it, counted nowhere yet.</p>
            <label class="restore-check">
              <input id="restore-merge" type="checkbox" checked>
              <span>Add them to my career</span>
            </label>
          </div>`;
}

/**
 * The offer at the end of an innings, in the key card's own clothes.
 *
 * The same row as the career key's, in the same slot, and the two can never be
 * on the screen together: a key needs a claimed name and this is only shown
 * where there is none. So the slot has one occupant at a time and the player
 * sees one object that changes what it says, rather than two competing for the
 * same strip of card.
 *
 * The ids are given rather than fixed, because there are two places it can
 * stand — the end of an innings and the foot of the board — and the board sits
 * over the card rather than replacing it, so both can be in the document at
 * once. Two of anything sharing an id is one of them being wired and the other
 * being furniture.
 *
 * It asks rather than assumes. We do not know whether the person reading it has
 * lost a record or has simply never had one, so "played before?" is the honest
 * sentence — "welcome back" would be a guess, and wrong for most of the people
 * who see it.
 *
 * One line under the title, and short enough to stay one. It read "bring your
 * record back to this phone", which wrapped and made this row taller than the
 * key row it stands in for — and the whole point of wearing the same clothes is
 * that the slot does not change shape depending on who is in it.
 */
export function restorePanelMarkup(id = 'restore-panel'): string {
  return `
    <section class="key-panel restore-panel" aria-labelledby="${escape(id)}-title">
      <div class="key-panel-face">
        <span class="key-mark" aria-hidden="true">${MARK}</span>
        <div class="key-panel-say">
          <h3 id="${escape(id)}-title">Played before?</h3>
          <p class="restore-panel-line">Bring your record back</p>
        </div>
        <button id="${escape(id)}-go" class="key-panel-key" type="button">RESTORE</button>
        <button id="${escape(id)}-close" class="key-toast-close" type="button" aria-label="No thanks">
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
    </section>`;
}

/** The offer, wherever the game has reason to think somebody has been here before. */
export function restoreLinkMarkup(id: string, words: string): string {
  return `<button id="${escape(id)}" class="restore-link" type="button">${escape(words)}</button>`;
}

/** What the claim form says when the name a player typed is already held. */
export const RESTORE_TAKEN = 'Is that you? Bring your record back';

const MARK = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 7.5a4.5 4.5 0 1 0-4.24 4.49L9.5 13.25v2h-2v2h-2v2.5H2v-3.29l6.51-6.5A4.5 4.5 0 0 1 15 7.5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="16.4" cy="7.1" r="1.35" fill="currentColor"/></svg>`;
